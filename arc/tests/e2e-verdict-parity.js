/**
 * GORWELD™ ARC — E2E: PARYTET CAŁEGO WERDYKTU (gra ↔ sim.js), nie tylko punktów.
 *
 * PO CO TO JEST
 * BattleWeld i konkurs liczą wynik z powtórki (sim.js). Dotąd gra porównywała z powtórką tylko PUNKTY
 * i tylko w konsoli. Ten sam wynik punktowy przy innym odrzucie, klasie ISO, pokryciu albo wadzie major
 * to też rozjazd: gracz widzi ZALICZONE, a weryfikator REJECT (audyt Codex 2026-10-30, #4).
 * Od poprawki 03 gra po inspekcji zapisuje `window.__parity = {live, sim, diff[]}`. Ten test spawa
 * prawdziwymi zdarzeniami wskaźnika kilka różnych rund i wymaga `diff = []` w każdej.
 *
 * Każdy przypadek ma też OCZEKIWANY wynik (przyjęty / REJECT z daną przyczyną), sprawdzaną pozycję,
 * liczbę ściegów i tryb sterowania. Bez tego test przechodziłby, gdyby bot spawał źle i WSZYSTKIE rundy
 * były odrzucone zgodnie po obu stronach (audyt Codex 03). Wymagana jest co najmniej jedna przyjęta runda.
 * Ekran: klasa ISO pokazana graczowi (#rIso) musi być tą z powtórki.
 *
 * TESTY KONTROLNE (bez nich diff=[] mogłoby znaczyć „nic nie porównano"): podmieniamy wynik powtórki
 *   kontrola       — te same punkty, odwrócony werdykt  → diff musi mieć "rejected" i "iso"
 *   kontrola-nan   — pokrycie NaN                        → diff musi mieć "coverage"
 *   kontrola-brak  — brak pola pokrycia                  → diff musi mieć "coverage"
 *   kontrola-delta — pokrycie przesunięte o 0,01         → diff musi mieć "coverage"
 *
 * JAK ODPALIĆ — jak e2e-kb.js (kopia poza repo albo battle-server/static-dev.py):
 *   ARC_CHROME=<chrome>  node e2e-verdict-parity.js http://127.0.0.1:8898 [nazwa-przypadku]
 * Bez ARC_CHROME używa Chromium z pakietu playwright.
 *
 * CZEGO OCZEKIWAĆ: każdy przypadek „diff []" + kontrola „wykryty", wynik ✓ przeszło (kod 0).
 */
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) {
  try { ({ chromium } = require(p)); break; } catch (e) {}
}
if (!chromium) { console.error("brak playwrighta"); process.exit(2); }
const BASE = process.argv[2], ONLY = process.argv[3];
if (!BASE) { console.error("użycie: node e2e-verdict-parity.js <baseURL> [przypadek]"); process.exit(2); }
const EXE = process.env.ARC_CHROME;
let fail = 0; const ok = (n, c, i) => { console.log((c ? "  ✓ " : "  ✗ ") + n + (i !== undefined ? "  " + JSON.stringify(i) : "")); if (!c) fail++; };

