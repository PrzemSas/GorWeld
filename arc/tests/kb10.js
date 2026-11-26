/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// 10 (kb=10, REGUŁA PRÓBNA): okno zajarzenia — po każdym zajarzeniu łuk startuje od 0, więc pierwsze ułamki sekundy
// zawsze były „za krótkie”. Z flagą próbki r < lo w oknie nie dają kary; okno kończy się przy wejściu w pasmo albo po limicie.
// Sprawdzamy (numeracja jak w CZYTAJ 10, część A):
//  1) bez flagi BIT W BIT jak zamrożony sim-3.15.0.js — korpus parity (1808), reject-reasons (2880), boty (60) + te same
//     zdarzenia jako kb:9 (ścieżka, którą zmienia 10), także z {defects:true};
//  2) z flagą egzaminator (ziarno 20261126, 20 prób) nie ma „za krótkiego łuku”;
//  3) prawdziwy krótki łuk w środku ściegu dalej wykrywany; 4) łuk krótki od zajarzenia (nigdy w paśmie) — liczony po limicie;
//  4b) okno kończy się przy wejściu w pasmo (krótki łuk zaraz po wejściu, przed limitem, jest liczony);
//  5) za długi łuk zaraz po zajarzeniu — kara i „za długi łuk” także z flagą; 6) przywarcie i zerwanie bez zmian;
//  7) niezmiennik na całym korpusie: score(flaga) ≥ score(bez), różnica ≤ arcPen(bez)+1 (zaokrąglenie), ISO nigdy gorsze,
//     pozostałe pola identyczne; 8) mutacje wywracają 2 / 4 / 4b / 5; 9) determinizm (też osobny proces);
//  A5) etykieta krótki/długi po stronie większej kary (punkty bez zmian); stałe i gra/Battle nietknięte.
const fs = require("fs"), path = require("path"), vm = require("vm"), cp = require("child_process");
const ROOT = path.join(__dirname, "..");
const S = require("../sim.js"), OLD = require("./sim-3.15.0.js"), Bt = require("../boty.js"), { build } = require("./gen.js");
let fail = 0; const ok = (n, c, i) => { console.log((c ? "  ✓ " : "  ✗ ") + n + (i !== undefined ? "  " + JSON.stringify(i) : "")); if (!c) fail++; return !!c; };
const J = o => JSON.parse(JSON.stringify(o));
const SEED = 20261126, SIMSRC = fs.readFileSync(path.join(ROOT, "sim.js"), "utf8");
const ISO_RANK = { B: 0, C: 1, D: 2, REJECT: 3 };
const hasArc = (res, c) => res.defects.some(d => d.c === c);

// ── korpusy (te same pętle co parity.js i reject-reasons.js) ──
const P = [];
{ const PROCS = ["MMA", "MIG", "TIG"], THICK = [2, 3, 5, 8, 12], BEADS = ["steel", "ss", "alu"], VF = [0.6, 1.0, 1.6];
  const POS = { MMA: ["PA", "PB", "PC", "PD", "PE", "PF", "PG", "P1G", "P2G", "P5G", "HL045"], MIG: ["PA", "PC", "PE", "PF", "P2G"], TIG: ["PA", "PC", "PF", "HL045"] };
  for (const proc of PROCS) for (const pos of POS[proc]) for (const thick of THICK) for (const bead of BEADS) for (const vFac of VF) for (const arc of [false, true]) P.push(build({ proc, pos, thick, bead, vFac, arc }));
  const rec = S.recommendedAmps("MMA", 5, "PA");
  for (const mul of [0.7, 0.85, 1.15, 1.3]) for (const arc of [false, true]) P.push(build({ proc: "MMA", pos: "PA", thick: 5, amps: Math.round(rec * mul), arc })); }
