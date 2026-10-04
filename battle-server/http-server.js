"use strict";

const http = require("node:http");
const { BattleServerError } = require("./core.js");
const { BATTLE_ID } = require("./file-store.js");

const MAX_BODY_BYTES = 64 * 1024;
const MAX_ATTEMPT_BODY_BYTES = 4 * 1024 * 1024;
const DEFAULT_DEV_ORIGINS = ["http://127.0.0.1:8898", "http://localhost:8898"];
const RATE_WINDOW_MS = 60 * 60 * 1000;

function createEventHub() {
  const listeners = new Map();
  const streamCounts = new Map();
  const observers = new Set();
  return {
    publish(battleId, event) {
      for (const listener of listeners.get(battleId) || []) {
        try { listener(structuredClone(event)); } catch (_) {}
      }
      for (const observer of observers) {
        try { observer(battleId, event); } catch (_) {}
      }
    },
    subscribe(battleId, listener) {
      let set = listeners.get(battleId);
      if (!set) listeners.set(battleId, set = new Set());
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(battleId);
      };
    },
    reserveStream(battleId, limit = 8) {
      const count = streamCounts.get(battleId) || 0;
      if (count >= limit) return false;
      streamCounts.set(battleId, count + 1);
      return true;
    },
    releaseStream(battleId) {
      const count = streamCounts.get(battleId) || 0;
      if (count <= 1) streamCounts.delete(battleId);
      else streamCounts.set(battleId, count - 1);
    },
    openStreamCount(battleId) { return streamCounts.get(battleId) || 0; },
    listenerCount(battleId) { return (listeners.get(battleId) || new Set()).size; },
    onPublish(observer) {
      observers.add(observer);
      return () => observers.delete(observer);
    }
  };
}

function send(res, status, value, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers
  });
  res.end(body);
}

async function readJson(req, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new BattleServerError(413, "BODY_TOO_LARGE", "request body too large");
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BattleServerError(400, "INVALID_JSON", "request body must be valid JSON");
  }
}

function routeTemplate(pathname) {
  if (pathname === "/health") return "/health";
  if (pathname === "/battles") return "/battles";
  const match = pathname.match(/^\/battles\/[^/]+(?:\/(join|ready|attempts|finish|status|events))?$/);
  if (!match) return "/unmatched";
  return "/battles/:id" + (match[1] ? "/" + match[1] : "");
}

