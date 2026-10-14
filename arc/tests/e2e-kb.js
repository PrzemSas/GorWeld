/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// KOMBAJN 3.7.0 E2E: prawdziwa mysz spawa KAŻDY ścieg po SWOIM torze (lanePts), z bankowaniem jak gracz.
// Sprawdza: nagranie ma kb=1, ekran == sim.js (punkty, ISO, przyczyny), MMA: młotek (C) → bez 301,
// bez młotka → REJECT „slag" na ekranie i w weryfikatorze.
// Użycie: node e2e-kb.js http://localhost:8765/arc [tryb]   tryb: mig-pc | mma-chip | mma-noslag (domyślnie wszystkie)
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) { try { ({ chromium } = require(p)); break; } catch (e) {} }
if (!chromium) { console.error("brak playwrighta"); process.exit(2); }
const BASE = process.argv[2], ONLY = process.argv[3];
const EXE = process.env.ARC_CHROME || "/home/gorweld/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
if (!BASE) { console.error("użycie: node e2e-kb.js <baseURL> [tryb]"); process.exit(2); }
let fail = 0; const ok = (n, c, i) => { console.log((c ? "  ✓ " : "  ✗ ") + n + (i !== undefined ? "  " + JSON.stringify(i) : "")); if (!c) fail++; };

async function run(b, { name, proc, pos, thick, chip }) {
  const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; pg.on("pageerror", e => errs.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem("gorweld_tut", "1"); localStorage.setItem("gorweld_lang", "pl"); } catch (e) {} });
  await pg.goto(BASE + "/index.html"); await pg.waitForTimeout(1500);
  await pg.evaluate(() => { if (window.openM) closeModal(openM); });
  await pg.click(`[data-proc="${proc}"]`); await pg.waitForTimeout(200);
  await pg.click(`.thk[data-t="${thick}"]`); await pg.waitForTimeout(200);
  await pg.evaluate(p => { const b = [...document.querySelectorAll(".pos")].find(x => x.dataset.pos === p); b && b.click(); }, pos);
  await pg.waitForTimeout(300);
  const nBeads = await pg.evaluate(() => passPlanArr.length);
  for (let bi = 0; bi < nBeads; bi++) {
    const g = await pg.evaluate(() => { const r = stage.getBoundingClientRect(), k = r.width / W;
      return { pts: lanePts.map(p => [r.left + p.x * k, r.top + p.y * k]), v: targetPx * k, idx: passIndex }; });
    if (g.idx !== bi) { ok(`${name}: ścieg ${bi + 1} wystartował`, false, { passIndex: g.idx }); break; }
    // dobry spawacz: dogrywa elektrodę, gdy łuk urósł ponad nominał; po zgaśnięciu (wymiana) zajarza od nowa
    let down = false;
    await pg.mouse.move(g.pts[0][0], g.pts[0][1]); await pg.mouse.down(); down = true;
    for (let i = 1; i < g.pts.length; i++) {
      const d = Math.hypot(g.pts[i][0] - g.pts[i - 1][0], g.pts[i][1] - g.pts[i - 1][1]);
      const sub = Math.max(1, Math.round(d / 2));
      for (let s = 1; s <= sub; s++) {
        const x = g.pts[i - 1][0] + (g.pts[i][0] - g.pts[i - 1][0]) * s / sub, y = g.pts[i - 1][1] + (g.pts[i][1] - g.pts[i - 1][1]) * s / sub;
        const st = await pg.evaluate(() => ({ welding, al: arcLen, L0: arcL0(), live: arcLive }));
        if (!st.welding) { if (down) { await pg.mouse.up(); down = false; } await pg.mouse.move(x, y); await pg.mouse.down(); down = true; continue; }
        if (st.live) { const want = st.al > st.L0; if (want && !down) { await pg.mouse.down(); down = true; } if (!want && down) { await pg.mouse.up(); down = false; } }
        await pg.mouse.move(x, y);
        await pg.waitForTimeout(Math.max(1, (d / sub) / g.v * 1000 - 4));
      }
    }
    // koniec ściegu: LPM+PPM gasi łuk (świadomie, bez kary)
    const L = g.pts[g.pts.length - 1];
    if (!down) { await pg.mouse.down(); down = true; }
    await pg.mouse.down({ button: "right" }); await pg.mouse.move(L[0] + 0.5, L[1]); await pg.waitForTimeout(120);
    await pg.mouse.up({ button: "right" }); await pg.mouse.up(); down = false;
    await pg.waitForTimeout(450);
    if (bi < nBeads - 1 && proc === "MMA" && chip) { await pg.keyboard.press("c"); await pg.waitForTimeout(150); }
  }
  await pg.waitForTimeout(800);
  const out = await pg.evaluate(() => {
    if (!document.getElementById("repModal").classList.contains("open")) inspect();
    const s = ArcSim.simulate(JSON.parse(JSON.stringify(rec)));
    const iso = (document.getElementById("rIso").textContent || "").replace("≈ ISO 5817 · ", "").trim();
    return { kb: rec.kb, chips: rec.events.filter(e => e.type === "chip").length, banks: rec.events.filter(e => e.type === "bank").length,
      beads: passPlanArr.length, live: rec.liveScore, sim: s.score, simIso: s.iso, ekranIso: iso,
      isoOk: iso === t(s.iso === "REJECT" ? "iso_reject" : "iso_" + s.iso), reasons: s.rejectReasons, edge: s.edgeCov, ib: s.ibMax, slag: s.slag,
      defects: [...document.querySelectorAll("#rDefects li")].map(l => l.textContent.slice(0, 60)) };
  });
  await pg.close();
  return { out, errs };
}
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--mute-audio"] });
  const cases = [
    { name: "mig-pc", proc: "MIG", pos: "PC", thick: 8 },
    { name: "mma-chip", proc: "MMA", pos: "PA", thick: 8, chip: true },
    { name: "mma-noslag", proc: "MMA", pos: "PA", thick: 8, chip: false },
  ].filter(c => !ONLY || c.name === ONLY);
  for (const c of cases) {
    const { out, errs } = await run(b, c);
    console.log(c.name, JSON.stringify(out));
    ok(`${c.name}: nagranie ma kb=1 i ${out.beads} ściegów (${out.banks} bank)`, out.kb === 1 && out.banks === out.beads - 1);
    ok(`${c.name}: ekran == sim.js (punkty i ISO)`, out.live === out.sim && out.isoOk, { live: out.live, sim: out.sim, iso: out.ekranIso, simIso: out.simIso });
    ok(`${c.name}: zero błędów JS`, errs.length === 0, errs.slice(0, 2));
    if (c.name === "mig-pc") ok("mig-pc: po torach — lico przykrywa fazę, ściegi zlane", !(out.reasons || []).some(r => ["edges", "interbead"].includes(r)) && out.ib === 0, { edge: out.edge, ib: out.ib, reasons: out.reasons });
    if (c.name === "mma-chip") ok("mma-chip: młotek w nagraniu, brak 301", out.chips === out.beads - 1 && !out.slag, { chips: out.chips, slag: out.slag });
    if (c.name === "mma-noslag") ok("mma-noslag: bez młotka REJECT slag (ekran i weryfikator)", out.slag > 0 && (out.reasons || []).includes("slag") && out.defects.some(d => /żużl/.test(d)), { slag: out.slag, reasons: out.reasons });
  }
  await b.close();
  console.log(fail ? `\n✗ ${fail} nie przeszło` : "\n✓ przeszło"); process.exit(fail ? 1 : 0);
})();
