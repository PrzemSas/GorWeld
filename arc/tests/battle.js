"use strict";

const assert = require("node:assert/strict");
const Battle = require("../battle.js");
const ArcSim = require("../sim.js");

const TASK_DEFAULTS = {
  seed: 1296914737,
  proc: "MMA",
  joint: "butt",
  pos: "PA",
  thick: 3,
  bead: "steel",
  amps: 92,
  ampMode: "auto",
  W: 1280,
  H: 720,
  requiredCoverage: 0.8
};
const BASE = {
  score: 94,
  grade: "A",
  inspectionRejected: false,
  taskCompleted: true,
  challengePassed: true,
  coverage: 0.96,
  taskHash: "a".repeat(64),
  scoringVersion: "arc-score-test",
  engineVersion: "arc-engine-test",
  attemptNumber: 1,
  attemptsStarted: 1
};

let passed = 0;
let failed = 0;
function test(name, run) {
  try {
    run();
    passed++;
    console.log("✓ " + name);
  } catch (error) {
    failed++;
    console.error("✗ " + name + "\n  " + error.stack);
  }
}
async function testAsync(name, run) {
  try {
    await run();
    passed++;
    console.log("✓ " + name);
  } catch (error) {
    failed++;
    console.error("✗ " + name + "\n  " + error.stack);
  }
}
function result(overrides = {}) {
  return { ...BASE, ...overrides };
}
function fullTask(overrides = {}) {
  return { ...TASK_DEFAULTS, ...overrides };
}

test("BP derive only from ARC score; integer ARC results produce multiples of ten", () => {
  assert.equal(Battle.getBattlePoints(94), 940);
  assert.equal(Battle.getBattlePoints(0), 0);
  assert.equal(Battle.getBattlePoints(100), 1000);
  for (let score = 0; score <= 100; score++) {
    assert.equal(Battle.getBattlePoints(score) % 10, 0);
  }
});

test("known decimal and floating-point boundary examples follow the agreed rounding", () => {
  assert.equal(Battle.getBattlePoints(97.3), 973);
  assert.equal(Battle.getBattlePoints(94.7), 947);
  assert.equal(Battle.getBattlePoints(92.1), 921);
  assert.equal(Battle.getBattlePoints(94.65), 947);
  assert.equal(Battle.getBattlePoints(94.6 + 0.05), 947);
});

test("invalid scores throw instead of being clamped", () => {
  for (const score of [NaN, Infinity, -Infinity, -1, 100.1]) {
    assert.throws(() => Battle.getBattlePoints(score), RangeError);
  }
});

test("normalization emits the complete fixed task schema and fills agreed defaults", () => {
  const normalized = Battle.normalizeBattleTask({
    seed: TASK_DEFAULTS.seed,
    proc: "mma 111",
    joint: "butt",
    pos: "pa",
    thick: 3,
    bead: "STEEL",
    amps: 92,
    ampMode: "man"
  });
  assert.deepEqual(normalized, {
    seed: TASK_DEFAULTS.seed,
    W: 1280,
    H: 720,
    proc: "MMA",
    joint: "butt",
    pos: "PA",
    thick: 3,
    bead: "steel",
    amps: 92,
    ampMode: "manual",
    requiredCoverage: 0.8
  });
  assert.equal(Battle.toArcAmpMode(normalized.ampMode), "man");
  assert.equal(Battle.toArcAmpMode("man"), "man");
  assert.equal(Battle.toArcAmpMode("auto"), "auto");
  assert.deepEqual(
    Battle.normalizeBattleTask({ width: 1280, height: 720, process: "MMA 111",
      joint: "butt", position: "PA", thicknessMm: 3, material: "steel",
      seed: TASK_DEFAULTS.seed, currentA: 92 }, { ampMode: "auto" }),
    fullTask({ ampMode: "auto" })
  );
  assert.throws(() => Battle.normalizeBattleTask({ seed: 1 }), /Missing task field: proc/);
  assert.throws(
    () => Battle.normalizeBattleTask({
      seed: TASK_DEFAULTS.seed, process: "MMA 111", joint: "butt", position: "PA",
      thicknessMm: 3, electrodeMm: 2.5, material: "steel", currentA: 90
    }),
    /Unknown task field: electrodeMm/
  );
  assert.throws(() => Battle.normalizeBattleTask(fullTask({ unknownOption: 1 })), /Unknown task field/);
  assert.throws(() => Battle.normalizeBattleTask(fullTask({ seed: -1 })), RangeError);
  assert.throws(
    () => Battle.normalizeBattleTask({ ...fullTask(), process: "TIG 141" }),
    /Conflicting values for task field: proc/
  );
});

