/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// REGUŁA PRÓBNA kb:11 (poprawka 11) — zakres prądu WPS dla Ø + próg wady łuku. Gra i Battle dalej kb:9.
//  1) kb≤10 bit w bit z zamrożonym sim-3.15.0-kb10.js (silnik b8fde93): korpus parity 1808 + reject-reasons 2880 + boty 60 + kb9-łuk 240,
//     każda runda bez flagi, jako kb:9 i jako kb:10 (boty i kb9-łuk z listą wad);
//  2) niezmiennik kb:11 vs kb:10 na tym samym korpusie: score ≥, ISO nigdy gorsze, odrzut `amps` i przyczyny major te same co do rund,
//     pola poza prądem i łukiem identyczne (fizyka: pokrycie, odpryski, pęcherze, napięcie, HI…), MIG/TIG: prąd jak w kb:10;
//  3) egzaminator (ziarno 20261126, 20 prób) 0 × wada prądu; 4) prąd w zakresie: brak wady i kara 0; 5) tuż poza: minor, kara ciągła od krawędzi;
//  6) ≥ 25 % od nominału: major + `amps` + REJECT jak w kb:10; 7) łuk: poniżej progu brak wady i kara 0, powyżej jak kb:10,
//     prawdziwy krótki łuk w środku ściegu wykryty, major łuku bez zmian; 8) stałe = tabela ze źródeł; 9) mutacje 5/5; 10) determinizm.
const fs = require("fs"), path = require("path"), vm = require("vm"), cp = require("child_process");
const ROOT = path.join(__dirname, "..");
const S = require("../sim.js"), OLD = require("./sim-3.15.0-kb10.js"), Bt = require("../boty.js"), { build } = require("./gen.js");
let fail = 0; const ok = (n, c, i) => { console.log((c ? "  ✓ " : "  ✗ ") + n + (i !== undefined ? "  " + JSON.stringify(i) : "")); if (!c) fail++; return !!c; };
const J = o => JSON.parse(JSON.stringify(o));
const SEED = 20261126, SIMSRC = fs.readFileSync(path.join(ROOT, "sim.js"), "utf8");
const ISO_RANK = { B: 0, C: 1, D: 2, REJECT: 3 };
const isAmp = d => /^amp_/.test(d.c), isArc = d => /^arc_/.test(d.c);

// ── korpusy (te same pętle co kb10.js / parity.js / reject-reasons.js) ──
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
const K = [];   // plan ściegów, łuk i kąt, MMA (z wyborem Ø) i MIG, różne długości łuku i prądy
{ const CFG = [["PA", "butt"], ["PC", "butt"], ["PF", "butt"], ["PG", "butt"], ["PB", "fillet"], ["P5G", "pipe"]];
  for (const proc of ["MMA", "MIG"]) for (const [pos, joint] of CFG) for (const thick of [2, 5, 8, 12]) for (const arcT of [0.45, 0.8, 1, 1.2, 1.35]) { if (pos === "PG" && thick > 5) continue;
    const ar = S.recommendedAmps(proc, thick, pos), mul = [1, 0.9, 1.08, 0.8, 1.2][Math.round(arcT * 20) % 5];
    K.push({ ...build({ proc, pos, joint, thick, kb: 9, arc: true, ang: true, arcT, amps: ar ? Math.round(ar * mul) : null }), uf: 1, cvn: 1 }); } }
const CORPUS = [["parity", P], ["reject-reasons", R], ["boty", B], ["kb9-łuk", K]];
console.log(`korpus: parity ${P.length} · reject-reasons ${R.length} · boty ${B.length} · kb9-łuk ${K.length}`);

