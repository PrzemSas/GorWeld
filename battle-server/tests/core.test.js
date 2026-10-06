"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Battle = require("../../arc/battle.js");
const ArcSim = require("../../arc/sim.js");
const { build: buildRound } = require("../../arc/tests/gen.js");
const { createBattleCore, BattleServerError } = require("../core.js");
const { createMemoryStore } = require("../memory-store.js");
const { createHttpServer, createEventHub } = require("../dev-server.js");
const { Readable } = require("node:stream");
const { createHash } = require("node:crypto");

const TASK = {
  seed: 1296914737, W: 1280, H: 720, proc: "MMA", joint: "butt", pos: "PA",
  thick: 3, bead: "steel", amps: 60, ampMode: "auto", requiredCoverage: 0.8
};

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function createExpiryRaceStore() {
  const backing = createMemoryStore();
  let lockedGate = null;
  let expiredGate = null;
  let lockedReached = null;
  let expiredReached = null;
  return {
    async get(id) { return backing.get(id); },
    async put(id, record) {
      if (record.state === "LOCKED" && lockedGate) {
        const gate = lockedGate;
        lockedGate = null;
        lockedReached.resolve();
        await gate.promise;
      }
      if (record.state === "EXPIRED" && expiredGate) {
        const gate = expiredGate;
        expiredGate = null;
        expiredReached.resolve();
        await gate.promise;
      }
      await backing.put(id, record);
    },
    holdNextLockedWrite() {
      lockedGate = deferred();
      lockedReached = deferred();
      return { reached: lockedReached.promise, release: lockedGate.resolve };
    },
    holdNextExpiredWrite() {
      expiredGate = deferred();
      expiredReached = deferred();
      return { reached: expiredReached.promise, release: expiredGate.resolve };
    }
  };
}

function harness(store = createMemoryStore(), arcSim = ArcSim, options = {}) {
  let now = Date.UTC(2026, 9, 3, 12, 0, 0);
  let randomSequence = 1;
  const core = createBattleCore({
    clock: { now: () => now },
    randomBytes(length) {
      const out = new Uint8Array(length);
      out.fill(randomSequence++);
      return out;
    },
    store,
    battleRules: Battle,
    arcSim,
    events: options.events,
    syncWindowMs: options.syncWindowMs
  });
  return { core, store, now: () => now, setNow: value => { now = value; }, advance: ms => { now += ms; } };
}

async function createAndJoin(core, mode = "sync") {
  const created = await core.createBattle({ task: TASK, mode, nickname: " Welder 1 " });
  const joined = await core.joinBattle(created.battleId, { nickname: "Welder 2", inviteSecret: created.inviteSecret });
  return { created, joined };
}

function authFor(credentials) {
  return { playerSessionId: credentials.playerSessionId, playerSecret: credentials.playerSecret };
}

function roundFor(task, inputProfile = "full", options = {}) {
  const full = inputProfile === "full";
  const rec = buildRound({
    seed: task.seed, W: task.W, H: task.H, proc: task.proc, joint: task.joint,
    pos: task.pos, thick: task.thick, bead: task.bead, amps: task.amps,
    arc: full, ang: full, vFac: options.vFac === undefined ? 1 : options.vFac,
    dtMs: options.dtMs === undefined ? 8 : options.dtMs,
    passes: options.passes
  });
  rec.amps = task.amps;
  rec.arc = full ? 1 : 0;
  rec.ang = full ? 1 : 0;
  rec.tig = full && task.proc === "TIG" ? 1 : 0;
  rec.cvn = task.bead === "steel" ? 1 : 0;
  rec.rw = options.rw === undefined ? 1280 : options.rw;
  return rec;
}

async function openBattle(core, mode = "sync", inputProfile = "full", task = TASK) {
  const created = await core.createBattle({ task, mode, inputProfile });
  const joined = await core.joinBattle(created.battleId, { inviteSecret: created.inviteSecret });
  if (mode === "sync") {
    await core.readyBattle(created.battleId, authFor(created));
    await core.readyBattle(created.battleId, authFor(joined));
  }
  const battle = await core.getBattle(created.battleId);
  return { created, joined, battle };
}

function roundSpan(rec) {
  return rec.events[rec.events.length - 1].t - rec.events[0].t;
}

async function submitAtWindow(h, opened, player, rec, extra = {}) {
  const stored = await h.store.get(opened.created.battleId);
  const windowStart = stored.mode === "sync" ? stored.startAtMs : stored.joinedAtMs;
  const target = windowStart + roundSpan(rec) + 1;
  if (h.now() < target) h.setNow(target);
  return h.core.submitAttempt(opened.created.battleId, { rec, ...extra }, authFor(player));
}

async function moveToAttemptWindow(h, opened, offsetMs = 10_000) {
  const stored = await h.store.get(opened.created.battleId);
  h.setNow((stored.mode === "sync" ? stored.startAtMs : stored.joinedAtMs) + offsetMs);
}

function fakeSimHarness(outcomes) {
  let index = 0;
  const fakeArcSim = { ...ArcSim, simulate() { return outcomes[index++]; } };
  return harness(createMemoryStore(), fakeArcSim);
}

async function rejectsCode(promise, code, status) {
  await assert.rejects(promise, error => {
    assert.ok(error instanceof BattleServerError);
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  });
}

async function httpRequest(server, method, url, body, authorization) {
  const requestBody = body === undefined ? [] : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))];
  const req = Readable.from(requestBody);
  req.method = method;
  req.url = url;
  req.headers = authorization ? { authorization } : {};
  return new Promise((resolve, reject) => {
    const res = {
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(value) { resolve({ status: this.status, headers: this.headers, body: JSON.parse(value) }); }
    };
    try { server.emit("request", req, res); } catch (error) { reject(error); }
  });
}

async function listenEphemeral(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function readSseFrame(reader, state, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const split = state.buffer.indexOf("\n\n");
    if (split !== -1) {
      const raw = state.buffer.slice(0, split);
      state.buffer = state.buffer.slice(split + 2);
      const fields = {};
      for (const line of raw.split("\n")) {
        const colon = line.indexOf(":");
        if (colon < 0) continue;
        fields[line.slice(0, colon)] = line.slice(colon + 1).replace(/^ /, "");
      }
      return { id: fields.id, event: fields.event, data: JSON.parse(fields.data) };
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("timed out waiting for SSE frame");
    let timeout;
    try {
      const result = await Promise.race([
        reader.read(),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("timed out waiting for SSE bytes")), remaining); })
      ]);
      if (result.done) throw new Error("SSE stream ended unexpectedly");
      state.buffer += new TextDecoder().decode(result.value, { stream: true });
    } finally { clearTimeout(timeout); }
  }
}

async function closeHttpServer(server) {
  await new Promise(resolve => server.close(resolve));
}

test("creates battle with a server seed, versions, ID and timestamp", async () => {
  const { core, store } = harness();
  const created = await core.createBattle({
    task: TASK, mode: "link", taskHash: "forged", engineVersion: "forged",
    scoringVersion: "forged", createdAt: "1900-01-01T00:00:00.000Z", nickname: "  P1  "
  });
  assert.match(created.battleId, /^bw_[a-z2-7]{26}$/);
  assert.match(created.playerSessionId, /^ps_[a-z2-7]{26}$/);
  assert.equal(created.slot, "P1");
  assert.ok(created.playerSecret.length >= 50);
  assert.match(created.inviteSecret, /^[a-z2-7]{52}$/);
  assert.equal(created.battle.task.seed, undefined);
  assert.equal(created.battle.taskHash, undefined);
  const storedTask = (await store.get(created.battleId)).task;
  assert.notEqual(storedTask.seed, TASK.seed);
  assert.equal(created.battle.task.W, TASK.W);
  const storedBattle = await store.get(created.battleId);
  assert.equal(storedBattle.taskHash, await Battle.computeTaskHash(storedBattle.task));
  assert.equal(created.battle.engineVersion, ArcSim.VERSION);
  assert.equal(created.battle.scoringVersion, ArcSim.SCORING_VERSION);
  assert.equal(created.battle.createdAt, "2026-10-03T12:00:00.000Z");
  assert.equal(created.battle.players.P1.nickname, "P1");
  assert.equal(created.battle.state, "CREATED");
  const stored = await store.get(created.battleId);
  assert.equal(stored.inviteSecretHash, createHash("sha256").update(created.inviteSecret).digest("hex"));
  assert.match(stored.inviteSecretHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(stored).includes(created.inviteSecret), false);
  assert.equal(JSON.stringify(created.battle).includes(created.inviteSecret), false);
});