const R = [];
{ const cut = (r, f) => { const ev = r.events, k = Math.max(3, Math.floor(ev.length * f)); const last = ev[k - 1]; r.events = ev.slice(0, k).concat([{ type: "up", t: last.t + 20, x: last.x, y: last.y }]); return r; };
  const POS = { MMA: ["PA", "PF", "PC", "P5G"], MIG: ["PA", "PF"], TIG: ["PA", "PC"] };
  for (const proc of ["MMA", "MIG", "TIG"]) for (const pos of POS[proc]) for (const thick of [2, 3, 8, 12]) for (const bead of ["steel", "ss", "alu"])
  for (const vFac of [0.3, 0.6, 1, 1.6, 3]) for (const arc of [false, true]) for (const part of [1, 0.7, 0.35]) { const base = build({ proc, pos, thick, bead, vFac, arc }); R.push(part < 1 ? cut(J(base), part) : base); } }
const B = []; for (let n = 1; n <= 20; n++) for (let b = 0; b < 3; b++) B.push(Bt.buildRound(SEED, b, n));
const K = [];   // zdarzenia z planem ściegów i łukiem MMA/MIG w różnych długościach (gen.js kb:9)
{ const CFG = [["PA", "butt"], ["PC", "butt"], ["PF", "butt"], ["PG", "butt"], ["PB", "fillet"], ["P5G", "pipe"]];
  for (const proc of ["MMA", "MIG"]) for (const [pos, joint] of CFG) for (const thick of [2, 5, 8, 12]) for (const arcT of [0.45, 0.8, 1, 1.2, 1.35]) { if (pos === "PG" && thick > 5) continue;
    K.push({ ...build({ proc, pos, joint, thick, kb: 9, arc: true, ang: true, arcT }), uf: 1, cvn: 1 }); } }
const CORPUS = [["parity", P], ["reject-reasons", R], ["boty", B], ["kb9-łuk", K]];
console.log(`korpus: parity ${P.length} · reject-reasons ${R.length} · boty ${B.length} · kb9-łuk ${K.length}`);

// ── 1) bez flagi bit w bit; 7) niezmiennik z flagą (te same zdarzenia jako kb:9 i kb:10) ──
const ARC_FIELDS = new Set(["score", "letter", "iso", "arcPen", "arcR", "rejectReasons", "kb10", "arcSide"]);
let inv = { n: 0, worse: [], diff: [], other: [], gain: 0, isoUp: 0, defOther: [] };
for (const [name, list] of CORPUS) {
  let bad = [], bad9 = [];
  const withDef = name === "boty" || name === "kb9-łuk";
  for (const r of list) {
    if (JSON.stringify(S.simulate(J(r))) !== JSON.stringify(OLD.simulate(J(r)))) bad.push(r.proc + " " + r.pos + " " + r.thick);
    const r9 = { ...r, kb: 9 }, r10 = { ...r, kb: 10 };
    const a = S.simulate(J(r9), withDef ? { defects: true } : undefined);
    if (JSON.stringify(a) !== JSON.stringify(OLD.simulate(J(r9), withDef ? { defects: true } : undefined))) bad9.push(r.proc + " " + r.pos + " " + r.thick);
    const z = S.simulate(J(r10), withDef ? { defects: true } : undefined); inv.n++;
    if (z.score < a.score) inv.worse.push([name, r.proc, r.pos, r.thick, a.score, z.score]);
    if (z.score - a.score > a.arcPen + 1) inv.diff.push([name, r.proc, r.pos, r.thick, a.score, z.score, a.arcPen]);
    if (ISO_RANK[z.iso] > ISO_RANK[a.iso]) inv.worse.push([name, "ISO", a.iso, z.iso]);
    if (z.score > a.score) inv.gain++; if (ISO_RANK[z.iso] < ISO_RANK[a.iso]) inv.isoUp++;
    for (const k of new Set([...Object.keys(a), ...Object.keys(z)])) { if (ARC_FIELDS.has(k) || k === "defects") continue;
      if (JSON.stringify(a[k]) !== JSON.stringify(z[k])) { inv.other.push([name, k, a[k], z[k]]); break; } }
    if (withDef) { const strip = d => d.filter(x => !/^arc_|^ok$/.test(x.c)); if (JSON.stringify(strip(a.defects)) !== JSON.stringify(strip(z.defects))) inv.defOther.push([name, r.proc, r.pos]); }
  }
  ok(`1) ${name}: bez flagi sim.js == sim-3.15.0 bit w bit, cały wynik (${list.length} rund)`, bad.length === 0, bad.slice(0, 3));
  ok(`1) ${name}: te same zdarzenia jako kb:9 == sim-3.15.0 bit w bit${withDef ? " (z listą wad)" : ""} (${list.length} rund)`, bad9.length === 0, bad9.slice(0, 3));
}
ok(`7) z flagą nigdy gorzej: score i ISO (${inv.n} rund, lepiej: ${inv.gain} score, ${inv.isoUp} ISO)`, inv.worse.length === 0, inv.worse.slice(0, 4));
ok("7) zysk punktów ≤ arcPen bez flagi (+1 na zaokrąglenie wyniku)", inv.diff.length === 0, inv.diff.slice(0, 4));
ok("7) pola poza łukiem identyczne (pokrycie, HI, napięcie, tempo, odpryski, pęcherze, przywarcia, …)", inv.other.length === 0, inv.other.slice(0, 4));
ok("7) lista wad poza łukiem identyczna (boty + kb9-łuk, z {defects:true})", inv.defOther.length === 0, inv.defOther.slice(0, 4));

