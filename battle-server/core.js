"use strict";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const DAY_MS = 24 * 60 * 60 * 1000;
const COUNTDOWN_MS = 5_000;
const DEFAULT_SYNC_WINDOW_MS = 15 * 60 * 1000;
const STATUS_RATE_LIMIT_MS = 500;
const MAX_ATTEMPTS_PER_PLAYER = 20;
const MAX_EVENTS_PER_ATTEMPT = 60_000;
const REJECT_REASON_CODES = new Set(["coverage", "root", "ends", "heatInput", "underfill", "overflow", "porosity", "offAxis", "amps", "arc", "angle", "filler", "score"]);
const REC_FIELDS = new Set([
  "seed", "W", "H", "proc", "joint", "pos", "thick", "bead", "amps",
  "arc", "ang", "tig", "cvn", "uf", "rw", "events", "liveScore"
]);
const EVENT_FIELDS = new Set(["type", "t", "x", "y", "b", "k"]);
const EVENT_TYPES = new Set(["down", "move", "up", "bank"]);

class BattleServerError extends Error {
  constructor(status, code, message, detail) {
    super(message || code);
    this.name = "BattleServerError";
    this.status = status;
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

function base32(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function createBattleCore({ clock, randomBytes, store, battleRules, arcSim, events, syncWindowMs = DEFAULT_SYNC_WINDOW_MS }) {
  if (!clock || typeof clock.now !== "function") throw new TypeError("clock.now is required");
  if (typeof randomBytes !== "function") throw new TypeError("randomBytes is required");
  if (!store || typeof store.get !== "function" || typeof store.put !== "function") {
    throw new TypeError("store.get and store.put are required");
  }
  if (!battleRules || typeof battleRules.normalizeBattleTask !== "function" ||
      typeof battleRules.validateBattleTaskForArc !== "function" ||
      typeof battleRules.computeTaskHash !== "function") {
    throw new TypeError("battleRules must provide task normalization, validation and hashing");
  }
  if (!arcSim || typeof arcSim.VERSION !== "string" ||
      typeof arcSim.SCORING_VERSION !== "string" ||
      typeof arcSim.recommendedAmps !== "function" || typeof arcSim.simulate !== "function") {
    throw new TypeError("arcSim version stamps, recommendedAmps and simulate are required");
  }
  if (typeof battleRules.getBattlePoints !== "function") {
    throw new TypeError("battleRules.getBattlePoints is required");
  }
  if (!Number.isFinite(syncWindowMs) || syncWindowMs <= 0) throw new TypeError("syncWindowMs must be positive");
  const eventSink = events && typeof events.publish === "function" ? events : { publish() {} };
  const battleLocks = new Map();

  async function withBattleLock(battleId, operation) {
    const previous = battleLocks.get(battleId) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    const tail = previous.then(() => current);
    battleLocks.set(battleId, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (battleLocks.get(battleId) === tail) battleLocks.delete(battleId);
    }
  }

  function nowMs() {
    const value = clock.now();
    if (!Number.isFinite(value)) throw new TypeError("clock.now() must return milliseconds");
    return value;
  }

  function isoTime(value) {
    return new Date(value).toISOString();
  }

  function secureBytes(length) {
    const bytes = randomBytes(length);
    if (!(bytes instanceof Uint8Array) || bytes.length !== length) {
      throw new TypeError("randomBytes must return a Uint8Array of the requested length");
    }
    return bytes;
  }

  function secureSeed() {
    const bytes = secureBytes(4);
    return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  }

  async function sha256(value) {
    if (!globalThis.crypto || !globalThis.crypto.subtle) {
      throw new Error("Web Crypto is required");
    }
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  }

  function nickname(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") {
      throw new BattleServerError(400, "INVALID_NICKNAME", "nickname must be a string");
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/\p{Cc}/u.test(trimmed) || /[\u202A-\u202E\u2066-\u2069]/u.test(trimmed)) {
      throw new BattleServerError(400, "INVALID_NICKNAME", "nickname contains forbidden control or direction characters");
    }
    if (!trimmed.replace(/\p{Cf}/gu, "").trim()) {
      throw new BattleServerError(400, "INVALID_NICKNAME", "nickname must contain visible characters");
    }
    if ([...trimmed].length > 24) {
      throw new BattleServerError(400, "INVALID_NICKNAME", "nickname must be at most 24 characters");
    }
    return trimmed;
  }

  function credentials(slot, displayName) {
    const playerSessionId = "ps_" + base32(secureBytes(16));
    const playerSecret = base32(secureBytes(32));
    return {
      player: { slot, playerSessionId, secretHash: null, nickname: displayName, ready: false, readyAt: null,
        status: "idle", finished: false },
      playerSessionId,
      playerSecret
    };
  }

  async function publicBattle(record) {
    const seedVisible = record.mode === "sync"
      ? record.lockedAtMs != null
      : record.joinedAtMs != null;
    const task = { ...record.task };
    if (!seedVisible) delete task.seed;
    const playerView = player => player && ({
      nickname: player.nickname,
      ready: player.ready,
      readyAt: player.readyAt,
      finished: !!player.finished,
      status: player.status || "idle",
      attemptsCount: (record.attempts || []).filter(attempt => attempt.playerSessionId === player.playerSessionId).length,
      best: publicBest(record.attempts || [], player.playerSessionId)
    });
    return {
      battleId: record.battleId,
      mode: record.mode,
      state: record.state,
      task,
      ...(seedVisible ? { taskHash: record.taskHash } : {}),
      inputProfile: record.inputProfile,
      engineVersion: record.engineVersion,
      scoringVersion: record.scoringVersion,
      createdAt: record.createdAt,
      joinedAt: record.joinedAt,
      lockedAt: record.lockedAt,
      startAt: record.startAt || null,
      players: { P1: playerView(record.players.P1), P2: playerView(record.players.P2) },
      verdict: record.state === "VERDICT" ? record.verdict : null
    };
  }

  // Przyczyny odrzutu z sim.js — tylko znane kody, bez duplikatów; stare próby (sprzed pola) dają [].
  function sanitizeRejectReasons(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(code => REJECT_REASON_CODES.has(code)))];
  }

