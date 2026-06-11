/**
 * GORWELD™ Arc Welder — headless deterministyczny silnik oceny (faza on-chain, krok 2).
 *
 * `ArcSim.simulate(round)` odtwarza rundę z surowych inputów i SAM liczy wynik — bez grafiki.
 * Ta sama funkcja działa w przeglądarce (parity-check) i w Node (przyszły serwer-oracle).
 *
 * round = { seed, W, H, proc, joint, pos, thick, bead, events:[{type:'down'|'move'|'up'|'bank', t, x, y}] }
 *
 * UWAGA: matematyka jest 1:1 z `index.html` (depositBead / move / passMetrics / inspect).
 * Po potwierdzeniu parity scali się to w jedno źródło (index.html zacznie WOŁAĆ sim.js).
 * Jedyna metryka jeszcze NIE bit-exact: `spatter` (w grze nalicza pętla klatek ~16ms;
 * tu aproksymujemy 1 zdarzenie ruchu ≈ 1 klatka). Reszta odtwarza się dokładnie.
 */
(function (root) {
  "use strict";

  // ── PRNG (identyczny jak w grze) ──
  function mulberry32(seed) { let a = seed >>> 0; return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ── Tabele konfiguracyjne (1:1 z index.html) ──
  const PX_PER_MM = 16;
  const PROCESS = {
    MMA: { vMul: 1.00, sparks: 1.4 },
    MIG: { vMul: 1.40, sparks: 0.7 },
    TIG: { vMul: 0.70, sparks: 0.0 },
  };
  const POSITIONS = {
    PA:{ang:0,stars:1}, PB:{ang:0,stars:2}, PC:{ang:0,stars:3}, PD:{ang:0,stars:4,flip:true},
    PE:{ang:0,stars:5,flip:true}, PF:{ang:90,stars:4}, PG:{ang:90,stars:3},
    P1G:{ang:0,stars:1,pipe:"flat"}, P2G:{ang:0,stars:3,pipe:"wall"},
    P5G:{ang:0,stars:4,pipe:"axis"}, HL045:{ang:0,stars:5,pipe:"axis",tilt:45},
  };
  const SPEED = { 2:5.0, 3:4.3, 5:3.2, 8:2.3, 12:1.6 };
  const MATERIAL = {
    steel:{ MIG:1.0, MMA:1.0, TIG:1.0, tol:1.00 },
    ss:   { MIG:1.2, MMA:1.6, TIG:1.5, tol:0.82 },
    alu:  { MIG:1.4, MMA:2.4, TIG:1.9, tol:0.70 },
  };
  const PASS_W = { root:0.72, fill:0.92, cap:1.00 };
  const BASE_REWARD = 50;
  const ELEC_STUB = 0.16;

  function simulate(round) {
    const { seed, W, H, proc, joint, pos: posKey, thick, bead, events } = round;
    const rng = mulberry32(seed >>> 0);
    const P = POSITIONS[posKey];

    // ── passy ──
    function passPlan() { if (thick <= 3) return ["cap"]; if (thick <= 5) return ["root","cap"]; return ["root","fill","cap"]; }
    const passPlanArr = passPlan();
    let passIndex = 0, passMul = PASS_W[passPlanArr[0]];

    // ── geometria (recalc + buildWorkpiece, cy=H*0.66) ──
    let grooveHalf, bevelW, idealHalf, targetPx;
    function recalc() {
      grooveHalf = 3 + thick * 0.7; bevelW = 7 + thick * 1.3;
      idealHalf = grooveHalf * 1.25 * passMul; targetPx = SPEED[thick] * PX_PER_MM * PROCESS[proc].vMul;
    }
    recalc();
    const seamPts = [];
    (function buildSeam() {
      const cx = W / 2, cy = H * 0.66;
      if (P.pipe) {
        const r = Math.min(W, H) * 0.30, tilt = (P.tilt || 0) * Math.PI / 180;
        const yS = P.pipe === "flat" ? 0.40 : P.pipe === "wall" ? 1.0 : 0.6;
        for (let a = 0; a <= Math.PI * 2 + 0.001; a += Math.PI / 110) { const x = Math.cos(a) * r, y = Math.sin(a) * r * yS;
          seamPts.push({ x: cx + x * Math.cos(tilt) - y * Math.sin(tilt), y: cy + x * Math.sin(tilt) + y * Math.cos(tilt) }); }
      } else {
        const len = Math.min(W, H) * 0.62, ang = P.ang * Math.PI / 180, dx = Math.cos(ang), dy = Math.sin(ang);
        for (let t = -1; t <= 1.0001; t += 2 / 150) seamPts.push({ x: cx + dx * len / 2 * t, y: cy + dy * len / 2 * t });
      }
    })();

    // ── helpery geometrii (1:1) ──
    function nearestSeam(x, y) { let d = 1e18, px = x, py = y; for (const p of seamPts) { const dd = (p.x - x) ** 2 + (p.y - y) ** 2; if (dd < d) { d = dd; px = p.x; py = p.y; } } return { d: Math.sqrt(d), x: px, y: py }; }
    function plateHalf() { return grooveHalf + bevelW + 75; }
    function onPlate(x, y) { return nearestSeam(x, y).d <= plateHalf(); }

    // ── stan rundy (jak globalne w grze) ──
    let baked = [], speedSum = 0, speedN = 0, vVarSum = 0, spatterCount = 0, distAcc = 0;
    let electrodeLeft = 1, replacing = false, vEMA = targetPx;
    let last = null, lastT = 0, lastDab = 0, ux = 1, uy = 0;
    const passLog = [];

    function beadWidth() { const sr = vEMA / targetPx;
      if (sr < 0.7) return Math.min(idealHalf * 1.9, idealHalf * Math.pow(0.7 / Math.max(sr, 0.08), 0.55));
      if (sr > 1.3) return Math.max(idealHalf * 0.42, idealHalf * Math.pow(1.3 / sr, 0.7));
      return idealHalf; }
    function depositBead(x, y, w) { const ns = nearestSeam(x, y);
      if (ns.d < grooveHalf + bevelW) { x += (ns.x - x) * 0.4; y += (ns.y - y) * 0.4; }
      const jit = proc === "MMA" ? (rng() * 0.18 - 0.09) * w : 0;   // jedyny pobór z rng (jak w grze)
      x += jit; baked.push({ x, y, r: w, off: ns.d }); }

    function passMetrics() {
      const K = seamPts.length; let covered = 0; const gaps = [];
      for (let i = 0; i < K; i++) { const p = seamPts[i]; let d = 1e18; for (const b of baked) { const dd = (b.x - p.x) ** 2 + (b.y - p.y) ** 2; if (dd < d) d = dd; }
        if (Math.sqrt(d) < grooveHalf * 1.6) covered++; else gaps.push(p); }
      const coverage = K ? covered / K : 0;
      let out = 0, narrow = 0, wide = 0, rs = [];
      for (const b of baked) { if (b.off > grooveHalf + bevelW * 0.7) out++; if (b.r < grooveHalf * 0.9) narrow++; if (b.r > idealHalf * 1.65) wide++; rs.push(b.r); }
      const overflow = baked.length ? out / baked.length : 0;
      const mean = rs.reduce((a, v) => a + v, 0) / (rs.length || 1);
      const evenness = rs.length ? Math.max(0, 1 - (Math.sqrt(rs.reduce((a, v) => a + (v - mean) ** 2, 0) / rs.length) / mean) * 1.4) : 0;
      const tol = MATERIAL[bead].tol;
      const avgV = speedN ? speedSum / speedN : targetPx, spdAcc = Math.max(0, 1 - Math.abs(avgV - targetPx) / (targetPx * tol));
      const instab = speedN ? vVarSum / speedN : 0; const porosity = Math.max(0, Math.round((instab / 8 + (proc === "MIG" && spdAcc < 0.4 ? 2 : 0)) / tol));
      const spatter = Math.round(spatterCount * PROCESS[proc].sparks / 40);
      let endGap = 0; for (const e of [seamPts[0], seamPts[K - 1]]) { let d = 1e18; for (const b of baked) { const dd = (b.x - e.x) ** 2 + (b.y - e.y) ** 2; if (dd < d) d = dd; } if (Math.sqrt(d) > grooveHalf * 1.7) endGap++; }
      return { coverage, overflow, evenness, spdAcc, porosity, spatter, narrow, wide, out, gaps, avgV, endGap };
    }
    function bankReset() { passLog.push(passMetrics());
      baked = []; speedSum = 0; speedN = 0; vVarSum = 0; spatterCount = 0; distAcc = 0;
      passIndex++; passMul = PASS_W[passPlanArr[passIndex]] || 1; recalc(); }

    // ── replay zdarzeń ──
    for (const ev of events) {
      if (ev.type === "down") { last = { x: ev.x, y: ev.y }; lastT = ev.t; vEMA = targetPx; lastDab = ev.t;
        if (replacing) { electrodeLeft = 1; replacing = false; } continue; }
      if (ev.type === "up") { last = null; continue; }
      if (ev.type === "bank") { bankReset(); continue; }
      if (ev.type !== "move" || !last) continue;
      const p = { x: ev.x, y: ev.y }, now = ev.t;
      const ddx = p.x - last.x, ddy = p.y - last.y, dist = Math.hypot(ddx, ddy), dt = Math.max(8, now - lastT);
      const inst = dist / (dt / 1000), prev = vEMA; vEMA = vEMA * 0.7 + inst * 0.3; vVarSum += Math.abs(vEMA - prev);
      const w = beadWidth(); if (dist) { ux = ddx / dist; uy = ddy / dist; }
      if (proc === "TIG") {
        if (now - lastDab > 150 && onPlate(p.x, p.y)) { const dw = Math.max(idealHalf, w * 0.95); depositBead(p.x, p.y, dw); lastDab = now; }
      } else {
        const step = Math.max(2, w * 0.35), n = Math.max(1, Math.floor(dist / step));
        for (let i = 1; i <= n; i++) { const x = last.x + ddx * (i / n), y = last.y + ddy * (i / n);
          if (!onPlate(x, y)) continue;
          if (proc === "MMA") { if (replacing) break; electrodeLeft -= step / 650;
            if (electrodeLeft <= ELEC_STUB) { replacing = true; break; } }
          depositBead(x, y, w); distAcc += step; }
      }
      speedSum += vEMA; speedN++;
      // spatter: gra nalicza w pętli klatek co ~16ms; tu po czasie (dt/16) → niezależne od Hz urządzenia
      spatterCount += Math.round((3 + (thick >> 1)) * PROCESS[proc].sparks) * ((now - lastT) / 16);
      last = p; lastT = now;
    }

    // ── inspekcja (1:1 z inspect()) ──
    const K = seamPts.length;
    const cur = passMetrics(), all = passLog.concat([cur]), n = all.length, avg = k => all.reduce((a, m) => a + m[k], 0) / n;
    const coverage = avg("coverage"), spdAcc = avg("spdAcc"), evenness = avg("evenness");
    const overflow = Math.max.apply(null, all.map(m => m.overflow));
    const porosity = all.reduce((a, m) => a + m.porosity, 0), spatter = all.reduce((a, m) => a + m.spatter, 0);
    const endGap = Math.max.apply(null, all.map(m => m.endGap));
    const rootCov = (passPlanArr[0] === "root" && passLog.length) ? passLog[0].coverage : 1;

    let score = coverage * 50 + spdAcc * 20 + evenness * 15 + (1 - overflow) * 15
              - porosity * 5 - (proc === "TIG" ? spatter * 3 : spatter * 0.5);
    score = Math.max(0, Math.min(100, Math.round(score)));

    // wady major (do oceny ISO / odrzutu) — te same progi co w grze
    const Dmajor =
      (coverage < 0.6) ||
      (overflow > 0.3) ||
      (porosity > 3) ||
      (endGap > 1) ||
      (passPlanArr[0] === "root" && rootCov < 0.8);

    const letter = score >= 90 ? "A" : score >= 78 ? "B" : score >= 62 ? "C" : score >= 45 ? "D" : "F";
    const iso = (Dmajor || score < 50) ? "REJECT" : score >= 88 ? "B" : score >= 72 ? "C" : "D";

    // ekonomia (do parytetu wypłaty)
    const mb = { MIG:1.0, MMA:1.6, TIG:2.2 }[proc];
    const pm = [0,1.0,1.25,1.6,2.1,2.8][P.stars] || 1;
    const jm = joint === "pipe" ? 1.3 : joint === "fillet" ? 0.9 : 1.0;
    const mf = MATERIAL[bead][proc] || 1;
    const pf = 1 + 0.18 * (passPlanArr.length - 1);
    const difficulty = mb * pm * jm * mf * pf;

    return { score, letter, iso, coverage, spdAcc, evenness, overflow, porosity, spatter, endGap, baked: baked.length, passes: passPlanArr.length, difficulty: +difficulty.toFixed(2) };
  }

  const API = { simulate, mulberry32, VERSION: "0.1.0" };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.ArcSim = API;
})(typeof self !== "undefined" ? self : this);