// ── narzędzie: przeprogramowanie przycisków jednego ściegu rundy bota (ten sam model łuku co sim.js) ──
// prog(ts, arcLen, L0) → maska b (1 = dociśnij / PUSH, 2 = podnieś / LIFT) albo null = zostaw zdarzenie bota.
// Przycisk ze zdarzenia działa od tego zdarzenia do następnego (applyInputs po kroku) — tak samo liczy replika.
const { ARC_GRACE_S, ARC_GRACE_K } = S, RISE = 1.0, LIFT = 1.5, PUSH = 3.5;
function reprogram(round, beadIdx, mkProg) {
  const r = J(round), plan = S.weldPlan(r.joint, r.thick, r.pos, r.proc, 2); let bead = 0, t0 = null, arcLen = 0, curB = 0, prevT = 0, prog = null, L0 = null, trace = [];
  for (const e of r.events) {
    if (e.type === "bank") { bead++; continue; }
    if (bead !== beadIdx) continue;
    if (e.type === "down") { if (t0 === null) { t0 = e.t; L0 = S.elecTyp(plan[beadIdx].k, r.thick) / 10; prog = mkProg(); } arcLen = 0; curB = e.b | 0; prevT = e.t; continue; }
    if (e.type !== "move" || t0 === null) continue;
    const dt = (e.t - prevT) / 1000; prevT = e.t;
    arcLen = Math.max(0, arcLen + (RISE + ((curB & 2) ? LIFT : 0) - ((curB & 1) ? PUSH : 0)) * dt);
    const ts = (e.t - t0) / 1000, b = prog(ts, arcLen, L0);
    if (b !== null) e.b = b; curB = e.b | 0; trace.push([ts, arcLen / L0]);
  }
  return { round: r, L0, trace };
}
const hold = x => (ts, a, L0) => a > x * L0 ? 1 : a < 0.9 * x * L0 ? 2 : 0;
const base = Bt.buildRound(SEED, 2, 2);                  // egzaminator, próba 2: z flagą zero wad łuku (kontrola niżej)
const CAP = 1;                                           // ścieg licowy, Ø3,2 (limit okna 0,80 s)
const PROGS = {
  clean: () => hold(0.8),
  realShort: () => (ts, a, L0) => (ts >= 3 && ts < 4.6 ? hold(0.3) : hold(0.8))(ts, a, L0),
  shortStart: () => hold(0.3),
  entryDip: () => { let ph = 0, tEnd = 0; return (ts, a, L0) => {                     // podnieś do 0,52×Ø → 0,06 s docisk → z powrotem w pasmo
    if (ph === 0) { if (a >= 0.52 * L0) { ph = 1; tEnd = ts + 0.06; } else return 2; }
    if (ph === 1) { if (ts < tEnd) return 1; ph = 2; }
    if (ph === 2) { if (a < 0.6 * L0) return 2; ph = 3; }
    return hold(0.8)(ts, a, L0); }; },
  longStart: () => (ts, a, L0) => ts < 1.6 ? 2 : hold(0.8)(ts, a, L0),
  stickStart: () => (ts, a, L0) => ts < 1.0 ? 1 : hold(0.8)(ts, a, L0),
  brokeStart: () => (ts, a, L0) => ts < 5.5 ? 2 : hold(0.8)(ts, a, L0)
};
const RUN = {};
function runProg(Sim, name, kb) { const { round, L0, trace } = reprogram(base, CAP, PROGS[name]); return { res: Sim.simulate(J({ ...round, kb }), { defects: true }), L0, trace }; }