  function publicAttempt(attempt) {
    if (!attempt) return null;
    return {
      attemptNumber: attempt.attemptNumber,
      score: attempt.score,
      bp: attempt.bp,
      letter: attempt.letter,
      qualified: attempt.qualified,
      taskCompleted: attempt.taskCompleted,
      inspectionRejected: attempt.inspectionRejected,
      rejectReasons: sanitizeRejectReasons(attempt.rejectReasons),
      serverTime: attempt.serverTime
    };
  }

  async function persistEvents(record, specs) {
    const startSeq = Number.isInteger(record.eventSeq) ? record.eventSeq : 0;
    record.eventSeq = startSeq + specs.length;
    await store.put(record.battleId, record);
    for (let index = 0; index < specs.length; index++) {
      const spec = specs[index];
      const snapshot = await publicBattle(record);
      delete snapshot.taskHash;
      const event = {
        seq: startSeq + index + 1,
        type: spec.type,
        at: isoTime(nowMs()),
        battle: snapshot,
        ...(spec.data ? { data: structuredClone(spec.data) } : {})
      };
      try { eventSink.publish(record.battleId, event); } catch (_) {}
    }
  }

  function nextDeadline(record) {
    if (!record || record.state === "VERDICT" || record.state === "EXPIRED") return null;
    if (record.mode === "sync" && record.startAtMs != null) {
      return { atMs: record.startAtMs + syncWindowMs, kind: "verdict" };
    }
    if (record.mode === "link" && record.joinedAtMs != null) {
      return { atMs: record.joinedAtMs + DAY_MS, kind: "verdict" };
    }
    return { atMs: record.createdAtMs + DAY_MS, kind: "expire" };
  }

  function publicBest(attempts, playerSessionId) {
    const own = attempts.filter(attempt => attempt.playerSessionId === playerSessionId);
    own.sort((a, b) => Number(b.qualified) - Number(a.qualified) || b.bp - a.bp ||
      a.serverTimeMs - b.serverTimeMs || a.attemptNumber - b.attemptNumber);
    return publicAttempt(own[0]);
  }

