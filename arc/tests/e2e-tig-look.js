/**
 * GORWELD™ ARC — E2E: WYGLĄD ŚCIEGU TIG (poprawka 07). Tylko rysunek — ocena, sim.js i nagranie bez zmian.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 *
 * Prawdziwe rundy myszą (spoiwo spacją w równym rytmie). Kolor blachy mierzony przed i po rundzie w pasie tuż za brzegiem lica.
 *  - TIG nierdzewka, dobre tempo: delikatna słomka (ciepły odcień),
 *  - TIG nierdzewka, za wolno (przegrzanie): wyraźnie więcej nalotu — kolor zależy od ciepła, nie jest „nagrodą”,
 *  - TIG aluminium: bez nalotu (czyszczenia katodowego gra nie modeluje); MIG (dotykiem) — pokrycie i parytet,
 *  - badane punkty naprawdę pokryte ściegiem (inaczej porównanie nic nie mówi — uwaga Codexa),
 *  - ocena na ekranie = powtórka sim.js, zero błędów JS.
 *   node e2e-tig-look.js http://127.0.0.1:8898
 */
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) { try { ({ chromium } = require(p)); break; } catch (e) {} }
if (!chromium) { console.error("brak playwrighta"); process.exit(2); }
const BASE = process.argv[2]; if (!BASE) { console.error("użycie: node e2e-tig-look.js <baseURL>"); process.exit(2); }
const EXE = process.env.ARC_CHROME;
// Progi z pomiarów (2 przebiegi, ciepło = przyrost R−B blachy): 06 → TIG dobre tempo 10–11, za wolno 22–26; 07 → 18–19 i 53–66; alu ~1,5 w obu.
// MIG ma własny ciepły nalot przy stopkach (~20 w 06 i 07 — kod MIG bez zmian), więc MIG służy tu tylko do pokrycia i parytetu.
const LIM = { tig: 14, hot: 40, alu: 5 };
let fail = 0; const ok = (n, c, i) => { console.log((c ? "  ✓ " : "  ✗ ") + n + (i !== undefined ? "  " + JSON.stringify(i) : "")); if (!c) fail++; };