// ── 1) kb≤10 bit w bit; 2) niezmiennik kb:11 vs kb:10 ──
const AMP_ARC_FIELDS = new Set(["score", "letter", "iso", "ampPen", "arcPen", "arcSide", "rejectReasons", "kb11", "arcPenRaw", "elec", "defects"]);
const inv = { n: 0, worse: [], other: [], amps: [], major: [], defOther: [], elec: [], migtig: [], gain: 0, isoUp: 0 };
for (const [name, list] of CORPUS) {
  const bad = [], bad9 = [], bad10 = [];
  const withDef = name === "boty" || name === "kb9-łuk", o = withDef ? { defects: true } : undefined;
  for (const r of list) {
    if (JSON.stringify(S.simulate(J(r), o)) !== JSON.stringify(OLD.simulate(J(r), o))) bad.push(r.proc + " " + r.pos + " " + r.thick);
    const r9 = { ...r, kb: Math.max(9, r.kb || 0) }, r10 = { ...r, kb: 10 }, r11 = { ...r, kb: 11 };
    if (JSON.stringify(S.simulate(J(r9), o)) !== JSON.stringify(OLD.simulate(J(r9), o))) bad9.push(r.proc + " " + r.pos + " " + r.thick);
    const a = S.simulate(J(r10), { defects: true });
    if (JSON.stringify(a) !== JSON.stringify(OLD.simulate(J(r10), { defects: true }))) bad10.push(r.proc + " " + r.pos + " " + r.thick);
    const z = S.simulate(J(r11), { defects: true }); inv.n++;
    if (z.score < a.score || ISO_RANK[z.iso] > ISO_RANK[a.iso]) inv.worse.push([name, r.proc, r.pos, r.thick, a.score, z.score, a.iso, z.iso]);
    if (z.score > a.score) inv.gain++; if (ISO_RANK[z.iso] < ISO_RANK[a.iso]) inv.isoUp++;
    if (a.rejectReasons.includes("amps") !== z.rejectReasons.includes("amps")) inv.amps.push([name, r.proc, r.pos, r.thick]);
    const maj = x => x.rejectReasons.filter(q => q !== "score");   // przyczyny major (bez „za mało punktów")
    if (JSON.stringify(maj(a)) !== JSON.stringify(maj(z))) inv.major.push([name, r.proc, r.pos, r.thick, maj(a), maj(z)]);
    for (const k of new Set([...Object.keys(a), ...Object.keys(z)])) { if (AMP_ARC_FIELDS.has(k)) continue;
      if (JSON.stringify(a[k]) !== JSON.stringify(z[k])) { inv.other.push([name, k, a[k], z[k]]); break; } }
    if (a.elec && JSON.stringify(a.elec) !== JSON.stringify(z.elec.map(e => { const { ampRng, ...q } = e; return q; }))) inv.elec.push([name, r.proc, r.pos]);
    const strip = d => d.filter(x => !isAmp(x) && !isArc(x) && x.c !== "ok");
    if (JSON.stringify(strip(a.defects)) !== JSON.stringify(strip(z.defects))) inv.defOther.push([name, r.proc, r.pos, r.thick]);
    if (r.proc !== "MMA") { const am = x => JSON.stringify([x.ampPen, x.defects.filter(isAmp)]); if (am(a) !== am(z)) inv.migtig.push([name, r.proc, r.pos, r.thick]); }
  }
  ok(`1) ${name}: bez flagi sim.js == sim-3.15.0-kb10 bit w bit${withDef ? " (z listą wad)" : ""} (${list.length} rund)`, bad.length === 0, bad.slice(0, 3));
  ok(`1) ${name}: jako kb:9 == sim-3.15.0-kb10 bit w bit${withDef ? " (z listą wad)" : ""} (${list.length} rund)`, bad9.length === 0, bad9.slice(0, 3));
  ok(`1) ${name}: jako kb:10 == sim-3.15.0-kb10 bit w bit (z listą wad) (${list.length} rund)`, bad10.length === 0, bad10.slice(0, 3));
}
ok(`2) kb:11 nigdy gorzej niż kb:10: score i ISO (${inv.n} rund; lepiej: ${inv.gain} score, ${inv.isoUp} ISO)`, inv.worse.length === 0, inv.worse.slice(0, 4));
ok("2) odrzut `amps` identyczny co do rund (major prądu bez zmian)", inv.amps.length === 0, inv.amps.slice(0, 4));
ok("2) przyczyny major identyczne co do rund (zmienić się może tylko „za mało punktów”)", inv.major.length === 0, inv.major.slice(0, 4));
ok("2) pola poza prądem i łukiem identyczne (pokrycie, odpryski, pęcherze, napięcie, HI, kąt, tempo…) = fizyka nietknięta", inv.other.length === 0, inv.other.slice(0, 4));
ok("2) elec: te same Ø, prądy i HI; kb:11 dokłada tylko ampRng", inv.elec.length === 0, inv.elec.slice(0, 4));
ok("2) lista wad poza prądem i łukiem identyczna (w zakresie prąd nie robi pośrednio innej wady)", inv.defOther.length === 0, inv.defOther.slice(0, 4));
ok("2) MIG / TIG: prąd liczony jak w kb:10 (brak źródeł zakresu na grubość — bez zmian; MMA z kb ≥ 4 zawsze ma wybór Ø)", inv.migtig.length === 0, inv.migtig.slice(0, 4));