test("ARC task adapter only accepts supported AUTO amperage from ArcSim", () => {
  const arcSim = {
    VERSION: "3.4.0",
    recommendedAmps: (proc, thick, pos) =>
      proc === "MMA" && thick === 3 && pos === "PF" ? 51 : null
  };
  const task = fullTask({ pos: "PF", amps: 51, ampMode: "auto" });
  assert.deepEqual(Battle.validateBattleTaskForArc(task, arcSim), {
    supported: true, reason: null, task: Battle.normalizeBattleTask(task),
    engineVersion: "3.4.0"
  });
  assert.equal(
    Battle.validateBattleTaskForArc(fullTask({ pos: "PF", amps: 51, ampMode: "manual" }), arcSim).reason,
    "TASK_UNSUPPORTED"
  );
  assert.equal(
    Battle.validateBattleTaskForArc(fullTask({ pos: "PF", amps: 50 }), arcSim).reason,
    "TASK_MISMATCH"
  );
  assert.equal(
    Battle.validateBattleTaskForArc(fullTask({ pos: "PA", amps: 92 }), arcSim).reason,
    "TASK_UNSUPPORTED"
  );
  assert.equal(
    Battle.validateBattleTaskForArc(fullTask({ pos: "NOT_A_POSITION", amps: 92 }), arcSim).reason,
    "TASK_UNSUPPORTED"
  );
});

test("Battle stamps and amperage policy come from ArcSim", () => {
  assert.equal(typeof ArcSim.VERSION, "string");
  assert.equal(typeof ArcSim.SCORING_VERSION, "string");
  assert.ok(ArcSim.SCORING_VERSION.length > 0);
  assert.equal(ArcSim.recommendedAmps("MMA", 3, "PA"), 60);
  assert.equal(ArcSim.recommendedAmps("MMA", 3, "PF"), 51);
  assert.equal(
    Battle.validateBattleTaskForArc(fullTask({ pos: "PF", amps: 51 }), ArcSim).supported,
    true
  );
  assert.equal(
    Battle.validateBattleTaskForArc(fullTask({ pos: "PF", amps: 50 }), ArcSim).reason,
    "TASK_MISMATCH"
  );
});

test("canonical task record has fixed field order regardless of input keys", () => {
  const task = fullTask();
  const reversed = Object.fromEntries(Object.entries(task).reverse());
  assert.equal(Battle.canonicalizeTask(task), Battle.canonicalizeTask(reversed));
  assert.equal(
    Battle.canonicalizeTask(task),
    '{"seed":1296914737,"W":1280,"H":720,"proc":"MMA","joint":"butt","pos":"PA","thick":3,"bead":"steel","amps":92,"ampMode":"auto","requiredCoverage":0.8}'
  );
  assert.notEqual(
    Battle.canonicalizeTask(task),
    Battle.canonicalizeTask(fullTask({ requiredCoverage: 0.9 }))
  );
});

