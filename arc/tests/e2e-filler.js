/**
 * GORWELD™ ARC — E2E: SPOIWO TIG PODAWANE SPACJĄ (odbiór klawisza, nie ocenianie).
 *
 * PO CO TO JEST
 * Silnik potrafi być bez zarzutu, a spoiwa w grze i tak nie ma, bo dab nigdy nie wchodzi
 * do nagrania. Tak było w 3.3.0: guard w obsłudze spacji odrzucał zdarzenie, gdy fokus
 * siedział na BUTTON/SELECT — czyli ZAWSZE, bo TIG wybiera się KLIKAJĄC przycisk
 * [data-proc=TIG] i ten przycisk trzyma fokus przez całą rundę. Testy jednostkowe czytają
 * nagranie, a nie klawiaturę, więc tego nie widzą. Ten sterownik widzi.
 *
 * ⚠ NIE WOLNO tu robić `blur()` po kliknięciu w TIG. Dokładnie to maskowało błąd:
 *   E2E robił blur, żywy gracz nie robi. Fokus MA zostać na przycisku — to jest warunek testu.
 *
 * JAK ODPALIĆ (sprawdzone 2026-09-02, WSL + chromium z ms-playwright)
 *   1. Skopiuj `index.html`, `sim.js`, `challenge-config.json` i ten plik do katalogu
 *      POZA repo i podmień tam `VERSION` w sim.js na znacznik — inaczej nie wiesz, czy
 *      test czyta ten silnik, co trzeba:
 *        sed -i 's/VERSION: "3.3.0"/VERSION: "E2E-POZA-REPO"/' sim.js
 *   2. Serwuj po HTTP (`file://` padnie na CORS przy challenge-config.json):
 *        python3 -m http.server 8898 --bind 127.0.0.1
 *   3. node e2e-filler.js http://127.0.0.1:8898 dabs   # gracz naciska spację
 *      node e2e-filler.js http://127.0.0.1:8898 nic    # gracz nie naciska
 *
 * CZEGO OCZEKIWAĆ (3.3.0 + poprawka odbioru spacji)
 *   dabs -> dabEv ~50, tig:1, pokrycie ~98,7%, ISO C, ekran == replay sim.js
 *   nic  -> dabEv 0, REJECT   (bez spoiwa nadal nie ma spoiny — to POPRAWNY wynik)
 * Na silniku sprzed poprawki wariant `dabs` daje dabEv 0 i REJECT — o to w tym teście chodzi.
 *
 * PUŁAPKI, które już kosztowały czas:
 *  * splash i samouczek przykrywają blachę — `localStorage.gorweld_tut=1` PRZED wczytaniem
 *    strony (addInitScript), potem hideSplash() i closeModal(openM);
 *  * nie da się spawać „przez środek": szew leży na 0.66H, więc jedziemy PO `seamPts`
 *    przeliczonych na współrzędne klienta odwrotnością `pos()`, a nie po prostej;
 *  * `rec`, `seamPts`, `W`, `H` to `let` w klasycznym skrypcie — NIE ma ich na `window`,
 *    trzeba się do nich odwoływać gołą nazwą wewnątrz evaluate;
 *  * ocenę uruchamia dopiero zgaszenie łuku — przy TIG PPM, nie samo puszczenie LPM.
 */
const path = require("path");
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) {
  try { ({ chromium } = require(p)); break; } catch (e) {}
}
if (!chromium) { console.error("brak playwrighta — zainstaluj albo popraw ścieżkę w require"); process.exit(2); }

const BASE = process.argv[2], DABS = process.argv[3] === "dabs";
const EXE = process.env.ARC_CHROME || "/home/gorweld/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
if (!BASE) { console.error("użycie: node e2e-filler.js <baseURL> [dabs|nic]"); process.exit(2); }

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--mute-audio"] });
  const pg = await b.newPage({ viewport: { width: 1100, height: 760 } });
  await pg.addInitScript(() => { try { localStorage.setItem("gorweld_tut", "1"); } catch (e) {} });
  await pg.goto(BASE + "/index.html");
  await pg.waitForTimeout(1800);
  await pg.evaluate(() => { if (window.hideSplash) hideSplash(); if (window.openM) closeModal(openM); });
  await pg.waitForTimeout(500);

  await pg.click('[data-proc="TIG"]');                 // ← fokus ZOSTAJE na przycisku. Tak ma być.
  await pg.waitForTimeout(400);
  const focus = await pg.evaluate(() => document.activeElement.tagName + ":" + (document.activeElement.dataset?.proc || ""));

  // Jedziemy PO GRANI — punkty szwu z gry, przeliczone odwrotnością pos().
  const seam = await pg.evaluate(() => { const r = stage.getBoundingClientRect(), sx = r.width / W, sy = r.height / H;
    return seamPts.map(p => [r.left + p.x * sx, r.top + p.y * sy]); });
  if (seam.length < 4) throw new Error("brak seamPts — runda się nie zbudowała");

  await pg.mouse.move(seam[0][0], seam[0][1]); await pg.mouse.down();
  for (let i = 1; i < seam.length; i++) {
    await pg.mouse.move(seam[i][0], seam[i][1]);
    if (DABS && i % 3 === 0) await pg.keyboard.press("Space");     // rytm spoiwa
    await pg.waitForTimeout(10);
  }
  // TIG: PPM gasi łuk i kończy ścieg — dopiero wtedy gra liczy ocenę.
  const last = seam[seam.length - 1];
  await pg.mouse.down({ button: "right" }); await pg.mouse.move(last[0] - 1, last[1]);
  await pg.waitForTimeout(200); await pg.mouse.up({ button: "right" }); await pg.mouse.up();
  await pg.waitForTimeout(1200);

  const out = await pg.evaluate(() => {
    const dabEv = rec ? rec.events.filter(e => (e.k | 0) & 16).length : -1, sim = window.ArcSim;
    const s = sim.simulate(JSON.parse(JSON.stringify(rec)));
    return { focusHeld: document.activeElement.tagName, dabEv, tig: rec.tig, ver: sim.VERSION,
             ekran: (document.getElementById("rPct")?.textContent || "").trim(),
             replay: { score: s.score, cov: +(s.coverage * 100).toFixed(1), dabs: s.filDabs, iso: s.iso } };
  });
  console.log(JSON.stringify({ focusPoKliku: focus, ...out }, null, 1));

  // Parytet: liczba z ekranu MUSI być liczbą z sim.js — inaczej zwycięzca odpada na weryfikacji.
  const ekranPkt = parseInt(out.ekran, 10);
  const ok = DABS ? (out.dabEv > 0 && out.tig === 1 && out.replay.cov > 90 && ekranPkt === out.replay.score)
                  : (out.dabEv === 0 && out.replay.iso === "REJECT");
  console.log(ok ? "\n✓ przeszło" : "\n✗ NIE PRZESZŁO");
  await b.close();
  process.exit(ok ? 0 : 1);
})();
