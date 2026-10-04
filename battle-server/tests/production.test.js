"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { spawnSync } = require("node:child_process");
const { loadConfig, parseOrigins, resolveClientIp, createActiveBattleCounter } = require("../server.js");
const { purgeBattles, DAY_MS } = require("../purge.js");
const { createFileStore } = require("../file-store.js");
const { createMemoryStore } = require("../memory-store.js");

const ROOT = path.resolve(__dirname, "..");
const ORIGINS = "https://gorweldarc.com,https://www.gorweldarc.com";
const TASK = { seed: 44, W: 1280, H: 720, proc: "MMA", joint: "butt", pos: "PA", thick: 3,
  bead: "steel", amps: 60, ampMode: "auto", requiredCoverage: 0.8 };

function tempDir() { return fs.mkdtemp(path.join(os.tmpdir(), "bw-prod-")); }
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}
function startServer(env) {
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", part => { stdout += part; });
  child.stderr.setEncoding("utf8").on("data", part => { stderr += part; });
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server startup timed out: " + stderr)), 5000);
    const poll = () => {
      const line = stdout.split("\n").find(item => item.includes('"event":"battle_server_started"'));
      if (line) { clearTimeout(timeout); resolve(JSON.parse(line)); }
      else if (child.exitCode !== null) { clearTimeout(timeout); reject(new Error("server exited: " + stderr)); }
      else setTimeout(poll, 10);
    };
    poll();
  });
  return { child, ready, output: () => stdout, errors: () => stderr };
}
async function stopServer(proc) {
  if (!proc || proc.child.exitCode !== null) return;
  const exited = new Promise(resolve => proc.child.once("exit", resolve));
  proc.child.kill("SIGTERM");
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("server did not stop after SIGTERM")), 5000))]);
}
async function request(base, pathname, { method = "GET", body, origin, authorization } = {}) {
  const response = await fetch(base + pathname, { method, headers: {
    ...(body === undefined ? {} : { "content-type": "application/json" }),
    ...(origin ? { origin } : {}), ...(authorization ? { authorization } : {})
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
}
async function online(t, extra = {}) {
  const dir = await tempDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const port = await freePort();
  const env = { HOST: "127.0.0.1", PORT: String(port), BATTLE_DATA_DIR: dir, BATTLE_ORIGINS: ORIGINS, ...extra };
  const proc = startServer(env);
  t.after(() => stopServer(proc));
  await proc.ready;
  return { ...proc, base: `http://127.0.0.1:${port}`, dir, port, env, stop: () => stopServer(proc) };
}
async function createBattle(base, nickname = "private-nickname") {
  return request(base, "/battles", { method: "POST", origin: "https://gorweldarc.com", body: { task: TASK, mode: "sync", nickname } });
}

test("production environment requires data directory and exact non-wildcard origins", () => {
  assert.throws(() => loadConfig({ BATTLE_ORIGINS: ORIGINS }), /BATTLE_DATA_DIR/);
  for (const value of [undefined, "", "*", "https://example.com,*", "https://one.test,,https://two.test"]) {
    const env = { BATTLE_DATA_DIR: "/tmp/data" };
    if (value !== undefined) env.BATTLE_ORIGINS = value;
    assert.throws(() => loadConfig(env), /BATTLE_ORIGINS/);
  }
  assert.deepEqual(parseOrigins(ORIGINS), ["https://gorweldarc.com", "https://www.gorweldarc.com"]);
});

test("production entry exits without listening when required environment is invalid", async () => {
  for (const invalid of [
    { env: { BATTLE_DATA_DIR: undefined, BATTLE_ORIGINS: ORIGINS }, message: "BATTLE_DATA_DIR is required" },
    { env: { BATTLE_DATA_DIR: "/tmp/bw-invalid", BATTLE_ORIGINS: undefined }, message: "BATTLE_ORIGINS is required" },
    { env: { BATTLE_DATA_DIR: "/tmp/bw-invalid", BATTLE_ORIGINS: "*" }, message: "BATTLE_ORIGINS is required" }
  ]) {
    const env = { ...process.env, HOST: "127.0.0.1", PORT: "0" };
    delete env.BATTLE_DATA_DIR;
    delete env.BATTLE_ORIGINS;
    for (const [key, value] of Object.entries(invalid.env)) if (value !== undefined) env[key] = value;
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(ROOT, "server.js")], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      child.stdout.on("data", part => { stdout += part; }); child.stderr.on("data", part => { stderr += part; });
      child.on("error", reject); child.on("close", code => resolve({ code, stdout, stderr }));
      setTimeout(() => { child.kill("SIGKILL"); reject(new Error("invalid configuration process did not exit")); }, 2000).unref();
    });
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.includes(invalid.message), result.stderr);
  }
});