// ── 3) egzaminator: 0 × wada prądu (i dla porównania kb:10) ──
{ const L11 = [], c10 = []; for (let n = 1; n <= 20; n++) { const r = Bt.buildRound(SEED, 2, n, 11), s = S.simulate(J(r), { defects: true }), d = s.defects.find(isAmp);
    if (d) L11.push({ n, prad: d.p[0], zakres: d.p[1] + "–" + d.p[2], elec: s.elec.map(e => "Ø" + e.d / 10 + " " + e.amps + " A"), poz: r.pos });
    if (S.simulate(J(Bt.buildRound(SEED, 2, n, 10)), { defects: true }).defects.some(isAmp)) c10.push(n); }
  ok(`3) egzaminator kb:11 (ziarno ${SEED}, 20 prób): 0 × wada prądu (kb:10: ${c10.length}/20)`, L11.length === 0 && c10.length === 16, L11.length ? L11 : { kb10: c10.length }); }

// ── 4–6) prąd: ta sama runda bota (egzaminator, próba 1), zmieniony tylko prąd (AUTO: krotność pokrętła) ──
const base = Bt.buildRound(SEED, 2, 1), REC = S.recommendedAmps(base.proc, base.thick, base.pos);
function withMul(mul, kb) { return S.simulate(J({ ...base, amps: Math.round(REC * mul), kb }), { defects: true }); }
{ const res = [0.95, 1.0, 1.10].map(m => { const s = withMul(m, 11); return { m, elec: s.elec.map(e => [e.d, e.amps, e.ampRng]), ampPen: s.ampPen, amp: s.defects.filter(isAmp).length }; });
  ok("4) prąd w zakresie (×0,95 / ×1,00 / ×1,10 nominału, Ø2,5 i Ø3,2): brak wady prądu, kara 0", res.every(x => x.amp === 0 && x.ampPen === 0 && x.elec.every(([d, a, g]) => a >= g[0] && a <= g[1])), res);
  const k10 = [0.95, 1.10].map(m => withMul(m, 10)).map(s => ({ amp: s.defects.filter(isAmp).length, ampPen: s.ampPen }));
  ok("4) te same prądy w kb:10 dają wadę minor i karę (czyli test nie przechodzi na pusto)", k10.every(x => x.amp === 1 && x.ampPen > 0), k10); }
{ const out = [0.85, 1.16].map(m => { const s = withMul(m, 11), d = s.defects.find(isAmp); return { m, elec: s.elec.map(e => [e.d, e.amps, e.ampRng]), ampPen: s.ampPen, d: d && [d.k, d.s, d.p], iso: s.iso, rr: s.rejectReasons }; });
  ok("5) tuż poza zakresem (×0,85 / ×1,16): minor z zakresem w tekście, kara > 0, bez odrzutu za prąd", out.every(x => x.d && x.d[1] === "minor" && /_r$/.test(x.d[0]) && x.ampPen > 0 && !x.rr.includes("amps") && x.d[2].length === 3), out); }
{ // ciągłość: jedna Ø (blacha 3 mm → Ø2,5 we wszystkich ściegach), prąd ręczny (am) co 1 A przez obie krawędzie
  const sweep = []; for (let X = 64; X <= 96; X++) { const r = { ...build({ proc: "MMA", pos: "PA", thick: 3, kb: 9, arc: true, ang: true, amps: X, am: true }), uf: 1, cvn: 1, kb: 11 }; const s = S.simulate(r, { defects: true }); sweep.push([X, s.ampPen, s.defects.some(isAmp)]); }
  const [lo, hi] = S.ampRng(25, "PA"), nom = S.diaAmps(25, "PA");
  const exp = X => X < lo ? Math.min(30, (lo - X) / nom * 70) : X > hi ? Math.min(30, (X - hi) / nom * 50) : 0;
  const bad = sweep.filter(([X, p, d]) => Math.abs(p - +exp(X).toFixed(2)) > 0.011 || d !== (X < lo || X > hi));
  const jump = Math.max(...sweep.slice(1).map((q, i) => Math.abs(q[1] - sweep[i][1])));
  ok(`5) kara ciągła od krawędzi (Ø2,5 PA ${lo}–${hi} A, co 1 A od 64 do 96 A): 0 w zakresie, (lo−I)/nom·70 i (I−hi)/nom·50 poza, największy skok ${jump.toFixed(2)} pkt/A`, bad.length === 0 && jump <= 70 / nom + 0.01, bad.slice(0, 4)); }
{ const maj = [0.70, 1.30].map(m => { const a = withMul(m, 11), b = withMul(m, 10), d = a.defects.find(isAmp); return { m, d: d && d.s, iso: a.iso, rr: a.rejectReasons, same: a.iso === b.iso && JSON.stringify(a.rejectReasons) === JSON.stringify(b.rejectReasons) }; });
  ok("6) ≥ 25 % od nominału (×0,70 / ×1,30): major, `amps` w przyczynach, REJECT — tak samo jak kb:10", maj.every(x => x.d === "major" && x.rr.includes("amps") && x.iso === "REJECT" && x.same), maj); }
{ // mnożnik pozycji: ten sam co dla nominału, zakres = round(granica × mnożnik)
  const rows = ["PA", "PC", "PF", "PE"].map(pos => [pos, S.ampRng(32, pos), S.diaAmps(32, pos)]);
  ok("6) zakres × mnożnik pozycji jak nominał (Ø3,2: PA / PC / PF / PE), nominał w środku zakresu", rows.every(([pos, g, n]) => g[0] < n && n < g[1] && Math.abs((g[0] + g[1]) / 2 - n) <= 1), rows); }