  function canonicalJson(value) {
    if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function invalidAttempt(reason, message) {
    throw new BattleServerError(400, "INVALID_ATTEMPT", message || "attempt failed validation", reason);
  }

  function validateAttempt(rec, record) {
    if (!rec || typeof rec !== "object" || Array.isArray(rec)) invalidAttempt("REC_NOT_OBJECT");
    for (const key of Object.keys(rec)) {
      if (!REC_FIELDS.has(key)) invalidAttempt("UNKNOWN_REC_FIELD", "unknown rec field: " + key);
    }
    for (const key of ["seed", "W", "H", "proc", "joint", "pos", "thick", "bead", "amps"]) {
      if (rec[key] !== record.task[key]) invalidAttempt("TASK_MISMATCH", "recording does not match the locked task: " + key);
    }
    if (typeof rec.rw !== "number" || !Number.isFinite(rec.rw) || rec.rw < 400) {
      invalidAttempt("RENDER_WIDTH_UNSUPPORTED", "recording width must be at least 400 px");
    }
    const expectedCvn = record.task.bead === "steel" ? 1 : 0;
    if (rec.cvn !== expectedCvn) invalidAttempt("CVN_MISMATCH", "recording cvn flag does not match the task");
    // 3.6.0: bez `uf` silnik pomija próg za szybkiego przejazdu — wycięcie flagi nie może go obejść
    if (rec.uf !== 1) invalidAttempt("UF_MISMATCH", "recording uf flag is required");
    const expectedArc = record.inputProfile === "full" ? 1 : 0;
    const expectedAng = record.inputProfile === "full" ? 1 : 0;
    const expectedTig = record.inputProfile === "full" && record.task.proc === "TIG" ? 1 : 0;
    if (rec.arc !== expectedArc || rec.ang !== expectedAng || rec.tig !== expectedTig) {
      throw new BattleServerError(400, "INPUT_PROFILE_MISMATCH", "recording does not match the battle input profile");
    }
    if (!Array.isArray(rec.events) || rec.events.length === 0) invalidAttempt("EVENTS_EMPTY");
    if (rec.events.length > MAX_EVENTS_PER_ATTEMPT) invalidAttempt("EVENT_LIMIT");
    let previousTime = -Infinity;
    for (let index = 0; index < rec.events.length; index++) {
      const event = rec.events[index];
      if (!event || typeof event !== "object" || Array.isArray(event)) invalidAttempt("EVENT_NOT_OBJECT");
      for (const key of Object.keys(event)) if (!EVENT_FIELDS.has(key)) invalidAttempt("UNKNOWN_EVENT_FIELD");
      if (!EVENT_TYPES.has(event.type)) invalidAttempt("EVENT_TYPE_INVALID");
      if (!Number.isFinite(event.t) || !Number.isInteger(event.t) || event.t < 0 || event.t < previousTime) {
        invalidAttempt("EVENT_TIME_INVALID");
      }
      previousTime = event.t;
      if (!Number.isFinite(event.x) || !Number.isFinite(event.y) ||
          event.x < -record.task.W || event.x > 2 * record.task.W ||
          event.y < -record.task.H || event.y > 2 * record.task.H) {
        invalidAttempt("EVENT_COORDINATE_INVALID");
      }
      for (const key of ["b", "k"]) {
        if (event[key] !== undefined && (!Number.isInteger(event[key]) || event[key] < 0 || event[key] > 255)) {
          invalidAttempt("EVENT_MASK_INVALID");
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(rec, "liveScore") &&
        (typeof rec.liveScore !== "number" || !Number.isFinite(rec.liveScore))) {
      invalidAttempt("CLIENT_SCORE_INVALID");
    }
    const sanitized = { ...rec, events: rec.events.map(event => ({ ...event })) };
    delete sanitized.liveScore;
    return sanitized;
  }

  function botSignals(events) {
    const moves = events.filter(event => event.type === "move");
    if (moves.length < 25) return { verdict: "ZA_MALO_PROBEK", detail: `${moves.length} zdarzeń ruchu` };
    const dts = [];
    for (let i = 1; i < moves.length; i++) dts.push(moves[i].t - moves[i - 1].t);
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    const std = values => Math.sqrt(mean(values.map(value => (value - mean(values)) ** 2)));
    const resid = [];
    for (let i = 1; i < moves.length - 1; i++) {
      const a = moves[i - 1], b = moves[i], c = moves[i + 1];
      const dx = c.x - a.x, dy = c.y - a.y, len = Math.hypot(dx, dy) || 1;
      resid.push(Math.abs((b.x - a.x) * dy - (b.y - a.y) * dx) / len);
    }
    const dtStd = std(dts), rStd = std(resid), rMean = mean(resid);
    const metronome = dtStd < 0.75, ruler = rMean < 0.08 && rStd < 0.12;
    return {
      verdict: metronome && ruler ? "BOT" : (metronome || ruler ? "PODEJRZANY" : "BEZ_ZASTRZEZEN"),
      detail: `dtStd=${dtStd.toFixed(2)} residMean=${rMean.toFixed(3)} residStd=${rStd.toFixed(3)}`
    };
  }

  async function applyDeadline(record, deadline) {
    if (!deadline || nowMs() < deadline.atMs) return false;
    if (deadline.kind === "verdict") {
      await decideBattle(record, deadline.atMs);
    } else if (deadline.kind === "expire") {
      record.state = "EXPIRED";
      record.expiredAt = isoTime(deadline.atMs);
      await persistEvents(record, [{ type: "battle.expired" }]);
    }
    return true;
  }

  async function expireIfNeeded(record) {
    await applyDeadline(record, nextDeadline(record));
    return record;
  }

  async function loadBattle(battleId) {
    const record = await store.get(battleId);
    if (!record) throw new BattleServerError(404, "BATTLE_NOT_FOUND", "battle not found");
    return expireIfNeeded(record);
  }

  async function nextDeadlineFor(battleId) {
    return withBattleLock(battleId, async () => {
      const record = await loadBattle(battleId);
      return nextDeadline(record);
    });
  }

  async function runDeadline(battleId) {
    return withBattleLock(battleId, async () => {
      const record = await store.get(battleId);
      if (!record) throw new BattleServerError(404, "BATTLE_NOT_FOUND", "battle not found");
      const deadline = nextDeadline(record);
      const ran = await applyDeadline(record, deadline);
      return { ran, deadline, battle: await publicBattle(record) };
    });
  }

  async function getBattleEventSnapshot(battleId) {
    return withBattleLock(battleId, async () => {
      const record = await loadBattle(battleId);
      const battle = await publicBattle(record);
      delete battle.taskHash;
      return {
        seq: Number.isInteger(record.eventSeq) ? record.eventSeq : 0,
        type: "battle.snapshot",
        at: isoTime(nowMs()),
        battle
      };
    });
  }

  function requireLive(record) {
    if (record.state === "VERDICT") {
      throw new BattleServerError(409, "BATTLE_DECIDED", "battle verdict is final");
    }
    if (record.state === "EXPIRED") {
      throw new BattleServerError(409, "BATTLE_EXPIRED", "battle expired");
    }
    if (record.state === "LOCKED") {
      throw new BattleServerError(409, "BATTLE_LOCKED", "battle is locked");
    }
  }

  function parseAuthorization(value) {
    if (typeof value !== "string") return null;
    const match = /^Bearer\s+(ps_[a-z2-7]+)\.([a-z2-7]+)$/i.exec(value.trim());
    if (!match) return null;
    return { playerSessionId: match[1], playerSecret: match[2] };
  }

  async function authorize(record, auth) {
    const parsed = typeof auth === "string" ? parseAuthorization(auth) : auth;
    if (!parsed || typeof parsed.playerSessionId !== "string" || typeof parsed.playerSecret !== "string") {
      throw new BattleServerError(401, "AUTH_REQUIRED", "player credentials required");
    }
    const player = [record.players.P1, record.players.P2].find(p =>
      p && p.playerSessionId === parsed.playerSessionId);
    if (!player || !constantTimeEqual(await sha256(parsed.playerSecret), player.secretHash)) {
      throw new BattleServerError(401, "INVALID_CREDENTIALS", "invalid player credentials");
    }
    return player;
  }

  async function createBattle(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BattleServerError(400, "INVALID_BODY", "JSON object required");
    }
    if (input.mode !== "sync" && input.mode !== "link") {
      throw new BattleServerError(400, "INVALID_MODE", "mode must be sync or link");
    }
    const inputProfile = input.inputProfile === undefined ? "full" : input.inputProfile;
    if (inputProfile !== "full" && inputProfile !== "touch") {
      throw new BattleServerError(400, "INVALID_INPUT_PROFILE", "inputProfile must be full or touch");
    }

    let task;
    try {
      const taskSource = Object.assign({}, input.task, { seed: secureSeed() });
      task = battleRules.normalizeBattleTask(taskSource);
      const check = battleRules.validateBattleTaskForArc(task, arcSim);
      if (!check.supported) {
        throw new BattleServerError(400, check.reason, check.detail || check.reason);
      }
      task = check.task;
      if (task.W !== 1280 || task.H !== 720) {
        throw new BattleServerError(400, "TASK_UNSUPPORTED", "Battle Weld requires a 1280x720 task");
      }
      if (task.requiredCoverage !== 0.8) {
        throw new BattleServerError(400, "TASK_UNSUPPORTED", "Battle Weld requires requiredCoverage 0.8");
      }
    } catch (error) {
      if (error instanceof BattleServerError) throw error;
      throw new BattleServerError(400, "TASK_UNSUPPORTED", error.message);
    }

    const battleId = "bw_" + base32(secureBytes(16));
    const p1 = credentials("P1", nickname(input.nickname));
    p1.player.secretHash = await sha256(p1.playerSecret);
    const inviteSecret = base32(secureBytes(32));
    const createdAtMs = nowMs();
    const record = {
      battleId,
      mode: input.mode,
      inputProfile,
      state: "CREATED",
      task,
      taskHash: await battleRules.computeTaskHash(task),
      engineVersion: arcSim.VERSION,
      scoringVersion: arcSim.SCORING_VERSION,
      createdAtMs,
      createdAt: isoTime(createdAtMs),
      joinedAt: null,
      joinedAtMs: null,
      lockedAt: null,
      lockedAtMs: null,
      startAt: null,
      startAtMs: null,
      attempts: [],
      eventSeq: 0,
      inviteSecretHash: await sha256(inviteSecret),
      players: { P1: p1.player, P2: null }
    };
    await persistEvents(record, [{ type: "battle.created" }]);
    return {
      battleId,
      playerSessionId: p1.playerSessionId,
      playerSecret: p1.playerSecret,
      inviteSecret,
      slot: "P1",
      battle: await publicBattle(record)
    };
  }

  async function joinBattle(battleId, input = {}, auth = null) {
    return withBattleLock(battleId, async () => {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new BattleServerError(400, "INVALID_BODY", "JSON object required");
      }
      const record = await loadBattle(battleId);
      requireLive(record);
      if (record.state !== "CREATED") {
        throw new BattleServerError(409, "BATTLE_ALREADY_JOINED", "battle already has a second player");
      }
      const parsedAuth = typeof auth === "string" ? parseAuthorization(auth) : auth;
      if (parsedAuth && parsedAuth.playerSessionId === record.players.P1.playerSessionId) {
        const valid = await authorize(record, parsedAuth);
        if (valid.slot === "P1") {
          throw new BattleServerError(409, "SELF_JOIN", "creator cannot join as P2");
        }
      }
      if (typeof input.inviteSecret !== "string" || !input.inviteSecret) {
        throw new BattleServerError(401, "INVITE_REQUIRED", "one-time invite secret required");
      }
      if (!constantTimeEqual(await sha256(input.inviteSecret), record.inviteSecretHash)) {
        throw new BattleServerError(403, "INVALID_INVITE", "invalid invite secret");
      }
      const p2 = credentials("P2", nickname(input.nickname));
      p2.player.secretHash = await sha256(p2.playerSecret);
      const joinedAtMs = nowMs();
      record.players.P2 = p2.player;
      record.inviteSecretHash = null;
      record.joinedAtMs = joinedAtMs;
      record.joinedAt = isoTime(joinedAtMs);
      record.state = "JOINED";
      await persistEvents(record, [{ type: "player.joined", data: { slot: "P2" } }]);
      return {
        battleId,
        playerSessionId: p2.playerSessionId,
        playerSecret: p2.playerSecret,
        slot: "P2",
        battle: await publicBattle(record)
      };
    });
  }

  async function readyBattle(battleId, auth) {
    return withBattleLock(battleId, async () => {
      const record = await loadBattle(battleId);
      requireLive(record);
      if (!record.players.P2) {
        throw new BattleServerError(409, "WAITING_FOR_OPPONENT", "second player has not joined");
      }
      const player = await authorize(record, auth);
      if (player.ready) {
        throw new BattleServerError(409, "ALREADY_READY", "player is already ready");
      }
      const readyAtMs = nowMs();
      player.ready = true;
      player.readyAt = isoTime(readyAtMs);
      if (record.players.P1.ready && record.players.P2.ready) {
        record.state = "LOCKED";
        record.lockedAtMs = readyAtMs;
        record.lockedAt = isoTime(readyAtMs);
        record.startAtMs = readyAtMs + COUNTDOWN_MS;
        record.startAt = isoTime(record.startAtMs);
      } else {
        record.state = "READY";
      }
      const specs = [{ type: "player.ready", data: { slot: player.slot } }];
      if (record.state === "LOCKED") {
        specs.push({ type: "battle.locked" });
        specs.push({ type: "battle.countdown", data: { startAt: record.startAt } });
      }
      await persistEvents(record, specs);
      return { battle: await publicBattle(record) };
    });
  }

  async function getBattle(battleId) {
    return withBattleLock(battleId, async () => publicBattle(await loadBattle(battleId)));
  }

  async function submitAttempt(battleId, input, auth) {
    return withBattleLock(battleId, async () => {
      const record = await loadBattle(battleId);
      if (record.state === "EXPIRED") {
        throw new BattleServerError(409, "BATTLE_EXPIRED", "battle expired");
      }
      if (record.state === "VERDICT") {
        throw new BattleServerError(409, "BATTLE_DECIDED", "battle verdict is final");
      }
      const player = await authorize(record, auth);
      if (player.finished) throw new BattleServerError(409, "PLAYER_FINISHED", "player has finished this battle");
      if (record.mode === "sync" && record.state !== "LOCKED") {
        throw new BattleServerError(409, "BATTLE_NOT_STARTED", "synchronized battle has not started");
      }
      if (record.mode === "sync" && nowMs() < record.startAtMs) {
        throw new BattleServerError(409, "BATTLE_NOT_STARTED", "synchronized countdown has not finished");
      }
      if (record.mode === "link" && !["JOINED", "READY", "LOCKED"].includes(record.state)) {
        throw new BattleServerError(409, "BATTLE_NOT_JOINED", "both players must join before attempts begin");
      }
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new BattleServerError(400, "INVALID_BODY", "JSON object required");
      }
      for (const key of Object.keys(input)) {
        if (key !== "rec" && key !== "clientScore") invalidAttempt("UNKNOWN_ATTEMPT_FIELD", "unknown attempt field: " + key);
      }
      const sanitizedRec = validateAttempt(input.rec, record);
      const receivedAtMs = nowMs();
      const windowStart = record.mode === "sync" ? record.startAtMs : record.joinedAtMs;
      const elapsed = Math.max(0, receivedAtMs - windowStart);
      const span = sanitizedRec.events[sanitizedRec.events.length - 1].t - sanitizedRec.events[0].t;
      if (span > elapsed + 2000) invalidAttempt("ROUND_TOO_LONG", "recorded round is longer than the attempt window");

      const payloadHash = await sha256(canonicalJson(sanitizedRec));
      const attempts = record.attempts || [];
      if (attempts.some(attempt => attempt.payloadHash === payloadHash)) {
        throw new BattleServerError(409, "DUPLICATE_ATTEMPT", "this recording was already submitted");
      }
      const playerAttempts = attempts.filter(attempt => attempt.playerSessionId === player.playerSessionId);
      if (playerAttempts.length >= MAX_ATTEMPTS_PER_PLAYER) {
        throw new BattleServerError(429, "ATTEMPT_LIMIT", "maximum accepted attempts reached");
      }

      const recForReplay = structuredClone(sanitizedRec);
      const timer = globalThis.performance && typeof globalThis.performance.now === "function"
        ? () => globalThis.performance.now()
        : () => nowMs();
      const replayEngineVersion = arcSim.VERSION;
      const replayScoringVersion = arcSim.SCORING_VERSION;
      const replayTaskHash = record.taskHash;
      const simStarted = timer();
      let sim;
      try {
        sim = arcSim.simulate(recForReplay);
      } catch (error) {
        throw new BattleServerError(422, "REPLAY_FAILED", "recording replay failed", error && error.message);
      }
      const simMs = Math.max(0, timer() - simStarted);
      if (!sim || !Number.isInteger(sim.score) || sim.score < 0 || sim.score > 100 ||
          !Number.isFinite(sim.coverage) || sim.coverage < 0 || sim.coverage > 1 ||
          typeof sim.iso !== "string" || typeof sim.letter !== "string") {
        throw new BattleServerError(422, "REPLAY_FAILED", "replay returned an invalid result");
      }
      const score = sim.score;
      const bp = battleRules.getBattlePoints(score);
      const inspectionRejected = sim.iso === "REJECT";
      const rejectReasons = inspectionRejected ? sanitizeRejectReasons(sim.rejectReasons) : [];
      const taskCompleted = sim.coverage >= record.task.requiredCoverage;
      const qualified = taskCompleted && !inspectionRejected;
      const acceptedAtMs = nowMs();
      const clientScore = typeof input.clientScore === "number"
        ? input.clientScore
        : (typeof input.rec.liveScore === "number" ? input.rec.liveScore : null);
      const attempt = {
        attemptNumber: playerAttempts.length + 1,
        playerSessionId: player.playerSessionId,
        score,
        coverage: sim.coverage,
        bp,
        letter: sim.letter,
        qualified,
        taskCompleted,
        inspectionRejected,
        rejectReasons,
        serverTime: isoTime(acceptedAtMs),
        serverTimeMs: acceptedAtMs,
        engineVersion: replayEngineVersion,
        scoringVersion: replayScoringVersion,
        taskHash: replayTaskHash,
        rec: structuredClone(sanitizedRec),
        recStoredAt: isoTime(acceptedAtMs),
        payloadHash,
        clientScore,
        scoreMismatch: typeof clientScore === "number" && clientScore !== score,
        botSignals: botSignals(sanitizedRec.events),
        simMs
      };
      record.attempts = attempts.concat([attempt]);
      await persistEvents(record, [{ type: "attempt.accepted", data: { slot: player.slot, attempt: publicAttempt(attempt) } }]);
      return { attempt: publicAttempt(attempt), best: publicBest(record.attempts, player.playerSessionId) };
    });
  }

