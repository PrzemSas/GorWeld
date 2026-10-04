"use strict";

const net = require("node:net");
const { randomBytes } = require("node:crypto");
const ArcSim = require("../arc/sim.js");
const Battle = require("../arc/battle.js");
const { createBattleCore, BattleServerError } = require("./core.js");
const { createFileStore } = require("./file-store.js");
const { createHttpServer, createEventHub } = require("./http-server.js");
const { purgeBattles, retentionFromEnv } = require("./purge.js");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PURGE_INTERVAL_MS = DAY_MS;

function positiveInteger(env, name, fallback, max = Number.MAX_SAFE_INTEGER) {
  const value = env[name] === undefined ? fallback : Number(env[name]);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new TypeError(name + " must be a positive integer" + (max < Number.MAX_SAFE_INTEGER ? " no greater than " + max : ""));
  }
  return value;
}

function parseOrigins(value) {
  if (typeof value !== "string" || value.trim() === "" || value.includes("*")) {
    throw new TypeError("BATTLE_ORIGINS is required and must not contain wildcards");
  }
  const origins = value.split(",").map(part => part.trim());
  if (!origins.length || origins.some(origin => !origin)) throw new TypeError("BATTLE_ORIGINS contains an empty origin");
  const unique = new Set();
  for (const origin of origins) {
    let url;
    try { url = new URL(origin); } catch (_) { throw new TypeError("BATTLE_ORIGINS contains an invalid origin"); }
    if (!(["http:", "https:"].includes(url.protocol) && !url.username && !url.password &&
        url.origin === origin && url.pathname === "/" && !url.search && !url.hash)) {
      throw new TypeError("BATTLE_ORIGINS must contain exact HTTP(S) origins only");
    }
    if (unique.has(origin)) throw new TypeError("BATTLE_ORIGINS contains a duplicate origin");
    unique.add(origin);
  }
  return [...unique];
}

function loadConfig(env = process.env) {
  if (typeof env.BATTLE_DATA_DIR !== "string" || env.BATTLE_DATA_DIR.trim() === "") {
    throw new TypeError("BATTLE_DATA_DIR is required");
  }
  const origins = parseOrigins(env.BATTLE_ORIGINS);
  const host = env.HOST === undefined ? "127.0.0.1" : env.HOST.trim();
  if (!host || net.isIP(host) === 0 && host !== "localhost") throw new TypeError("HOST must be an IP address or localhost");
  const port = env.PORT === undefined ? 8899 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError("PORT must be between 0 and 65535");
  if (env.TRUST_PROXY !== undefined && !["0", "1"].includes(env.TRUST_PROXY)) {
    throw new TypeError("TRUST_PROXY must be 0 or 1");
  }
  const retention = retentionFromEnv(env);
  return {
    host,
    port,
    dataDirectory: env.BATTLE_DATA_DIR.trim(),
    origins,
    trustProxy: env.TRUST_PROXY === "1",
    createsPerHour: positiveInteger(env, "BATTLE_CREATE_LIMIT_PER_HOUR", 20),
    joinsPerHour: positiveInteger(env, "BATTLE_JOIN_LIMIT_PER_HOUR", 60),
    streamsPerIp: positiveInteger(env, "BATTLE_SSE_LIMIT_PER_IP", 20),
    activeBattleCapacity: positiveInteger(env, "BATTLE_ACTIVE_CAPACITY", 2000, 2000),
    ...retention
  };
}

function normalizedIp(value) {
  if (typeof value !== "string") return null;
  const ip = value.trim().toLowerCase();
  if (net.isIP(ip)) return ip;
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped && net.isIP(mapped[1]) === 4) return mapped[1];
  return null;
}

function resolveClientIp(req, trustProxy = false) {
  const peer = normalizedIp(req && req.socket && req.socket.remoteAddress);
  if (!trustProxy || !peer || !["127.0.0.1", "::1"].includes(peer)) return peer || "unknown";
  const forwarded = req.headers && req.headers["x-forwarded-for"];
  if (typeof forwarded !== "string") return peer;
  const candidate = normalizedIp(forwarded.split(",")[0]);
  return candidate || peer;
}

function makeCore(store, eventHub) {
  return createBattleCore({
    clock: { now: () => Date.now() },
    randomBytes: length => new Uint8Array(randomBytes(length)),
    store,
    battleRules: Battle,
    arcSim: ArcSim,
    events: eventHub
  });
}

