"use strict";

const { createFileStore } = require("./file-store.js");

const DAY_MS = 24 * 60 * 60 * 1000;

function positiveDays(value, fallback, name) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new TypeError(name + " must be a positive whole number of days");
  return parsed;
}

function retentionFromEnv(env = process.env) {
  return {
    recordingRetentionMs: positiveDays(env.RECORDING_RETENTION_DAYS, 30, "RECORDING_RETENTION_DAYS") * DAY_MS,
    battleRetentionMs: positiveDays(env.BATTLE_RETENTION_DAYS, 180, "BATTLE_RETENTION_DAYS") * DAY_MS,
    unstartedRetentionMs: positiveDays(env.UNSTARTED_RETENTION_DAYS, 7, "UNSTARTED_RETENTION_DAYS") * DAY_MS
  };
}

function timeValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function purgeBattles(store, options = {}) {
  const now = options.now === undefined ? Date.now() : options.now;
  const policy = {
    ...retentionFromEnv({}),
    ...options
  };
  if (!Number.isFinite(now)) throw new TypeError("purge clock must be finite");
  let recordingsRemoved = 0;
  let battlesRemoved = 0;
  const records = Array.isArray(options.records) ? options.records : await store.list();

  for (const source of records) {
    if (!source || typeof source !== "object" || typeof source.battleId !== "string") continue;
    const record = structuredClone(source);
    const createdAt = timeValue(record.createdAtMs) ?? timeValue(record.createdAt);
    const neverStarted = record.mode === "sync"
      ? record.startAtMs == null
      : record.joinedAtMs == null;
    const unstartedExpired = neverStarted && createdAt != null && now - createdAt >= policy.unstartedRetentionMs;
    const terminalAt = record.state === "VERDICT"
      ? timeValue(record.verdict && record.verdict.decidedAt)
      : record.state === "EXPIRED" ? timeValue(record.expiredAt) : null;
    const battleExpired = terminalAt != null && now - terminalAt >= policy.battleRetentionMs;

    if (unstartedExpired || battleExpired) {
      battlesRemoved++;
      if (!options.dryRun) {
        await store.delete(record.battleId);
        if (typeof options.onBattleDeleted === "function") options.onBattleDeleted(record.battleId);
      }
      continue;
    }

    let changed = false;
    for (const attempt of record.attempts || []) {
      if (!attempt || !Object.prototype.hasOwnProperty.call(attempt, "rec")) continue;
      const storedAt = timeValue(attempt.recStoredAt) ?? timeValue(attempt.serverTimeMs) ?? timeValue(attempt.serverTime);
      if (storedAt != null && now - storedAt >= policy.recordingRetentionMs) {
        recordingsRemoved++;
        if (!options.dryRun) {
          delete attempt.rec;
          changed = true;
        }
      }
    }
    if (changed) await store.put(record.battleId, record);
  }

  return { recordingsRemoved, battlesRemoved };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (process.argv.slice(2).some(arg => arg !== "--dry-run")) {
    throw new Error("usage: node purge.js [--dry-run]");
  }
  if (!process.env.BATTLE_DATA_DIR) throw new Error("BATTLE_DATA_DIR is required");
  const store = createFileStore(process.env.BATTLE_DATA_DIR);
  const result = await purgeBattles(store, { ...retentionFromEnv(), dryRun });
  console.log(JSON.stringify({ dryRun, recordingsRemoved: result.recordingsRemoved,
    battlesRemoved: result.battlesRemoved }));
}

if (require.main === module) {
  main().catch(error => {
    console.error("Battle retention purge failed: " + (error && error.message ? error.message : "unknown error"));
    process.exitCode = 1;
  });
}

module.exports = { purgeBattles, retentionFromEnv, DAY_MS };