  async function statusBattle(battleId, input, auth) {
    return withBattleLock(battleId, async () => {
      const record = await loadBattle(battleId);
      if (record.state === "VERDICT") throw new BattleServerError(409, "BATTLE_DECIDED", "battle verdict is final");
      if (record.state === "EXPIRED") throw new BattleServerError(409, "BATTLE_EXPIRED", "battle expired");
      const player = await authorize(record, auth);
      if (player.finished) throw new BattleServerError(409, "PLAYER_FINISHED", "player has finished this battle");
      if (!input || typeof input !== "object" || !["welding", "idle"].includes(input.status)) {
        throw new BattleServerError(400, "INVALID_STATUS", "status must be welding or idle");
      }
      const currentTime = nowMs();
      if (record.mode === "sync") {
        if (record.state !== "LOCKED" || currentTime < record.startAtMs) {
          throw new BattleServerError(409, "BATTLE_NOT_STARTED", "status is unavailable before the synchronized start");
        }
      } else if (record.joinedAtMs == null) {
        throw new BattleServerError(409, "BATTLE_NOT_JOINED", "both players must join before status updates");
      }
      if (player.status === input.status) return { battle: await publicBattle(record), changed: false };
      if (player.statusAtMs != null && currentTime - player.statusAtMs < STATUS_RATE_LIMIT_MS) {
        throw new BattleServerError(429, "STATUS_RATE_LIMIT", "status may change once every 500 ms");
      }
      player.status = input.status;
      player.statusAtMs = currentTime;
      await persistEvents(record, [{ type: "player.status", data: { slot: player.slot, status: player.status } }]);
      return { battle: await publicBattle(record), changed: true };
    });
  }

