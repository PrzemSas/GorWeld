// Zaliczenie treningu: testujemy funkcje z ŻYWEGO index.html, nie kopię reguł.
// Uruchomienie: node arc/tests/acceptance.js (bez przeglądarki i zapisu plików).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const SRC = fs.readFileSync(process.env.ACCEPTANCE_SOURCE || path.join(__dirname, '..', 'index.html'), 'utf8');

function section(from, to) {
  const a = SRC.indexOf(from), b = SRC.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `brak fragmentu źródła: ${from}`);
  return SRC.slice(a, b);
}
function gameFunction(name) {
  const start = SRC.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `brak funkcji ${name}`);
  // Testowane funkcje mają zamykający nawias w osobnym wierszu bez wcięcia.
  const end = SRC.indexOf('\n}', start);
  assert.ok(end > start, `brak końca funkcji ${name}`);
  return SRC.slice(start, end + 2);
}
const code = section('const I18N=', '// ── Processes') + '\n' +
  section('const COUPONS=', 'const RANKS=') + '\n' +
  ['inspectionVerdict', 'acceptanceText', 'inspect', 'cutInspect', 'maybeCompleteCoupon'].map(gameFunction).join('\n');

// Kontrolowane metryki i atrapy DOM: obliczenia oraz decyzje w inspect/cutInspect/karierze
// pochodzą z gry. Tutaj nie powielamy warunków zaliczenia ani wzoru punktacji.
function fixture(options = {}) {
  const nodes = new Map();
  function element() {
    return { textContent: '', innerHTML: '', style: {}, offsetWidth: 10,
      classList: { add() {}, remove() {} }, appendChild() {} };
  }
  const ctx = {
    lang: options.lang || 'pl', challenge: !!options.challenge,
    document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); }, createElement: element },
    window: {}, console: { log() {}, warn() {} },
    baked: Array.from({ length: 20 }, () => ({ x: 0, y: 0, off: 0 })),
    seamPts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], passLog: [], passPlanArr: ['cap'],
    metrics: { coverage: 1, spdAcc: 1, evenness: 1, overflow: 0, porosity: 0, spatter: 0,
      narrow: 0, wide: 0, gaps: [], out: 0, avgV: 68.8, endGap: 0, offPen: 0 },
    arcTime: 0, arcPenAcc: 0, arcRSum: 0, stickCount: 0, arcBroke: 0,
    angTime: 0, angPenAcc: 0, angWSum: 0, angTSum: 0, arcPorAcc: 0, angPorAcc: 0,
    filCount: 0, filPenAcc: 0, FIL_PEN_CAP: 20, FIL_MAJOR: 17, OFF_MAJOR: 15,
    SPATTER_PEN_CAP: 20, ampF: { pen: 0, sev: null }, rec: null,
    WELD_EFF: { MMA: 0.8 }, PX_PER_MM: 16, HI_MAX_R: 1.25, CVN_BEADS: { steel: 1 },
    hi: options.hi ?? 0.5, arcVSum: 0, proc: 'MMA', posKey: 'PA', thick: 5, bead: 'steel',
    MATERIAL: { steel: { tol: 1, name: { pl: 'Stal', en: 'Steel', ru: 'Сталь' } } },
    POSITIONS: { PA: { lbl: 'PA' } }, grooveHalf: 5, bevelW: 5,
    activeCoupon: options.coupon === undefined ? 'c1' : options.coupon,
    progress: { done: {}, xp: 0 }, jobSettled: false, CHALLENGE: { minScore: 90 },
    saved: 0, celebrations: 0, toasts: [], lastReport: null,
    cutCov: 1, cutDevN: 1, cutDevSum: 0, speedN: 1, speedSum: 68.8, targetPx: 68.8,
    showToast(message) { ctx.toasts.push(message); }, saveProgress() { ctx.saved++; },
    updateRank() {}, setTimeout(fn) { fn(); }, burstConfetti() { ctx.celebrations++; },
    isChallenge() { return ctx.challenge; }, jobDiff() { return 7; },
    passMetrics() { return ctx.metrics; }, weldElectrics() { return { hi: 1, volts: 20, ampsUse: 100 }; },
    heatInputKJmm() { return ctx.hi; }, cutCoverage() { return ctx.cutCov; }, kerfPx() { return 1; },
    valueTier() { return { col: '#fff', name: 'Test' }; }, renderStat() {}, drawZoom() {}, openModal() {},
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx.node = id => ctx.document.getElementById(id);
  return ctx;
}