test("bad battle IDs return 404 on every ID route without writing stderr", async t => {
  const service = await online(t);
  const invalidIds = ["AAAA", "bw_short", "..%2f..%2fetc%2fpasswd"];
  const routes = [
    { suffix: "", method: "GET" }, { suffix: "/join", method: "POST" },
    { suffix: "/ready", method: "POST" }, { suffix: "/attempts", method: "POST" },
    { suffix: "/finish", method: "POST" }, { suffix: "/status", method: "POST" },
    { suffix: "/events", method: "GET" }
  ];
  for (const id of invalidIds) for (const route of routes) {
    const result = await request(service.base, `/battles/${id}${route.suffix}`, {
      method: route.method, ...(route.method === "POST" ? { body: {} } : {})
    });
    assert.equal(result.status, 404, `${route.method} /battles/${id}${route.suffix}`);
    assert.equal(result.body.error, "BATTLE_NOT_FOUND");
  }
  assert.equal(service.errors(), "");
});

test("purge startup errors report the specific missing setting", async () => {
  const env = { ...process.env };
  delete env.BATTLE_DATA_DIR;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, "purge.js"), "--dry-run"], {
      cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", part => { stdout += part; }); child.stderr.on("data", part => { stderr += part; });
    child.on("error", reject); child.on("close", code => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /BATTLE_DATA_DIR is required/);
  assert.doesNotMatch(result.stderr, /Check configuration and filesystem permissions/);
});

test("proxy IP is trusted only for a loopback socket peer", () => {
  const req = { socket: { remoteAddress: "203.0.113.5" }, headers: { "x-forwarded-for": "198.51.100.8" } };
  assert.equal(resolveClientIp(req, true), "203.0.113.5");
  req.socket.remoteAddress = "127.0.0.1";
  assert.equal(resolveClientIp(req, false), "127.0.0.1");
  assert.equal(resolveClientIp(req, true), "198.51.100.8");
  req.headers["x-forwarded-for"] = "bad, 198.51.100.8";
  assert.equal(resolveClientIp(req, true), "127.0.0.1");
  req.socket.remoteAddress = "::1";
  req.headers["x-forwarded-for"] = "2001:db8::1";
  assert.equal(resolveClientIp(req, true), "2001:db8::1");
});

test("file store survives process restart and re-arms a near deadline", async t => {
  const dir = await tempDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const port = await freePort();
  const env = { HOST: "127.0.0.1", PORT: String(port), BATTLE_DATA_DIR: dir, BATTLE_ORIGINS: ORIGINS };
  let first = startServer(env);
  t.after(async () => stopServer(first));
  await first.ready;
  const base = `http://127.0.0.1:${port}`;
  const made = await createBattle(base);
  assert.equal(made.status, 201);
  const joined = await request(base, `/battles/${made.body.battleId}/join`, { method: "POST", body: { inviteSecret: made.body.inviteSecret } });
  assert.equal(joined.status, 200);
  const auth1 = `Bearer ${made.body.playerSessionId}.${made.body.playerSecret}`;
  const auth2 = `Bearer ${joined.body.playerSessionId}.${joined.body.playerSecret}`;
  assert.equal((await request(base, `/battles/${made.body.battleId}/ready`, { method: "POST", body: {}, authorization: auth1 })).body.battle.state, "READY");
  const locked = await request(base, `/battles/${made.body.battleId}/ready`, { method: "POST", body: {}, authorization: auth2 });
  assert.equal(locked.body.battle.state, "LOCKED");
  await stopServer(first);

  const store = createFileStore(dir);
  const stored = await store.get(made.body.battleId);
  stored.startAtMs = Date.now() - 15 * 60 * 1000 + 700;
  stored.startAt = new Date(stored.startAtMs).toISOString();
  await store.put(stored.battleId, stored);
  first = startServer(env);
  await first.ready;
  const persisted = await request(base, `/battles/${made.body.battleId}`);
  assert.equal(persisted.body.players.P2.nickname, null);
  await new Promise(resolve => setTimeout(resolve, 1000));
  const after = await request(base, `/battles/${made.body.battleId}`);
  assert.equal(after.body.state, "VERDICT");
  assert.equal(after.body.verdict.code, "NO_QUALIFIED_RESULT");
});

