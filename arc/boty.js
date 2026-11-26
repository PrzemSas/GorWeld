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
  //    10: przełącznik „pomijaj zajarzenie" = te same zdarzenia z flagą rundy kb:10 (reguła próbna w sim.js). Ruch bota bez zmian.
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
    { id: "nowicjusz", sh: "Nowic.", pl: "Nowicjusz", en: "Beginner", ru: "Новичок", col: "#ff7a5c",
      v: 1.05, vSd: 0.20, vDr: 0.20, wob: 14, wobSd: 6, amp: 1.0, ampSd: 0.12, arc: 1.2, arcSd: 0.2, gap: 0.12, gapS: 0.8,
      angW: 8, angT: 8, angSd: 5, chip: 0.75, lazy: 0.35, lift: 0 },
    { id: "sredni", sh: "Średni", pl: "Średniozaawansowany", en: "Intermediate", ru: "Средний уровень", col: "#ffd23f",
      v: 1.0, vSd: 0.12, vDr: 0.12, wob: 9, wobSd: 4, amp: 1.0, ampSd: 0.07, arc: 1.0, arcSd: 0.08, gap: 0.03, gapS: 0.6,
      angW: 5, angT: 5, angSd: 4, chip: 0.92, lazy: 0.15, lift: 1 },
    { id: "egzaminator", sh: "Egzam.", pl: "Egzaminator", en: "Examiner", ru: "Экзаменатор", col: "#5fe08a",
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
  function buildRound(seed, botIdx, n, grace) {
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
    return { seed: rs, W, H, proc: S.proc, joint: S.joint, pos: S.pos, thick: S.thick, bead: S.bead, amps, arc: 1, ang: 1, tig: 0, cvn: 1, uf: 1, kb: grace ? 10 : 9, events: ev };
  }

  // Próba = runda + wynik silnika. NIC nie jest dopisywane do wyniku.
  function runTrial(seed, botIdx, n, grace) {
    const round = buildRound(seed, botIdx, n, grace);
    const res = Sim.simulate(JSON.parse(JSON.stringify(round)), { defects: true });
    return { n, bot: botIdx, round, res };
  }

  // Wpis dziennika: tylko pola z silnika + parametry wejścia (prąd z rundy).
  function entryOf(tr) { const r = tr.res;
    const passes = tr.round.events.filter(e => e.type === "bank").length + 1;
    return { n: tr.n, bot: tr.bot, kb: tr.round.kb, arcPen: r.arcPen, score: r.score, letter: r.letter, iso: r.iso, rejectReasons: r.rejectReasons.slice(),
      defects: r.defects.map(d => ({ s: d.s, c: d.c, k: d.k, p: d.p.slice() })),
      amps: r.amps, ampsWps: r.ampsWps, volts: r.volts, waDeg: r.waDeg, taDeg: r.taDeg, taIdeal: r.taIdeal,
      fastR: r.fastR, fastMax: r.fastMax, hi: r.hi, hiMax: r.hiMax, coverage: r.coverage, passes,
      elec: (r.elec || []).map(e => ({ d: e.d, typ: e.typ, amps: e.amps, ref: e.ref })),   // MMA: prąd i Ø per ścieg (silnik liczy prąd względem Ø)
      vWps: SPEED[SAMPLE.thick] * VMUL[SAMPLE.proc] }; }

  // ── Przebieg: krok = jedna skończona próba KAŻDEGO z trzech botów (3 wpisy w dzienniku) ──
  // grace (10): true = rundy z flagą kb:10. Ziarno + grace + liczba kroków = identyczny dziennik. reset bez grace zostawia bieżący.
  function Bench(seed, grace) { this.grace = false; this.reset(seed, grace); }
  Bench.prototype.reset = function (seed, grace) { this.seed = (seed >>> 0); if (grace !== undefined) this.grace = !!grace; this.n = 0; this.log = []; };
  Bench.prototype.stepOne = function () { const n = this.n + 1, out = [];
    for (let b = 0; b < PROFILES.length; b++) out.push(entryOf(runTrial(this.seed, b, n, this.grace)));
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
    },
    ru: {
      def_hi_over: "Превышен погонный тепловложение — %1 кДж/мм при допустимых %2. Материал с испытанием на удар: выше предела по WPS квалификация не покрывает соединение — брак независимо от вида валика",
      def_hi_zero: "Нет перемещения при горящей дуге — тепловложение выше предела WPS (макс. %1 кДж/мм). Рука должна двигаться",
      def_fast: "Слишком быстрое ведение — %1 мм/с при %2 мм/с по WPS: незаполненная разделка и несплавление кромок (ISO 5817: 511, 401) — брак независимо от вида валика",
      def_dir_pf: "Валик PF выполнен сверху вниз — не по WPS (PF = снизу вверх): риск несплавления и наплыва без провара (ISO 5817: 401) — брак независимо от вида валика",
      def_dir_pg: "Валик PG выполнен снизу вверх — не по WPS (PG = сверху вниз): перегрев тонкого листа и избыточное усиление — брак независимо от вида валика",
      def_pen: "Непровар / несплавление (%1% не заполнено)",
      def_narrow: "Узкий валик — недолив (быстро)",
      def_wide: "Чрезмерное усиление (медленно)",
      def_undercut: "Подрез / натёк вне шва (%1%)",
      def_porosity: "Поры — %1 (нестабильная дуга)",
      def_arc_short: "Слишком короткая дуга — прилипание, непровар",
      def_arc_long: "Слишком длинная дуга — потеря защиты, поры и брызги",
      def_stick: "Дуга прервана — %1 раз(а)",
      def_ang_work: "Кривой рабочий угол — подрез с одной стороны, шов мимо оси",
      def_ang_drag: "Слишком большой угол волочения — шлаковые включения, выпуклый валик",
      def_ang_push: "Электрод толкается — непровар, шлак перед ванной",
      def_offaxis: "Шов вне оси соединения — подрез с одной кромки, непровар с другой",
      def_filler: "Неровный ритм присадки — волнистый валик, местами наплыв, местами непровар",
      def_amp_low: "Ток занижен — непровар (%1 А при WPS %2 А)",
      def_amp_high: "Ток завышен — прожог / подрез (%1 А при WPS %2 А)",
      def_dia_small: "Слишком тонкий электрод — Ø%1 вместо Ø%2 (%3): холодный валик, мало наплавки, риск несплавления с кромками (ISO 5817: 401)",
      def_dia_root: "Слишком толстый электрод для корня — Ø%1 вместо Ø%2 (%3): прожог, чрезмерный провар (ISO 5817: 504, 510)",
      def_dia_big: "Слишком толстый электрод — Ø%1 вместо Ø%2 (%3): большая ванна, перегрев, широкая облицовка",
      def_spatter: "Брызги — %1 (зачистка)",
      def_uneven: "Неравномерная ширина",
      def_crater: "Кратер / незаваренный конец шва",
      def_rootlack: "Слабый провар корня (корневой слой %1%)",
      def_edges: "Облицовка не перекрыла кромки разделки на %1% длины — незаполненная кромка и несплавление (ISO 5817: 511, 401)",
      def_interbead: "Несплавление между валиками — зазор между соседними валиками (ISO 5817: 401)",
      def_slag: "Шлаковое включение — следующий валик пошёл по неубранному шлаку %1× (ISO 5817: 301)",
      def_clean: "Без дефектов — шов годен",
      iso_B: "уровень B (строгий)",
      iso_C: "уровень C",
      iso_D: "уровень D",
      iso_reject: "БРАК",
      rep_note: "Симуляция. Учебное пособие, не контроль сварного шва, не WPQR и не аттестация сварщика.",
      pass_root: "корень",
      pass_fill: "заполнение",
      pass_cap: "облицовка",
      lane_n: "дорожка %1/%2",
      bead_weave: "колебания"
    }
  }/*/TEXTS*/;
  function fmtDia(d, lang) { const v = (d / 10).toFixed(1); return lang === "en" ? v : v.replace(".", ","); }   // PL i RU: przecinek
  function beadLabel(i, lang) { const L = TEXTS[lang], plan = Sim.weldPlan(SAMPLE.joint, SAMPLE.thick, SAMPLE.pos, SAMPLE.proc, 2), b = plan[i];
    if (!b) return L.pass_cap; const k = plan.filter((q2, j) => j <= i && q2.lay === b.lay).length;
    return L["pass_" + b.k] + (b.n > 1 ? " · " + L.lane_n.replace("%1", k).replace("%2", b.n) : "") + (b.wv ? " · " + L.bead_weave : ""); }
  function defectText(d, lang) { const L = TEXTS[lang] || TEXTS.pl; let p = d.p;
    if (d.c === "dia") p = [fmtDia(p[0], lang), fmtDia(p[1], lang), beadLabel(p[2], lang)];
    let s = L[d.k] || d.k; p.forEach((v, i) => { s = s.split("%" + (i + 1)).join(String(v)); }); return s; }

  // ── 10: OBJAŚNIENIA WAD (pulpit szkoleniowy). Klucz = klucz tekstu wady z gry (def_*), który wystawia sim.js.
  //    [co to jest, typowa przyczyna, jak uniknąć, odniesienie]. Proces próbki: MMA (111) — osłoną jest otulina, nie gaz z butli.
  //    Numery wg ISO 6520-1 tylko pewne i zgodne z raportem gry; odchyłka procesu = uczciwie „to nie jest niezgodność wg ISO 5817".
  //    PL sprawdza GorWeld (objasnienia_do_sprawdzenia.md), RU i numery ze źródłem — Codex.
  const EXPLAIN = /*EXPLAIN*/{
    pl: {
      labels: ["Co to jest", "Typowa przyczyna", "Jak uniknąć", "Odniesienie"],
      gone: "W ostatniej próbie tej wady nie ma.", close: "Zamknij", title: "Objaśnienie wady",
      def_hi_over: ["Za dużo ciepła na mm spoiny względem WPS. Na stali badanej udarnościowo złącze wypada z kwalifikacji.", "Za wolno, za duży prąd, za długi łuk (wyższe napięcie), szerokie wahadło.", "Tempo z WPS, prąd dla Ø, łuk ok. 1×Ø. Szeroki ścieg rozbij na węższe.", "To nie jest niezgodność wg ISO 5817, tylko odchyłka od WPS; granica wynika z kwalifikacji technologii (np. ISO 15614-1). Możliwe skutki: spadek udarności."],
      def_hi_zero: ["Łuk się pali, a ręka stoi. Całe ciepło idzie w jedno miejsce.", "Zatrzymana ręka przy zajarzonym łuku: poprawianie chwytu, czekanie, patrzenie zamiast prowadzenia.", "Po zajarzeniu od razu prowadź. Jak musisz przerwać, zgaś łuk i wznów na zakładkę.", "To nie jest niezgodność wg ISO 5817, tylko odchyłka od WPS (wkład ciepła). Możliwe skutki: przegrzanie, przepalenie (510), spadek udarności."],
      def_fast: ["Tempo dużo wyższe niż w WPS. Rowek zostaje niedolany, brzegi nie są nadtopione.", "Pośpiech, gonienie jeziorka, za mały prąd nadrabiany szybką ręką.", "Prowadź ok. 1× tempa z WPS. Patrz, czy jeziorko obejmuje oba brzegi rowka.", "511 niecałkowite wypełnienie rowka, 4011 przyklejenie brzegowe (grupa 401) — te same numery co w raporcie gry."],
      def_dir_pf: ["PF prowadzona z góry na dół, a WPS każe z dołu do góry.", "Nawyk z PG albo łatwiejsza jazda w dół. Jeziorko i żużel wyprzedzają łuk.", "W PF prowadź z dołu do góry krótkim łukiem, z przytrzymaniem na brzegach.", "To nie jest niezgodność wg ISO 5817, tylko odchyłka od WPS (kierunek, pozycje wg ISO 6947). Możliwe skutki: przyklejenie (401), płytki przetop."],
      def_dir_pg: ["PG prowadzona z dołu do góry, a WPS każe z góry na dół.", "Nawyk z PF. Na cienkiej blasze jazda w górę skupia ciepło w jednym miejscu.", "W PG prowadź z góry na dół, szybciej, bez szerokiego wahadła.", "To nie jest niezgodność wg ISO 5817, tylko odchyłka od WPS (kierunek, pozycje wg ISO 6947). Możliwe skutki: przegrzanie, nadlew (502), przepalenie (510)."],
      def_pen: ["Część rowka nie jest zespolona: metal nie doszedł do dna albo leży na brzegu bez nadtopienia.", "Za szybko, za mały prąd, elektroda obok osi rowka, za długi łuk w grani.", "Prowadź środkiem rowka, prąd dla Ø z WPS, tempo ok. 1× WPS. W grani krótki łuk i pilnuj oczka przetopu.", "402 niepełny przetop (4021 w grani), 4013 przyklejenie w grani."],
      def_narrow: ["Lico węższe niż rowek. Metal nie przykrywa całej szerokości złącza.", "Za szybkie tempo, za mały prąd, za cienka elektroda, brak wahadła na licu.", "Zwolnij do tempa z WPS. Na licu lekkie wahadło od brzegu do brzegu, z krótkim przytrzymaniem na brzegach.", "511 niecałkowite wypełnienie rowka, gdy lico nie dochodzi do powierzchni blachy."],
      def_wide: ["Lico za wysokie i za szerokie: za dużo metalu w jednym miejscu.", "Za wolne prowadzenie, za szerokie wahadło, za gruba elektroda na ten ścieg.", "Tempo z WPS. Wahadło tylko na szerokość rowka i ok. 1–2 mm na każdy brzeg.", "502 nadmierny nadlew lica (spoina czołowa)."],
      def_undercut: ["Przy brzegu spoiny wyżłobiony rowek w materiale albo metal wylany poza złącze.", "Za duży prąd, za długi łuk, krzywy kąt roboczy, za szybko na brzegach wahadła.", "Prąd z WPS, łuk ok. 1×Ø, elektroda w osi złącza. Na brzegach wahadła krótko przytrzymaj, żeby dolać metalu.", "5011/5012 podtopienie ciągłe/przerywane. Metal na blasze bez wtopienia to 506 (nawis); ARC wtopienia nie mierzy, więc numeru nie daje."],
      def_porosity: ["Pęcherze gazu zamknięte w spoinie albo widoczne na licu.", "Za długi łuk (otulina nie osłania jeziorka), wilgotne elektrody, rdza, farba lub olej w rowku.", "Krótki łuk, suche elektrody (zasadowe suszone wg producenta), czysty rowek. Elektrodą zasadową zajarz przed miejscem startu i wróć.", "2011 pęcherz gazowy, 2012 porowatość równomierna, 2017 pęcherz powierzchniowy."],
      def_arc_short: ["Koniec elektrody bliżej jeziorka niż ok. 0,5×Ø. Łuk się dusi, elektroda przywiera.", "Dociskanie elektrody, za mały prąd, brak odsunięcia po zajarzeniu.", "Łuk w paśmie ARC 0,5–1,1×Ø, zwykle ok. 1×Ø; zasadowe prowadzi się krótszym łukiem niż rutylowe. Po zajarzeniu odsuń i podawaj w tempie topienia.", "To nie jest niezgodność wg ISO 5817, tylko odchyłka techniki. Możliwe skutki: wąskie wysokie lico, słabe zwilżanie brzegów (401), żużel (301)."],
      def_arc_long: ["Łuk dłuższy niż ok. 1,1×Ø. Otulina przestaje osłaniać jeziorko, łuk syczy i rozrzuca metal.", "Elektroda za wysoko albo niepodawana w miarę topienia.", "Łuk w paśmie ARC 0,5–1,1×Ø, zwykle ok. 1×Ø; zasadowe prowadzi się krótszym łukiem niż rutylowe. Podawaj w tempie topienia: równy trzask, nie syczenie.", "To nie jest niezgodność wg ISO 5817, tylko odchyłka techniki. Możliwe skutki: pory (2011), rozpryski (602), podtopienia (5011), płytsze wtopienie."],
      def_stick: ["Łuk zgasł w trakcie ściegu: elektroda przywarła albo została odciągnięta za daleko.", "Dociskanie elektrody, za mały prąd albo łuk wyciągany aż do zerwania.", "Łuk ok. 1×Ø. Przywartą elektrodę oderwij skrętem. Wznów przed kraterem i przejdź przez niego.", "To nie jest niezgodność wg ISO 5817, tylko odchyłka techniki. Możliwe skutki: wadliwe wznowienie (517), krater, pory."],
      def_ang_work: ["Elektroda pochylona w bok, nie w osi złącza. Jeden brzeg dostaje za dużo ciepła, drugi za mało.", "Przechylona ręka, zła pozycja ciała albo zasłonięty widok złącza.", "W doczołowym PA elektroda w poprzek złącza prostopadle do blachy (ARC: odchyłka 0°, klawisze A/D).", "To nie jest niezgodność wg ISO 5817, tylko odchyłka techniki. Możliwe skutki: podtopienie jednego brzegu (5011), przyklejenie drugiego (4011)."],
      def_ang_drag: ["Uchwyt za mocno wyprzedza koniec elektrody: elektroda za płasko, kąt do blachy poniżej ok. 70°.", "Za płasko trzymany uchwyt, zmęczenie ręki, gdy elektroda się skraca.", "MMA: lekkie ciągnięcie ok. 10° od pionu, czyli ok. 80° do blachy (ARC: klawisze W/S), aż do końca elektrody.", "To nie jest niezgodność wg ISO 5817, tylko odchyłka techniki. Możliwe skutki: wtrącenia żużla (301), wypukłe lico, złe przejście lica (505)."],
      def_ang_push: ["Elektroda pochylona do przodu, w kierunku jazdy. Żużel spływa przed jeziorko.", "Nawyk z MAG lub TIG, gdzie często się pcha, albo zła pozycja ręki.", "W MMA prowadź z lekkim ciągnięciem ok. 10° (ARC: klawisze W/S), żeby łuk spychał żużel do tyłu.", "To nie jest niezgodność wg ISO 5817, tylko odchyłka techniki. Możliwe skutki: przyklejenie (401), wtrącenia żużla (301)."],
      def_offaxis: ["Ścieg położony obok osi rowka. Jeden brzeg jest nadtopiony za mocno, drugi wcale.", "Słabo widoczny rowek, prowadzenie na oko, krzywy kąt roboczy.", "Przed zajarzeniem ustaw rękę wzdłuż złącza. Patrz na oba brzegi jeziorka, nie w łuk.", "To nie jest niezgodność wg ISO 5817, tylko odchyłka techniki. Możliwe skutki: podtopienie (5011) po jednej stronie, przyklejenie brzegowe (4011) po drugiej."],
      def_filler: ["Tylko TIG (141): pręt spoiwa podawany nierówno, raz za często, raz za rzadko.", "Brak rytmu ręki z prętem, wzrok na pręcie zamiast na jeziorku.", "Podawaj pręt równo na przedni brzeg jeziorka, nie w łuk. W MMA spoiwem jest elektroda.", "To nie jest niezgodność wg ISO 5817, tylko odchyłka techniki. Możliwe skutki: faliste lico, miejscami nadlew (502), miejscami niedolew (511)."],
      def_amp_low: ["Prąd niższy niż w WPS dla użytej Ø. Jeziorko małe i zimne.", "Źle ustawione źródło, prąd z innej Ø, ściszanie „na wszelki wypadek”.", "Ustaw prąd z WPS dla użytej Ø (ARC w PA: Ø2,5 ok. 80 A, Ø3,2 ok. 115 A).", "To nie jest niezgodność wg ISO 5817, tylko odchyłka od WPS. Możliwe skutki: przyklejenie (401), niepełny przetop (402), wtrącenia żużla (301)."],
      def_amp_high: ["Prąd wyższy niż w WPS dla użytej Ø. Jeziorko duże i rzadkie, elektroda może się czerwienić.", "Za wysoko ustawione źródło albo prąd po grubszej elektrodzie.", "Wróć do prądu z WPS dla użytej Ø. Grań raczej z dolnej części zakresu.", "To nie jest niezgodność wg ISO 5817, tylko odchyłka od WPS. Możliwe skutki: podtopienie (5011), nadmierny przetop (504), przepalenie (510), rozpryski (602)."],
      def_dia_small: ["Elektroda cieńsza niż typowa dla tego ściegu. Mało stopiwa, zimny ścieg.", "Niewymieniona elektroda po grani albo wybór cieńszej „na wszelki wypadek”.", "Dobierz Ø do ściegu wg WPS (ARC, 5 mm: grań Ø2,5, lico Ø3,2; zmiana przed ściegiem).", "To nie jest niezgodność wg ISO 5817, tylko odchyłka od WPS. Możliwe skutki: przyklejenie brzegowe (401), niedolew (511)."],
      def_dia_root: ["Na grań użyta elektroda grubsza niż typowa. Za dużo ciepła i metalu w cienkim dnie rowka.", "Grań zaczęta elektrodą przygotowaną do lica.", "Grań cieńszą elektrodą z WPS (ARC, 5 mm: Ø2,5), lico grubszą.", "To nie jest niezgodność wg ISO 5817, tylko odchyłka od WPS. Możliwe skutki: nadmierny przetop (504), przepalenie (510), jak w raporcie gry."],
      def_dia_big: ["Elektroda grubsza niż typowa dla tego ściegu: za duże jeziorko i za dużo ciepła.", "Pośpiech: grubsza elektroda kładzie więcej metalu naraz.", "Ø z WPS dla ściegu. Więcej metalu daj kolejnym ściegiem, nie grubszą elektrodą.", "To nie jest niezgodność wg ISO 5817, tylko odchyłka od WPS. Możliwe skutki: przegrzanie, nadmierny nadlew (502), podtopienie (5011)."],
      def_spatter: ["Kropelki metalu przyklejone do blachy obok spoiny.", "Za długi łuk, za duży prąd, wilgotne elektrody, elektroda pchana.", "Krótki łuk, prąd z WPS, suche elektrody. Po spawaniu oczyść, jeśli wymaga tego zastosowanie, np. malowanie.", "602 rozprysk. ISO 5817: dopuszczalność zależy od zastosowania (np. materiał, ochrona przed korozją)."],
      def_uneven: ["Szerokość lica zmienia się wzdłuż spoiny: raz wąsko, raz szeroko.", "Nierówne tempo i wahadło, zmiana długości łuku w trakcie elektrody.", "Stałe tempo z WPS, wahadło tej samej szerokości, łuk ok. 1×Ø przez całą elektrodę.", "Nie dotyczy: ARC nie przypisuje tu jednego numeru. Ocenia się skutki: nadmierny nadlew (502), złe przejście lica (505), niedolew (511)."],
      def_crater: ["Ścieg nie doszedł do końca złącza albo zostawił na końcu niewypełniony krater.", "Za wczesne oderwanie elektrody, start za daleko od brzegu blachy.", "Zaczynaj i kończ na końcach złącza. Na końcu przytrzymaj chwilę lub cofnij się, żeby wypełnić krater, potem oderwij.", "511 niecałkowite wypełnienie (koniec ściegu). W praktyce w kraterze bywa też jamka skurczowa (2025), ale ARC tego nie mierzy, sprawdza tylko dojście do końców złącza."],
      def_rootlack: ["Grań nie przetopiła dna rowka na całej długości. Od spodu brak przetopu.", "Za szybko w grani, za mały prąd, za długi łuk.", "Grań krótkim łukiem i prądem z WPS dla Ø2,5. Prowadź tak, żeby przed elektrodą było widać oczko przetopu.", "402 niepełny przetop (4021 niepełny przetop grani), 4013 przyklejenie w grani."],
      def_edges: ["Lico nie przykryło brzegów fazy. Przy krawędzi zostaje niewypełniony, niezespolony pas.", "Za wąskie wahadło na licu, za szybko, elektroda obok osi.", "Lico prowadź wahadłem od brzegu do brzegu, z przytrzymaniem na krawędziach fazy, aż jeziorko je nadtopi.", "511 niecałkowite wypełnienie rowka, 4011 przyklejenie brzegowe — jak w raporcie gry."],
      def_interbead: ["Dwa sąsiednie ściegi nie stopiły się ze sobą. Między nimi została szczelina.", "Za duży odstęp między torami, za mały prąd, żużel między ściegami.", "Każdy następny ścieg kładź na ok. połowę poprzedniego. Przed nim oczyść żużel.", "4012 przyklejenie międzyściegowe (grupa 401)."],
      def_slag: ["Żużel z poprzedniego ściegu został w spoinie pod następnym ściegiem.", "Brak czyszczenia żużla między ściegami.", "Po każdym ściegu zbij żużel młotkiem i oczyść szczotką (ARC: klawisz C). Uważaj na brzegi, tam żużel się chowa.", "301 wtrącenie żużla."],
      def_clean: ["Silnik ARC nie znalazł żadnej z wad, które mierzy.", "Parametry i ruch ręki w granicach WPS.", "Powtórz to samo. Wynik dotyczy symulacji, nie prawdziwej spoiny.", "Nie dotyczy. To nie jest badanie wizualne wg ISO 17637 ani ocena wg ISO 5817."]
    },
    en: {
      labels: ["What it is", "Typical cause", "How to avoid it", "Reference"],
      gone: "This defect is not in the latest trial.", close: "Close", title: "Defect explained",
      def_hi_over: ["Too much heat per millimetre of weld (kJ/mm) against the WPS. On impact-tested steel the joint falls outside the qualification.", "Travel too slow, current too high, arc too long (higher voltage), wide weave.", "WPS travel speed, current for the electrode Ø, arc about 1×Ø. Split a wide bead into several narrower ones.", "Not an imperfection under ISO 5817, it is a deviation from the WPS. The limit comes from procedure qualification (e.g. ISO 15614-1 with impact test). Possible result: lower toughness."],
      def_hi_zero: ["The arc is burning but the hand stands still. All the heat goes into one spot.", "Hand stopped with the arc lit: adjusting the grip, waiting, watching instead of travelling.", "Start travelling right after striking. If you must stop, break the arc and restart with an overlap.", "Not an imperfection under ISO 5817, it is a deviation from the WPS (heat input). Possible results: overheating, burn-through (510), lower toughness."],
      def_fast: ["Travel much faster than the WPS. The groove is underfilled and the sidewalls are not fused.", "Rushing, chasing the puddle, low current made up for with a fast hand.", "Travel at about 1× the WPS speed. Check that the puddle wets both groove edges.", "511 incompletely filled groove, 4011 lack of sidewall fusion (group 401) — the same numbers as the game report."],
      def_dir_pf: ["A PF weld run from top to bottom, while the WPS says bottom to top.", "Habit from PG, or the easier run downhill. The puddle and slag run ahead of the arc.", "In PF start at the bottom and travel up with a short arc, pausing at the edges.", "Not an imperfection under ISO 5817, it is a deviation from the WPS (direction; positions per ISO 6947). Possible results: lack of fusion (401), shallow penetration."],
      def_dir_pg: ["A PG weld run from bottom to top, while the WPS says top to bottom.", "Habit from PF. On thin plate travelling up puts a lot of heat in one spot.", "In PG travel from top to bottom, faster and without a wide weave, so the puddle does not run ahead of the arc.", "Not an imperfection under ISO 5817, it is a deviation from the WPS (direction; positions per ISO 6947). Possible results: overheating, excess weld metal (502), burn-through (510)."],
      def_pen: ["Part of the groove is not fused: metal did not reach the bottom or lies on the edge without melting it.", "Too fast, current too low, electrode off the groove centre, arc too long in the root.", "Run down the groove centre, WPS current for the Ø, about 1× WPS speed. In the root keep a short arc and watch the keyhole.", "402 incomplete penetration (4021 in the root), 4013 lack of root fusion."],
      def_narrow: ["The cap is narrower than the groove. Metal does not cover the full joint width.", "Travel too fast, current too low, electrode too thin, no weave on the cap.", "Slow down to the WPS speed. Weave the cap edge to edge with a short pause at each edge.", "511 incompletely filled groove, when the cap does not reach the plate surface."],
      def_wide: ["The cap is too high and too wide: too much metal in one place.", "Travel too slow, weave too wide, electrode too thick for this bead.", "WPS speed. Weave only the groove width plus about 1–2 mm on each edge.", "502 excess weld metal (butt weld)."],
      def_undercut: ["A groove melted into the base metal at the weld toe, or metal spilled outside the joint.", "Current too high, arc too long, work angle off, too fast at the weave edges.", "WPS current, arc about 1×Ø, electrode on the joint axis. Pause briefly at the weave edges to fill them.", "5011/5012 continuous/intermittent undercut. Metal lying on the plate without fusion is 506 (overlap); ARC does not measure fusion, so it gives no number."],
      def_porosity: ["Gas pores trapped in the weld or open on the surface.", "Arc too long (the coating no longer shields the puddle), damp electrodes, rust, paint or oil in the groove.", "Short arc, dry electrodes (basic ones baked per the maker), clean groove. With a basic electrode strike ahead of the start and come back.", "2011 gas pore, 2012 uniformly distributed porosity, 2017 surface pore."],
      def_arc_short: ["The electrode tip is closer to the puddle than about 0.5×Ø. The arc chokes and the electrode sticks.", "Pushing the electrode in too hard, current too low, not lifting to arc length after striking.", "Keep the arc in the ARC band 0.5–1.1×Ø, usually about 1×Ø; basic electrodes run a shorter arc than rutile ones. Lift after striking and feed as it melts.", "Not an imperfection under ISO 5817, it is a technique deviation. Possible results: narrow high cap, poor edge wetting (401), slag inclusions (301)."],
      def_arc_long: ["Arc longer than about 1.1×Ø. The coating stops shielding the puddle, the arc hisses and throws metal.", "Electrode lifted too high or not fed as it melts, tired hand.", "Keep the arc in the ARC band 0.5–1.1×Ø, usually about 1×Ø; basic electrodes run a shorter arc than rutile ones. Feed as it melts: a steady crackle, not hissing.", "Not an imperfection under ISO 5817, it is a technique deviation. Possible results: pores (2011), spatter (602), undercut (5011), shallower fusion."],
      def_stick: ["The arc went out mid-bead: the electrode stuck to the plate or was pulled away too far.", "Pushing the electrode into the puddle, current too low, or stretching the arc until it breaks.", "Arc about 1×Ø. Free a stuck electrode with a twist. Restart ahead of the crater and run back through it to remelt it.", "Not an imperfection under ISO 5817, it is a technique deviation. Possible results at the restart: poor restart (517), crater, pores."],
      def_ang_work: ["The electrode leans sideways, off the joint axis. One edge gets too much heat, the other too little.", "Tilted hand, poor body position or a blocked view of the joint.", "In a PA butt joint keep the electrode square to the plate across the joint (ARC: 0° deviation, keys A/D).", "Not an imperfection under ISO 5817, it is a technique deviation. Possible results: undercut on one edge (5011), lack of fusion on the other (4011)."],
      def_ang_drag: ["The holder leads the electrode tip too far: the electrode lies too flat, under about 70° to the plate.", "Holder held too flat, tired hand as the electrode gets shorter.", "MMA: slight drag of about 10° from vertical, i.e. about 80° to the plate (ARC: keys W/S), to the end of the electrode.", "Not an imperfection under ISO 5817, it is a technique deviation. Possible results: slag inclusions (301), convex cap, incorrect weld toe (505)."],
      def_ang_push: ["The electrode leans forward, in the travel direction. Slag runs ahead of the puddle.", "Habit from MAG or TIG, where pushing is common, or a poor hand position.", "In MMA travel with a slight drag of about 10° (ARC: keys W/S), so the arc pushes the slag back.", "Not an imperfection under ISO 5817, it is a technique deviation. Possible results: lack of fusion (401), slag inclusions (301)."],
      def_offaxis: ["The bead lies beside the groove axis. One edge is melted too much, the other not at all.", "Groove hard to see, steering by feel without watching the edges, work angle off.", "Before striking, line your hand up along the joint. Watch both edges of the puddle, not the arc itself.", "Not an imperfection under ISO 5817, it is a technique deviation. Possible results: undercut (5011) on one side, lack of sidewall fusion (4011) on the other."],
      def_filler: ["TIG (141) only: the filler rod is fed unevenly, sometimes too often, sometimes too rarely.", "No rhythm in the rod hand, watching the rod instead of the puddle.", "Feed the rod at a steady rhythm into the leading edge of the puddle, not into the arc. In MMA this defect does not exist, the electrode is the filler.", "Not an imperfection under ISO 5817, it is a technique deviation. Possible results: rippled cap, excess metal in places (502), underfill in others (511)."],
      def_amp_low: ["Current below the WPS for the electrode Ø in use. The puddle is small and cold.", "Machine set wrong, current for another Ø, turning it down \"to be safe\".", "Set the WPS current for the Ø in use (ARC in PA: Ø2.5 about 80 A, Ø3.2 about 115 A).", "Not an imperfection under ISO 5817, it is a deviation from the WPS. Possible results: lack of fusion (401), incomplete penetration (402), slag inclusions (301)."],
      def_amp_high: ["Current above the WPS for the Ø in use. The puddle is large and runny, the electrode may glow red.", "Machine set too high, or current left from a thicker electrode.", "Go back to the WPS current for the Ø in use. Run the root rather at the low end of the range.", "Not an imperfection under ISO 5817, it is a deviation from the WPS. Possible results: undercut (5011), excessive penetration (504), burn-through (510), spatter (602)."],
      def_dia_small: ["Electrode thinner than typical for this bead. Little deposit, cold bead.", "Electrode not changed after the root, or a thinner one picked \"just in case\".", "Match the Ø to the bead per WPS (ARC, 5 mm: root Ø2.5, cap Ø3.2; change before the bead).", "Not an imperfection under ISO 5817, it is a deviation from the WPS. Possible results: lack of sidewall fusion (401), underfill (511)."],
      def_dia_root: ["Root run with an electrode thicker than typical. Too much heat and metal in the thin groove bottom.", "Root started with the electrode meant for the cap.", "Root with the thinner WPS electrode (ARC, 5 mm: Ø2.5), cap with the thicker one.", "Not an imperfection under ISO 5817, it is a deviation from the WPS. Possible results: excessive penetration (504), burn-through (510), as in the game report."],
      def_dia_big: ["Electrode thicker than typical for this bead: puddle too big and too much heat.", "Rushing: a thicker electrode lays more metal at once.", "WPS Ø for the bead. Add more metal with another bead, not a thicker electrode.", "Not an imperfection under ISO 5817, it is a deviation from the WPS. Possible results: overheating, excess weld metal (502), undercut (5011)."],
      def_spatter: ["Droplets of metal stuck to the plate next to the weld.", "Arc too long, current too high, damp electrodes, electrode pushed.", "Short arc, WPS current, dry electrodes. Clean up after welding if the application needs it, e.g. painting.", "602 spatter. ISO 5817: acceptance depends on the application (e.g. material, corrosion protection)."],
      def_uneven: ["The cap width changes along the weld: narrow here, wide there.", "Uneven speed and weave, arc length changing as the electrode burns.", "Steady WPS speed, same weave width, arc about 1×Ø through the whole electrode.", "Not applicable: ARC does not assign one number here. The results are judged instead: excess weld metal (502), incorrect weld toe (505), underfill (511)."],
      def_crater: ["The bead did not reach the end of the joint, or left an unfilled crater at the end.", "Breaking the arc too early, starting too far from the plate edge.", "Start and finish at the joint ends. At the end hold briefly or step back to fill the crater, then break the arc.", "511 incompletely filled groove (bead end). In practice the crater can also hold an end crater pipe (2025), but ARC does not measure it, it only checks reaching the joint ends."],
      def_rootlack: ["The root did not penetrate the groove bottom along the full length. No penetration on the back.", "Too fast in the root, current too low, arc too long.", "Root with a short arc and WPS current for Ø2.5. Travel so the keyhole stays visible ahead of the electrode.", "402 incomplete penetration (4021 incomplete root penetration), 4013 lack of root fusion."],
      def_edges: ["The cap did not cover the bevel edges. An unfilled, unfused strip remains along the edge.", "Weave too narrow on the cap, too fast, electrode off the axis.", "Weave the cap edge to edge, pausing on the bevel edges until the puddle melts them.", "511 incompletely filled groove, 4011 lack of sidewall fusion — as in the game report."],
      def_interbead: ["Two neighbouring beads did not fuse together. A gap is left between them.", "Lanes too far apart, current too low, slag between beads.", "Lay each new bead over about half of the previous one. Clean the slag first.", "4012 lack of inter-run fusion (group 401)."],
      def_slag: ["Slag from the previous bead stayed in the weld under the next one.", "Slag not removed between beads.", "After every bead chip the slag and wire-brush (ARC: key C). Watch the edges, slag hides there.", "301 slag inclusion."],
      def_clean: ["The ARC engine found none of the defects it measures.", "Parameters and hand movement within the WPS.", "Do it again the same way. The result is about the simulation, not a real weld.", "Not applicable. This is not a visual test per ISO 17637 nor an assessment per ISO 5817."]
    },
    ru: {
      labels: ["Что это", "Типичная причина", "Как избежать", "Ссылка"],
      gone: "В последней попытке этого дефекта нет.", close: "Закрыть", title: "Пояснение дефекта",
      def_hi_over: ["Слишком много тепла на миллиметр шва (кДж/мм) по сравнению с WPS. На стали с испытанием на удар соединение выходит за пределы аттестации.", "Слишком медленное ведение, большой ток, длинная дуга (выше напряжение), широкие колебания.", "Скорость по WPS, ток для Ø электрода, дуга около 1×Ø. Широкий валик разбей на несколько узких.", "Это не несоответствие по ISO 5817, а отклонение от WPS. Предел задаёт аттестация технологии (напр. ISO 15614-1 с испытанием на удар). Возможное следствие: снижение ударной вязкости."],
      def_hi_zero: ["Дуга горит, а рука стоит. Всё тепло идёт в одну точку.", "Рука остановилась при горящей дуге: перехват держателя, ожидание, наблюдение вместо ведения.", "Сразу после зажигания веди электрод. Если надо остановиться, оборви дугу и возобнови с перекрытием.", "Это не несоответствие по ISO 5817, а отклонение от WPS (тепловложение). Возможные следствия: перегрев, прожог (510), снижение ударной вязкости."],
      def_fast: ["Скорость намного выше, чем по WPS. Разделка не заполнена, кромки не проплавлены.", "Спешка, погоня за ванной, малый ток компенсируют быстрой рукой.", "Веди примерно с 1× скорости по WPS. Следи, чтобы ванна захватывала обе кромки.", "511 незаполненная разделка, 4011 несплавление по кромке (группа 401) — те же номера, что в отчёте игры."],
      def_dir_pf: ["Шов в положении PF выполнен сверху вниз, а WPS требует снизу вверх.", "Привычка от PG или более лёгкое ведение вниз. Ванна и шлак опережают дугу.", "В PF начинай снизу и веди вверх короткой дугой с задержкой на кромках.", "Это не несоответствие по ISO 5817, а отклонение от WPS (направление; положения по ISO 6947). Возможные следствия: несплавление (401), мелкий провар."],
      def_dir_pg: ["Шов в положении PG выполнен снизу вверх, а WPS требует сверху вниз.", "Привычка от PF. На тонком листе ведение вверх даёт много тепла в одной точке.", "В PG веди сверху вниз, быстрее и без широких колебаний, чтобы ванна не опережала дугу.", "Это не несоответствие по ISO 5817, а отклонение от WPS (направление; положения по ISO 6947). Возможные следствия: перегрев, чрезмерное усиление (502), прожог (510)."],
      def_pen: ["Часть разделки не сплавлена: металл не дошёл до дна или лежит на кромке без проплавления.", "Слишком быстро, малый ток, электрод не по оси разделки, длинная дуга в корне.", "Веди по середине разделки, ток для Ø по WPS, скорость около 1× WPS. В корне короткая дуга, следи за проплавлением (отверстием).", "402 неполный провар (4021 в корне), 4013 несплавление в корне."],
      def_narrow: ["Облицовка уже разделки. Металл не перекрывает всю ширину соединения.", "Слишком быстро, малый ток, слишком тонкий электрод, нет колебаний на облицовке.", "Замедлись до скорости по WPS. Облицовку веди лёгкими колебаниями от кромки до кромки с короткой задержкой на кромках.", "511 незаполненная разделка, когда облицовка не доходит до поверхности листа."],
      def_wide: ["Облицовка слишком высокая и широкая: слишком много металла в одном месте.", "Слишком медленно, слишком широкие колебания, слишком толстый электрод для этого валика.", "Скорость по WPS. Колебания только на ширину разделки плюс около 1–2 мм на каждую кромку.", "502 чрезмерное усиление (стыковой шов)."],
      def_undercut: ["У края шва выплавлена канавка в основном металле или металл вытек за пределы соединения.", "Большой ток, длинная дуга, кривой рабочий угол, слишком быстро на краях колебаний.", "Ток по WPS, дуга около 1×Ø, электрод по оси соединения. На краях колебаний короткая задержка, чтобы долить металл.", "5011/5012 подрез непрерывный/прерывистый. Металл на листе без сплавления — это 506 (наплыв); ARC сплавление не измеряет, поэтому номер не даёт."],
      def_porosity: ["Газовые поры внутри шва или на поверхности.", "Длинная дуга (покрытие перестаёт защищать ванну), влажные электроды, ржавчина, краска или масло в разделке.", "Короткая дуга, сухие электроды (основные прокалить по указанию производителя), чистая разделка. Основным электродом зажигай впереди места начала и возвращайся.", "2011 газовая пора, 2012 равномерно распределённая пористость, 2017 поверхностная пора."],
      def_arc_short: ["Конец электрода ближе к ванне, чем примерно 0,5×Ø. Дуга душится, электрод прилипает.", "Слишком сильный нажим на электрод, малый ток, после зажигания нет отвода на длину дуги.", "Держи дугу в диапазоне ARC 0,5–1,1×Ø, обычно около 1×Ø; основными электродами варят более короткой дугой, чем рутиловыми. После зажигания отведи и подавай по мере плавления.", "Это не несоответствие по ISO 5817, а отклонение техники. Возможные следствия: узкий высокий валик, плохое смачивание кромок (401), шлаковые включения (301)."],
      def_arc_long: ["Дуга длиннее примерно 1,1×Ø. Покрытие перестаёт защищать ванну, дуга шипит и разбрасывает металл.", "Электрод поднят слишком высоко или не подаётся по мере плавления, уставшая рука.", "Держи дугу в диапазоне ARC 0,5–1,1×Ø, обычно около 1×Ø; основными электродами варят более короткой дугой, чем рутиловыми. Подавай по мере плавления: ровный треск, а не шипение.", "Это не несоответствие по ISO 5817, а отклонение техники. Возможные следствия: поры (2011), брызги (602), подрезы (5011), меньшее проплавление."],
      def_stick: ["Дуга погасла посреди валика: электрод прилип к листу или его отвели слишком далеко.", "Нажим электрода в ванну, малый ток или растягивание дуги до обрыва.", "Дуга около 1×Ø. Прилипший электрод оторви поворотом. Возобнови перед кратером и пройди через него, чтобы его переплавить.", "Это не несоответствие по ISO 5817, а отклонение техники. Возможные следствия в месте возобновления: дефект возобновления (517), кратер, поры."],
      def_ang_work: ["Электрод наклонён в сторону, не по оси соединения. Одна кромка получает слишком много тепла, другая слишком мало.", "Наклонённая рука, неудобная поза или закрытый обзор соединения.", "В стыковом шве PA держи электрод поперёк соединения перпендикулярно листу (ARC: отклонение 0°, клавиши A/D).", "Это не несоответствие по ISO 5817, а отклонение техники. Возможные следствия: подрез одной кромки (5011), несплавление другой (4011)."],
      def_ang_drag: ["Держатель слишком сильно опережает конец электрода: электрод лежит слишком полого, угол к листу меньше примерно 70°.", "Держатель держат слишком плоско, рука устаёт, когда электрод укорачивается.", "MMA: лёгкий наклон углом назад около 10° от вертикали, то есть около 80° к листу (ARC: клавиши W/S), до конца электрода.", "Это не несоответствие по ISO 5817, а отклонение техники. Возможные следствия: шлаковые включения (301), выпуклый валик, неправильный переход к основному металлу (505)."],
      def_ang_push: ["Электрод наклонён вперёд, по направлению движения. Шлак затекает перед ванной.", "Привычка от MAG или TIG, где часто ведут углом вперёд, или неправильное положение руки.", "В MMA веди с лёгким наклоном назад около 10° (ARC: клавиши W/S), чтобы дуга оттесняла шлак назад.", "Это не несоответствие по ISO 5817, а отклонение техники. Возможные следствия: несплавление (401), шлаковые включения (301)."],
      def_offaxis: ["Валик лёг рядом с осью разделки. Одна кромка проплавлена слишком сильно, другая совсем нет.", "Плохо видна разделка, ведение на глаз без контроля кромок, кривой рабочий угол.", "Перед зажиганием выставь руку вдоль соединения. Смотри на обе кромки ванны, а не в саму дугу.", "Это не несоответствие по ISO 5817, а отклонение техники. Возможные следствия: подрез (5011) с одной стороны, несплавление по кромке (4011) с другой."],
      def_filler: ["Только TIG (141): присадочный пруток подаётся неравномерно, то слишком часто, то слишком редко.", "Нет ритма у руки с прутком, взгляд на пруток вместо ванны.", "Подавай пруток в ровном ритме на передний край ванны, а не в дугу. В MMA этого дефекта нет, присадкой служит электрод.", "Это не несоответствие по ISO 5817, а отклонение техники. Возможные следствия: волнистый валик, местами избыток металла (502), местами незаполнение (511)."],
      def_amp_low: ["Ток ниже, чем по WPS для используемого Ø электрода. Ванна маленькая и холодная.", "Неверно выставлен источник, ток от другого Ø, ток убавлен «на всякий случай».", "Выставь ток по WPS для используемого Ø (ARC в PA: Ø2,5 около 80 А, Ø3,2 около 115 А).", "Это не несоответствие по ISO 5817, а отклонение от WPS. Возможные следствия: несплавление (401), неполный провар (402), шлаковые включения (301)."],
      def_amp_high: ["Ток выше, чем по WPS для используемого Ø. Ванна большая и жидкая, электрод может краснеть.", "Источник выставлен слишком высоко или ток остался от более толстого электрода.", "Вернись к току по WPS для используемого Ø. Корень лучше варить в нижней части диапазона.", "Это не несоответствие по ISO 5817, а отклонение от WPS. Возможные следствия: подрез (5011), чрезмерный провар (504), прожог (510), брызги (602)."],
      def_dia_small: ["Электрод тоньше типового для этого валика. Мало наплавленного металла, холодный валик.", "Электрод не сменили после корня или выбрали тоньше «на всякий случай».", "Подбирай Ø под валик по WPS (ARC, 5 мм: корень Ø2,5, облицовка Ø3,2; смена перед валиком).", "Это не несоответствие по ISO 5817, а отклонение от WPS. Возможные следствия: несплавление по кромке (401), незаполнение (511)."],
      def_dia_root: ["Корень выполнен электродом толще типового. Слишком много тепла и металла в тонком дне разделки.", "Корень начат электродом, подготовленным для облицовки.", "Корень более тонким электродом по WPS (ARC, 5 мм: Ø2,5), облицовку более толстым.", "Это не несоответствие по ISO 5817, а отклонение от WPS. Возможные следствия: чрезмерный провар (504), прожог (510), как в отчёте игры."],
      def_dia_big: ["Электрод толще типового для этого валика: слишком большая ванна и слишком много тепла.", "Спешка: толстый электрод кладёт больше металла за раз.", "Ø по WPS для валика. Больше металла добавляй следующим валиком, а не более толстым электродом.", "Это не несоответствие по ISO 5817, а отклонение от WPS. Возможные следствия: перегрев, чрезмерное усиление (502), подрез (5011)."],
      def_spatter: ["Капли металла, приварившиеся к листу рядом со швом.", "Длинная дуга, большой ток, влажные электроды, ведение углом вперёд.", "Короткая дуга, ток по WPS, сухие электроды. После сварки зачисти, если этого требует применение, напр. покраска.", "602 брызги. ISO 5817: допустимость зависит от применения (напр. материал, защита от коррозии)."],
      def_uneven: ["Ширина облицовки меняется вдоль шва: то узко, то широко.", "Неровная скорость и колебания, длина дуги меняется по ходу электрода.", "Ровная скорость по WPS, колебания одной ширины, дуга около 1×Ø на всём электроде.", "Не применимо: ARC не присваивает здесь одного номера. Оцениваются следствия: чрезмерное усиление (502), неправильный переход (505), незаполнение (511)."],
      def_crater: ["Валик не дошёл до конца соединения или оставил на конце незаполненный кратер.", "Слишком ранний обрыв дуги, начало слишком далеко от края листа.", "Начинай и заканчивай на концах соединения. В конце задержись или вернись немного назад, чтобы заполнить кратер, потом оборви дугу.", "511 неполное заполнение разделки (конец валика). На практике в кратере бывает и усадочная раковина (2025), но ARC её не измеряет, проверяет только выход к концам соединения."],
      def_rootlack: ["Корень не проплавил дно разделки по всей длине. С обратной стороны нет проплава.", "Слишком быстро в корне, малый ток, длинная дуга.", "Корень короткой дугой и током по WPS для Ø2,5. Веди так, чтобы впереди электрода было видно отверстие проплавления.", "402 неполный провар (4021 непровар корня), 4013 несплавление в корне."],
      def_edges: ["Облицовка не перекрыла кромки разделки. У края остаётся незаполненная, несплавленная полоса.", "Слишком узкие колебания на облицовке, слишком быстро, электрод не по оси.", "Облицовку веди колебаниями от кромки до кромки с задержкой на кромках разделки, пока ванна их не проплавит.", "511 незаполненная разделка, 4011 несплавление по кромке — как в отчёте игры."],
      def_interbead: ["Два соседних валика не сплавились друг с другом. Между ними остался зазор.", "Слишком большой шаг между дорожками, малый ток, шлак между валиками.", "Каждый следующий валик клади примерно на половину предыдущего. Перед ним зачисти шлак.", "4012 несплавление между валиками (группа 401)."],
      def_slag: ["Шлак от предыдущего валика остался в шве под следующим валиком.", "Шлак не убран между валиками.", "После каждого валика отбей шлак молотком и зачисти щёткой (ARC: клавиша C). Следи за кромками, там шлак прячется.", "301 шлаковое включение."],
      def_clean: ["Движок ARC не нашёл ни одного из измеряемых дефектов.", "Параметры и движение руки в пределах WPS.", "Повтори так же. Результат относится к симуляции, а не к настоящему шву.", "Не применимо. Это не визуальный контроль по ISO 17637 и не оценка по ISO 5817."]
    }
  }/*/EXPLAIN*/;
  function explainOf(k, lang) { const L = EXPLAIN[lang] || EXPLAIN.pl; return L[k] || null; }

  const SPEED_WPS = SPEED[SAMPLE.thick] * VMUL[SAMPLE.proc];   // [mm/s] tempo z WPS dla próbki
  const API = { SAMPLE, SPEED_WPS, PROFILES, TEXTS, trialSeed, buildRound, runTrial, entryOf, Bench, defectText, EXPLAIN, explainOf, VERSION: "1.1.0" };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.ArcBoty = API;
})(typeof self !== "undefined" ? self : this);