test("joins once, records server time and rejects a second join", async () => {
  const { core } = harness();
  const created = await core.createBattle({ task: TASK, mode: "sync" });
  const joined = await core.joinBattle(created.battleId, { nickname: "P2", inviteSecret: created.inviteSecret });
  assert.equal(joined.slot, "P2");
  assert.equal(joined.battle.state, "JOINED");
  assert.equal(joined.battle.players.P2.nickname, "P2");
  await rejectsCode(core.joinBattle(created.battleId), "BATTLE_ALREADY_JOINED", 409);
});

test("P2 invite is mandatory, checked, consumed once and hidden from public GET", async () => {
  const { core, store } = harness();
  const created = await core.createBattle({ task: TASK, mode: "sync" });
  await rejectsCode(core.joinBattle(created.battleId, {}), "INVITE_REQUIRED", 401);
  await rejectsCode(core.joinBattle(created.battleId, { inviteSecret: "wrong" }), "INVALID_INVITE", 403);
  const joined = await core.joinBattle(created.battleId, { inviteSecret: created.inviteSecret });
  assert.equal(joined.slot, "P2");
  assert.equal((await store.get(created.battleId)).inviteSecretHash, null);
  await rejectsCode(core.joinBattle(created.battleId, { inviteSecret: created.inviteSecret }), "BATTLE_ALREADY_JOINED", 409);

  const publicRecord = await core.getBattle(created.battleId);
  const serialized = JSON.stringify(publicRecord);
  assert.equal(serialized.includes(created.inviteSecret), false);
  assert.equal(serialized.includes("inviteSecretHash"), false);
});

test("serializes concurrent joins so only one player receives P2", async () => {
  const { core } = harness();
  const created = await core.createBattle({ task: TASK, mode: "sync" });
  const attempts = await Promise.allSettled([
    core.joinBattle(created.battleId, { nickname: "P2-A", inviteSecret: created.inviteSecret }),
    core.joinBattle(created.battleId, { nickname: "P2-B", inviteSecret: created.inviteSecret })
  ]);
  assert.equal(attempts.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(attempts.filter(x => x.status === "rejected" && x.reason.code === "BATTLE_ALREADY_JOINED").length, 1);
  const saved = await core.getBattle(created.battleId);
  assert.ok(["P2-A", "P2-B"].includes(saved.players.P2.nickname));
});

test("rejects creator self-join when creator credentials are presented", async () => {
  const { core } = harness();
  const created = await core.createBattle({ task: TASK, mode: "link" });
  const auth = { playerSessionId: created.playerSessionId, playerSecret: created.playerSecret };
  await rejectsCode(core.joinBattle(created.battleId, { inviteSecret: created.inviteSecret }, auth), "SELF_JOIN", 409);
});

test("ready requires an opponent and valid credentials; second ready locks battle", async () => {
  const { core } = harness();
  const created = await core.createBattle({ task: TASK, mode: "sync" });
  await rejectsCode(core.readyBattle(created.battleId, {
    playerSessionId: created.playerSessionId, playerSecret: created.playerSecret
  }), "WAITING_FOR_OPPONENT", 409);

  const joined = await core.joinBattle(created.battleId, { inviteSecret: created.inviteSecret });
  await rejectsCode(core.readyBattle(created.battleId), "AUTH_REQUIRED", 401);
  await rejectsCode(core.readyBattle(created.battleId, {
    playerSessionId: created.playerSessionId, playerSecret: "wrong"
  }), "INVALID_CREDENTIALS", 401);

  const p1Ready = await core.readyBattle(created.battleId, {
    playerSessionId: created.playerSessionId, playerSecret: created.playerSecret
  });
  assert.equal(p1Ready.battle.state, "READY");
  const p2Ready = await core.readyBattle(created.battleId, {
    playerSessionId: joined.playerSessionId, playerSecret: joined.playerSecret
  });
  assert.equal(p2Ready.battle.state, "LOCKED");
  assert.equal(p2Ready.battle.lockedAt, "2026-10-03T12:00:00.000Z");
  await rejectsCode(core.readyBattle(created.battleId, {
    playerSessionId: joined.playerSessionId, playerSecret: joined.playerSecret
  }), "BATTLE_LOCKED", 409);
});

test("public GET hides session IDs and secret hashes", async () => {
  const { core } = harness();
  const { created } = await createAndJoin(core);
  const result = await core.getBattle(created.battleId);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(created.playerSessionId), false);
  assert.equal(serialized.includes(created.playerSecret), false);
  assert.equal(serialized.includes("secretHash"), false);
  assert.equal(serialized.includes("payloadHash"), false);
  assert.equal(serialized.includes("events"), false);
  assert.equal(serialized.includes("botSignals"), false);
  assert.deepEqual(Object.keys(result.players.P1).sort(), ["attemptsCount", "best", "finished", "nickname", "ready", "readyAt", "status"]);
  assert.equal(result.verdict, null);
});

test("ignores client task hash, versions and timestamps", async () => {
  const { core } = harness();
  const created = await core.createBattle({
    task: TASK, mode: "sync", taskHash: "0".repeat(64),
    engineVersion: "0.0.0", scoringVersion: "0.0.0",
    createdAt: "1900-01-01T00:00:00.000Z", lockedAt: "1900-01-01T00:00:00.000Z"
  });
  assert.equal(created.battle.task.seed, undefined);
  assert.equal(created.battle.taskHash, undefined);
  assert.equal(created.battle.engineVersion, ArcSim.VERSION);
  assert.equal(created.battle.scoringVersion, ArcSim.SCORING_VERSION);
  assert.notEqual(created.battle.createdAt, "1900-01-01T00:00:00.000Z");
  assert.equal(created.battle.lockedAt, null);
});

test("rejects unsupported manual amperage tasks", async () => {
  const { core } = harness();
  await rejectsCode(core.createBattle({ task: { ...TASK, ampMode: "manual" }, mode: "sync" }),
    "TASK_UNSUPPORTED", 400);
});

test("accepts only server-approved task dimensions and coverage", async () => {
  const { core } = harness();
  for (const task of [
    { ...TASK, W: 300 },
    { ...TASK, H: 480 },
    { ...TASK, requiredCoverage: 0.01 }
  ]) {
    await rejectsCode(core.createBattle({ task, mode: "sync" }), "TASK_UNSUPPORTED", 400);
  }
  const accepted = await core.createBattle({ task: TASK, mode: "sync" });
  assert.equal(accepted.battle.task.W, 1280);
  assert.equal(accepted.battle.task.H, 720);
  assert.equal(accepted.battle.task.requiredCoverage, 0.8);
});

test("rejects unsafe or visually empty nicknames and counts Unicode code points", async () => {
  const { core } = harness();
  for (const nickname of ["line\nbreak", "Welder\u202e123", "\u200b", "😀".repeat(25)]) {
    await rejectsCode(core.createBattle({ task: TASK, mode: "sync", nickname }), "INVALID_NICKNAME", 400);
  }
  const accepted = await core.createBattle({ task: TASK, mode: "sync", nickname: "😀".repeat(24) });
  assert.equal(accepted.battle.players.P1.nickname, "😀".repeat(24));
});

test("uses server creation time and lazily expires unlocked battles after 24 hours", async () => {
  const { core, advance } = harness();
  const created = await core.createBattle({ task: TASK, mode: "link" });
  advance(24 * 60 * 60 * 1000);
  const expired = await core.getBattle(created.battleId);
  assert.equal(expired.state, "EXPIRED");
  await rejectsCode(core.joinBattle(created.battleId), "BATTLE_EXPIRED", 409);
});

