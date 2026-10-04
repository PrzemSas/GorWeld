"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

const BATTLE_ID = /^bw_[a-z2-7]{16,64}$/;

function validateBattleId(battleId) {
  if (typeof battleId !== "string" || !BATTLE_ID.test(battleId)) {
    throw new TypeError("invalid battleId");
  }
}

function createFileStore(dataDirectory, options = {}) {
  if (typeof dataDirectory !== "string" || dataDirectory.trim() === "") {
    throw new TypeError("data directory is required");
  }
  const root = path.resolve(dataDirectory);
  const battlesDirectory = path.join(root, "battles");
  const report = options.log || (message => console.error(message));
  let readyPromise;

  function ensureReady() {
    if (!readyPromise) readyPromise = (async () => {
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      await fs.chmod(root, 0o700);
      await fs.mkdir(battlesDirectory, { recursive: true, mode: 0o700 });
      await fs.chmod(battlesDirectory, 0o700);
    })();
    return readyPromise;
  }

  function filename(battleId) {
    validateBattleId(battleId);
    return path.join(battlesDirectory, battleId + ".json");
  }

  async function quarantineCorrupt(file) {
    let corrupt = file + ".corrupt";
    try {
      await fs.rename(file, corrupt);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      corrupt = file + "." + Date.now() + "." + randomBytes(4).toString("hex") + ".corrupt";
      await fs.rename(file, corrupt);
    }
    try { await fs.chmod(corrupt, 0o600); } catch (_) {}
    report(JSON.stringify({ event: "battle_store_corrupt", action: "quarantined" }));
  }

  const store = {
    directory: root,
    battlesDirectory,
    async get(battleId) {
      if (typeof battleId !== "string" || !BATTLE_ID.test(battleId)) return undefined;
      const file = filename(battleId);
      await ensureReady();
      let text;
      try { text = await fs.readFile(file, "utf8"); }
      catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
      try {
        const value = JSON.parse(text);
        if (!value || typeof value !== "object" || value.battleId !== battleId) throw new Error("record mismatch");
        return value;
      } catch (_) {
        await quarantineCorrupt(file);
        return undefined;
      }
    },
    async put(battleId, record) {
      const file = filename(battleId);
      if (!record || typeof record !== "object" || record.battleId !== battleId) {
        throw new TypeError("record battleId must match key");
      }
      await ensureReady();
      const temp = path.join(battlesDirectory,
        "." + battleId + "." + randomBytes(12).toString("hex") + ".tmp");
      let handle;
      try {
        handle = await fs.open(temp, "wx", 0o600);
        await handle.writeFile(JSON.stringify(record), "utf8");
        await handle.sync();
        await handle.close();
        handle = null;
        await fs.rename(temp, file);
        const directoryHandle = await fs.open(battlesDirectory, "r");
        try { await directoryHandle.sync(); }
        finally { await directoryHandle.close(); }
        await fs.chmod(file, 0o600);
      } finally {
        if (handle) await handle.close().catch(() => {});
        await fs.unlink(temp).catch(() => {});
      }
    },
    async list() {
      await ensureReady();
      const names = await fs.readdir(battlesDirectory);
      const ids = names.filter(name => name.endsWith(".json"))
        .map(name => name.slice(0, -5)).filter(id => BATTLE_ID.test(id));
      const records = [];
      for (const battleId of ids) {
        const record = await store.get(battleId);
        if (record) records.push(record);
      }
      return records;
    },
    async delete(battleId) {
      if (typeof battleId !== "string" || !BATTLE_ID.test(battleId)) return false;
      const file = filename(battleId);
      await ensureReady();
      try { await fs.unlink(file); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      return true;
    },
    async flush() {
      await ensureReady();
    }
  };
  return store;
}

module.exports = { createFileStore, validateBattleId, BATTLE_ID };