// ── 7) łuk ──
{ const rows = []; for (let n = 1; n <= 20; n++) for (let b = 0; b < 3; b++) { const a = S.simulate(J(Bt.buildRound(SEED, b, n, 10)), { defects: true }), z = S.simulate(J(Bt.buildRound(SEED, b, n, 11)), { defects: true });
    rows.push({ b, n, raw: z.arcPenRaw, p10: a.arcPen, p11: z.arcPen, d10: a.defects.find(isArc), d11: z.defects.find(isArc) }); }
  const below = rows.filter(x => x.raw > 0 && x.raw < S.ARC_DEF_MIN), above = rows.filter(x => x.raw >= S.ARC_DEF_MIN);
  ok(`7) łuk poniżej progu ${S.ARC_DEF_MIN} (${below.length} prób botów): brak wady i kara łuku 0 (kb:10 miał wadę)`, below.length > 0 && below.every(x => !x.d11 && x.p11 === 0 && x.d10 && x.raw === x.p10), below.map(x => [x.b, x.n, x.raw]));
  ok(`7) łuk od progu (${above.length} prób): wada i kara jak w kb:10 (strona, waga, arcPen)`, above.length > 0 && above.every(x => x.d11 && x.d10 && x.d11.c === x.d10.c && x.d11.s === x.d10.s && x.p11 === x.p10), above.filter(x => !(x.d11 && x.d10 && x.d11.c === x.d10.c)).slice(0, 3));
  const nov = rows.filter(x => x.b === 0); ok("7) nowicjusz: każda wada łuku z kb:10 zostaje w kb:11", nov.every(x => !x.d10 || (x.d11 && x.d11.c === x.d10.c)), nov.filter(x => x.d10 && !x.d11).map(x => x.n)); }