function createHttpServer(coreInstance, options = {}) {
  if (!coreInstance) throw new TypeError("core instance is required");
  const hub = options.eventHub || createEventHub();
  const configuredOrigins = options.origins === undefined
    ? (process.env.BATTLE_DEV_ORIGINS === undefined ? DEFAULT_DEV_ORIGINS : process.env.BATTLE_DEV_ORIGINS.split(","))
    : options.origins;
  const origins = (Array.isArray(configuredOrigins) ? configuredOrigins : [configuredOrigins])
    .map(value => String(value).trim()).filter(value => value && value !== "*");
  const heartbeatMs = options.heartbeatMs === undefined ? 15_000 : options.heartbeatMs;
  const timers = new Map();
  const timerGeneration = new Map();
  const sseResponses = new Set();
  const streamIpCounts = new Map();
  const rateBuckets = new Map();
  const limits = options.limits || null;
  const rateCleanup = limits ? setInterval(() => {
    const now = clockNow();
    for (const [key, bucket] of rateBuckets) {
      const live = bucket.filter(at => now - at < RATE_WINDOW_MS);
      if (live.length) rateBuckets.set(key, live);
      else rateBuckets.delete(key);
    }
  }, 5 * 60 * 1000) : null;
  if (rateCleanup && rateCleanup.unref) rateCleanup.unref();
  const enableDeadlineTimers = options.scheduleDeadlines === undefined ? true : !!options.scheduleDeadlines;
  const logRequests = !!options.logRequests;
  const log = options.log || (line => console.log(line));
  const logError = options.logError || (error => console.error(error));
  const clockNow = options.now || Date.now;

  function corsHeaders(req) {
    const headers = { vary: "Origin" };
    const origin = req.headers && req.headers.origin;
    if (origin && origins.includes(origin)) headers["access-control-allow-origin"] = origin;
    return headers;
  }

  function checkRateLimit(key, limit) {
    if (!limit) return 0;
    const now = clockNow();
    const bucket = (rateBuckets.get(key) || []).filter(at => now - at < RATE_WINDOW_MS);
    if (bucket.length >= limit) {
      rateBuckets.set(key, bucket);
      return Math.max(1, Math.ceil((bucket[0] + RATE_WINDOW_MS - now) / 1000));
    }
    bucket.push(now);
    rateBuckets.set(key, bucket);
    return 0;
  }

  function rejectRateLimit(res, retryAfter, cors) {
    return send(res, 429, { error: "BATTLE_RATE_LIMIT" }, { ...cors, "retry-after": String(retryAfter) });
  }

  async function scheduleDeadline(battleId) {
    const generation = (timerGeneration.get(battleId) || 0) + 1;
    timerGeneration.set(battleId, generation);
    const previous = timers.get(battleId);
    if (previous) clearTimeout(previous);
    timers.delete(battleId);
    if (!enableDeadlineTimers || typeof coreInstance.nextDeadlineFor !== "function" ||
        typeof coreInstance.runDeadline !== "function") return;
    let deadline;
    try { deadline = await coreInstance.nextDeadlineFor(battleId); } catch (_) { return; }
    if (timerGeneration.get(battleId) !== generation || !deadline) return;
    const timer = setTimeout(async () => {
      timers.delete(battleId);
      try { await coreInstance.runDeadline(battleId); } catch (error) { logError(error); }
      if (timerGeneration.get(battleId) === generation) await scheduleDeadline(battleId);
    }, Math.max(0, deadline.atMs - clockNow()));
    if (timer.unref) timer.unref();
    timers.set(battleId, timer);
  }

  const stopObserving = hub.onPublish ? hub.onPublish(id => { void scheduleDeadline(id); }) : () => {};
  const server = http.createServer(async (req, res) => {
    const cors = corsHeaders(req);
    const requestStartedAt = clockNow();
    let logged = false;
    let requestPath = "/";
    if (logRequests) {
      const writeRequestLog = () => {
        if (logged) return;
        logged = true;
        log(JSON.stringify({ ts: new Date(clockNow()).toISOString(), method: req.method,
          route: routeTemplate(requestPath), status: res.statusCode,
          ms: Math.max(0, clockNow() - requestStartedAt) }));
      };
      res.once("finish", writeRequestLog);
      res.once("close", writeRequestLog);
    }
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      requestPath = url.pathname;
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          ...cors,
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "Authorization, Content-Type",
          "access-control-max-age": "600"
        });
        return res.end();
      }
      if (req.method === "GET" && url.pathname === "/health" && options.health) {
        const value = typeof options.health === "function" ? await options.health() : options.health;
        return send(res, 200, value, cors);
      }

      const route = url.pathname.match(/^\/battles(?:\/([^/]+)(?:\/(join|ready|attempts|finish|status|events))?)?$/);
      if (!route) return send(res, 404, { error: "NOT_FOUND" }, cors);
      const [, id, action] = route;
      if (id && !BATTLE_ID.test(id)) {
        return send(res, 404, { error: "BATTLE_NOT_FOUND" }, cors);
      }
      const clientIp = options.clientIp ? options.clientIp(req) : null;

      if (req.method === "GET" && id && action === "events") {
        const ipKey = clientIp || "unknown";
        const currentIpStreams = streamIpCounts.get(ipKey) || 0;
        if (limits && limits.streamsPerIp && currentIpStreams >= limits.streamsPerIp) {
          return rejectRateLimit(res, 60, cors);
        }
        await coreInstance.getBattle(id);
        if (!hub.reserveStream(id, 8)) return send(res, 429, { error: "STREAM_LIMIT" }, { ...cors, "retry-after": "60" });
        streamIpCounts.set(ipKey, currentIpStreams + 1);
        let released = false;
        let closed = false;
        let live = false;
        let snapshotSeq = -1;
        let queued = [];
        let heartbeat = null;
        let unsubscribe = () => {};
        const cleanup = () => {
          if (released) return;
          released = true;
          closed = true;
          sseResponses.delete(res);
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe();
          hub.releaseStream(id);
          const count = streamIpCounts.get(ipKey) || 0;
          if (count <= 1) streamIpCounts.delete(ipKey);
          else streamIpCounts.set(ipKey, count - 1);
        };
        const encodeEvent = event => `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        unsubscribe = hub.subscribe(id, event => {
          if (event.seq <= snapshotSeq) return;
          if (!live) queued.push(event);
          else if (!closed) res.write(encodeEvent(event));
        });
        res.on("close", cleanup);
        sseResponses.add(res);
        if (res.destroyed || res.writableEnded) { cleanup(); return; }
        try {
          const snapshot = await coreInstance.getBattleEventSnapshot(id);
          if (closed) return;
          snapshotSeq = snapshot.seq;
          res.writeHead(200, {
            ...cors,
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
            "x-accel-buffering": "no"
          });
          if (res.flushHeaders) res.flushHeaders();
          res.write(encodeEvent(snapshot));
          live = true;
          queued.sort((a, b) => a.seq - b.seq);
          for (const event of queued) if (event.seq > snapshotSeq) res.write(encodeEvent(event));
          queued = [];
          heartbeat = setInterval(() => { if (!closed) res.write(": heartbeat\n\n"); }, heartbeatMs);
          if (heartbeat.unref) heartbeat.unref();
        } catch (error) {
          cleanup();
          if (!res.headersSent) throw error;
          res.end();
        }
        return;
      }

      if (req.method === "POST" && !id) {
        if (limits && limits.createsPerHour) {
          const retryAfter = checkRateLimit("create:" + (clientIp || "unknown"), limits.createsPerHour);
          if (retryAfter) return rejectRateLimit(res, retryAfter, cors);
        }
        const input = await readJson(req);
        const create = options.createBattle || (value => coreInstance.createBattle(value));
        return send(res, 201, await create(input), cors);
      }
      if (req.method === "POST" && id && action === "join") {
        if (limits && limits.joinsPerHour) {
          const retryAfter = checkRateLimit("join:" + (clientIp || "unknown"), limits.joinsPerHour);
          if (retryAfter) return rejectRateLimit(res, retryAfter, cors);
        }
        return send(res, 200, await coreInstance.joinBattle(id, await readJson(req), req.headers.authorization), cors);
      }
      if (req.method === "POST" && id && action === "ready") {
        await readJson(req);
        return send(res, 200, await coreInstance.readyBattle(id, req.headers.authorization), cors);
      }
      if (req.method === "POST" && id && action === "attempts") {
        return send(res, 201, await coreInstance.submitAttempt(
          id, await readJson(req, MAX_ATTEMPT_BODY_BYTES), req.headers.authorization
        ), cors);
      }
      if (req.method === "POST" && id && action === "finish") {
        await readJson(req);
        return send(res, 200, await coreInstance.finishBattle(id, req.headers.authorization), cors);
      }
      if (req.method === "POST" && id && action === "status") {
        return send(res, 200, await coreInstance.statusBattle(
          id, await readJson(req), req.headers.authorization
        ), cors);
      }
      if (req.method === "GET" && id && !action) {
        return send(res, 200, await coreInstance.getBattle(id), cors);
      }
      return send(res, 404, { error: "NOT_FOUND" }, cors);
    } catch (error) {
      const status = error instanceof BattleServerError ? error.status : 500;
      const body = error instanceof BattleServerError
        ? { error: error.code, message: error.message, ...(error.detail ? { detail: error.detail } : {}) }
        : { error: "INTERNAL_ERROR" };
      if (status >= 500) logError(error && error.stack ? error.stack : "Internal Battle Server error");
      if (res.headersSent) return res.end();
      return send(res, status, body, cors);
    }
  });

  server.eventHub = hub;
  server.rearmDeadlines = async knownRecords => {
    if (!Array.isArray(knownRecords) && (!options.store || typeof options.store.list !== "function")) return 0;
    const records = Array.isArray(knownRecords) ? knownRecords : await options.store.list();
    let armed = 0;
    for (const record of records) {
      if (!record || ["VERDICT", "EXPIRED"].includes(record.state)) continue;
      await scheduleDeadline(record.battleId);
      armed++;
    }
    return armed;
  };
  server.shutdownStreams = () => {
    for (const response of [...sseResponses]) {
      try { response.write("event: server.shutdown\ndata: {}\n\n"); response.end(); } catch (_) {}
    }
  };
  server.on("close", () => {
    stopObserving();
    if (rateCleanup) clearInterval(rateCleanup);
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    rateBuckets.clear();
  });
  return server;
}

module.exports = { createHttpServer, createEventHub, readJson, routeTemplate };