test("result validator requires separate statuses, coverage, stamps and valid attempt counts", () => {
  const valid = result();
  assert.equal(Battle.validateBattleResult(valid), valid);
  assert.throws(() => Battle.validateBattleResult(result({ score: 101 })), RangeError);
  assert.throws(() => Battle.validateBattleResult(result({ coverage: 1.01 })), RangeError);
  assert.throws(() => Battle.validateBattleResult(result({ grade: "E" })), TypeError);
  assert.throws(() => Battle.validateBattleResult(result({ grade: "Z" })), TypeError);
  assert.throws(() => Battle.validateBattleResult(result({ taskCompleted: 1 })), TypeError);
  assert.throws(() => Battle.validateBattleResult(result({ engineVersion: "" })), TypeError);
  assert.throws(() => Battle.validateBattleResult(result({ attemptNumber: 0 })), RangeError);
  assert.throws(() => Battle.validateBattleResult(result({ attemptNumber: 3, attemptsStarted: 2 })), RangeError);
  assert.throws(() => Battle.validateBattleResult(result({ attemptsStarted: 1.5 })), RangeError);
});

test("only comparable qualified results compete on BP; equal BP is a draw", () => {
  assert.equal(Battle.battleVerdict(result({ score: 94 }), result({ score: 92 })), "P1_WINS");
  assert.equal(Battle.battleVerdict(result({ score: 92 }), result({ score: 94 })), "P2_WINS");
  assert.equal(Battle.battleVerdict(result({ score: 94 }), result({ score: 94 })), "DRAW");
  assert.equal(
    Battle.battleVerdict(result({ score: 100, inspectionRejected: true }), result({ score: 50 })),
    "P2_WINS"
  );
  assert.equal(
    Battle.battleVerdict(result({ taskCompleted: false }), result({ score: 50 })),
    "P2_WINS"
  );
});

test("two rejected results and other unqualified results have no winner", () => {
  assert.equal(
    Battle.battleVerdict(
      result({ inspectionRejected: true, score: 100 }),
      result({ inspectionRejected: true, score: 99 })
    ),
    "BOTH_REJECTED"
  );
  assert.equal(
    Battle.battleVerdict(
      result({ taskCompleted: false }),
      result({ taskCompleted: false, attemptNumber: 2, attemptsStarted: 2 })
    ),
    "NO_WINNER"
  );
});

test("stamps are compared before qualification and client-supplied BP is ignored", () => {
  assert.equal(
    Battle.battleVerdict(
      result({ inspectionRejected: true }),
      result({ inspectionRejected: true, engineVersion: "other-engine" })
    ),
    "INCOMPARABLE"
  );
  assert.equal(
    Battle.battleVerdict(
      result({ score: 94, battlePoints: 0 }),
      result({ score: 90, battlePoints: 1000 })
    ),
    "P1_WINS"
  );
  assert.equal(
    Battle.battleVerdict(result(), result({ taskHash: "b".repeat(64) })),
    "INCOMPARABLE"
  );
  assert.equal(
    Battle.battleVerdict(result(), result({ scoringVersion: "other-score" })),
    "INCOMPARABLE"
  );
});

test("best-attempt selection prioritizes qualification, then BP, then earlier attempt", () => {
  const highRejected = result({
    score: 100, inspectionRejected: true, attemptNumber: 1, attemptsStarted: 4
  });
  const firstQualified = result({
    score: 70, attemptNumber: 2, attemptsStarted: 4
  });
  const laterQualified = result({
    score: 70, attemptNumber: 3, attemptsStarted: 4
  });
  assert.equal(
    Battle.selectBestAttempt([highRejected, laterQualified, firstQualified]),
    firstQualified
  );
  assert.equal(
    Battle.selectBestAttempt([
      result({ score: 80, taskCompleted: false, attemptNumber: 1, attemptsStarted: 3 }),
      result({ score: 90, inspectionRejected: true, attemptNumber: 2, attemptsStarted: 3 })
    ]).score,
    90
  );
  assert.throws(() => Battle.selectBestAttempt([]), TypeError);
  assert.throws(
    () => Battle.selectBestAttempt([result(), result({ engineVersion: "other-engine" })]),
    RangeError
  );
});