  function verdictResult(attempt) {
    if (!attempt) return null;
    return {
      score: attempt.score,
      grade: attempt.letter,
      inspectionRejected: attempt.inspectionRejected,
      rejectReasons: sanitizeRejectReasons(attempt.rejectReasons),
      taskCompleted: attempt.taskCompleted,
      challengePassed: false,
      coverage: attempt.coverage,
      taskHash: attempt.taskHash,
      scoringVersion: attempt.scoringVersion,
      engineVersion: attempt.engineVersion,
      attemptNumber: attempt.attemptNumber,
      attemptsStarted: attempt.attemptNumber,
      serverTimeMs: attempt.serverTimeMs
    };
  }

  function bestAttemptFor(record, player) {
    if (!player) return null;
    const mine = (record.attempts || []).filter(attempt => attempt.playerSessionId === player.playerSessionId);
    if (!mine.length) return null;
    return mine.slice().sort((a, b) => Number(b.qualified) - Number(a.qualified) || b.bp - a.bp ||
      a.serverTimeMs - b.serverTimeMs || a.attemptNumber - b.attemptNumber)[0];
  }

  async function decideBattle(record, decidedAtMs = nowMs(), precedingEvents = []) {
    if (record.state === "VERDICT") return record;
    const p1Attempt = bestAttemptFor(record, record.players.P1);
    const p2Attempt = bestAttemptFor(record, record.players.P2);
    const p1Best = verdictResult(p1Attempt);
    const p2Best = verdictResult(p2Attempt);
    let code = "NO_QUALIFIED_RESULT";
    let tieBreak;
    if (p1Best && p2Best) {
      code = battleRules.battleVerdict(p1Best, p2Best, { mode: record.mode });
      if (record.mode === "sync" && p1Best.taskCompleted && !p1Best.inspectionRejected &&
          p2Best.taskCompleted && !p2Best.inspectionRejected && p1Best.score === p2Best.score &&
          p1Best.serverTimeMs !== p2Best.serverTimeMs) tieBreak = "serverTime";
    } else if (p1Best && p1Best.taskCompleted && !p1Best.inspectionRejected) {
      code = "P1_WINS";
    } else if (p2Best && p2Best.taskCompleted && !p2Best.inspectionRejected) {
      code = "P2_WINS";
    }
    record.verdict = {
      code,
      mode: record.mode,
      decidedAt: isoTime(decidedAtMs),
      ...(tieBreak ? { tieBreak } : {}),
      p1Best: publicAttempt(p1Attempt),
      p2Best: publicAttempt(p2Attempt)
    };
    record.state = "VERDICT";
    await persistEvents(record, [...precedingEvents, { type: "battle.verdict", data: { verdict: record.verdict } }]);
    return record;
  }