// prawdziwy krótki łuk w środku ściegu (dociskanie 1,6 s) — to samo narzędzie co kb10.js
const RISE = 1.0, LIFT = 1.5, PUSH = 3.5;
function reprogram(round, beadIdx, mkProg) {
  const r = J(round), plan = S.weldPlan(r.joint, r.thick, r.pos, r.proc, 2); let bead = 0, t0 = null, arcLen = 0, curB = 0, prevT = 0, prog = null, L0 = null;
  for (const e of r.events) {
    if (e.type === "bank") { bead++; continue; } if (bead !== beadIdx) continue;
    if (e.type === "down") { if (t0 === null) { t0 = e.t; L0 = S.elecTyp(plan[beadIdx].k, r.thick) / 10; prog = mkProg(); } arcLen = 0; curB = e.b | 0; prevT = e.t; continue; }
    if (e.type !== "move" || t0 === null) continue;
    const dt = (e.t - prevT) / 1000; prevT = e.t;
    arcLen = Math.max(0, arcLen + (RISE + ((curB & 2) ? LIFT : 0) - ((curB & 1) ? PUSH : 0)) * dt);
    const ts = (e.t - t0) / 1000, b = prog(ts, arcLen, L0); if (b !== null) e.b = b; curB = e.b | 0; }
  return r; }
const hold = x => (ts, a, L0) => a > x * L0 ? 1 : a < 0.9 * x * L0 ? 2 : 0;
const ARCBASE = Bt.buildRound(SEED, 2, 2);
const realShort = () => (ts, a, L0) => (ts >= 3 && ts < 4.6 ? hold(0.3) : hold(0.8))(ts, a, L0);
const longAll = () => hold(2.9);
function arcCase(Sim, mk, kb, both) { const r = both ? reprogram(reprogram(ARCBASE, 0, mk), 1, mk) : reprogram(ARCBASE, 1, mk); return Sim.simulate(J({ ...r, kb }), { defects: true }); }
const T7 = Sim => { const s = arcCase(Sim, realShort, 11), d = s.defects.find(isArc); return { ok: !!d && d.c === "arc_short" && s.arcPen >= Sim.ARC_DEF_MIN, arcPen: s.arcPen, d: d && d.c }; };
{ const x = T7(S); ok("7) prawdziwy krótki łuk w środku ściegu (docisk do 0,3×Ø przez 1,6 s): wykryty jako „za krótki łuk”", x.ok, x);
  const a = arcCase(S, longAll, 11, true), b = arcCase(S, longAll, 10, true);
  ok("7) major łuku bez zmian (łuk ~2,7×Ø w obu ściegach): ta sama waga, przyczyna `arc` i ISO co w kb:10", a.arcPen >= 12 && a.rejectReasons.includes("arc") && a.iso === b.iso && JSON.stringify(a.rejectReasons) === JSON.stringify(b.rejectReasons) && a.arcPen === b.arcPen, { arcPen: a.arcPen, rr: a.rejectReasons }); }