test("health, CORS, rate limits, capacity and privacy-safe request logs", async t => {
  const service = await online(t, { BATTLE_ACTIVE_CAPACITY: "1" });
  const health = await request(service.base, "/health");
  assert.deepEqual(Object.keys(health.body).sort(), ["engineVersion", "ok", "scoringVersion", "uptimeS"]);
  assert.equal(health.body.ok, true);
  assert.equal((await request(service.base, "/health", { origin: "https://gorweldarc.com" })).headers.get("access-control-allow-origin"), "https://gorweldarc.com");
  assert.equal((await request(service.base, "/health", { origin: "https://attacker.invalid" })).headers.get("access-control-allow-origin"), null);
  const made = await createBattle(service.base, "NICKHIDDEN");
  assert.equal(made.status, 201);
  assert.equal((await createBattle(service.base)).status, 503);
  assert.equal((await request(service.base, "/battles", { method: "POST", body: { task: TASK, mode: "sync" } })).headers.get("access-control-allow-origin"), null);
  await new Promise(resolve => setTimeout(resolve, 20));
  const allOutput = service.output() + service.errors();
  assert.doesNotMatch(allOutput, /NICKHIDDEN/);
  assert.doesNotMatch(allOutput, new RegExp(made.body.playerSecret));
  assert.doesNotMatch(allOutput, /127\.0\.0\.1/);
  const logs = service.output().split("\n").filter(line => line.startsWith("{"));
  const requestLogs = logs.map(line => JSON.parse(line)).filter(item => item.method);
  assert.ok(requestLogs.length >= 5);
  for (const line of requestLogs) {
    assert.equal(line.route.includes(made.body.battleId), false);
    assert.ok(Number.isFinite(line.ms));
    assert.equal(Object.hasOwn(line, "ip"), false);
  }
});

test("active capacity survives restart and is released when a verdict is stored", async t => {
  let service = await online(t, { BATTLE_ACTIVE_CAPACITY: "1" });
  const made = await request(service.base, "/battles", { method: "POST", body: { task: TASK, mode: "link", nickname: "P1" } });
  const joined = await request(service.base, `/battles/${made.body.battleId}/join`, {
    method: "POST", body: { inviteSecret: made.body.inviteSecret, nickname: "P2" }
  });
  assert.equal(joined.status, 200);
  assert.equal((await request(service.base, "/battles", { method: "POST", body: { task: TASK, mode: "link" } })).status, 503);
  await service.stop();

  const restarted = startServer(service.env);
  t.after(() => stopServer(restarted));
  await restarted.ready;
  assert.equal((await request(service.base, "/battles", { method: "POST", body: { task: TASK, mode: "link" } })).status, 503);
  const p1Auth = `Bearer ${made.body.playerSessionId}.${made.body.playerSecret}`;
  const p2Auth = `Bearer ${joined.body.playerSessionId}.${joined.body.playerSecret}`;
  assert.equal((await request(service.base, `/battles/${made.body.battleId}/finish`, {
    method: "POST", body: {}, authorization: p1Auth
  })).status, 200);
  const finished = await request(service.base, `/battles/${made.body.battleId}/finish`, {
    method: "POST", body: {}, authorization: p2Auth
  });
  assert.equal(finished.status, 200);
  assert.equal(finished.body.battle.state, "VERDICT");
  const available = await request(service.base, "/battles", { method: "POST", body: { task: TASK, mode: "link" } });
  assert.equal(available.status, 201);
});

test("join and per-IP SSE stream limits are configurable", async t => {
  const service = await online(t, { BATTLE_JOIN_LIMIT_PER_HOUR: "1", BATTLE_SSE_LIMIT_PER_IP: "1" });
  const first = await createBattle(service.base, "First");
  const second = await createBattle(service.base, "Second");
  const joined = await request(service.base, `/battles/${first.body.battleId}/join`, {
    method: "POST", body: { inviteSecret: first.body.inviteSecret }
  });
  assert.equal(joined.status, 200);
  const blockedJoin = await request(service.base, `/battles/${second.body.battleId}/join`, {
    method: "POST", body: { inviteSecret: second.body.inviteSecret }
  });
  assert.equal(blockedJoin.status, 429);
  assert.ok(blockedJoin.headers.get("retry-after"));

  const stream = await fetch(service.base + `/battles/${first.body.battleId}/events`);
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  await reader.read();
  const blockedStream = await request(service.base, `/battles/${second.body.battleId}/events`);
  assert.equal(blockedStream.status, 429);
  assert.ok(blockedStream.headers.get("retry-after"));
  await reader.cancel();
});