let passed = 0, failed = 0;
function test(name, run) {
  try { run(); passed++; console.log('✓ ' + name); }
  catch (error) { failed++; console.error('✗ ' + name + '\n  ' + error.stack); }
}

test('Granice 45/49/50 pkt i pokrycia 80% — dokładnie ten werdykt, którego używa gra', () => {
  const g = fixture();
  for (const score of [0, 44, 45, 49]) {
    const v = g.inspectionVerdict(score, 1, false);
    assert.equal(v.passed, false); assert.equal(v.rejected, true); assert.equal(v.reason, 'accept_score');
  }
  for (const score of [50, 62, 90, 100]) {
    assert.equal(g.inspectionVerdict(score, 0.8, false).passed, true);
    assert.equal(g.inspectionVerdict(score, 0.799, false).passed, false);
    assert.equal(g.inspectionVerdict(score, 1, true).passed, false);
  }
  assert.equal(g.inspectionVerdict(61, 1, false, 62).reason, 'accept_coupon');
  assert.equal(g.inspectionVerdict(62, 0.8, false, 62).passed, true);
  assert.equal(g.inspectionVerdict(100, 1, true).reason, 'accept_major');
});

test('Spawanie: wysoki wynik + poprawna inspekcja = raport zaliczenia i XP', () => {
  const g = fixture(); g.inspect();
  assert.equal(g.lastReport.score, 100); assert.equal(g.lastReport.passed, true);
  assert.equal(g.node('rIso').textContent, 'ISO 5817 · ' + g.t('iso_B'));
  assert.match(g.node('rReward').innerHTML, /^100 pkt — ZALICZONE/);
  assert.equal(g.progress.done.c1, 100); assert.equal(g.progress.xp, 100); assert.equal(g.saved, 1);
  assert.equal(g.celebrations, 1);
  g.inspect();
  assert.equal(g.progress.xp, 100); assert.equal(g.saved, 1); assert.equal(g.celebrations, 1);
});

for (const [lang, text] of [
  ['pl', '100 pkt — NIEZALICZONE: przekroczony wkład ciepła'],
  ['en', '100 pts — NOT PASSED: heat input exceeded'],
  ['ru', '100 балл. — НЕ ЗАЧТЕНО: превышено тепловложение'],
]) {
  test(`Spawanie ${lang}: wysoki wynik + odrzut HI = przyczyna w raporcie, brak XP i celebracji`, () => {
    const g = fixture({ lang, hi: 2 }); g.inspect();
    assert.equal(g.lastReport.score, 100); assert.equal(g.lastReport.passed, false);
    assert.equal(g.node('rIso').textContent, 'ISO 5817 · ' + g.t('iso_reject'));
    assert.ok(g.node('rReward').innerHTML.startsWith(text));
    assert.equal(g.toasts[0], text);
    assert.equal(g.progress.xp, 0); assert.equal(Object.keys(g.progress.done).length, 0);
    assert.equal(g.saved, 0); assert.equal(g.celebrations, 0);
  });
}

test('Inna wada major również blokuje zaliczenie i podaje swoją przyczynę', () => {
  const g = fixture(); g.metrics.endGap = 2; g.inspect();
  assert.equal(g.lastReport.score, 100); assert.equal(g.lastReport.passed, false);
  assert.ok(g.node('rReward').innerHTML.includes(g.fmt('def_crater', [2])));
  assert.equal(g.progress.xp, 0); assert.equal(g.celebrations, 0);
});

test('Kariera: odrzucony lepszy wynik nie nadpisuje osiągnięć', () => {
  const g = fixture({ hi: 2 });
  g.progress = { done: { c1: 80, c2: 90 }, xp: 220 };
  const before = JSON.stringify(g.progress); g.inspect();
  assert.equal(JSON.stringify(g.progress), before); assert.equal(g.saved, 0);
});

test('Kariera: poprawny lepszy wynik aktualizuje rekord bez dodatkowego XP', () => {
  const g = fixture(); g.progress = { done: { c1: 80 }, xp: 100 }; g.inspect();
  assert.equal(g.progress.done.c1, 100); assert.equal(g.progress.xp, 100); assert.equal(g.saved, 1);
});