  async function finishBattle(battleId, auth) {
    return withBattleLock(battleId, async () => {
      const record = await loadBattle(battleId);
      const player = await authorize(record, auth);
      if (record.state === "VERDICT") throw new BattleServerError(409, "BATTLE_DECIDED", "battle verdict is final");
      if (record.state === "EXPIRED") throw new BattleServerError(409, "BATTLE_EXPIRED", "battle expired");
      if (player.finished) throw new BattleServerError(409, "PLAYER_FINISHED", "player has finished this battle");
      if (record.mode === "sync" && record.state !== "LOCKED") {
        throw new BattleServerError(409, "BATTLE_NOT_STARTED", "synchronized battle has not started");
      }
      if (record.mode === "link" && record.joinedAtMs == null) {
        throw new BattleServerError(409, "BATTLE_NOT_JOINED", "both players must join before finishing");
      }
      player.finished = true;
      player.finishedAt = isoTime(nowMs());
      if (record.players.P1.finished && record.players.P2 && record.players.P2.finished) {
        await decideBattle(record, nowMs(), [{ type: "player.finished", data: { slot: player.slot } }]);
      } else {
        await persistEvents(record, [{ type: "player.finished", data: { slot: player.slot } }]);
      }
      return { battle: await publicBattle(record) };
    });
  }

  return {
    createBattle, joinBattle, readyBattle, getBattle, submitAttempt, finishBattle, statusBattle,
    getBattleEventSnapshot, nextDeadline, nextDeadlineFor, runDeadline
  };
}

module.exports = { createBattleCore, BattleServerError };