async function run(b, { name, proc, pos, thick, chip, spd = 1, step = 2, wobble = 0, dir, touch, control }) {   // step: przerwa między ruchami = step·4 ms
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: !!touch });
  const pg = await ctx.newPage();
  const errs = []; pg.on("pageerror", e => errs.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem("gorweld_tut", "1"); localStorage.setItem("gorweld_lang", "pl");
    localStorage.setItem("gorweld_tlift", "0"); } catch (e) {} });
  await pg.goto(BASE + "/index.html"); await pg.waitForTimeout(1500);
  await pg.evaluate(() => { if (window.openM) closeModal(openM); });
  await pg.click(`[data-proc="${proc}"]`); await pg.waitForTimeout(200);
  await pg.click(`.thk[data-t="${thick}"]`); await pg.waitForTimeout(200);
  await pg.evaluate(p => { const b = [...document.querySelectorAll(".pos")].find(x => x.dataset.pos === p); b && b.click(); }, pos);
  await pg.waitForTimeout(300);
  if (control) await pg.evaluate((mode) => {        // kontrola: psujemy WYNIK POWTÓRKI w jeden znany sposób
    const orig = ArcSim.simulate; window.ArcSim = Object.assign({}, ArcSim, { simulate: r => {
      const s = Object.assign({}, orig(r));
      if (mode === "werdykt") return s.iso === "REJECT"         // odwróć werdykt w obie strony, punkty bez zmian
        ? Object.assign(s, { iso: "B", rejectReasons: [] })
        : Object.assign(s, { iso: "REJECT", rejectReasons: ["slag"] });
      if (mode === "nan") s.coverage = NaN;
      if (mode === "brak") delete s.coverage;
      if (mode === "delta") s.coverage = s.coverage + 0.01;
      return s; } }); }, control);
  const cdp = touch ? await ctx.newCDPSession(pg) : null;
  const nBeads = await pg.evaluate(() => passPlanArr.length);
  for (let bi = 0; bi < nBeads; bi++) {
    const g = await pg.evaluate(() => { const r = stage.getBoundingClientRect(), k = r.width / W;
      return { pts: lanePts.map(p => [r.left + p.x * k, r.top + p.y * k]), v: targetPx * k, idx: passIndex }; });
    if (dir && ((dir === "up") === (g.pts[g.pts.length - 1][1] > g.pts[0][1]))) g.pts.reverse();
    if (g.idx !== bi) { ok(`${name}: ścieg ${bi + 1} wystartował`, false, { passIndex: g.idx }); break; }
    if (proc === "MMA") { await pg.click("#toolhud .dia.typ").catch(() => {}); await pg.waitForTimeout(100); }
    const v = g.v * spd;
    // Ręka sterowana ZEGAREM, nie liczbą kroków: pozycja = droga v·t po torze. Każdy odczyt stanu
    // i każde zdarzenie kosztuje kilka-kilkadziesiąt ms (zależnie od maszyny), więc „krok + sleep"
    // jechał 2–3× za wolno i KAŻDA runda wpadała w REJECT za wkład ciepła — test widziałby tylko odrzuty.
    const cum = [0]; for (let i = 1; i < g.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(g.pts[i][0] - g.pts[i - 1][0], g.pts[i][1] - g.pts[i - 1][1]));
    const total = cum[cum.length - 1];
    const at = (dist, k) => { let i = 1; while (i < cum.length - 1 && cum[i] < dist) i++;
      const f = Math.min(1, Math.max(0, (dist - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1)));
      const w = wobble ? Math.sin(k * 0.35) * wobble : 0;
      return [g.pts[i - 1][0] + (g.pts[i][0] - g.pts[i - 1][0]) * f, g.pts[i - 1][1] + (g.pts[i][1] - g.pts[i - 1][1]) * f + w]; };
    const t0 = Date.now(); let k = 0;
    if (touch) {   // dotyk = demo: łuk i kąt stoją, wystarczy prowadzić palec po torze
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: g.pts[0][0], y: g.pts[0][1], id: 1 }] });
      for (;;) { const dist = v * (Date.now() - t0) / 1000; const [x, y] = at(Math.min(dist, total), k++);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
        if (dist >= total) break; await pg.waitForTimeout(step * 4); }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      let down = false;
      await pg.mouse.move(g.pts[0][0], g.pts[0][1]); await pg.mouse.down(); down = true;
      for (;;) {
        const dist = v * (Date.now() - t0) / 1000; const [x, y] = at(Math.min(dist, total), k++);
        const st = await pg.evaluate(() => ({ welding, al: arcLen, L0: arcL0(), live: arcLive, pi: passIndex }));
        if (st.pi !== bi) break;
        if (!st.welding) { if (down) { await pg.mouse.up(); down = false; } await pg.mouse.move(x, y); await pg.mouse.down(); down = true; }
        else {
          if (st.live) { const want = st.al > st.L0; if (want && !down) { await pg.mouse.down(); down = true; } if (!want && down) { await pg.mouse.up(); down = false; } }
          await pg.mouse.move(x, y);
        }
        if (dist >= total) break; await pg.waitForTimeout(step * 4);
      }
      const L = g.pts[g.pts.length - 1];
      const open = await pg.evaluate(b => passIndex === b && welding, bi);
      if (!open) { if (down) { await pg.mouse.up(); down = false; } }
      else {
        if (!down) { await pg.mouse.down(); down = true; }
        await pg.mouse.down({ button: "right" }); await pg.mouse.move(L[0] + 0.5, L[1]); await pg.waitForTimeout(120);
        await pg.mouse.up({ button: "right" }); await pg.mouse.up(); down = false;
      }
    }
    await pg.waitForTimeout(450);
    if (bi < nBeads - 1 && proc === "MMA" && chip) {
      await pg.waitForFunction(() => needChip && !welding, null, { timeout: 5000 }).catch(() => {});
      await pg.keyboard.press("c"); await pg.waitForTimeout(150);
    }
  }
  await pg.waitForTimeout(800);
  const out = await pg.evaluate(() => {
    if (!document.getElementById("repModal").classList.contains("open")) inspect();
    const P = window.__parity, simIso = P && P.sim && P.sim.iso;
    return { parity: P, events: rec ? rec.events.length : 0, arc: rec && rec.arc, pos: rec && rec.pos,
      banks: rec ? rec.events.filter(e => e.type === "bank").length : -1, beads: passPlanArr.length,
      ekranIso: (document.getElementById("rIso").textContent || "").replace("≈ ISO 5817 · ", "").trim(),
      simIsoTxt: simIso ? t(simIso === "REJECT" ? "iso_reject" : "iso_" + simIso) : null };
  });
  await ctx.close();
  return { out, errs };
}