// ── 2) egzaminator z flagą: zero fałszywego „za krótkiego łuku” ──
function examinerShort(Sim) { const out = []; for (let n = 1; n <= 20; n++) { const r = Sim.simulate(J(Bt.buildRound(SEED, 2, n, true)), { defects: true }); if (hasArc(r, "arc_short")) out.push([n, r.arcPen, r.arcR]); } return out; }
function examinerShortBefore() { let c = 0; for (let n = 1; n <= 20; n++) if (hasArc(S.simulate(J(Bt.buildRound(SEED, 2, n)), { defects: true }), "arc_short")) c++; return c; }
const ex2 = examinerShort(S), ex2b = examinerShortBefore();
ok(`2) egzaminator, ziarno ${SEED}, 20 prób: z flagą 0 × „za krótki łuk” (bez flagi: ${ex2b})`, ex2.length === 0 && ex2b > 0, ex2);

// ── 3–6) syntetyczne ściegi na licu egzaminatora ──
const T = {};
T.clean = () => { const x = runProg(S, "clean", 10).res; return !hasArc(x, "arc_short") && !hasArc(x, "arc_long") && x.arcPen === 0 && x.stickCount === 0 && x.arcBroke === 0; };
T.realShort = Sim => { const x = runProg(Sim, "realShort", 10).res; return hasArc(x, "arc_short") && x.arcPen > 0 && x.arcSide === "short"; };
T.shortStart = Sim => { const x = runProg(Sim, "shortStart", 10); return hasArc(x.res, "arc_short") && x.res.arcPen > 0 && x.trace.every(([, r]) => r < 0.5); };
T.entryDip = Sim => { const x = runProg(Sim, "entryDip", 10), lim = Math.min(ARC_GRACE_S, ARC_GRACE_K * 0.5 * x.L0 / (RISE + LIFT));
  let entered = null, lastShort = null; for (const [ts, r] of x.trace) { if (entered === null && r >= 0.5) entered = ts; if (entered !== null && r < 0.5 && ts < 2) lastShort = ts; }
  T.entryDipInfo = { wejscie_s: entered, ostatniKrotki_s: lastShort, limit_s: +lim.toFixed(3) };
  return lastShort !== null && lastShort < lim && hasArc(x.res, "arc_short") && x.res.arcSide === "short"; };
