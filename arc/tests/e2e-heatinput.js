/**
 * GORWELD™ ARC — E2E: LIMIT WKŁADU CIEPŁA (3.4.0) w GRZE, nie tylko w silniku.
 *
 * PO CO TO JEST
 * Matematyka oceny jest ZDUPLIKOWANA w `index.html` i `sim.js`. `heatinput.js` sprawdza silnik
 * i zgodność stałych, ale nie uruchamia gry — a to gra pokazuje graczowi liczbę i literę ISO.
 * Ten sterownik spawa PRAWDZIWYMI zdarzeniami wskaźnika rundę wolniejszą od WPS na stali i żąda,
 * żeby ekran i replay `sim.js` zgodziły się CO DO PUNKTU i CO DO LITERY — łącznie z odrzutem
 * „poza zakresem kwalifikacji WPS".
 *
 * Jedziemy TIG-iem, bo TIG trzyma łuk na nominale przy wciśniętym LPM (MMA przy trzymanym
 * przycisku przywiera i runda kończy się z innego powodu, niż testujemy). Spoiwo dokładamy
 * SPACJĄ — bez niego nie ma ściegu i nie ma czego oceniać.
 *
 * JAK ODPALIĆ — jak `e2e-filler.js` (przepis w nagłówku tamtego pliku):
 *   node e2e-heatinput.js http://127.0.0.1:8898  wolno   # tempo poniżej WPS → HI ponad sufit
 *   node e2e-heatinput.js http://127.0.0.1:8898  wps     # tempo z WPS → limit ma milczeć
 */
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) {
  try { ({ chromium } = require(p)); break; } catch (e) {}
}
if (!chromium) { console.error("brak playwrighta"); process.exit(2); }

const BASE = process.argv[2], SLOW = process.argv[3] !== "wps";
const EXE = process.env.ARC_CHROME || "/home/gorweld/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
if (!BASE) { console.error("użycie: node e2e-heatinput.js <baseURL> [wolno|wps]"); process.exit(2); }

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--mute-audio"] });
  const pg = await b.newPage({ viewport: { width: 1100, height: 760 } });
  await pg.addInitScript(() => { try { localStorage.setItem("gorweld_tut", "1"); } catch (e) {} });
  await pg.goto(BASE + "/index.html");
  await pg.waitForTimeout(1800);
  await pg.evaluate(() => { if (window.hideSplash) hideSplash(); if (window.openM) closeModal(openM); });
  await pg.waitForTimeout(500);
  await pg.click('[data-proc="TIG"]'); await pg.waitForTimeout(400);
  const mat = await pg.evaluate(() => bead);          // stal = materiał badany udarnościowo

  const seam = await pg.evaluate(() => { const r = stage.getBoundingClientRect(), sx = r.width / W, sy = r.height / H;
    return seamPts.map(p => [r.left + p.x * sx, r.top + p.y * sy]); });
  const step = SLOW ? 90 : 10;   // dłuższy postój = wolniejsze tempo = więcej ciepła (poniżej ARC_IDLE_MS=2500)
  await pg.mouse.move(seam[0][0], seam[0][1]); await pg.mouse.down();
  for (let i = 1; i < seam.length; i++) {
    await pg.mouse.move(seam[i][0], seam[i][1]);
    if (i % 3 === 0) await pg.keyboard.press("Space");
    await pg.waitForTimeout(step);
  }
  const last = seam[seam.length - 1];
  await pg.mouse.down({ button: "right" }); await pg.mouse.move(last[0] - 1, last[1]);
  await pg.waitForTimeout(200); await pg.mouse.up({ button: "right" }); await pg.mouse.up();
  await pg.waitForTimeout(1500);

  const out = await pg.evaluate(() => {
    const sim = window.ArcSim, s = sim.simulate(JSON.parse(JSON.stringify(rec)));
    return { cvnWNagraniu: rec.cvn, ekranPkt: parseInt(document.getElementById("rPct")?.textContent || "", 10),
             // Litera na ekranie jest PRZETŁUMACZONA (`iso_reject`, `iso_B`…) — porównujemy przez ten
             // sam słownik, którego używa gra, a nie przez surowy tekst.
             ekranIso: (document.getElementById("rIso")?.textContent || "").replace("ISO 5817 · ", "").trim(),
             isoOczek: (l => t(l === "REJECT" ? "iso_reject" : "iso_" + l))(window.ArcSim.simulate(JSON.parse(JSON.stringify(rec))).iso),
             ekranHi: (document.getElementById("rHi")?.textContent || "").trim(),
             wady: [...document.querySelectorAll("#rDefects li")].map(li => li.textContent.slice(0, 70)),
             replay: { score: s.score, iso: s.iso, hi: s.hi, hiMax: s.hiMax, hiOver: s.hiOver, cvn: s.cvn }, ver: sim.VERSION };
  });
  console.log(JSON.stringify({ material: mat, tempo: SLOW ? "poniżej WPS" : "z WPS", ...out }, null, 1));

  const r = out.replay;
  // Parytet co do punktu i co do litery — bez tego zwycięzca konkursu odpada na weryfikacji.
  const parytet = out.ekranPkt === r.score && out.ekranIso === out.isoOczek;
  const sens = SLOW ? (r.hiOver && r.iso === "REJECT" && r.hi > r.hiMax)
                    : (!r.hiOver && r.hi <= r.hiMax);
  console.log(parytet ? "  ✓ parytet ekran = sim.js" : `  ✗ ROZJAZD: ekran ${out.ekranPkt}/${out.ekranIso} vs sim ${r.score}/${r.iso}`);
  console.log(sens ? (SLOW ? "  ✓ przekroczony wkład ciepła = odrzut" : "  ✓ tempo z WPS — limit milczy") : "  ✗ limit zachował się nie tak");
  console.log(parytet && sens && out.cvnWNagraniu === 1 ? "\n✓ przeszło" : "\n✗ NIE PRZESZŁO");
  await b.close();
  process.exit(parytet && sens && out.cvnWNagraniu === 1 ? 0 : 1);
})();