// ── 8) stałe: tabela ze źródeł (zrodla_zakresow.md), gra i Battle nietknięte ──
{ ok("8) AMP_RNG = zakresy z karty / komentarza (Ø2,0 50–70, Ø2,5 70–90, Ø3,2 100–130, Ø4,0 140–180 A), nominał = środek, w ±25 %",
    JSON.stringify(S.AMP_RNG) === JSON.stringify({ 20: [50, 70], 25: [70, 90], 32: [100, 130], 40: [140, 180] }) && S.DIAS.every(d => (S.AMP_RNG[d][0] + S.AMP_RNG[d][1]) / 2 === S.AMP_DIA[d] && S.AMP_RNG[d][0] / S.AMP_DIA[d] > 0.75 && S.AMP_RNG[d][1] / S.AMP_DIA[d] < 1.25), S.AMP_RNG);
  // karty producentów (zrodla_zakresow.md): każdy zakres ARC leży w całości w co najmniej jednej karcie rutylowej i jednej zasadowej
  const CARDS = { rutyl: { "ESAB OK 46.00": { 20: [50, 80], 25: [60, 100], 32: [80, 150], 40: [100, 230] }, "Böhler FOX OHV": { 20: [45, 80], 25: [60, 100], 32: [90, 130], 40: [110, 170] } },
                  zasad: { "ESAB OK 48.00": { 20: [55, 90], 25: [70, 110], 32: [90, 140], 40: [120, 190] }, "Böhler FOX EV 50": { 20: [50, 70], 25: [80, 110], 32: [100, 140], 40: [130, 180] } } };
  const inside = (g, c) => g[0] >= c[0] && g[1] <= c[1];
  const cover = S.DIAS.map(d => [d, Object.keys(CARDS.rutyl).filter(k => inside(S.AMP_RNG[d], CARDS.rutyl[k][d])), Object.keys(CARDS.zasad).filter(k => inside(S.AMP_RNG[d], CARDS.zasad[k][d]))]);
  ok("8) każdy zakres ARC w całości w karcie ≥ 1 elektrody rutylowej i ≥ 1 zasadowej", cover.every(([d, r, z]) => r.length && z.length), cover);
  ok("8) tekst wady prądu pokazuje zakres ARC, bez WPS przy jego granicach (PL/EN/RU)",
    Object.entries({ pl: "zakres ARC", en: "ARC range", ru: "диапазон ARC" }).every(([lang, label]) => {
      const t = Bt.defectText({ k: "def_amp_low_r", p: [68, 70, 90] }, lang);
      const unit = lang === "ru" ? "А" : "A";
      return t.includes(label + " 70–90 " + unit) && !/WPS.{0,12}70–90|70–90.{0,12}WPS/i.test(t);
    }), Object.fromEntries(["pl", "en", "ru"].map(lang => [lang, Bt.defectText({ k: "def_amp_low_r", p: [68, 70, 90] }, lang)])));
  const ampExplain = Object.fromEntries(["pl", "en", "ru"].map(lang => [lang, Bt.explainOf("def_amp_low_r", lang).join(" ")]));
  ok("8) objaśnienie odróżnia pasmo treningowe od rzeczywistego WPS i mówi, że prąd w zakresie nie gwarantuje spoiny bez wad (PL/EN/RU)",
    ampExplain.pl.includes("Pasmo treningowe ARC w granicach karty elektrody; prawdziwy WPS ustala zakład.") && ampExplain.pl.includes("Prąd w zakresie nie gwarantuje spoiny bez wad.") &&
    ampExplain.en.includes("The ARC training band stays within the electrode data sheet; the shop sets the real WPS.") && ampExplain.en.includes("Current within the range does not guarantee a defect-free weld.") &&
    ampExplain.ru.includes("Тренировочный диапазон ARC в пределах паспорта электрода; настоящий WPS устанавливает предприятие.") && ampExplain.ru.includes("Ток в диапазоне не гарантирует шов без дефектов."));   // 11_v2: krócej (B), bez zdania o prędkości i łuku
  ok("8) ARC_DEF_MIN = 0,25 (z rozkładu: najmniejsza kara łuku nowicjusza na 100 próbach 0,80)", S.ARC_DEF_MIN === 0.25);
  const H = fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), core = fs.readFileSync(path.join(ROOT, "..", "battle-server", "core.js"), "utf8");
  ok("8) gra nagrywa kb:9, Battle wymaga kb 9, VERSION 3.15.0 / SCORING 1.10.0 bez zmian, gra nie zna AMP_RNG ani kb:11",
    /\n\s*kb:9,/.test(H) && !/kb:1[01],/.test(H) && !/AMP_RNG|ARC_DEF_MIN/.test(H) && S.VERSION === "3.15.0" && S.SCORING_VERSION === "1.10.0" && S.TRIAL_KB === 10 && S.TRIAL_KB_MAX === 11 && /const KB_FOR_SCORING = \{ "1\.10\.0": 9 \};/.test(core));
  const frz = fs.readFileSync(path.join(__dirname, "sim-3.15.0-kb10.js"), "utf8");
  ok("8) sim-3.15.0-kb10.js = silnik b8fde93 (ma okno zajarzenia kb:10, nie ma AMP_RNG / ARC_DEF_MIN)", frz.includes("ARC_GRACE_S") && !frz.includes("AMP_RNG") && !frz.includes("ARC_DEF_MIN") && OLD.VERSION === "3.15.0"); }