test("serializes expiry reads with a readiness write at the 24-hour boundary", async () => {
  const store = createExpiryRaceStore();
  const { core, now, setNow } = harness(store);
  const created = await core.createBattle({ task: TASK, mode: "sync" });
  const joined = await core.joinBattle(created.battleId, { inviteSecret: created.inviteSecret });
  const p1 = { playerSessionId: created.playerSessionId, playerSecret: created.playerSecret };
  const p2 = { playerSessionId: joined.playerSessionId, playerSecret: joined.playerSecret };
  await core.readyBattle(created.battleId, p1);

  const createdMs = Date.parse(created.battle.createdAt);
  setNow(createdMs + 24 * 60 * 60 * 1000 - 1);
  const lockedWrite = store.holdNextLockedWrite();
  const readyPromise = core.readyBattle(created.battleId, p2);
  await lockedWrite.reached;

  setNow(createdMs + 24 * 60 * 60 * 1000);
  const expiryWrite = store.holdNextExpiredWrite();
  const getPromise = core.getBattle(created.battleId);
  const expiryAttempted = await Promise.race([
    expiryWrite.reached.then(() => true),
    new Promise(resolve => setImmediate(() => resolve(false)))
  ]);

  // Always release both barriers, including on a regression, so the test cannot hang.
  lockedWrite.release();
  const readyResult = await readyPromise;
  if (expiryAttempted) expiryWrite.release();
  const publicBattle = await getPromise;

  assert.equal(expiryAttempted, false, "GET must wait for readiness and must not write stale EXPIRED state");
  assert.equal(readyResult.battle.state, "LOCKED");
  assert.equal(publicBattle.state, "LOCKED");
  assert.equal((await core.getBattle(created.battleId)).state, "LOCKED");
});

test("a locked battle receives its lazy 24-hour no-result verdict", async () => {
  const { core, advance } = harness();
  const { created, joined } = await createAndJoin(core);
  await core.readyBattle(created.battleId, {
    playerSessionId: created.playerSessionId, playerSecret: created.playerSecret
  });
  await core.readyBattle(created.battleId, {
    playerSessionId: joined.playerSessionId, playerSecret: joined.playerSecret
  });
  advance(48 * 60 * 60 * 1000);
  const result = await core.getBattle(created.battleId);
  assert.equal(result.state, "VERDICT");
  assert.equal(result.verdict.code, "NO_QUALIFIED_RESULT");
});

