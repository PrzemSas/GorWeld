"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createFileStore } = require("../file-store.js");

async function temporaryDirectory() { return fs.mkdtemp(path.join(os.tmpdir(), "bw-store-")); }

test("file store persists records atomically with private modes and CRUD", async t => {
  const dir = await temporaryDirectory();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = createFileStore(dir);
  const id = "bw_abcdefghijklmnop";
  const record = { battleId: id, state: "CREATED", nested: { value: 1 } };
  await store.put(id, record);
  assert.deepEqual(await store.get(id), record);
  assert.deepEqual(await store.list(), [record]);
  const dirStat = await fs.stat(store.battlesDirectory);
  assert.equal(dirStat.mode & 0o777, 0o700);
  const file = path.join(store.battlesDirectory, id + ".json");
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.deepEqual((await fs.readdir(store.battlesDirectory)).filter(name => name.endsWith(".tmp")), []);
  await store.put(id, { battleId: id, state: "JOINED" });
  assert.equal((await store.get(id)).state, "JOINED");
  await store.delete(id);
  assert.equal(await store.get(id), undefined);
  assert.deepEqual(await store.list(), []);
});

test("file store rejects traversal-like IDs before filesystem operations", async t => {
  const dir = await temporaryDirectory();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = createFileStore(dir);
  for (const id of ["../escape", "/tmp/escape", "bw_abcdefghijklmnop.json", "bw_abc.defghijklmnop"]) {
    assert.equal(await store.get(id), undefined);
    await assert.rejects(store.put(id, { battleId: id }), /invalid battleId/);
    assert.equal(await store.delete(id), false);
  }
  await assert.rejects(fs.access(store.battlesDirectory));
  await assert.rejects(fs.access(path.join(dir, "escape.json")));
});

test("corrupt file is logged, quarantined and treated as missing", async t => {
  const dir = await temporaryDirectory();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const logs = [];
  const store = createFileStore(dir, { log: line => logs.push(line) });
  const id = "bw_abcdefghijklmnop";
  await fs.mkdir(store.battlesDirectory, { recursive: true });
  await fs.writeFile(path.join(store.battlesDirectory, id + ".json"), "{bad json");
  assert.equal(await store.get(id), undefined);
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0]), { event: "battle_store_corrupt", action: "quarantined" });
  const names = await fs.readdir(store.battlesDirectory);
  assert.ok(names.some(name => name.startsWith(id + ".json") && name.endsWith(".corrupt")));
  assert.equal(names.includes(id + ".json"), false);
});
