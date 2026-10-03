"use strict";

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function createMemoryStore() {
  const records = new Map();
  return {
    async get(battleId) { return clone(records.get(battleId)); },
    async put(battleId, record) { records.set(battleId, clone(record)); }
  };
}

module.exports = { createMemoryStore };
