"use strict";

const { randomBytes } = require("node:crypto");
const ArcSim = require("../arc/sim.js");
const Battle = require("../arc/battle.js");
const { createBattleCore } = require("./core.js");
const { createMemoryStore } = require("./memory-store.js");
const { createHttpServer, createEventHub } = require("./http-server.js");

const eventHub = createEventHub();
const core = createBattleCore({
  clock: { now: () => Date.now() },
  randomBytes: length => new Uint8Array(randomBytes(length)),
  store: createMemoryStore(),
  battleRules: Battle,
  arcSim: ArcSim,
  events: eventHub
});

function createDevHttpServer(coreInstance = core, options = {}) {
  const hub = options.eventHub || (coreInstance === core ? eventHub : createEventHub());
  return createHttpServer(coreInstance, {
    ...options,
    eventHub: hub,
    limits: null,
    logRequests: false,
    scheduleDeadlines: options.scheduleDeadlines === undefined ? coreInstance === core : options.scheduleDeadlines
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8899;
  const host = process.env.HOST || "127.0.0.1";
  createDevHttpServer(core).listen(port, host, () => {
    console.log(`Battle server listening at http://${host}:${port}`);
  });
}

module.exports = { createHttpServer: createDevHttpServer, createEventHub, core, eventHub };