test("core has no Node-only imports", () => {
  const source = fs.readFileSync(path.join(__dirname, "../core.js"), "utf8");
  assert.doesNotMatch(source, /require\s*\(\s*["']node:/);
  assert.doesNotMatch(source, /from\s+["']node:/);
});

test("HTTP adapter exposes create, join, ready, attempt, finish and public GET routes", async () => {
  const h = harness();
  const { core } = h;
  const server = createHttpServer(core);
  const made = await httpRequest(server, "POST", "/battles", { task: TASK, mode: "link" });
  assert.equal(made.status, 201);
  assert.equal(made.body.slot, "P1");

  const joinUrl = `/battles/${made.body.battleId}/join`;
  assert.equal((await httpRequest(server, "POST", joinUrl, {})).status, 401);
  assert.equal((await httpRequest(server, "POST", joinUrl, { inviteSecret: "wrong" })).status, 403);
  const joined = await httpRequest(server, "POST", joinUrl, { inviteSecret: made.body.inviteSecret });
  assert.equal(joined.status, 200);
  assert.equal(joined.body.slot, "P2");

  const p1Auth = `Bearer ${made.body.playerSessionId}.${made.body.playerSecret}`;
  const p2Auth = `Bearer ${joined.body.playerSessionId}.${joined.body.playerSecret}`;
  assert.equal((await httpRequest(server, "POST", `/battles/${made.body.battleId}/ready`, {}, p1Auth)).body.battle.state, "READY");
  assert.equal((await httpRequest(server, "POST", `/battles/${made.body.battleId}/ready`, {}, p2Auth)).body.battle.state, "LOCKED");

  const rec = roundFor(joined.body.battle.task);
  const stored = await h.store.get(made.body.battleId);
  h.setNow((stored.mode === "sync" ? stored.startAtMs : stored.joinedAtMs) + roundSpan(rec) + 1);
  const submitted = await httpRequest(server, "POST", `/battles/${made.body.battleId}/attempts`, { rec, clientScore: 50 }, p1Auth);
  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.attempt.score, ArcSim.simulate(rec).score);

  const read = await httpRequest(server, "GET", `/battles/${made.body.battleId}`);
  assert.equal(read.status, 200);
  assert.equal(read.body.state, "LOCKED");
  assert.equal(read.body.players.P1.attemptsCount, 1);
  assert.equal(read.body.players.P1.best.score, submitted.body.attempt.score);
  assert.equal(JSON.stringify(read.body).includes(made.body.playerSessionId), false);
  assert.equal(JSON.stringify(read.body).includes(made.body.playerSecret), false);
  assert.equal(read.body.verdict, null);
  assert.equal((await httpRequest(server, "POST", `/battles/${made.body.battleId}/finish`, {}, p1Auth)).status, 200);
  const finished = await httpRequest(server, "POST", `/battles/${made.body.battleId}/finish`, {}, p2Auth);
  assert.equal(finished.status, 200);
  assert.equal(finished.body.battle.state, "VERDICT");
  assert.equal(finished.body.battle.verdict.code, "P1_WINS");
  assert.equal((await httpRequest(server, "GET", `/battles/${made.body.battleId}`)).body.verdict.code, "P1_WINS");
});

test("D9/D10 lock a random task seed and public replay profile", async () => {
  const h = harness();
  const created = await h.core.createBattle({ task: { ...TASK, seed: 0 }, mode: "link", inputProfile: "touch" });
  assert.equal(created.battle.task.seed, undefined);
  assert.equal(created.battle.taskHash, undefined);
  assert.equal(created.battle.inputProfile, "touch");
  const preJoin = await h.core.getBattle(created.battleId);
  assert.equal(preJoin.task.seed, undefined);
  assert.equal(preJoin.inputProfile, "touch");
  const joined = await h.core.joinBattle(created.battleId, { inviteSecret: created.inviteSecret });
  assert.ok(Number.isInteger(joined.battle.task.seed));
  assert.notEqual(joined.battle.task.seed, 0);
  assert.equal(joined.battle.taskHash, await Battle.computeTaskHash(joined.battle.task));
  const p1Read = await h.core.getBattle(created.battleId);
  const p2Read = await h.core.getBattle(created.battleId);
  assert.equal(p1Read.task.seed, p2Read.task.seed);
  assert.equal(p1Read.inputProfile, "touch");
});

test("rejects unknown input profiles", async () => {
  const h = harness();
  await rejectsCode(h.core.createBattle({ task: TASK, mode: "sync", inputProfile: "mouse" }),
    "INVALID_INPUT_PROFILE", 400);
});

test("sync task seed and hash appear only after both players lock", async () => {
  const h = harness();
  const created = await h.core.createBattle({ task: TASK, mode: "sync" });
  const joined = await h.core.joinBattle(created.battleId, { inviteSecret: created.inviteSecret });
  assert.equal(joined.battle.task.seed, undefined);
  const p1Ready = await h.core.readyBattle(created.battleId, authFor(created));
  assert.equal(p1Ready.battle.task.seed, undefined);
  assert.equal(p1Ready.battle.taskHash, undefined);
  const p2Ready = await h.core.readyBattle(created.battleId, authFor(joined));
  assert.ok(Number.isInteger(p2Ready.battle.task.seed));
  assert.ok(p2Ready.battle.taskHash);
  assert.equal(p2Ready.battle.taskHash, await Battle.computeTaskHash(p2Ready.battle.task));
});

test("sync attempt replays server-side and public GET exposes only the best result", async () => {
  const h = harness();
  const opened = await openBattle(h.core, "sync");
  const rec = roundFor(opened.battle.task);
  const expected = ArcSim.simulate(structuredClone(rec));
  const original = JSON.stringify(rec);
  const result = await submitAtWindow(h, opened, opened.created, rec, { clientScore: expected.score });
  assert.equal(JSON.stringify(rec), original, "core must not mutate a caller-owned recording");
  assert.equal(result.attempt.score, expected.score);
  assert.equal(result.attempt.bp, expected.score * 10);
  assert.equal(result.attempt.letter, expected.letter);
  assert.equal(result.attempt.inspectionRejected, expected.iso === "REJECT");
  assert.equal(result.attempt.taskCompleted, expected.coverage >= TASK.requiredCoverage);
  assert.equal(result.attempt.qualified, result.attempt.taskCompleted && !result.attempt.inspectionRejected);
  assert.equal(result.attempt.attemptNumber, 1);
  assert.deepEqual(Object.keys(result.attempt).sort(), [
    "attemptNumber", "bp", "inspectionRejected", "letter", "qualified", "rejectReasons", "score", "serverTime", "taskCompleted"
  ]);
  assert.deepEqual(result.attempt.rejectReasons, expected.iso === "REJECT" ? expected.rejectReasons : []);
  assert.equal(result.attempt.serverTime,
    new Date(Date.UTC(2026, 9, 3, 12, 0, 0) + 5000 + roundSpan(rec) + 1).toISOString());
  assert.deepEqual(result.best, result.attempt);

  const publicRecord = await h.core.getBattle(opened.created.battleId);
  assert.equal(publicRecord.players.P1.attemptsCount, 1);
  assert.deepEqual(publicRecord.players.P1.best, result.attempt);
  assert.equal(publicRecord.verdict, null);
  const serialized = JSON.stringify(publicRecord);
  for (const secret of ["events", "payloadHash", "clientScore", "scoreMismatch", "botSignals", "simMs", "serverTimeMs"]) {
    assert.equal(serialized.includes(secret), false, `${secret} must remain private`);
  }
  const stored = await h.store.get(opened.created.battleId);
  assert.equal(stored.attempts[0].clientScore, expected.score);
  assert.equal(stored.attempts[0].scoreMismatch, false);
  assert.ok(stored.attempts[0].botSignals);
  assert.ok(stored.attempts[0].simMs >= 0);
  assert.deepEqual(stored.attempts[0].rec, rec);
  assert.equal(typeof stored.attempts[0].recStoredAt, "string");
  for (const privateStamp of ["engineVersion", "scoringVersion", "taskHash"]) {
    assert.equal(typeof stored.attempts[0][privateStamp], "string");
    assert.equal(Object.hasOwn(publicRecord.players.P1.best, privateStamp), false);
  }
});

test("sync attempt window opens at startAt, exactly five seconds after lock", async () => {
  const h = fakeSimHarness([{ score: 94, coverage: 0.9, iso: "OK", letter: "A" }]);
  const opened = await openBattle(h.core, "sync");
  const stored = await h.store.get(opened.created.battleId);
  assert.equal(stored.startAtMs, stored.lockedAtMs + 5000);
  const rec = roundFor(opened.battle.task);
  rec.events = [
    { type: "down", t: 0, x: 0, y: 0 },
    { type: "move", t: 1, x: 1, y: 1 },
    { type: "up", t: 2, x: 1, y: 1 }
  ];
  h.setNow(stored.startAtMs - 1);
  await rejectsCode(h.core.submitAttempt(opened.created.battleId, { rec }, authFor(opened.created)),
    "BATTLE_NOT_STARTED", 409);
  h.setNow(stored.startAtMs);
  const result = await h.core.submitAttempt(opened.created.battleId, { rec }, authFor(opened.created));
  assert.equal(result.attempt.score, 94);
});

test("core publishes ordered public sync events only after writes and persists sequence", async () => {
  const captured = [];
  const h = harness(createMemoryStore(), ArcSim, { events: { publish(id, event) { captured.push({ id, ...event }); } } });
  const created = await h.core.createBattle({ task: TASK, mode: "sync" });
  const joined = await h.core.joinBattle(created.battleId, { inviteSecret: created.inviteSecret });
  await h.core.readyBattle(created.battleId, authFor(created));
  await h.core.readyBattle(created.battleId, authFor(joined));
  const locked = await h.store.get(created.battleId);
  assert.equal(locked.startAtMs, locked.lockedAtMs + 5000);
  h.setNow(locked.startAtMs);
  await h.core.statusBattle(created.battleId, { status: "welding" }, authFor(created));
  const rec = roundFor(locked.task);
  await submitAtWindow(h, { created, battle: await h.core.getBattle(created.battleId) }, created, rec);
  await h.core.finishBattle(created.battleId, authFor(created));
  await h.core.finishBattle(created.battleId, authFor(joined));

  assert.deepEqual(captured.map(event => event.type), [
    "battle.created", "player.joined", "player.ready", "player.ready", "battle.locked",
    "battle.countdown", "player.status", "attempt.accepted", "player.finished",
    "player.finished", "battle.verdict"
  ]);
  assert.deepEqual(captured.map(event => event.seq), captured.map((_, index) => index + 1));
  assert.equal(captured[5].data.startAt, new Date(locked.startAtMs).toISOString());
  assert.equal((await h.store.get(created.battleId)).eventSeq, captured.length);
  for (const event of captured) {
    const json = JSON.stringify(event);
    for (const privateValue of [created.playerSecret, created.playerSessionId, created.inviteSecret,
      joined.playerSecret, joined.playerSessionId]) assert.equal(json.includes(privateValue), false);
    assert.doesNotMatch(json, /playerSessionId|playerSecret|inviteSecret|taskHash|scoringVersionHash|payloadHash|"events"|"rec"|clientScore|botSignals/i);
  }
});

test("runDeadline and lazy reads use the exact sync and link deadlines", async () => {
  const sync = harness(createMemoryStore(), ArcSim, { syncWindowMs: 60_000 });
  const battle = await openBattle(sync.core, "sync");
  const stored = await sync.store.get(battle.created.battleId);
  const deadline = sync.core.nextDeadline(stored);
  assert.deepEqual(deadline, { atMs: stored.startAtMs + 60_000, kind: "verdict" });
  sync.setNow(deadline.atMs);
  const ran = await sync.core.runDeadline(battle.created.battleId);
  assert.equal(ran.ran, true);
  assert.equal(ran.battle.state, "VERDICT");
  assert.equal(ran.battle.verdict.decidedAt, new Date(deadline.atMs).toISOString());
  sync.advance(50_000);
  assert.equal((await sync.core.getBattle(battle.created.battleId)).verdict.decidedAt, ran.battle.verdict.decidedAt);

  const link = harness();
  const linkBattle = await openBattle(link.core, "link");
  const linkStored = await link.store.get(linkBattle.created.battleId);
  const linkDeadline = link.core.nextDeadline(linkStored);
  assert.deepEqual(linkDeadline, { atMs: linkStored.joinedAtMs + 24 * 60 * 60 * 1000, kind: "verdict" });
  link.setNow(linkDeadline.atMs + 1);
  const linkRun = await link.core.runDeadline(linkBattle.created.battleId);
  assert.equal(linkRun.battle.verdict.decidedAt, new Date(linkDeadline.atMs).toISOString());
});

test("status is window-bound, idempotent, rate-limited, and blocked after finish", async () => {
  const published = [];
  const h = harness(createMemoryStore(), ArcSim, { events: { publish(_id, event) { published.push(event); } } });
  const opened = await openBattle(h.core, "sync");
  const stored = await h.store.get(opened.created.battleId);
  await rejectsCode(h.core.statusBattle(opened.created.battleId, { status: "welding" }, authFor(opened.created)),
    "BATTLE_NOT_STARTED", 409);
  h.setNow(stored.startAtMs);
  const started = await h.core.statusBattle(opened.created.battleId, { status: "welding" }, authFor(opened.created));
  assert.equal(started.battle.players.P1.status, "welding");
  const beforeDuplicate = published.length;
  assert.equal((await h.core.statusBattle(opened.created.battleId, { status: "welding" }, authFor(opened.created))).changed, false);
  assert.equal(published.length, beforeDuplicate);
  h.advance(499);
  await rejectsCode(h.core.statusBattle(opened.created.battleId, { status: "idle" }, authFor(opened.created)),
    "STATUS_RATE_LIMIT", 429);
  h.advance(1);
  await h.core.statusBattle(opened.created.battleId, { status: "idle" }, authFor(opened.created));
  await h.core.finishBattle(opened.created.battleId, authFor(opened.created));
  await rejectsCode(h.core.statusBattle(opened.created.battleId, { status: "welding" }, authFor(opened.created)),
    "PLAYER_FINISHED", 409);
});

test("link attempts are available to both players only after P2 joins", async () => {
  const h = harness();
  const created = await h.core.createBattle({ task: TASK, mode: "link" });
  await rejectsCode(h.core.submitAttempt(created.battleId, {}, authFor(created)), "BATTLE_NOT_JOINED", 409);
  const joined = await h.core.joinBattle(created.battleId, { inviteSecret: created.inviteSecret });
  const rec1 = roundFor(joined.battle.task, "full");
  const rec2 = structuredClone(rec1);
  rec2.events[0].x += 0.01;
  const p1Result = await submitAtWindow(h, { created, battle: joined.battle }, created, rec1);
  const p2Result = await submitAtWindow(h, { created, battle: joined.battle }, joined, rec2);
  assert.equal(p1Result.attempt.attemptNumber, 1);
  assert.equal(p2Result.attempt.attemptNumber, 1);
  const read = await h.core.getBattle(created.battleId);
  assert.equal(read.players.P1.attemptsCount, 1);
  assert.equal(read.players.P2.attemptsCount, 1);
});

test("clientScore is informational and mismatch is kept privately", async () => {
  const h = harness();
  const opened = await openBattle(h.core, "sync");
  const rec = roundFor(opened.battle.task, "full", { vFac: 0.3 });
  const actual = ArcSim.simulate(rec).score;
  assert.notEqual(actual, 100);
  const result = await submitAtWindow(h, opened, opened.created, rec, { clientScore: 100 });
  assert.equal(result.attempt.score, actual);
  const stored = await h.store.get(opened.created.battleId);
  assert.equal(stored.attempts[0].clientScore, 100);
  assert.equal(stored.attempts[0].scoreMismatch, true);
  assert.equal(JSON.stringify(await h.core.getBattle(opened.created.battleId)).includes("scoreMismatch"), false);
});

test("rejects every task-stamped rec field when tampered", async () => {
  const h = harness();
  const opened = await openBattle(h.core);
  const base = roundFor(opened.battle.task);
  await moveToAttemptWindow(h, opened);
  const mutations = [
    rec => { rec.seed ^= 1; }, rec => { rec.W = 1279; }, rec => { rec.H = 719; },
    rec => { rec.proc = "MIG"; }, rec => { rec.joint = "fillet"; }, rec => { rec.pos = "PB"; },
    rec => { rec.thick = 5; }, rec => { rec.bead = "ss"; }, rec => { rec.amps += 1; }
  ];
  for (const mutate of mutations) {
    const rec = structuredClone(base);
    mutate(rec);
    await rejectsCode(h.core.submitAttempt(opened.created.battleId, { rec }, authFor(opened.created)), "INVALID_ATTEMPT", 400);
  }
  const narrow = structuredClone(base);
  narrow.rw = 399;
  await rejectsCode(h.core.submitAttempt(opened.created.battleId, { rec: narrow }, authFor(opened.created)), "INVALID_ATTEMPT", 400);
  const wrongCvn = structuredClone(base);
  wrongCvn.cvn = 0;
  await rejectsCode(h.core.submitAttempt(opened.created.battleId, { rec: wrongCvn }, authFor(opened.created)), "INVALID_ATTEMPT", 400);
  assert.equal((await h.core.getBattle(opened.created.battleId)).players.P1.attemptsCount, 0);
});

test("validates full and touch replay flags against the stored battle profile", async () => {
  const fullHarness = harness();
  const fullBattle = await openBattle(fullHarness.core, "sync", "full");
  await moveToAttemptWindow(fullHarness, fullBattle);
  const touchRec = roundFor(fullBattle.battle.task, "touch");
  await rejectsCode(fullHarness.core.submitAttempt(fullBattle.created.battleId, { rec: touchRec }, authFor(fullBattle.created)),
    "INPUT_PROFILE_MISMATCH", 400);

  const touchHarness = harness();
  const touchBattle = await openBattle(touchHarness.core, "link", "touch");
  await moveToAttemptWindow(touchHarness, touchBattle);
  const fullRec = roundFor(touchBattle.battle.task, "full");
  await rejectsCode(touchHarness.core.submitAttempt(touchBattle.created.battleId, { rec: fullRec }, authFor(touchBattle.created)),
    "INPUT_PROFILE_MISMATCH", 400);
  const validTouch = roundFor(touchBattle.battle.task, "touch");
  const accepted = await submitAtWindow(touchHarness, touchBattle, touchBattle.joined, validTouch);
  assert.equal(accepted.attempt.attemptNumber, 1);
});

test("full TIG profile requires the TIG replay flag", async () => {
  const h = harness();
  const task = { ...TASK, proc: "TIG", amps: ArcSim.recommendedAmps("TIG", TASK.thick, TASK.pos) };
  const opened = await openBattle(h.core, "sync", "full", task);
  await moveToAttemptWindow(h, opened);
  const rec = roundFor(opened.battle.task, "full");
  assert.equal(rec.tig, 1);
  rec.tig = 0;
  await rejectsCode(h.core.submitAttempt(opened.created.battleId, { rec }, authFor(opened.created)),
    "INPUT_PROFILE_MISMATCH", 400);
});

test("rejects unknown recording fields but accepts liveScore as an informational claim", async () => {
  const h = harness();
  const opened = await openBattle(h.core);
  const unknown = roundFor(opened.battle.task);
  await moveToAttemptWindow(h, opened);
  unknown.winner = true;
  await rejectsCode(h.core.submitAttempt(opened.created.battleId, { rec: unknown }, authFor(opened.created)), "INVALID_ATTEMPT", 400);
  const valid = roundFor(opened.battle.task);
  valid.liveScore = 1;
  const accepted = await submitAtWindow(h, opened, opened.created, valid);
  const stored = await h.store.get(opened.created.battleId);
  assert.equal(stored.attempts[0].clientScore, 1);
  assert.equal(accepted.attempt.score, ArcSim.simulate(roundFor(opened.battle.task)).score);
});

test("rejects malformed event arrays, timestamps, coordinates, types and masks", async () => {
  const h = harness();
  const opened = await openBattle(h.core);
  const base = roundFor(opened.battle.task);
  await moveToAttemptWindow(h, opened);
  const cases = [
    rec => { rec.events = []; },
    rec => { rec.events[1].t = NaN; },
    rec => { rec.events[0].t = -1; },
    rec => { rec.events[1].t = rec.events[0].t - 1; },
    rec => { rec.events[1].x = 2 * rec.W + 1; },
    rec => { rec.events[1].type = "teleport"; },
    rec => { rec.events[1].extra = 1; },
    rec => { rec.events[1].b = 256; },
    rec => { rec.events[1].k = -1; }
  ];
  for (const mutate of cases) {
    const rec = structuredClone(base);
    mutate(rec);
    await rejectsCode(h.core.submitAttempt(opened.created.battleId, { rec }, authFor(opened.created)), "INVALID_ATTEMPT", 400);
  }
  const tooMany = structuredClone(base);
  tooMany.events = Array.from({ length: 60_001 }, () => ({ type: "move", t: 0, x: 10, y: 10 }));
  await rejectsCode(h.core.submitAttempt(opened.created.battleId, { rec: tooMany }, authFor(opened.created)), "INVALID_ATTEMPT", 400);
});

test("accepts legitimate pointer-capture overshoot but rejects extreme coordinates", async () => {
  const h = harness();
  const opened = await openBattle(h.core);
  const rec = roundFor(opened.battle.task);
  const move = rec.events.find(event => event.type === "move");
  assert.ok(move);
  move.x = -3.5;
  const accepted = await submitAtWindow(h, opened, opened.created, rec);
  assert.ok(accepted.attempt);

  const next = structuredClone(rec);
  next.events[1].x = 1e9;
  await rejectsCode(h.core.submitAttempt(opened.created.battleId, { rec: next }, authFor(opened.created)),
    "INVALID_ATTEMPT", 400);
});

test("rejects overlong recordings relative to the server attempt window", async () => {
  const h = harness();
  const opened = await openBattle(h.core);
  const rec = roundFor(opened.battle.task);
  rec.events[rec.events.length - 1].t += 60_000;
  await moveToAttemptWindow(h, opened, 10_000);
  await rejectsCode(h.core.submitAttempt(opened.created.battleId, { rec }, authFor(opened.created)), "INVALID_ATTEMPT", 400);
});

test("detects duplicate scoring payloads even if clientScore or liveScore changes", async () => {
  const h = harness();
  const opened = await openBattle(h.core);
  const rec = roundFor(opened.battle.task);
  rec.liveScore = 75;
  await submitAtWindow(h, opened, opened.created, rec, { clientScore: 75 });
  const changedClaims = structuredClone(rec);
  changedClaims.liveScore = 10;
  await rejectsCode(h.core.submitAttempt(opened.created.battleId, { rec: changedClaims, clientScore: 10 }, authFor(opened.created)),
    "DUPLICATE_ATTEMPT", 409);
});

test("enforces a limit of 20 accepted attempts per player", async () => {
  const h = harness();
  const opened = await openBattle(h.core);
  const rec = roundFor(opened.battle.task);
  const stored = await h.store.get(opened.created.battleId);
  h.setNow(stored.startAtMs + roundSpan(rec) + 10_000);
  for (let i = 0; i < 20; i++) {
    const unique = structuredClone(rec);
    unique.events[0].x += i * 0.01;
    await h.core.submitAttempt(opened.created.battleId, { rec: unique }, authFor(opened.created));
  }
  assert.equal((await h.core.getBattle(opened.created.battleId)).players.P1.attemptsCount, 20);
  const twentyFirst = structuredClone(rec);
  twentyFirst.events[0].x += 0.25;
  await rejectsCode(h.core.submitAttempt(opened.created.battleId, { rec: twentyFirst }, authFor(opened.created)), "ATTEMPT_LIMIT", 429);
});

test("rejects attempts before their mode-specific window opens and after expiry", async () => {
  const sync = harness();
  const syncCreated = await sync.core.createBattle({ task: TASK, mode: "sync" });
  await sync.core.joinBattle(syncCreated.battleId, { inviteSecret: syncCreated.inviteSecret });
  await rejectsCode(sync.core.submitAttempt(syncCreated.battleId, {}, authFor(syncCreated)), "BATTLE_NOT_STARTED", 409);

  const link = harness();
  const linkCreated = await link.core.createBattle({ task: TASK, mode: "link" });
  await rejectsCode(link.core.submitAttempt(linkCreated.battleId, {}, authFor(linkCreated)), "BATTLE_NOT_JOINED", 409);
  link.advance(24 * 60 * 60 * 1000);
  await rejectsCode(link.core.submitAttempt(linkCreated.battleId, {}, authFor(linkCreated)), "BATTLE_EXPIRED", 409);
});

test("rejects invalid credentials from another player or another battle", async () => {
  const h = harness();
  const a = await openBattle(h.core, "link");
  const b = await openBattle(h.core, "link");
  const rec = roundFor(a.battle.task);
  await rejectsCode(h.core.submitAttempt(a.created.battleId, { rec }, authFor(b.created)), "INVALID_CREDENTIALS", 401);
  await rejectsCode(h.core.submitAttempt(b.created.battleId, { rec }, authFor(a.created)), "INVALID_CREDENTIALS", 401);
});

test("qualified attempts beat higher-BP unqualified attempts", async () => {
  const h = fakeSimHarness([
    { score: 96, coverage: 0.79, iso: "D", letter: "A" },
    { score: 80, coverage: 0.8, iso: "D", letter: "B" }
  ]);
  const opened = await openBattle(h.core);
  const highUnqualified = roundFor(opened.battle.task);
  const lowQualified = structuredClone(highUnqualified);
  lowQualified.events[0].x += 0.01;
  await submitAtWindow(h, opened, opened.created, highUnqualified);
  const second = await submitAtWindow(h, opened, opened.created, lowQualified);
  assert.equal(second.best.attemptNumber, 2);
  assert.equal(second.best.qualified, true);
  assert.equal(second.best.bp, 800);
});

test("equal BP best attempts use the earlier trusted server timestamp", async () => {
  const h = fakeSimHarness([
    { score: 80, coverage: 0.8, iso: "D", letter: "B" },
    { score: 80, coverage: 0.9, iso: "C", letter: "B" }
  ]);
  const opened = await openBattle(h.core);
  const first = roundFor(opened.battle.task);
  const second = structuredClone(first);
  second.events[0].x += 0.01;
  await submitAtWindow(h, opened, opened.created, first);
  h.advance(1);
  const result = await submitAtWindow(h, opened, opened.created, second);
  assert.equal(result.best.attemptNumber, 1);
});

test("when no result qualifies, best unqualified attempt is displayed", async () => {
  const h = fakeSimHarness([
    { score: 30, coverage: 0.4, iso: "REJECT", letter: "F" },
    { score: 45, coverage: 0.7, iso: "REJECT", letter: "D" }
  ]);
  const opened = await openBattle(h.core);
  const first = roundFor(opened.battle.task);
  const second = structuredClone(first);
  second.events[0].x += 0.01;
  await submitAtWindow(h, opened, opened.created, first);
  const result = await submitAtWindow(h, opened, opened.created, second);
  assert.equal(result.best.attemptNumber, 2);
  assert.equal(result.best.qualified, false);
  assert.equal(result.best.bp, 450);
});

test("replay failures return 422 and do not persist attempts", async () => {
  const throwingSim = { ...ArcSim, simulate() { throw new Error("simulated failure"); } };
  const h = harness(createMemoryStore(), throwingSim);
  const opened = await openBattle(h.core);
  const rec = roundFor(opened.battle.task);
  await rejectsCode(submitAtWindow(h, opened, opened.created, rec), "REPLAY_FAILED", 422);
  assert.equal((await h.core.getBattle(opened.created.battleId)).players.P1.attemptsCount, 0);
});

test("same recording replays deterministically through ArcSim", () => {
  const rec = roundFor(TASK);
  assert.deepEqual(ArcSim.simulate(structuredClone(rec)), ArcSim.simulate(structuredClone(rec)));
});

test("finish locks a player's attempts and creates a stored immutable verdict after both finish", async () => {
  const h = harness();
  const opened = await openBattle(h.core, "sync");
  const rec1 = roundFor(opened.battle.task);
  await submitAtWindow(h, opened, opened.created, rec1);
  const p1Finished = await h.core.finishBattle(opened.created.battleId, authFor(opened.created));
  assert.equal(p1Finished.battle.state, "LOCKED");
  assert.equal(p1Finished.battle.players.P1.finished, true);
  assert.equal(p1Finished.battle.verdict, null);
  const afterFinish = structuredClone(rec1);
  afterFinish.events[0].x += 0.01;
  await rejectsCode(h.core.submitAttempt(opened.created.battleId, { rec: afterFinish }, authFor(opened.created)),
    "PLAYER_FINISHED", 409);

  const rec2 = roundFor(opened.battle.task);
  rec2.events[0].x += 0.01;
  const start = (await h.store.get(opened.created.battleId)).startAtMs;
  h.setNow(start + roundSpan(rec2) + 2);
  await h.core.submitAttempt(opened.created.battleId, { rec: rec2 }, authFor(opened.joined));
  const final = await h.core.finishBattle(opened.created.battleId, authFor(opened.joined));
  assert.equal(final.battle.state, "VERDICT");
  assert.equal(final.battle.verdict.mode, "sync");
  assert.equal(final.battle.verdict.code, "P1_WINS");
  assert.equal(final.battle.verdict.tieBreak, "serverTime");
  assert.deepEqual(Object.keys(final.battle.verdict).sort(), ["code", "decidedAt", "mode", "p1Best", "p2Best", "tieBreak"]);
  await rejectsCode(h.core.finishBattle(opened.created.battleId, authFor(opened.created)), "BATTLE_DECIDED", 409);
  await rejectsCode(h.core.readyBattle(opened.created.battleId, authFor(opened.created)), "BATTLE_DECIDED", 409);
  const immutable = JSON.stringify((await h.store.get(opened.created.battleId)).verdict);
  await rejectsCode(h.core.submitAttempt(opened.created.battleId, { rec: rec1 }, authFor(opened.joined)),
    "BATTLE_DECIDED", 409);
  assert.equal(JSON.stringify((await h.store.get(opened.created.battleId)).verdict), immutable);
});

test("one player without attempts loses to a qualified result; neither without qualification gets NO_QUALIFIED_RESULT", async () => {
  const h = harness();
  const opened = await openBattle(h.core, "link");
  const rec = roundFor(opened.battle.task);
  await submitAtWindow(h, opened, opened.created, rec);
  await h.core.finishBattle(opened.created.battleId, authFor(opened.created));
  const final = await h.core.finishBattle(opened.created.battleId, authFor(opened.joined));
  assert.equal(final.battle.verdict.code, "P1_WINS");
  assert.equal(final.battle.verdict.p2Best, null);

  const rejectedHarness = fakeSimHarness([
    { score: 30, coverage: 0.4, iso: "REJECT", letter: "F" }
  ]);
  const rejectedBattle = await openBattle(rejectedHarness.core, "link");
  await submitAtWindow(rejectedHarness, rejectedBattle, rejectedBattle.created,
    roundFor(rejectedBattle.battle.task));
  await rejectedHarness.core.finishBattle(rejectedBattle.created.battleId, authFor(rejectedBattle.created));
  const none = await rejectedHarness.core.finishBattle(rejectedBattle.created.battleId, authFor(rejectedBattle.joined));
  assert.equal(none.battle.verdict.code, "NO_QUALIFIED_RESULT");
});

test("link mode retains DRAW on equal BP regardless of finish timestamps", async () => {
  const fake = { ...ArcSim, simulate: () => ({ score: 94, coverage: 0.9, iso: "OK", letter: "A" }) };
  const h = harness(createMemoryStore(), fake);
  const opened = await openBattle(h.core, "link");
  const first = roundFor(opened.battle.task);
  const second = structuredClone(first);
  second.events[0].x += 0.01;
  await submitAtWindow(h, opened, opened.created, first);
  await submitAtWindow(h, opened, opened.joined, second);
  await h.core.finishBattle(opened.created.battleId, authFor(opened.created));
  const final = await h.core.finishBattle(opened.created.battleId, authFor(opened.joined));
  assert.equal(final.battle.verdict.code, "DRAW");
  assert.equal(Object.hasOwn(final.battle.verdict, "tieBreak"), false);
});

test("lazy 24-hour verdict and replay-version changes are reflected as INCOMPARABLE", async () => {
  const mutableSim = { ...ArcSim };
  mutableSim.simulate = () => ({ score: 94, coverage: 0.9, iso: "OK", letter: "A" });
  const h = harness(createMemoryStore(), mutableSim);
  const opened = await openBattle(h.core, "sync");
  const rec1 = roundFor(opened.battle.task);
  await submitAtWindow(h, opened, opened.created, rec1);
  mutableSim.VERSION = "engine-upgrade";
  const rec2 = structuredClone(rec1);
  rec2.events[0].x += 0.01;
  const stored = await h.store.get(opened.created.battleId);
  h.setNow(stored.startAtMs + roundSpan(rec2) + 1);
  await h.core.submitAttempt(opened.created.battleId, { rec: rec2 }, authFor(opened.joined));
  const storedAfter = await h.store.get(opened.created.battleId);
  assert.notEqual(storedAfter.attempts[0].engineVersion, storedAfter.attempts[1].engineVersion);
  assert.equal(storedAfter.attempts[0].taskHash, storedAfter.attempts[1].taskHash);
  h.setNow(storedAfter.startAtMs + 15 * 60 * 1000);
  const final = await h.core.getBattle(opened.created.battleId);
  assert.equal(final.state, "VERDICT");
  assert.equal(final.verdict.code, "INCOMPARABLE");
  assert.equal(final.players.P1.finished, false);
  assert.equal(final.players.P2.finished, false);
});

test("long 0.5x 12 mm round fits the new event/body limits and replays", async () => {
  const h = harness();
  const task = { ...TASK, thick: 12, amps: 170 };
  const opened = await openBattle(h.core, "sync", "full", task);
  const rec = roundFor(opened.battle.task, "full", { dtMs: 4, vFac: 0.5 });
  const jsonBytes = Buffer.byteLength(JSON.stringify(rec));
  assert.ok(rec.events.length > 10_000 && rec.events.length <= 60_000);
  assert.ok(jsonBytes > 64 * 1024 && jsonBytes < 4 * 1024 * 1024);
  const storedBefore = await h.store.get(opened.created.battleId);
  h.setNow(storedBefore.startAtMs + roundSpan(rec) + 1);
  const server = createHttpServer(h.core);
  const authorization = `Bearer ${opened.created.playerSessionId}.${opened.created.playerSecret}`;
  const response = await httpRequest(server, "POST", `/battles/${opened.created.battleId}/attempts`, { rec }, authorization);
  assert.equal(response.status, 201);
  assert.equal(response.body.attempt.score, ArcSim.simulate(rec).score);
  const stored = await h.store.get(opened.created.battleId);
  assert.ok(stored.attempts[0].simMs >= 0);
});

test("accepts a recording above the former 20,000-event limit", async () => {
  const h = fakeSimHarness([{ score: 94, coverage: 0.9, iso: "OK", letter: "A" }]);
  const opened = await openBattle(h.core, "sync");
  const rec = roundFor(opened.battle.task);
  const tail = rec.events[rec.events.length - 1];
  while (rec.events.length <= 20_000) rec.events.push({ type: "move", t: tail.t, x: tail.x, y: tail.y });
  assert.equal(rec.events.length, 20_001);
  const accepted = await submitAtWindow(h, opened, opened.created, rec);
  assert.equal(accepted.attempt.score, 94);
});

test("attempt HTTP route accepts 4 MB bodies while other routes keep 64 KB", async () => {
  const h = harness();
  const server = createHttpServer(h.core);
  const created = await h.core.createBattle({ task: TASK, mode: "link" });
  const joined = await h.core.joinBattle(created.battleId, { inviteSecret: created.inviteSecret });
  const auth = `Bearer ${created.playerSessionId}.${created.playerSecret}`;
  const url = `/battles/${created.battleId}/attempts`;
  const overDefault = JSON.stringify({ pad: "x".repeat(70 * 1024) });
  const parsed = await httpRequest(server, "POST", url, overDefault, auth);
  assert.equal(parsed.status, 400);
  assert.equal(parsed.body.error, "INVALID_ATTEMPT");
  const tooLarge = JSON.stringify({ pad: "x".repeat(4 * 1024 * 1024 + 1) });
  assert.equal((await httpRequest(server, "POST", url, tooLarge, auth)).status, 413);
  assert.equal((await httpRequest(server, "POST", "/battles", JSON.stringify({ pad: "x".repeat(70 * 1024) }))).status, 413);
  assert.ok(joined.playerSessionId);
});

test("HTTP SSE snapshots first, streams sync state, enforces limits, closes cleanly, and applies CORS", async () => {
  const hub = createEventHub();
  const fakeSim = { ...ArcSim, simulate: () => ({ score: 94, coverage: 0.9, iso: "OK", letter: "A" }) };
  const h = harness(createMemoryStore(), fakeSim, { events: hub });
  const server = createHttpServer(h.core, {
    eventHub: hub,
    origins: ["http://127.0.0.1:8898", "http://localhost:8898"],
    scheduleDeadlines: false,
    heartbeatMs: 10_000
  });
  let base;
  const readers = [];
  const frames = [];
  try {
    base = await listenEphemeral(server);
    const created = await h.core.createBattle({ task: TASK, mode: "sync" });
    const streamUrl = `${base}/battles/${created.battleId}/events`;
    const controller = new AbortController();
    const response = await fetch(streamUrl, { signal: controller.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/event-stream/);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    const reader = response.body.getReader();
    const readerState = { buffer: "" };
    readers.push({ reader, controller, state: readerState });
    const snapshot = await readSseFrame(reader, readerState);
    frames.push(snapshot);
    assert.equal(snapshot.event, "battle.snapshot");
    assert.equal(snapshot.data.battle.state, "CREATED");
    assert.equal(snapshot.id, "1");

    const unknown = await fetch(`${base}/battles/not-a-battle/events`);
    assert.equal(unknown.status, 404);
    const allowed = await fetch(`${base}/battles/${created.battleId}`, { headers: { Origin: "http://localhost:8898" } });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:8898");
    const denied = await fetch(`${base}/battles/${created.battleId}`, { headers: { Origin: "https://example.invalid" } });
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    const preflight = await fetch(streamUrl, {
      method: "OPTIONS",
      headers: { Origin: "http://127.0.0.1:8898", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Authorization, Content-Type" }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "http://127.0.0.1:8898");

    async function next(type) {
      const frame = await readSseFrame(reader, readerState);
      frames.push(frame);
      assert.equal(frame.event, type);
      assert.equal(Number(frame.id), frame.data.seq);
      return frame.data;
    }
    async function post(pathname, body, credentials) {
      const headers = { "content-type": "application/json" };
      if (credentials) headers.authorization = `Bearer ${credentials.playerSessionId}.${credentials.playerSecret}`;
      return fetch(`${base}${pathname}`, { method: "POST", headers, body: JSON.stringify(body || {}) });
    }

    const joinedResponse = await post(`/battles/${created.battleId}/join`, { inviteSecret: created.inviteSecret });
    assert.equal(joinedResponse.status, 200);
    const joined = await joinedResponse.json();
    await next("player.joined");
    assert.equal((await post(`/battles/${created.battleId}/ready`, {}, created)).status, 200);
    await next("player.ready");
    assert.equal((await post(`/battles/${created.battleId}/ready`, {}, joined)).status, 200);
    await next("player.ready");
    const locked = await next("battle.locked");
    const countdown = await next("battle.countdown");
    assert.equal(new Date(countdown.data.startAt).getTime(), new Date(locked.battle.startAt).getTime());
    const stored = await h.store.get(created.battleId);

    const extraStreams = [];
    for (let i = 0; i < 7; i++) {
      const extraController = new AbortController();
      const extraResponse = await fetch(streamUrl, { signal: extraController.signal });
      assert.equal(extraResponse.status, 200);
      const extraReader = extraResponse.body.getReader();
      const extraState = { buffer: "" };
      assert.equal((await readSseFrame(extraReader, extraState)).event, "battle.snapshot");
      const extra = { reader: extraReader, controller: extraController, state: extraState };
      extraStreams.push(extra);
      readers.push(extra);
    }
    assert.equal(hub.openStreamCount(created.battleId), 8);
    const ninth = await fetch(streamUrl);
    assert.equal(ninth.status, 429);
    for (const extra of extraStreams) {
      await extra.reader.cancel();
      extra.controller.abort();
    }

    h.setNow(stored.startAtMs);
    assert.equal((await post(`/battles/${created.battleId}/status`, { status: "welding" }, created)).status, 200);
    const statusEvent = await next("player.status");
    assert.deepEqual(statusEvent.data, { slot: "P1", status: "welding" });
    const rec = roundFor(stored.task);
    h.setNow(stored.startAtMs + roundSpan(rec) + 1);
    const attemptResponse = await post(`/battles/${created.battleId}/attempts`, { rec }, created);
    assert.equal(attemptResponse.status, 201);
    await next("attempt.accepted");
    assert.equal((await post(`/battles/${created.battleId}/finish`, {}, created)).status, 200);
    await next("player.finished");
    assert.equal((await post(`/battles/${created.battleId}/finish`, {}, joined)).status, 200);
    await next("player.finished");
    const verdict = await next("battle.verdict");
    assert.equal(verdict.data.verdict.code, "P1_WINS");
    assert.deepEqual(frames.map(frame => frame.event), [
      "battle.snapshot", "player.joined", "player.ready", "player.ready", "battle.locked",
      "battle.countdown", "player.status", "attempt.accepted", "player.finished", "player.finished", "battle.verdict"
    ]);
    assert.deepEqual(frames.map(frame => Number(frame.id)), frames.map((_, i) => i + 1));

    const transcript = frames.map(frame => {
      const event = frame.data;
      const battle = event.battle;
      const summary = {
        seq: event.seq,
        type: event.type,
        at: event.at,
        ...(battle ? {
          battleId: battle.battleId,
          state: battle.state,
          players: Object.fromEntries(Object.entries(battle.players).map(([slot, player]) => [slot, player && ({
            ready: player.ready, status: player.status, finished: player.finished,
            best: player.best && { score: player.best.score, bp: player.best.bp, qualified: player.best.qualified }
          })])),
          verdict: battle.verdict && battle.verdict.code
        } : {}),
        ...(event.data ? { data: event.data } : {})
      };
      return `id: ${frame.id}\nevent: ${frame.event}\ndata: ${JSON.stringify(summary)}\n\n`;
    }).join("");
    console.log("REAL SSE TRANSCRIPT (sync battle, HTTP stream; state fields projected):\n" + transcript);
    await reader.cancel();
    controller.abort();
    for (let i = 0; i < 20 && (hub.listenerCount(created.battleId) !== 0 || hub.openStreamCount(created.battleId) !== 0); i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(hub.listenerCount(created.battleId), 0);
    assert.equal(hub.openStreamCount(created.battleId), 0);
  } finally {
    for (const item of readers) {
      try { await item.reader.cancel(); } catch (_) {}
      item.controller.abort();
    }
    await closeHttpServer(server);
  }
});

test("rejected attempt carries known reject reasons from the replay; unknown codes are dropped", async () => {
  const h = harness();
  const opened = await openBattle(h.core, "sync");
  const rec = roundFor(opened.battle.task, "full", { vFac: 3 });
  const expected = ArcSim.simulate(structuredClone(rec));
  assert.equal(expected.iso, "REJECT", "fixture must be a rejected round");
  assert.ok(expected.rejectReasons.length > 0);
  const result = await submitAtWindow(h, opened, opened.created, rec, { clientScore: expected.score });
  assert.equal(result.attempt.inspectionRejected, true);
  assert.deepEqual(result.attempt.rejectReasons, expected.rejectReasons);
  const publicView = await h.core.getBattle(opened.created.battleId);
  assert.deepEqual(publicView.players.P1.best.rejectReasons, expected.rejectReasons);

  const fakeSim = { ...ArcSim, simulate: input => ({ ...ArcSim.simulate(input), iso: "REJECT",
    rejectReasons: ["coverage", "<img src=x>", "coverage", 7] }) };
  const h2 = harness(createMemoryStore(), fakeSim);
  const opened2 = await openBattle(h2.core, "sync");
  const result2 = await submitAtWindow(h2, opened2, opened2.created, roundFor(opened2.battle.task));
  assert.deepEqual(result2.attempt.rejectReasons, ["coverage"]);
});