(async () => {
  const b = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--mute-audio"] }, EXE ? { executablePath: EXE } : {}));
  // exp: rejected = oczekiwany werdykt powtórki; reason = przyczyna, która MUSI być w rejectReasons.
  // mig-wobble bez oczekiwania — odchyłka ręki zależy od tempa maszyny (raz D, raz odrzut offAxis).
  const cases = [
    { name: "mig-pa3", proc: "MIG", pos: "PA", thick: 3, exp: { rejected: false } },                          // zwykły przejazd
    { name: "mig-fast", proc: "MIG", pos: "PA", thick: 3, spd: 2.2, exp: { rejected: true, reason: "underfill" } }, // >1,5× WPS
    { name: "mig-wobble", proc: "MIG", pos: "PA", thick: 5, wobble: 14 },                                      // ręka ucieka z osi
    { name: "mma-pa5", proc: "MMA", pos: "PA", thick: 5, chip: true, exp: { rejected: false } },               // 2 ściegi, młotek
    { name: "mma-noslag", proc: "MMA", pos: "PA", thick: 5, chip: false, exp: { rejected: true, reason: "slag" } },
    { name: "mma-pf-down", proc: "MMA", pos: "PF", thick: 5, chip: true, dir: "down", exp: { rejected: true, reason: "direction" } },
    { name: "mig-touch", proc: "MIG", pos: "PA", thick: 3, touch: true, exp: { rejected: false } },            // dotyk = demo (arc=0)
    { name: "tig-touch", proc: "TIG", pos: "PA", thick: 3, touch: true, exp: { rejected: false } },            // TIG dotykiem
    { name: "kontrola", proc: "MIG", pos: "PA", thick: 3, control: "werdykt", must: ["rejected", "iso"] },
    { name: "kontrola-nan", proc: "MIG", pos: "PA", thick: 3, control: "nan", must: ["coverage"] },
    { name: "kontrola-brak", proc: "MIG", pos: "PA", thick: 3, control: "brak", must: ["coverage"] },
    { name: "kontrola-delta", proc: "MIG", pos: "PA", thick: 3, control: "delta", must: ["coverage"] },
  ].filter(c => !ONLY || c.name === ONLY);
  let accepted = 0, realRuns = 0;
  for (const c of cases) {
    const { out, errs } = await run(b, c);
    const P = out.parity;
    console.log(c.name, JSON.stringify({ events: out.events, arc: out.arc, pos: out.pos, banks: out.banks, beads: out.beads, live: P && P.live, sim: P && P.sim, diff: P && P.diff }));
    ok(`${c.name}: runda nagrana i porównana`, !!P && out.events > 2, { events: out.events });
    ok(`${c.name}: pozycja ${c.pos}, ${out.beads} ściegów (${out.banks} bank), tryb ${c.touch ? "dotyk" : "mysz"}`,
      out.pos === c.pos && out.banks === out.beads - 1 && out.arc === (c.touch ? 0 : 1), { pos: out.pos, banks: out.banks, beads: out.beads, arc: out.arc });
    if (c.control) {
      ok(`${c.name}: zepsuta powtórka WYKRYTA (${c.must.join(", ")})`, !!P && c.must.every(k => P.diff.includes(k)), P && P.diff);
      continue;
    }
    realRuns++;
    ok(`${c.name}: cały werdykt gra == powtórka`, !!P && P.diff.length === 0, P && P.diff);
    ok(`${c.name}: ekran pokazuje klasę ISO z powtórki`, !!out.simIsoTxt && out.ekranIso === out.simIsoTxt, { ekran: out.ekranIso, sim: out.simIsoTxt });
    if (c.exp && P) {
      const reasons = P.sim.reasons || [];
      ok(`${c.name}: oczekiwany wynik ${c.exp.rejected ? "REJECT " + c.exp.reason : "przyjęty"}`,
        P.sim.rejected === c.exp.rejected && (!c.exp.reason || reasons.includes(c.exp.reason)), { rejected: P.sim.rejected, reasons, score: P.sim.score });
    }
    if (P && !P.sim.rejected) accepted++;
    ok(`${c.name}: zero błędów JS`, errs.length === 0, errs.slice(0, 2));
  }
  if (realRuns >= 2) ok(`co najmniej jedna runda PRZYJĘTA (nie same odrzuty)`, accepted >= 1, { accepted, realRuns });
  await b.close();
  console.log(fail ? `\n✗ ${fail} nie przeszło` : "\n✓ przeszło"); process.exit(fail ? 1 : 0);
})();