// ── 9) mutacje: każda musi wywrócić swój test ──
function load(src) { const m = { exports: {} }; vm.runInNewContext(src, { module: m, exports: m.exports, self: undefined, Math, JSON, Object, Array, Number, String, Set, Map, isFinite, console }); return m.exports; }
const mut = (from, to) => { if (!SIMSRC.includes(from)) throw new Error("mutacja: brak fragmentu " + from); return load(SIMSRC.replace(from, to)); };
const RNG = "const AMP_RNG = { 20: [50, 70], 25: [70, 90], 32: [100, 130], 40: [140, 180] };";
{ const examAmp = Sim => { let c = 0; for (let n = 1; n <= 20; n++) if (Sim.simulate(J(Bt.buildRound(SEED, 2, n, 11)), { defects: true }).defects.some(isAmp)) c++; return c; };
  const at = (Sim, m) => Sim.simulate(J({ ...base, amps: Math.round(REC * m), kb: 11 }), { defects: true });
  const belowArc = Sim => { for (let n = 1; n <= 20; n++) for (let b = 1; b < 3; b++) { const s = Sim.simulate(J(Bt.buildRound(SEED, b, n, 11)), { defects: true }); if (s.arcPenRaw > 0 && s.arcPenRaw < 0.25 && s.defects.some(isArc)) return true; } return false; };
  const novArc = Sim => { let c = 0; for (let n = 1; n <= 20; n++) if (Sim.simulate(J(Bt.buildRound(SEED, 0, n, 11)), { defects: true }).defects.some(isArc)) c++; return c; };
  const M1 = mut(RNG, "const AMP_RNG = { 20: [60, 60], 25: [80, 80], 32: [115, 115], 40: [160, 160] };");
  const M2 = mut(RNG, "const AMP_RNG = { 20: [0, 1e9], 25: [0, 1e9], 32: [0, 1e9], 40: [0, 1e9] };");
  const M3 = mut("sev: ar === 1 ? null : (Math.abs(ar - 1) >= 0.25 ? \"major\" : \"minor\"),", "sev: ar === 1 ? null : (Math.abs(ar - 1) >= 0.35 ? \"major\" : \"minor\"),");
  const M4 = mut("const ARC_DEF_MIN = 0.25;", "const ARC_DEF_MIN = 0;"), M5 = mut("const ARC_DEF_MIN = 0.25;", "const ARC_DEF_MIN = 10;");
  const res = {
    "zakres szerokości 0 → wracają fałszywe wady (test 3)": examAmp(M1) > 0,
    "zakres nieskończony → ×0,85 bez wady (test 5)": !at(M2, 0.85).defects.some(isAmp),
    "próg major 0,35 zamiast 0,25 → ×0,70 bez odrzutu (test 6)": !at(M3, 0.70).rejectReasons.includes("amps"),
    "ARC_DEF_MIN = 0 → wada łuku przy karze < 0,25 (test 7)": belowArc(M4),
    "ARC_DEF_MIN = 10 → nowicjusz traci wady łuku (test 7)": novArc(M5) < novArc(S) };
  const ctrl = examAmp(S) === 0 && at(S, 0.85).defects.some(isAmp) && at(S, 0.70).rejectReasons.includes("amps") && !belowArc(S) && novArc(S) === 20;
  ok("9) mutacje wykryte: " + Object.values(res).filter(Boolean).length + "/5 (silnik bez mutacji przechodzi te same scenariusze: " + ctrl + ")", ctrl && Object.values(res).every(Boolean), res); }

// ── 10) determinizm (także w osobnym procesie) ──
{ const sig = () => JSON.stringify(new Bt.Bench(SEED, 11).step(5).log);
  const a = sig(), b = sig();
  const child = cp.spawnSync(process.execPath, ["-e", `const Bt=require(${JSON.stringify(path.join(ROOT, "boty.js"))});process.stdout.write(JSON.stringify(new Bt.Bench(${SEED},11).step(5).log))`], { encoding: "utf8" });
  ok("10) determinizm: ziarno + reguła kb:11 + kroki = ten sam dziennik (dwa razy w procesie i w osobnym procesie)", a === b && child.stdout === a, { child: child.status, len: a.length }); }

console.log(fail ? `\n✗ ${fail} nie przeszło` : "\n✓ wszystko przeszło"); process.exit(fail ? 1 : 0);