T.longStart = Sim => { const x = runProg(Sim, "longStart", 10); return hasArc(x.res, "arc_long") && x.res.arcPen > 0 && x.res.arcSide === "long" && x.trace.some(([ts, r]) => ts < 1.6 && r > 1.1); };
ok("kontrola: ten sam ścieg trzymany 0,8×Ø (z flagą) — zero wad łuku, przywarć i zerwań", T.clean());
ok("3) prawdziwy krótki łuk: po 3 s ściegu 1,6 s łuku ~0,3×Ø — z flagą „za krótki łuk”, arcPen > 0", T.realShort(S), runProg(S, "realShort", 10).res.arcPen);
ok("4) łuk krótki od zajarzenia (nigdy w paśmie) — z flagą „za krótki łuk” (liczony po limicie okna)", T.shortStart(S), runProg(S, "shortStart", 10).res.arcPen);
ok("4b) okno kończy się przy wejściu w pasmo: krótki łuk zaraz po wejściu (przed limitem) jest liczony", T.entryDip(S), T.entryDipInfo);
ok("5) za długi łuk zaraz po zajarzeniu (PPM 1,6 s) — z flagą kara i „za długi łuk”", T.longStart(S), runProg(S, "longStart", 10).res.arcPen);
{ const a = runProg(S, "longStart", 9).res, z = runProg(S, "longStart", 10).res;
  ok("5) długi łuk: bez flagi wada nazwana „za krótki” (kara z okna przeważa), z flagą „za długi”; kara z flagą > 0 i ≤ bez", hasArc(a, "arc_short") && hasArc(z, "arc_long") && !hasArc(z, "arc_short") && z.arcPen > 0 && z.arcPen <= a.arcPen, { bez: a.arcPen, z: z.arcPen }); }
for (const [nm, key] of [["stickStart", "stickCount"], ["brokeStart", "arcBroke"]]) {
  const a = runProg(S, nm, 9).res, z = runProg(S, nm, 10).res, da = a.defects.find(d => d.c === "stick"), dz = z.defects.find(d => d.c === "stick");
  ok(`6) ${key === "stickCount" ? "przywarcie przy zajarzeniu (LPM 1 s)" : "zerwanie łuku (PPM 5,5 s)"}: ${key} i „przerwany łuk” identyczne z flagą i bez`, a[key] > 0 && a[key] === z[key] && a.stickCount === z.stickCount && a.arcBroke === z.arcBroke && JSON.stringify(da) === JSON.stringify(dz), { [key]: [a[key], z[key]] }); }

// ── stałe i fizyka okna ──
{ const rows = [], DIAS = S.DIAS;
  for (const d of DIAS) { const L0 = d / 10, tMin = 0.5 * L0 / (RISE + LIFT), lim = Math.min(ARC_GRACE_S, ARC_GRACE_K * tMin), tHi = 1.1 * L0 / (RISE + LIFT); rows.push({ d, tMin: +tMin.toFixed(3), lim: +lim.toFixed(3), tHi: +tHi.toFixed(3) }); }
  ok("okno MMA: limit ≥ 1,25 × najszybsze dojście do pasma z podnoszeniem, ≤ 1,0 s; za długi łuk fizycznie niemożliwy w oknie", ARC_GRACE_S <= 1.0 && ARC_GRACE_K === 1.25 && rows.every(x => x.lim >= x.tMin * 1.25 - 1e-9 && x.lim <= 1.0 && x.tHi > x.lim), rows); }

// ── A5) etykieta: po stronie większej kary; punkty bez zmian ──
{ const src = SIMSRC.replace("const ARC_GRACE_S = 1.0,", "const ARC_GRACE_S = 0,"); const Z = load(src); let n = 0, wrong = 0, same = 0, ex = [];
  for (const r of B.concat(K)) { const a = S.simulate(J({ ...r, kb: 9 })), z = Z.simulate(J({ ...r, kb: 10 }), { defects: true }); const { kb10, arcSide, defects, ...rest } = z;
    if (JSON.stringify(rest) === JSON.stringify(a)) same++; n++;
    if (a.arcPen > 0 && (a.arcR < 1 ? "short" : "long") !== arcSide) { wrong++; if (ex.length < 3) ex.push([r.proc, r.pos, r.thick, a.arcR, arcSide]); }
    const d = defects.find(x => /^arc_/.test(x.c)); if (a.arcPen > 0 && (!d || d.c !== "arc_" + arcSide)) wrong += 1000; }
  ok(`A5) okno = 0 s: kb:10 liczy identycznie jak kb:9 (${same}/${n}); etykieta wg arcR < 1 była zła w ${wrong} rundach — z flagą wada = strona większej kary`, same === n && wrong > 0 && wrong < 1000, ex); }