test("active battle counter rebuilds, frees capacity at verdict, and serializes creates", async () => {
  const counter = createActiveBattleCounter(2);
  counter.initialize([
    { battleId: "bw_abcdefghijklmnop", state: "CREATED" },
    { battleId: "bw_bcdefghijklmnopq", state: "VERDICT" }
  ]);
  assert.equal(counter.size(), 1);
  let creates = 0;
  const created = await Promise.allSettled([
    counter.create({}, async () => { creates++; return { battleId: "bw_cdefghijklmnopqr" }; }),
    counter.create({}, async () => { creates++; return { battleId: "bw_defghijklmnopqrs" }; })
  ]);
  assert.equal(created.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(created.filter(result => result.status === "rejected" && result.reason.code === "BATTLE_CAPACITY").length, 1);
  assert.equal(creates, 1);
  assert.equal(counter.size(), 2);
  counter.observe("bw_abcdefghijklmnop", { type: "battle.verdict", battle: { state: "VERDICT" } });
  assert.equal(counter.size(), 1);
  await counter.create({}, async () => ({ battleId: "bw_efghijklmnopqrst" }));
  assert.equal(counter.size(), 2);
  counter.observe("bw_efghijklmnopqrst", { type: "battle.expired", battle: { state: "EXPIRED" } });
  assert.equal(counter.size(), 1);
});

test("deploy rsync permissions remove permissive source bits and keep delete disabled", async t => {
  const root = await tempDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const destination = path.join(root, "destination");
  await fs.mkdir(path.join(source, "nested"), { recursive: true, mode: 0o777 });
  await fs.writeFile(path.join(source, "nested", "server.js"), "module.exports = true;\n", { mode: 0o777 });
  await fs.chmod(path.join(source, "nested", "server.js"), 0o777);
  const copied = spawnSync("rsync", ["-a", "--chmod=D755,F644", source + "/", destination + "/"], { encoding: "utf8" });
  assert.equal(copied.status, 0, copied.stderr);
  assert.equal((await fs.stat(path.join(destination, "nested"))).mode & 0o777, 0o755);
  assert.equal((await fs.stat(path.join(destination, "nested", "server.js"))).mode & 0o777, 0o644);
  const deploy = await fs.readFile(path.join(ROOT, "deploy", "deploy.sh"), "utf8");
  assert.match(deploy, /--chown=root:root/);
  assert.match(deploy, /--chmod=D755,F644/);
  assert.doesNotMatch(deploy, /--delete/);
});

test("21st create is rate limited with Retry-After", async t => {
  const service = await online(t, { BATTLE_ACTIVE_CAPACITY: "2000" });
  let last;
  for (let i = 0; i < 21; i++) last = await createBattle(service.base, "limit-test");
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get("retry-after")) >= 1);
});

test("purge applies all retention rules and dry-run is non-mutating", async () => {
  const now = Date.UTC(2026, 9, 4);
  const store = createMemoryStore();
  await store.put("bw_abcdefghijklmnop", { battleId: "bw_abcdefghijklmnop", state: "VERDICT", mode: "sync",
    verdict: { decidedAt: new Date(now - 181 * DAY_MS).toISOString() }, attempts: [] });
  await store.put("bw_bcdefghijklmnopq", { battleId: "bw_bcdefghijklmnopq", state: "EXPIRED", mode: "link",
    expiredAt: new Date(now - 181 * DAY_MS).toISOString(), attempts: [] });
  await store.put("bw_cdefghijklmnopqr", { battleId: "bw_cdefghijklmnopqr", state: "CREATED", mode: "link",
    createdAt: new Date(now - 8 * DAY_MS).toISOString(), attempts: [] });
  await store.put("bw_defghijklmnopqrs", { battleId: "bw_defghijklmnopqrs", state: "LOCKED", mode: "sync",
    attempts: [{ rec: { events: [] }, recStoredAt: now - 31 * DAY_MS }] });
  const dry = await purgeBattles(store, { now, dryRun: true });
  assert.deepEqual(dry, { recordingsRemoved: 1, battlesRemoved: 3 });
  assert.equal((await store.get("bw_defghijklmnopqrs")).attempts[0].rec.events.length, 0);
  const real = await purgeBattles(store, { now });
  assert.deepEqual(real, { recordingsRemoved: 1, battlesRemoved: 3 });
  assert.equal(await store.get("bw_abcdefghijklmnop"), undefined);
  assert.equal((await store.get("bw_defghijklmnopqrs")).attempts[0].rec, undefined);
});

test("purge CLI dry-run prints counts and does not remove records", async t => {
  const dir = await tempDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = createFileStore(dir);
  await store.put("bw_abcdefghijklmnop", { battleId: "bw_abcdefghijklmnop", state: "CREATED", mode: "link",
    createdAt: new Date(0).toISOString(), attempts: [] });
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, "purge.js"), "--dry-run"], {
      cwd: ROOT, env: { ...process.env, BATTLE_DATA_DIR: dir }, stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", part => { stdout += part; }); child.stderr.on("data", part => { stderr += part; });
    child.on("error", reject); child.on("close", code => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
  });
  assert.deepEqual(JSON.parse(result), { dryRun: true, recordingsRemoved: 0, battlesRemoved: 1 });
  assert.ok(await store.get("bw_abcdefghijklmnop"));
});
