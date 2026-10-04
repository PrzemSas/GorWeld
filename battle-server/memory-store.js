"use strict";

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function createMemoryStore() {
  const records = new Map();
  return {
    async get(battleId) { return clone(records.get(battleId)); },
    async put(battleId, record) { records.set(battleId, clone(record)); },
    async list() { return [...records.values()].map(clone); },
    async delete(battleId) { records.delete(battleId); },
    async flush() {}
  };
}

module.exports = { createMemoryStore };