// ── 8) mutacje: każda musi wywrócić swój test ──
function load(src) { const m = { exports: {} }; vm.runInNewContext(src, { module: m, exports: m.exports, self: undefined, Math, JSON, Object, Array, Number, String, Set, Map, isFinite, console }); return m.exports; }
const mut = (from, to) => { if (!SIMSRC.includes(from)) throw new Error("mutacja: brak fragmentu " + from); return load(SIMSRC.replace(from, to)); };
{ const M1 = mut("const ARC_GRACE_S = 1.0, ARC_GRACE_K = 1.25;", "const ARC_GRACE_S = 0, ARC_GRACE_K = 1.25;");
  const M2 = mut("const ARC_GRACE_S = 1.0, ARC_GRACE_K = 1.25;", "const ARC_GRACE_S = Infinity, ARC_GRACE_K = Infinity;");
  const M2b = mut("if (r >= aLo || graceT > Math.min(", "if (graceT > Math.min(");
  const M3 = mut("if (!graceOn) { const pn = arcPenNow(r, aLo, aHi) * dtS;", "if (!graceOn && r <= aHi) { const pn = arcPenNow(r, aLo, aHi) * dtS;");
  const res = { "ARC_GRACE_S=0 → test 2": examinerShort(M1).length > 0, "okno bez limitu (∞) → test 4": !T.shortStart(M2),
    "okno bez końca przy wejściu w pasmo → test 4b": !T.entryDip(M2b), "pominięta kara za długi łuk → test 5": !T.longStart(M3) };
  ok("8) mutacje wykryte: " + Object.keys(res).filter(k => res[k]).length + "/4", Object.values(res).every(Boolean), res);
  ok("8) kontrola: niezmieniony silnik ładowany tą samą drogą przechodzi 2, 4, 4b, 5", (() => { const U = load(SIMSRC); return examinerShort(U).length === 0 && T.shortStart(U) && T.entryDip(U) && T.longStart(U); })()); }

// ── 9) determinizm z flagą ──
{ const a = JSON.stringify(new Bt.Bench(SEED, true).step(5).log), b = JSON.stringify(new Bt.Bench(SEED, true).step(5).log), c = JSON.stringify(new Bt.Bench(SEED).step(5).log);
  const out = cp.execFileSync(process.execPath, ["-e", `const B=require(${JSON.stringify(path.join(ROOT, "boty.js"))});process.stdout.write(JSON.stringify(new B.Bench(${SEED},true).step(5).log))`], { maxBuffer: 1 << 26 }).toString();
  ok("9) z flagą: ten sam dziennik dwa razy i w osobnym procesie Node; inny niż bez flagi; wpisy mają kb:10", a === b && a === out && a !== c && JSON.parse(a).every(e => e.kb === 10) && JSON.parse(c).every(e => e.kb === 9)); }

// ── gra i Battle nietknięte ──
{ const H = fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), core = fs.readFileSync(path.join(ROOT, "..", "battle-server", "core.js"), "utf8");
  ok("gra nagrywa kb:9 (nie 10), wersja silnika i SCORING bez zmian (3.15.0 / 1.10.0), Battle wymaga kb 9", /\n\s*kb:9,/.test(H) && !/\n\s*kb:10,/.test(H) && S.VERSION === "3.15.0" && S.SCORING_VERSION === "1.10.0" && OLD.VERSION === "3.15.0" && S.TRIAL_KB === 10 && /const KB_FOR_SCORING = \{ "1\.10\.0": 9 \};/.test(core));
  const sw = s => s.replace(/\s+/g, ""), bodyOld = sw(fs.readFileSync(path.join(__dirname, "sim-3.15.0.js"), "utf8"));
  ok("zamrożony sim-3.15.0.js to silnik z 09 (ma opcję defects, nie ma okna)", bodyOld.includes("opts.defects") && !bodyOld.includes("ARC_GRACE")); }

console.log(fail ? `\n✗ ${fail} nie przeszło` : "\n✓ wszystko przeszło"); process.exit(fail ? 1 : 0);