test("updated attemptsStarted preserves the chosen attemptNumber", () => {
  const saved = result({ attemptNumber: 4, attemptsStarted: 7 });
  const carried = Battle.carryAttemptCount(saved, 9);
  assert.equal(carried.attemptNumber, 4);
  assert.equal(carried.attemptsStarted, 9);
  assert.notEqual(carried, saved);
  assert.throws(() => Battle.carryAttemptCount(saved, 6), RangeError);
});

function envelopeFixture(task) {
  return Battle.computeTaskHash(task).then(taskHash => ({
    schemaVersion: 1,
    battleId: "GW-A7K92",
    engineVersion: BASE.engineVersion,
    scoringVersion: BASE.scoringVersion,
    taskHash,
    task,
    player1: {
      score: 94,
      grade: "A",
      inspectionRejected: false,
      taskCompleted: true,
      challengePassed: true,
      coverage: 0.96,
      attemptNumber: 1,
      attemptsStarted: 1
    },
    player2: null
  }));
}

async function main() {
  const task = fullTask();
  await testAsync("SHA-256 is stable after key/default/alias normalization and changes with task data", async () => {
    const first = await Battle.computeTaskHash(task);
    const equivalent = await Battle.computeTaskHash({
      seed: task.seed,
      process: "MMA 111",
      joint: task.joint,
      position: "pa",
      thicknessMm: task.thick,
      material: "STEEL",
      currentA: task.amps
    });
    const changed = await Battle.computeTaskHash(fullTask({ thick: 4 }));
    const fromArcDefaults = await Battle.computeTaskHash({}, TASK_DEFAULTS);
    const serializedRoundTrip = await Battle.computeTaskHash(JSON.parse(JSON.stringify(task)));
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.equal(first, equivalent);
    assert.equal(first, fromArcDefaults);
    assert.equal(first, serializedRoundTrip);
    assert.notEqual(first, changed);
  });

  await testAsync("envelope validates normalized task hash and binds player 1 to the envelope stamp", async () => {
    const taskWithDefaultsOmitted = {
      seed: task.seed,
      proc: task.proc,
      joint: task.joint,
      pos: task.pos,
      thick: task.thick,
      bead: task.bead,
      amps: task.amps
    };
    const envelope = await envelopeFixture(taskWithDefaultsOmitted);
    const normalized = await Battle.validateBattleEnvelope(envelope);
    assert.deepEqual(normalized.task, task);
    assert.equal(normalized.player1.taskHash, envelope.taskHash);
    assert.equal(normalized.player1.engineVersion, envelope.engineVersion);
    assert.equal(normalized.player2, null);

    const tampered = { ...envelope, task: { ...taskWithDefaultsOmitted, thick: 4 } };
    await assert.rejects(
      Battle.validateBattleEnvelope(tampered),
      /taskHash does not match normalized task/
    );
    const wrongStamp = {
      ...envelope,
      player1: { ...envelope.player1, engineVersion: "other-engine" }
    };
    await assert.rejects(Battle.validateBattleEnvelope(wrongStamp), /does not match envelope/);
  });

  await testAsync("preflight blocks engine, scoring and fully normalized task mismatches", async () => {
    const envelope = await envelopeFixture(task);
    const matching = {
      engineVersion: envelope.engineVersion,
      scoringVersion: envelope.scoringVersion,
      task
    };
    assert.deepEqual(await Battle.preflightBattleStart(envelope, matching), {
      startAllowed: true, reason: null
    });
    assert.equal(
      (await Battle.preflightBattleStart(envelope, { ...matching, engineVersion: "other-engine" })).reason,
      "ENGINE_VERSION_MISMATCH"
    );
    assert.equal(
      (await Battle.preflightBattleStart(envelope, { ...matching, scoringVersion: "other-score" })).reason,
      "SCORING_VERSION_MISMATCH"
    );
    assert.equal(
      (await Battle.preflightBattleStart(envelope, { ...matching, task: fullTask({ amps: 105 }) })).reason,
      "TASK_MISMATCH"
    );
  });

  console.log("\nBattle: " + passed + " passed, " + failed + " failed.");
  process.exitCode = failed ? 1 : 0;
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