function createActiveBattleCounter(capacity) {
  const active = new Set();
  let tail = Promise.resolve();
  let initialized = false;
  return {
    initialize(records) {
      active.clear();
      for (const record of records || []) {
        if (record && typeof record.battleId === "string" && !["VERDICT", "EXPIRED"].includes(record.state)) {
          active.add(record.battleId);
        }
      }
      initialized = true;
    },
    observe(battleId, event) {
      if (!event || !event.battle) return;
      if (["VERDICT", "EXPIRED"].includes(event.battle.state)) active.delete(battleId);
      else if (event.type === "battle.created") active.add(battleId);
    },
    remove(battleId) { active.delete(battleId); },
    size() { return active.size; },
    async create(input, createBattle) {
      let release;
      const prior = tail;
      const held = new Promise(resolve => { release = resolve; });
      const next = prior.then(() => held);
      tail = next;
      await prior;
      try {
        if (!initialized) throw new Error("active battle counter is not initialized");
        if (active.size >= capacity) throw new BattleServerError(503, "BATTLE_CAPACITY", "battle capacity reached");
        const result = await createBattle(input);
        if (result && result.battleId) active.add(result.battleId);
        return result;
      } finally {
        release();
        if (tail === next) tail = prior;
      }
    }
  };
}

async function listen(server, host, port) {
  await new Promise((resolve, reject) => {
    const onError = error => { server.off("listening", onListening); reject(error); };
    const onListening = () => { server.off("error", onError); resolve(); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

async function startProductionServer(options = {}) {
  const env = options.env || process.env;
  const config = options.config || loadConfig(env);
  const store = options.store || createFileStore(config.dataDirectory);
  const eventHub = options.eventHub || createEventHub();
  const core = options.core || makeCore(store, eventHub);
  const activeBattles = createActiveBattleCounter(config.activeBattleCapacity);
  const stopTrackingBattles = eventHub.onPublish
    ? eventHub.onPublish((battleId, event) => activeBattles.observe(battleId, event))
    : () => {};
  const startedAt = Date.now();
  let purgeRunning = false;
  const runPurge = async () => {
    if (purgeRunning) return { skipped: true };
    purgeRunning = true;
    try { return await purgeBattles(store, { now: Date.now(), ...config,
      onBattleDeleted: battleId => activeBattles.remove(battleId) }); }
    finally { purgeRunning = false; }
  };
  const server = createHttpServer(core, {
    eventHub,
    store,
    origins: config.origins,
    logRequests: true,
    clientIp: req => resolveClientIp(req, config.trustProxy),
    limits: {
      createsPerHour: config.createsPerHour,
      joinsPerHour: config.joinsPerHour,
      streamsPerIp: config.streamsPerIp
    },
    createBattle: input => activeBattles.create(input, value => core.createBattle(value)),
    health: () => ({ ok: true, engineVersion: ArcSim.VERSION,
      scoringVersion: ArcSim.SCORING_VERSION, uptimeS: Math.floor((Date.now() - startedAt) / 1000) })
  });
  let purgeTimer;
  let rearmedDeadlines = 0;
  try {
    const startupRecords = await store.list();
    const purgedAtStartup = new Set();
    await purgeBattles(store, { now: Date.now(), ...config, records: startupRecords,
      onBattleDeleted: battleId => purgedAtStartup.add(battleId) });
    const survivingRecords = startupRecords.filter(record => record && !purgedAtStartup.has(record.battleId));
    activeBattles.initialize(survivingRecords);
    rearmedDeadlines = await server.rearmDeadlines(survivingRecords);
    purgeTimer = setInterval(() => { void runPurge().catch(() => {}); }, PURGE_INTERVAL_MS);
    if (purgeTimer.unref) purgeTimer.unref();
    await listen(server, config.host, config.port);
  } catch (error) {
    if (purgeTimer) clearInterval(purgeTimer);
    stopTrackingBattles();
    server.close();
    throw error;
  }

  const address = server.address();
  console.log(JSON.stringify({ event: "battle_server_started",
    port: address && address.port, engineVersion: ArcSim.VERSION,
    scoringVersion: ArcSim.SCORING_VERSION, rearmedDeadlines }));

  let closing;
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      if (purgeTimer) clearInterval(purgeTimer);
      stopTrackingBattles();
      const closed = new Promise((resolve, reject) => {
        try { server.close(error => error ? reject(error) : resolve()); }
        catch (error) { reject(error); }
      });
      server.shutdownStreams();
      await closed;
      if (typeof store.flush === "function") await store.flush();
    })();
    return closing;
  }

  return { server, store, core, eventHub, config, close };
}

if (require.main === module) {
  startProductionServer().then(runtime => {
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      runtime.close().then(() => { process.exitCode = 0; }, () => { process.exitCode = 1; });
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  }).catch(error => {
    console.error("Battle production server failed to start: " + (error && error.message ? error.message : "unknown error"));
    process.exitCode = 1;
  });
}

module.exports = { loadConfig, parseOrigins, resolveClientIp, startProductionServer, makeCore,
  createActiveBattleCounter };