async function run(b, proc, mat, spd, touch) {   // touch: MIG prowadzony dotykiem (gra sama trzyma łuk; mysz z wciśniętym LPM = dosuwanie drutu → przywarcie)
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: !!touch }); const pg = await ctx.newPage(); const errs = []; pg.on("pageerror", e => errs.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem("gorweld_tut", "1"); localStorage.setItem("gorweld_lang", "pl"); localStorage.setItem("gorweld_tlift", "0"); } catch (e) {} });
  await pg.goto(BASE + "/index.html"); await pg.waitForTimeout(1500);
  await pg.evaluate(() => { if (window.hideSplash) hideSplash(); document.querySelectorAll(".modal.open").forEach(m => closeModal(m.id)); });
  await pg.click(`[data-proc="${proc}"]`); await pg.waitForTimeout(150); await pg.click(`[data-bead="${mat}"]`); await pg.waitForTimeout(150);
  await pg.click('.thk[data-t="3"]'); await pg.waitForTimeout(150);
  // pas tuż za brzegiem lica: odległość od osi = połowa wzorcowej szerokości × 1,15 / 1,4 / 1,7, obie strony
  const probe = () => pg.evaluate(() => { const d = pctx.getImageData(0, 0, plate.width, plate.height).data, k = plate.width / W, out = [];
    for (let i = 4; i < seamPts.length * 0.4; i += 3) { const p = seamPts[i], n = seamNrm[i];
      for (const sg of [-1, 1]) for (const f of [1.15, 1.4, 1.7]) { const x = Math.round((p.x + n.x * sg * idealHalf * f) * k), y = Math.round((p.y + n.y * sg * idealHalf * f) * k), o = (y * plate.width + x) * 4; out.push([d[o], d[o + 1], d[o + 2]]); } }
    return out; });
  const before = await probe();
  const g = await pg.evaluate(() => { const r = stage.getBoundingClientRect(), k = r.width / W; return { pts: lanePts.map(p => [r.left + p.x * k, r.top + p.y * k]), v: targetPx * k }; });
  const cum = [0]; for (let i = 1; i < g.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(g.pts[i][0] - g.pts[i - 1][0], g.pts[i][1] - g.pts[i - 1][1]));
  const total = cum[cum.length - 1] * 0.5, at = d => { let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const f = Math.min(1, Math.max(0, (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1))); return [g.pts[i - 1][0] + (g.pts[i][0] - g.pts[i - 1][0]) * f, g.pts[i - 1][1] + (g.pts[i][1] - g.pts[i - 1][1]) * f]; };
  if (touch) { const cdp = await ctx.newCDPSession(pg);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: g.pts[0][0], y: g.pts[0][1], id: 1 }] });
    const t0 = Date.now(); for (;;) { const d = Math.min(total, g.v * spd * (Date.now() - t0) / 1000), [x, y] = at(d); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] }); if (d >= total) break; await pg.waitForTimeout(8); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await pg.waitForTimeout(1200); }
  else { await pg.mouse.move(...g.pts[0]); await pg.mouse.down(); const t0 = Date.now(); let lastDab = -1e9;
    for (;;) { const el = Date.now() - t0, d = Math.min(total, g.v * spd * el / 1000), [x, y] = at(d); await pg.mouse.move(x, y);
      if (proc === "TIG" && el - lastDab > 230 / spd) { await pg.keyboard.press("Space"); lastDab = el; } if (d >= total) break; await pg.waitForTimeout(12); }
    if (proc === "TIG") { await pg.mouse.down({ button: "right" }); await pg.waitForTimeout(150); await pg.mouse.up({ button: "right" }); }
    await pg.mouse.up(); await pg.waitForTimeout(1200); }
  const after = await probe();
  const cov = await pg.evaluate(() => { let n = 0, c = 0; for (let i = 4; i < seamPts.length * 0.4; i += 3) { n++; if (vb && vb.hi[i] >= vb.lo[i]) c++; } return +(c / Math.max(1, n)).toFixed(2); });
  const par = await pg.evaluate(() => { try { if (!document.getElementById("repModal").classList.contains("open")) inspect(); } catch (e) {} const p = window.__parity; return p ? { live: p.live && p.live.score, sim: p.sim && p.sim.score } : null; });
  let dsum = 0, warm = 0; before.forEach((c, i) => { const a = after[i]; dsum += Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]) + Math.abs(a[2] - c[2]); warm += (a[0] - a[2]) - (c[0] - c[2]); });
  await ctx.close(); return { dRGB: +(dsum / before.length).toFixed(1), warm: +(warm / before.length).toFixed(1), cov, par, errs };
}
(async () => {
  const b = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--mute-audio"] }, EXE ? { executablePath: EXE } : {}));
  const t = await run(b, "TIG", "ss", 1), hot = await run(b, "TIG", "ss", 0.35), m = await run(b, "MIG", "ss", 1, true), al = await run(b, "TIG", "alu", 1);
  console.log("  pomiary [dRGB, ciepło, pokrycie]:", JSON.stringify({ TIG: [t.dRGB, t.warm, t.cov], TIG_wolno: [hot.dRGB, hot.warm, hot.cov], MIG: [m.dRGB, m.warm, m.cov], ALU: [al.dRGB, al.warm, al.cov] }));
  ok("badane punkty pokryte ściegiem (≥ 80%)", [t, hot, m, al].every(x => x.cov >= 0.8), [t.cov, hot.cov, m.cov, al.cov]);
  ok("TIG nierdzewka, dobre tempo: słomka na blasze (ciepło ≥ " + LIM.tig + ")", t.warm >= LIM.tig, t.warm);
  ok("TIG nierdzewka, za wolno: nalot od ciepła (ciepło ≥ " + LIM.hot + " i ≥ 2× dobre tempo)", hot.warm >= LIM.hot && hot.warm >= t.warm * 2, { dobre: t.warm, wolno: hot.warm });
    ok("TIG aluminium: bez nalotu (ciepło < " + LIM.alu + ")", al.warm < LIM.alu, al.warm);
  ok("ocena na ekranie = powtórka sim.js", [t, hot, m].every(x => x.par && x.par.live === x.par.sim), [t.par, hot.par, m.par]);
  ok("zero błędów JS", [t, hot, m, al].every(x => !x.errs.length), [].concat(t.errs, hot.errs, m.errs, al.errs).slice(0, 2));
  await b.close(); console.log(fail ? `\n✗ ${fail} nie przeszło` : "\n✓ przeszło"); process.exit(fail ? 1 : 0);
})();
