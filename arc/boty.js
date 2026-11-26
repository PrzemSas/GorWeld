/**
 * GORWELD ARC WELDER — „Boty kontra norma" (poprawka 09): trzech wirtualnych spawaczy na tej samej próbce.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 *
 * ZASADA: bot daje tylko WEJŚCIE (surowe zdarzenia wskaźnika, jak gra i tests/gen.js). Ocenę liczy wyłącznie
 * ArcSim.simulate(runda, {defects:true}) — punkty, litera, ISO, przyczyny odrzutu i lista wad 1:1 z inspect().
 * Tu nie ma żadnej własnej oceny ani poprawiania wyniku po silniku. Profile różnią się tempem, torem,
 * prądem, łukiem, kątem i nawykami (młotek, elektroda) — niczym więcej.
 *
 * Determinizm: wszystko z jednego ziarna (seed) i numeru próby; mulberry32 z silnika, zero Math.random().
 * Działa w przeglądarce (window.ArcBoty, wymaga wcześniej sim.js) i w Node (require("./boty.js")).
 */
(function (root) {
  "use strict";
  const Sim = (typeof module !== "undefined" && module.exports) ? require("./sim.js") : root.ArcSim;

  // ── Próbka v1: jedna dla wszystkich botów. Flagi jak w nagraniu gry (recStart): cvn, uf, kb:9, łuk i kąt z myszy.
  const SAMPLE = { proc: "MMA", pos: "PA", thick: 5, bead: "steel", joint: "butt" };
  const W = 1280, H = 720, PX = 16;                       // ten sam ekran logiczny co tests/gen.js
  const SPEED = { 2: 5.0, 3: 4.3, 5: 3.2, 8: 2.3, 12: 1.6 }, VMUL = { MMA: 1.0, MIG: 1.4, TIG: 0.7 };
  const ARC_RISE = 1.0, ARC_PUSH = 3.5, ARC_LIFT = 1.5, ANG_RATE = 42;    // fizyka łuku i obrotu kąta z sim.js — bot „wie", jak reaguje uchwyt
  const PASS_W = { root: 0.72, fill: 0.92, cap: 1.00 };
  const DT = 8;                                           // [ms] co ile bot rusza ręką (jak gen.js)

  // ── Profile: tylko wejście. sd = rozrzut między próbami, dr = wahanie w trakcie ściegu.
  //  v   — krotność tempa WPS        wob — drżenie toru [px] (16 px = 1 mm)     amp — krotność prądu z WPS
  //  arc — trzymana długość łuku [×Ø]  gap — szansa/s, że ręka „zapomni" dogrywać łuk (rwany łuk), gapS = ile s
  //  ang — odchyłka kąta [°] (roboczy, ciągnięcia)  chip — szansa, że zbije żużel  lazy — szansa, że nie zmieni elektrody
  //  lift — po zajarzeniu podnosi elektrodę do długości łuku (PPM = LIFT w sim.js); bez tego łuk startuje za krótki
  const PROFILES = [
    { id: "nowicjusz", sh: "Nowic.", pl: "Nowicjusz", en: "Beginner", col: "#ff7a5c",
      v: 1.05, vSd: 0.20, vDr: 0.20, wob: 14, wobSd: 6, amp: 1.0, ampSd: 0.12, arc: 1.2, arcSd: 0.2, gap: 0.12, gapS: 0.8,
      angW: 8, angT: 8, angSd: 5, chip: 0.75, lazy: 0.35, lift: 0 },
    { id: "sredni", sh: "Średni", pl: "Średniozaawansowany", en: "Intermediate", col: "#ffd23f",
      v: 1.0, vSd: 0.12, vDr: 0.12, wob: 9, wobSd: 4, amp: 1.0, ampSd: 0.07, arc: 1.0, arcSd: 0.08, gap: 0.03, gapS: 0.6,
      angW: 5, angT: 5, angSd: 4, chip: 0.92, lazy: 0.15, lift: 1 },
    { id: "egzaminator", sh: "Egzam.", pl: "Egzaminator", en: "Examiner", col: "#5fe08a",
      v: 1.0, vSd: 0.06, vDr: 0.05, wob: 4, wobSd: 2, amp: 1.0, ampSd: 0.04, arc: 1.0, arcSd: 0.08, gap: 0.005, gapS: 0.5,
      angW: 2.5, angT: 2.5, angSd: 2.5, chip: 1, lazy: 0, lift: 1 }
  ];

  // ziarno próby = f(ziarno przebiegu, bot, numer próby) — każda próba niezależna, ale powtarzalna
  function trialSeed(seed, bot, n) {
    let h = (seed >>> 0) ^ Math.imul(bot + 1, 0x9E3779B1) ^ Math.imul(n + 1, 0x85EBCA77);
    h = Math.imul(h ^ (h >>> 16), 0x7FEB352D); h = Math.imul(h ^ (h >>> 15), 0x846CA68B);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const q = v => Math.round(v * 100) / 100;

  function seam() {   // PA, prosto — jak seam() w tests/gen.js
    const cx = W / 2, cy = H * 0.66, len = Math.min(W, H) * 0.62, pts = [];
    for (let t = -1; t <= 1.0001; t += 2 / 150) pts.push({ x: cx + len / 2 * t, y: cy });
    return pts;
  }
  function lanePath(pts, off) { if (!off) return pts; return pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: p.x - dy / l * off, y: p.y + dx / l * off }; }); }

  // ── Jedna próba bota: surowe zdarzenia wg planu ściegów silnika (weldPlan), jak build() w tests/gen.js z kb:9 ──
  function buildRound(seed, botIdx, n) {
    const P = PROFILES[botIdx], S = SAMPLE, rs = trialSeed(seed, botIdx, n), r = Sim.mulberry32(rs);
    const ampRec = Sim.recommendedAmps(S.proc, S.thick, S.pos);
    const ampK = Math.max(0.6, 1 + (P.amp - 1) + gauss(r) * P.ampSd);
    const amps = Math.round(ampRec * ampK);
    const plan = Sim.weldPlan(S.joint, S.thick, S.pos, S.proc, 2), gh = Sim.grooveGeom(S.thick, true).gh;
    const vBase = SPEED[S.thick] * PX * VMUL[S.proc];
    const base = seam(), ev = [];
    let t = 0, elec = 1, guard = 1e9, rtick = 0, curD = null, wa = 0, ta = 0;
    // odchyłka kąta na całą próbkę (nawyk ręki) — znak losowy
    const tgtW = (r() < 0.5 ? -1 : 1) * Math.max(0, P.angW + gauss(r) * P.angSd);
    const tgtT = (r() < 0.5 ? -1 : 1) * Math.max(0, P.angT + gauss(r) * P.angSd);
    for (let pi = 0; pi < plan.length; pi++) {
      if (pi) ev.push({ type: "bank", t: Math.round(t), x: 0, y: 0 });
      if (pi && r() < P.chip) { t += 400; ev.push({ type: "chip", t: Math.round(t), x: 0, y: 0 }); }
      const b = plan[pi], Wl = gh * 1.25 * PASS_W[b.k], pts = lanePath(base, b.lane * (Wl - Wl * b.wm));
      // elektroda: typowa dla ściegu; „leniwy" zostaje przy tej, którą ma w uchwycie (kb≥6)
      const typ = Sim.elecTyp(b.k, S.thick); if (curD === null) curD = typ;
      const want = (r() < P.lazy) ? curD : typ;
      if (want !== curD) { ev.push({ type: "dia", t: Math.round(t), x: 0, y: 0, d: want }); elec = 1; curD = want; }
      const L0 = curD / 10;
      const vB = vBase * Math.max(0.35, P.v + gauss(r) * P.vSd);           // tempo tego ściegu
      const fr = 0.15 + r() * 0.35, ph = r() * 6.283;                      // wahanie tempa [Hz] i faza
      const wobA = Math.max(0, P.wob + gauss(r) * P.wobSd), wf = 0.4 + r() * 0.8, wph = r() * 6.283;
      const arcT = Math.max(0.4, P.arc + gauss(r) * P.arcSd);
      let arcLen = 0, i = 0, acc = 0, gapLeft = 0, walk = 0; const tBead = t;
      const push = (type, p, bb, k) => { const e = { type, t: Math.round(t), x: q(p.x), y: q(p.y) }; if (bb !== undefined) e.b = bb | 0; if (k !== undefined) e.k = k | 0; ev.push(e); };
      push("down", pts[0], 0); let cur = pts[0];
      while (i < pts.length - 1) {
        t += DT; const dtS = DT / 1000, ts = (t - tBead) / 1000;
        if (gapLeft <= 0 && P.gap && r() < P.gap * dtS) gapLeft = P.gapS * (0.5 + r());
        let bb = 0; if (gapLeft > 0) gapLeft -= dtS; else bb = (arcLen > L0 * arcT) ? 1 : (P.lift && arcLen < L0 * 0.7) ? 2 : 0;
        arcLen = Math.max(0, arcLen + (ARC_RISE + ((bb & 2) ? ARC_LIFT : 0) - ((bb & 1) ? ARC_PUSH : 0)) * dtS);
        // elektroda MMA: wymiana koło końca jak w gen.js (kb) — silnik daje nową tylko na `down` po swoim `replacing`
        const v = vB * Math.max(0.2, 1 + P.vDr * Math.sin(6.283 * fr * ts + ph));
        elec -= v * dtS / 1000; elec -= dtS / 55; guard += v * dtS;
        if (elec <= 0.13) { elec = 1; guard = 0; }
        if (elec <= 0.28 || guard < 90) { rtick += v * dtS; if (rtick >= 12) { rtick = 0; push("up", cur); t += 20; push("down", cur, 0); arcLen = 0; } }
        // kąt: dociśnij klawisz, aż ręka dojdzie do swojej (złej albo dobrej) pozycji
        let k = 0;
        if (tgtW - wa > 1.5) k |= 2; else if (wa - tgtW > 1.5) k |= 1;
        if (tgtT - ta > 1.5) k |= 8; else if (ta - tgtT > 1.5) k |= 4;
        if (k & 2) wa += ANG_RATE * dtS; if (k & 1) wa -= ANG_RATE * dtS; if (k & 8) ta += ANG_RATE * dtS; if (k & 4) ta -= ANG_RATE * dtS;
        acc += v * dtS;
        while (i < pts.length - 1 && acc >= Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)) { acc -= Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); i++; }
        const a = pts[Math.min(i, pts.length - 1)], c = pts[Math.min(i + 1, pts.length - 1)];
        const seg = Math.hypot(c.x - a.x, c.y - a.y) || 1, f = Math.min(1, acc / seg);
        walk += gauss(r) * wobA * 0.05; walk *= 0.985;                     // drżenie: wolna fala + błądzenie
        const off = wobA * Math.sin(6.283 * wf * ts + wph) * 0.6 + walk;
        cur = { x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f + off };
        push("move", cur, bb, k);
        if (t - tBead > 120000) break;
      }
      t += 20; push("up", pts[pts.length - 1]); t += 250;
    }
    return { seed: rs, W, H, proc: S.proc, joint: S.joint, pos: S.pos, thick: S.thick, bead: S.bead, amps, arc: 1, ang: 1, tig: 0, cvn: 1, uf: 1, kb: 9, events: ev };
  }

  // Próba = runda + wynik silnika. NIC nie jest dopisywane do wyniku.
  function runTrial(seed, botIdx, n) {
    const round = buildRound(seed, botIdx, n);
    const res = Sim.simulate(JSON.parse(JSON.stringify(round)), { defects: true });
    return { n, bot: botIdx, round, res };
  }

  // Wpis dziennika: tylko pola z silnika + parametry wejścia (prąd z rundy).
  function entryOf(tr) { const r = tr.res;
    const passes = tr.round.events.filter(e => e.type === "bank").length + 1;
    return { n: tr.n, bot: tr.bot, score: r.score, letter: r.letter, iso: r.iso, rejectReasons: r.rejectReasons.slice(),
      defects: r.defects.map(d => ({ s: d.s, c: d.c, k: d.k, p: d.p.slice() })),
      amps: r.amps, ampsWps: r.ampsWps, volts: r.volts, waDeg: r.waDeg, taDeg: r.taDeg, taIdeal: r.taIdeal,
      fastR: r.fastR, fastMax: r.fastMax, hi: r.hi, hiMax: r.hiMax, coverage: r.coverage, passes,
      elec: (r.elec || []).map(e => ({ d: e.d, typ: e.typ, amps: e.amps, ref: e.ref })),   // MMA: prąd i Ø per ścieg (silnik liczy prąd względem Ø)
      vWps: SPEED[SAMPLE.thick] * VMUL[SAMPLE.proc] }; }

  // ── Przebieg: krok = jedna skończona próba KAŻDEGO z trzech botów (3 wpisy w dzienniku) ──
  function Bench(seed) { this.reset(seed); }
  Bench.prototype.reset = function (seed) { this.seed = (seed >>> 0); this.n = 0; this.log = []; };
  Bench.prototype.stepOne = function () { const n = this.n + 1, out = [];
    for (let b = 0; b < PROFILES.length; b++) out.push(entryOf(runTrial(this.seed, b, n)));
    this.n = n; this.log.push(...out); return out; };
  Bench.prototype.step = function (k) { for (let i = 0; i < k; i++) this.stepOne(); return this; };
  Bench.prototype.stats = function (b) { const L = this.log.filter(e => e.bot === b), N = L.length;
    const iso = { B: 0, C: 0, D: 0, REJECT: 0 }; for (const e of L) iso[e.iso]++;
    return { n: N, avg: N ? L.reduce((a, e) => a + e.score, 0) / N : 0, pass: N ? (N - iso.REJECT) / N : 0, iso }; };

  // ── Teksty: 1:1 z I18N w index.html (test boty.js pilnuje zgodności co do znaku) ──
  const TEXTS = /*TEXTS*/{
    pl: {
      def_hi_over: "Przekroczony wkład ciepła — %1 kJ/mm przy dopuszczalnych %2. Materiał badany udarnościowo: powyżej granicy z WPS kwalifikacja udarnościowa nie pokrywa złącza — odrzut niezależnie od wyglądu lica",
      def_hi_zero: "Brak przejazdu przy palącym się łuku — wkład ciepła ponad limit WPS (max %1 kJ/mm). Ręka musi jechać",
      def_fast: "Za szybki przejazd — %1 mm/s przy %2 mm/s z WPS: niewypełniony rowek i brak wtopienia w brzegi (ISO 5817: 511, 401) — odrzut niezależnie od wyglądu lica",
      def_dir_pf: "Ścieg PF jechany z góry na dół — niezgodny z WPS (PF = z dołu do góry): ryzyko braku przetopu i przyklejenia (ISO 5817: 401) — odrzut niezależnie od wyglądu lica",
      def_dir_pg: "Ścieg PG jechany z dołu do góry — niezgodny z WPS (PG = z góry na dół): przegrzanie cienkiej blachy i nadmierny nadlew — odrzut niezależnie od wyglądu lica",
      def_pen: "Brak przetopu / przyklejenie grani (%1% niewypełnione)",
      def_narrow: "Wąskie lico — niedolew (za szybkie tempo)",
      def_wide: "Nadmierny nadlew lica (za wolno)",
      def_undercut: "Podtopienie / zwis poza granią (%1%)",
      def_porosity: "Porowatość — %1 pęcherzy (niestabilny łuk)",
      def_arc_short: "Za krótki łuk — przywieranie, brak wtopienia",
      def_arc_long: "Za długi łuk — utrata osłony, pęcherze i odpryski",
      def_stick: "Przerwany łuk — %1 raz(y)",
      def_ang_work: "Krzywy kąt roboczy — podtopienie jednej krawędzi, ścieg obok osi",
      def_ang_drag: "Za duży kąt ciągnięcia — wtrącenia żużla, wypukłe lico",
      def_ang_push: "Elektroda pchana — brak wtopienia, żużel przed jeziorkiem",
      def_offaxis: "Ścieg poza osią złącza — podtopienie jednej krawędzi, brak wtopienia po drugiej",
      def_filler: "Nierówny rytm spoiwa — faliste lico, miejscami nadlew, miejscami niedolew",
      def_amp_low: "Za mały prąd — brak wtopienia (%1 A przy WPS %2 A)",
      def_amp_high: "Za duży prąd — przepalenie / podtopienie (%1 A przy WPS %2 A)",
      def_dia_small: "Za cienka elektroda — Ø%1 zamiast Ø%2 (%3): zimny ścieg, mało stopiwa, ryzyko braku wtopienia w brzegi (ISO 5817: 401)",
      def_dia_root: "Za gruba elektroda na grań — Ø%1 zamiast Ø%2 (%3): przepalenie, nadmierny przetop (ISO 5817: 504, 510)",
      def_dia_big: "Za gruba elektroda — Ø%1 zamiast Ø%2 (%3): za duże jeziorko, przegrzanie, szerokie lico",
      def_spatter: "Odpryski — %1 (czyszczenie po spawaniu)",
      def_uneven: "Nierówna szerokość lica",
      def_crater: "Krater / niewypełniony koniec ściegu",
      def_rootlack: "Słaby przetop w grani (warstwa przetopowa %1%)",
      def_edges: "Lico nie przykryło krawędzi fazy na %1% długości — niewypełniony brzeg i brak wtopienia (ISO 5817: 511, 401)",
      def_interbead: "Brak wtopienia między ściegami — szczelina między sąsiednimi ściegami (ISO 5817: 401)",
      def_slag: "Wtrącenie żużla — następny ścieg poszedł po niezebranym żużlu %1× (ISO 5817: 301)",
      def_clean: "Brak wad — spoina zgodna z wymaganiami",
      iso_B: "poziom B (rygor.)",
      iso_C: "poziom C",
      iso_D: "poziom D",
      iso_reject: "ODRZUCONA",
      rep_note: "Symulacja. Pomoc dydaktyczna, nie badanie spoiny, WPQR ani uprawnienie spawacza.",
      pass_root: "przetop",
      pass_fill: "wypełnienie",
      pass_cap: "lico",
      lane_n: "tor %1/%2",
      bead_weave: "wahadło"
    },
    en: {
      def_hi_over: "Heat input exceeded — %1 kJ/mm against %2 allowed. Impact-tested material: above the WPS limit the CVN qualification no longer covers the joint — reject regardless of how the face looks",
      def_hi_zero: "No travel with the arc burning — heat input above the WPS limit (max %1 kJ/mm). Keep the hand moving",
      def_fast: "Travel too fast — %1 mm/s against %2 mm/s on the WPS: underfilled groove and lack of sidewall fusion (ISO 5817: 511, 401) — reject regardless of how the face looks",
      def_dir_pf: "PF bead run downhill — not per WPS (PF = vertical up): risk of lack of fusion and cold lap (ISO 5817: 401) — reject regardless of how the face looks",
      def_dir_pg: "PG bead run uphill — not per WPS (PG = vertical down): overheated thin plate and excess reinforcement — reject regardless of how the face looks",
      def_pen: "Lack of penetration / cold lap (%1% unfilled)",
      def_narrow: "Narrow bead — underfill (too fast)",
      def_wide: "Excess reinforcement (too slow)",
      def_undercut: "Undercut / sag outside groove (%1%)",
      def_porosity: "Porosity — %1 pores (unstable arc)",
      def_arc_short: "Arc too short — sticking, lack of fusion",
      def_arc_long: "Arc too long — lost shielding, pores and spatter",
      def_stick: "Arc interrupted — %1 time(s)",
      def_ang_work: "Work angle off — undercut on one side, bead off the centreline",
      def_ang_drag: "Drag angle too steep — slag inclusions, ropey convex face",
      def_ang_push: "Electrode pushed — lack of fusion, slag ahead of the puddle",
      def_offaxis: "Bead off the joint centreline — undercut on one edge, lack of fusion on the other",
      def_filler: "Uneven filler rhythm — rippled face, excess in places, starved in others",
      def_amp_low: "Current too low — lack of fusion (%1 A vs WPS %2 A)",
      def_amp_high: "Current too high — burn-through / undercut (%1 A vs WPS %2 A)",
      def_dia_small: "Electrode too thin — Ø%1 instead of Ø%2 (%3): cold bead, little deposit, risk of lack of sidewall fusion (ISO 5817: 401)",
      def_dia_root: "Electrode too thick for the root — Ø%1 instead of Ø%2 (%3): burn-through, excess penetration (ISO 5817: 504, 510)",
      def_dia_big: "Electrode too thick — Ø%1 instead of Ø%2 (%3): oversized pool, overheating, wide cap",
      def_spatter: "Spatter — %1 (post-weld cleanup)",
      def_uneven: "Uneven bead width",
      def_crater: "Crater / unfilled bead end",
      def_rootlack: "Poor root penetration (root pass %1%)",
      def_edges: "Cap did not cover the bevel edges on %1% of the length — unfilled edge and lack of fusion (ISO 5817: 511, 401)",
      def_interbead: "Lack of fusion between beads — a gap between neighbouring beads (ISO 5817: 401)",
      def_slag: "Slag inclusion — the next bead went over unremoved slag %1× (ISO 5817: 301)",
      def_clean: "No defects — weld meets requirements",
      iso_B: "level B (strict)",
      iso_C: "level C",
      iso_D: "level D",
      iso_reject: "REJECTED",
      rep_note: "Simulation. Teaching aid only, not a weld test, WPQR or welder qualification.",
      pass_root: "root",
      pass_fill: "fill",
      pass_cap: "cap",
      lane_n: "lane %1/%2",
      bead_weave: "weave"
    }
  }/*/TEXTS*/;
  function fmtDia(d, lang) { const v = (d / 10).toFixed(1); return lang === "en" ? v : v.replace(".", ","); }
  function beadLabel(i, lang) { const L = TEXTS[lang], plan = Sim.weldPlan(SAMPLE.joint, SAMPLE.thick, SAMPLE.pos, SAMPLE.proc, 2), b = plan[i];
    if (!b) return L.pass_cap; const k = plan.filter((q2, j) => j <= i && q2.lay === b.lay).length;
    return L["pass_" + b.k] + (b.n > 1 ? " · " + L.lane_n.replace("%1", k).replace("%2", b.n) : "") + (b.wv ? " · " + L.bead_weave : ""); }
  function defectText(d, lang) { const L = TEXTS[lang] || TEXTS.pl; let p = d.p;
    if (d.c === "dia") p = [fmtDia(p[0], lang), fmtDia(p[1], lang), beadLabel(p[2], lang)];
    let s = L[d.k] || d.k; p.forEach((v, i) => { s = s.split("%" + (i + 1)).join(String(v)); }); return s; }

  const SPEED_WPS = SPEED[SAMPLE.thick] * VMUL[SAMPLE.proc];   // [mm/s] tempo z WPS dla próbki
  const API = { SAMPLE, SPEED_WPS, PROFILES, TEXTS, trialSeed, buildRound, runTrial, entryOf, Bench, defectText, VERSION: "1.0.0" };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.ArcBoty = API;
})(typeof self !== "undefined" ? self : this);