test('Pokrycie poniżej 80% blokuje kupon nawet przy wysokim wyniku i braku odrzutu ISO', () => {
  const g = fixture(); g.metrics.coverage = 0.79; g.inspect();
  assert.equal(g.lastReport.score, 90); assert.equal(g.lastReport.passed, false);
  assert.equal(g.node('rIso').textContent, 'ISO 5817 · ' + g.t('iso_B'));
  assert.match(g.node('rReward').innerHTML, /^90 pkt — NIEZALICZONE: pokrycie poniżej 80%/);
  assert.equal(g.progress.xp, 0); assert.equal(g.saved, 0); assert.equal(g.celebrations, 0);
});

test('Próg kuponu pozostaje obowiązujący i raport wskazuje go jako przyczynę', () => {
  const g = fixture({ coupon: 'c4' }); g.metrics.spdAcc = 0; g.metrics.evenness = 0.8; g.inspect();
  assert.equal(g.lastReport.score, 77); assert.equal(g.lastReport.passed, false);
  assert.match(g.node('rReward').innerHTML, /^77 pkt — NIEZALICZONE: ćwiczenie wymaga co najmniej 78 pkt/);
  assert.equal(g.progress.xp, 0); assert.equal(g.saved, 0);
});

test('Niski wynik bez major: odrzut ISO i brak zaliczenia kariery', () => {
  const g = fixture();
  Object.assign(g.metrics, { coverage: 0.8, spdAcc: 0, evenness: 0.5, porosity: 3 }); g.inspect();
  assert.equal(g.lastReport.score, 48); assert.equal(g.lastReport.passed, false);
  assert.equal(g.node('rIso').textContent, 'ISO 5817 · ' + g.t('iso_reject'));
  assert.match(g.node('rReward').innerHTML, /^48 pkt — NIEZALICZONE: wynik poniżej 50 pkt/);
  assert.equal(g.progress.xp, 0); assert.equal(g.saved, 0);
});

for (const proc of ['CUT', 'PLASMA']) {
  test(`${proc}: wspólny werdykt ISO 9013 akceptuje poprawny wynik i odrzuca wadę major`, () => {
    const g = fixture({ coupon: null }); g.proc = proc; g.cutInspect();
    assert.equal(g.lastReport.score, 100); assert.equal(g.lastReport.passed, true);
    assert.equal(g.node('rIso').textContent, 'ISO 9013 · ' + g.t('iso_B'));
    assert.match(g.node('rReward').innerHTML, /^100 pkt — ZALICZONE/);
    g.cutDevSum = 1.54; g.cutInspect();
    assert.equal(g.lastReport.score, 86); assert.equal(g.lastReport.passed, false);
    assert.equal(g.node('rIso').textContent, 'ISO 9013 · ' + g.t('iso_reject'));
    assert.ok(g.node('rReward').innerHTML.startsWith('86 pkt — NIEZALICZONE: ' + g.t('cd_dev')));
    assert.equal(g.progress.xp, 0);
  });
}

test('Konkurs: odrzut inspekcji nie zmienia punktowego warunku sukcesu ani celebracji', () => {
  const g = fixture({ challenge: true, hi: 2, coupon: null }); g.inspect();
  assert.equal(g.lastReport.score, 100);
  assert.equal(g.node('rIso').textContent, 'ISO 5817 · ' + g.t('iso_reject'));
  assert.ok(g.node('rReward').innerHTML.startsWith('🏁 ' + g.t('chal_pass')));
  assert.equal(g.lastReport.passed, true); assert.equal(g.celebrations, 1);
  assert.equal(g.progress.xp, 0);
  g.metrics.spdAcc = 0; g.inspect();
  assert.equal(g.lastReport.score, 80);
  assert.ok(g.node('rReward').innerHTML.startsWith('🏁 ' + g.t('chal_fail')));
  assert.equal(g.celebrations, 1);
  g.proc = 'CUT'; g.cutInspect();
  assert.ok(g.node('rReward').innerHTML.startsWith('🏁 ' + g.t('chal_pass')));
  g.cutDevSum = 1.54; g.cutInspect();
  assert.ok(g.node('rReward').innerHTML.startsWith('🏁 ' + g.t('chal_fail')));
});

console.log(`\nWerdykt treningu: ${passed} zaliczone, ${failed} niezaliczone.`);
process.exitCode = failed ? 1 : 0;
