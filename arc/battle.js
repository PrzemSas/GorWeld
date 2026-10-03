(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GorWeldBattle = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TASK_FIELDS = [
    "seed", "W", "H", "proc", "joint", "pos", "thick", "bead",
    "amps", "ampMode", "requiredCoverage"
  ];
  const TASK_DEFAULTS = {
    W: 1280,
    H: 720,
    ampMode: "auto",
    requiredCoverage: 0.8
  };
  const TASK_ALIASES = {
    width: "W",
    height: "H",
    process: "proc",
    position: "pos",
    thicknessMm: "thick",
    material: "bead",
    amperage: "amps",
    currentA: "amps"
  };
  const PROC_ALIASES = {
    "MMA 111": "MMA",
    "111": "MMA",
    "MAG": "MIG",
    "MIG/MAG": "MIG",
    "MIG/MAG 135": "MIG",
    "MAG 135": "MIG",
    "135": "MIG",
    "TIG 141": "TIG",
    "141": "TIG"
  };
  const GRADES = new Set(["A", "B", "C", "D", "F"]);
  const STAMP_FIELDS = ["taskHash", "scoringVersion", "engineVersion"];

  function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function nonEmptyString(value, name) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError(name + " must be a non-empty string");
    }
  }

  function getBattlePoints(score) {
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new RangeError("Invalid ARC score");
    }
    return Math.round(Number((score * 10).toFixed(6)));
  }

  function mappedFields(input, name) {
    if (!record(input)) throw new TypeError(name + " must be an object");
    const mapped = {};
    for (const key of Object.keys(input)) {
      const field = TASK_ALIASES[key] || key;
      if (!TASK_FIELDS.includes(field)) throw new TypeError("Unknown task field: " + key);
      if (Object.prototype.hasOwnProperty.call(mapped, field) &&
          !Object.is(mapped[field], input[key])) {
        throw new TypeError("Conflicting values for task field: " + field);
      }
      mapped[field] = input[key];
    }
    return mapped;
  }

  function normalizeBattleTask(source, defaults = {}) {
    const fromDefaults = mappedFields(defaults, "defaults");
    const fromSource = mappedFields(source, "task");
    const values = { ...TASK_DEFAULTS, ...fromDefaults, ...fromSource };

    for (const field of TASK_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(values, field) || values[field] == null) {
        throw new TypeError("Missing task field: " + field);
      }
    }
    if (!Number.isInteger(values.seed) || values.seed < 0 || values.seed > 0xffffffff) {
      throw new RangeError("seed must be an unsigned 32-bit integer");
    }
    for (const field of ["W", "H"]) {
      if (!Number.isInteger(values[field]) || values[field] < 1) {
        throw new RangeError(field + " must be a positive integer");
      }
    }

    const procValue = String(values.proc).trim().toUpperCase();
    const proc = PROC_ALIASES[procValue] || procValue;
    if (!["MMA", "MIG", "TIG"].includes(proc)) {
      throw new TypeError("proc must be MMA, MIG or TIG");
    }
    for (const field of ["joint", "pos", "bead"]) nonEmptyString(values[field], field);
    if (!Number.isFinite(values.thick) || values.thick <= 0) {
      throw new RangeError("thick must be a positive number");
    }
    if (!Number.isFinite(values.amps) || values.amps <= 0) {
      throw new RangeError("amps must be a positive number");
    }
    const mode = String(values.ampMode).trim().toLowerCase();
    const ampMode = mode === "man" || mode === "manual" ? "manual" : mode;
    if (ampMode !== "auto" && ampMode !== "manual") {
      throw new TypeError("ampMode must be auto or manual");
    }
    if (!Number.isFinite(values.requiredCoverage) ||
        values.requiredCoverage < 0 || values.requiredCoverage > 1) {
      throw new RangeError("requiredCoverage must be between 0 and 1");
    }

    return {
      seed: values.seed,
      W: values.W,
      H: values.H,
      proc,
      joint: String(values.joint).trim(),
      pos: String(values.pos).trim().toUpperCase(),
      thick: values.thick,
      bead: String(values.bead).trim().toLowerCase(),
      amps: values.amps,
      ampMode,
      requiredCoverage: values.requiredCoverage
    };
  }

  function toArcAmpMode(mode) {
    const normalized = String(mode).trim().toLowerCase();
    if (normalized === "auto") return "auto";
    if (normalized === "manual" || normalized === "man") return "man";
    throw new TypeError("ampMode must be auto or manual");
  }

  function validateBattleTaskForArc(source, arcSim) {
    const task = normalizeBattleTask(source);
    if (task.ampMode !== "auto") {
      return { supported: false, reason: "TASK_UNSUPPORTED", detail: "AMP_MODE_UNSUPPORTED", task };
    }
    if (!arcSim || typeof arcSim.recommendedAmps !== "function" ||
        typeof arcSim.VERSION !== "string" || !arcSim.VERSION) {
      throw new TypeError("ArcSim version and recommendedAmps are required");
    }
    let expectedAmps;
    try { expectedAmps = arcSim.recommendedAmps(task.proc, task.thick, task.pos); }
    catch (error) {
      return { supported: false, reason: "TASK_UNSUPPORTED", detail: "ARC_TASK_UNSUPPORTED", task };
    }
    if (expectedAmps == null || !Number.isFinite(expectedAmps)) {
      return { supported: false, reason: "TASK_UNSUPPORTED", detail: "AMP_TABLE_UNAVAILABLE", task };
    }
    if (task.amps !== expectedAmps) {
      return { supported: false, reason: "TASK_MISMATCH", detail: "AMP_MISMATCH",
        expectedAmps, task };
    }
    return { supported: true, reason: null, task, engineVersion: arcSim.VERSION };
  }

  function canonicalizeTask(task, defaults) {
    return JSON.stringify(normalizeBattleTask(task, defaults));
  }

  function cryptoProvider() {
    if (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle) {
      return globalThis.crypto;
    }
    if (typeof require === "function") return require("node:crypto").webcrypto;
    throw new Error("Web Crypto is required to hash Battle tasks");
  }

  async function computeTaskHash(task, defaults) {
    const canonical = canonicalizeTask(task, defaults);
    const bytes = new TextEncoder().encode(canonical);
    const digest = await cryptoProvider().subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function validateBattleResult(result) {
    if (!record(result)) throw new TypeError("Battle result must be an object");
    getBattlePoints(result.score);
    if (typeof result.grade !== "string" || !GRADES.has(result.grade)) {
      throw new TypeError("grade must be one of A, B, C, D, F");
    }
    for (const key of ["inspectionRejected", "taskCompleted", "challengePassed"]) {
      if (typeof result[key] !== "boolean") throw new TypeError(key + " must be boolean");
    }
    if (!Number.isFinite(result.coverage) || result.coverage < 0 || result.coverage > 1) {
      throw new RangeError("coverage must be between 0 and 1");
    }
    for (const key of STAMP_FIELDS) nonEmptyString(result[key], key);
    if (!Number.isInteger(result.attemptNumber) || result.attemptNumber < 1) {
      throw new RangeError("attemptNumber must be an integer greater than or equal to 1");
    }
    if (!Number.isInteger(result.attemptsStarted) ||
        result.attemptsStarted < 1 ||
        result.attemptNumber > result.attemptsStarted) {
      throw new RangeError("attemptsStarted must be an integer at least attemptNumber");
    }
    return result;
  }

  function sameStamp(a, b) {
    return STAMP_FIELDS.every(key => a[key] === b[key]);
  }

  function validateEnvelopeShape(envelope) {
    if (!record(envelope)) throw new TypeError("Battle envelope must be an object");
    if (envelope.schemaVersion !== 1) throw new RangeError("Unsupported Battle schemaVersion");
    nonEmptyString(envelope.battleId, "battleId");
    for (const key of STAMP_FIELDS) nonEmptyString(envelope[key], key);
    if (!record(envelope.task)) throw new TypeError("task must be an object");
    if (!record(envelope.player1)) throw new TypeError("player1 result is required");
    if (envelope.player2 !== null && envelope.player2 !== undefined &&
        !record(envelope.player2)) {
      throw new TypeError("player2 must be a result or null");
    }
  }

  async function validateBattleEnvelope(envelope, taskDefaults) {
    validateEnvelopeShape(envelope);
    const normalizedTask = normalizeBattleTask(envelope.task, taskDefaults);
    const actualHash = await computeTaskHash(normalizedTask);
    if (actualHash !== envelope.taskHash) throw new RangeError("taskHash does not match normalized task");

    const player1 = { ...envelope.player1 };
    for (const key of STAMP_FIELDS) {
      if (player1[key] !== undefined && player1[key] !== envelope[key]) {
        throw new RangeError("player1 " + key + " does not match envelope");
      }
      player1[key] = envelope[key];
    }
    validateBattleResult(player1);

    let player2 = null;
    if (envelope.player2 != null) {
      player2 = { ...envelope.player2 };
      validateBattleResult(player2);
    }
    return { ...envelope, task: normalizedTask, player1, player2 };
  }

  async function preflightBattleStart(envelope, local, taskDefaults) {
    const validated = await validateBattleEnvelope(envelope, taskDefaults);
    if (!record(local)) throw new TypeError("local Battle configuration must be an object");
    for (const key of ["engineVersion", "scoringVersion"]) nonEmptyString(local[key], key);
    if (!record(local.task)) throw new TypeError("local task must be an object");

    if (local.engineVersion !== validated.engineVersion) {
      return { startAllowed: false, reason: "ENGINE_VERSION_MISMATCH" };
    }
    if (local.scoringVersion !== validated.scoringVersion) {
      return { startAllowed: false, reason: "SCORING_VERSION_MISMATCH" };
    }
    const localHash = await computeTaskHash(local.task, taskDefaults);
    if (localHash !== validated.taskHash) {
      return { startAllowed: false, reason: "TASK_MISMATCH" };
    }
    return { startAllowed: true, reason: null };
  }

  function battleVerdict(player1, player2) {
    validateBattleResult(player1);
    validateBattleResult(player2);

    if (!sameStamp(player1, player2)) return "INCOMPARABLE";

    const qualified1 = player1.taskCompleted && !player1.inspectionRejected;
    const qualified2 = player2.taskCompleted && !player2.inspectionRejected;
    if (!qualified1 && !qualified2) {
      return player1.inspectionRejected && player2.inspectionRejected
        ? "BOTH_REJECTED" : "NO_WINNER";
    }
    if (qualified1 !== qualified2) return qualified1 ? "P1_WINS" : "P2_WINS";

    const bp1 = getBattlePoints(player1.score);
    const bp2 = getBattlePoints(player2.score);
    if (bp1 === bp2) return "DRAW";
    return bp1 > bp2 ? "P1_WINS" : "P2_WINS";
  }

  function selectBestAttempt(attempts) {
    if (!Array.isArray(attempts) || attempts.length === 0) {
      throw new TypeError("attempts must be a non-empty array");
    }
    attempts.forEach(validateBattleResult);
    if (attempts.some(result => !sameStamp(attempts[0], result))) {
      throw new RangeError("attempts have different Battle stamps");
    }

    return attempts.slice().sort((a, b) => {
      const qualifiedA = a.taskCompleted && !a.inspectionRejected;
      const qualifiedB = b.taskCompleted && !b.inspectionRejected;
      if (qualifiedA !== qualifiedB) return qualifiedA ? -1 : 1;
      const pointDelta = getBattlePoints(b.score) - getBattlePoints(a.score);
      return pointDelta || a.attemptNumber - b.attemptNumber;
    })[0];
  }

  function carryAttemptCount(bestAttempt, attemptsStarted) {
    validateBattleResult(bestAttempt);
    if (!Number.isInteger(attemptsStarted) ||
        attemptsStarted < bestAttempt.attemptNumber ||
        attemptsStarted < bestAttempt.attemptsStarted) {
      throw new RangeError("attemptsStarted cannot precede the saved attempt");
    }
    return { ...bestAttempt, attemptsStarted };
  }

  return {
    normalizeBattleTask,
    toArcAmpMode,
    validateBattleTaskForArc,
    getBattlePoints,
    canonicalizeTask,
    computeTaskHash,
    validateBattleResult,
    validateBattleEnvelope,
    preflightBattleStart,
    battleVerdict,
    selectBestAttempt,
    carryAttemptCount
  };
});
