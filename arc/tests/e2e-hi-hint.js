/**
 * GORWELD™ ARC — E2E: ŻYWA PODPOWIEDŹ O WKŁADZIE CIEPŁA (3.4.1)
 *
 * PO CO TO JEST
 * `heatinput.js` pilnuje, że przekroczenie sufitu HI kończy się odrzutem, a `e2e-heatinput.js` —
 * że ekran i replay zgadzają się co do punktu. Żaden z nich nie sprawdza tego, co gracz widzi
 * W TRAKCIE ściegu: napis `fb_hi` był przetłumaczony na trzy języki i NIE MIAŁ ANI JEDNEGO
 * wywołania. Sufit widać było przed rundą i po niej, ale nie wtedy, kiedy da się jeszcze zareagować.
 *
 * Ten sterownik spawa prawdziwymi zdarzeniami wskaźnika i próbkuje `speedFb` w trakcie:
 *   node e2e-hi-hint.js http://127.0.0.1:8898  wolno   # stal + tempo poniżej WPS → podpowiedź MUSI paść
 *   node e2e-hi-hint.js http://127.0.0.1:8898  wps     # stal + tempo z WPS      → musi MILCZEĆ
 *   node e2e-hi-hint.js http://127.0.0.1:8898  ss      # nierdzewka, wolno       → musi MILCZEĆ (brak CVN)
 *
 * Nierdzewka jest tu ważniejsza, niż wygląda: bez tej próby „podpowiedź działa" znaczyłoby tylko
 * tyle, że napis w ogóle się pojawia — a on ma się pojawiać WYŁĄCZNIE tam, gdzie istnieje limit.
 */
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) {
  try { ({ chromium } = require(p)); break; } catch (e) {}
}
if (!chromium) { console.error("brak playwrighta"); process.exit(2); }

const BASE = process.argv[2], MODE = process.argv[3] || "wolno";
const SLOW = MODE !== "wps", SS = MODE === "ss";
const EXE = process.env.ARC_CHROME || "/home/gorweld/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
if (!BASE) { console.error("użycie: node e2e-hi-hint.js <baseURL> [wolno|wps|ss]"); process.exit(2); }

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--mute-audio"] });
  const pg = await b.newPage({ viewport: { width: 1100, height: 760 } });
  await pg.addInitScript(() => { try { localStorage.setItem("gorweld_tut", "1"); } catch (e) {} });
  await pg.goto(BASE + "/index.html");
  await pg.waitForTimeout(1800);
  await pg.evaluate(() => { if (window.hideSplash) hideSplash(); if (window.openM) closeModal(openM); });
  await pg.waitForTimeout(500);
  await pg.click('[data-proc="TIG"]'); await pg.waitForTimeout(400);
  if (SS) { await pg.click('[data-bead="ss"]'); await pg.waitForTimeout(400); }
  // Po programowym .click() fokus zostaje na przycisku — spacja musi i tak podawać spoiwo (131e6f0).
  await pg.evaluate(() => document.activeElement && document.activeElement.blur());

  // Bezpośredni strażnik naprawionego błędu: nagranie MUSI opisywać materiał, którym gracz gra.
  // Do 3.4.0 `.bead` zmieniał tylko `bead`, a `rec.bead`/`rec.cvn` zostawały z poprzedniego materiału.
  const przed = await pg.evaluate(() => ({ mat: bead, cvn: !!CVN_BEADS[bead], napis: t("fb_hi"),
                                           recMat: rec && rec.bead, recCvn: rec && rec.cvn }));

  const seam = await pg.evaluate(() => { const r = stage.getBoundingClientRect(), sx = r.width / W, sy = r.height / H;
    return seamPts.map(p => [r.left + p.x * sx, r.top + p.y * sy]); });
  const step = SLOW ? 90 : 10;
  const probki = [];
  await pg.mouse.move(seam[0][0], seam[0][1]); await pg.mouse.down();
  for (let i = 1; i < seam.length; i++) {
    await pg.mouse.move(seam[i][0], seam[i][1]);
    if (i % 3 === 0) await pg.keyboard.press("Space");
    await pg.waitForTimeout(step);
    probki.push(await pg.evaluate(() => ({ fb: speedFb, vT: +vTimeS.toFixed(2) })));
  }
  const last = seam[seam.length - 1];
  await pg.mouse.down({ button: "right" }); await pg.mouse.move(last[0] - 1, last[1]);
  await pg.waitForTimeout(200); await pg.mouse.up({ button: "right" }); await pg.mouse.up();
  await pg.waitForTimeout(1500);

  const out = await pg.evaluate(() => {
    const s = window.ArcSim.simulate(JSON.parse(JSON.stringify(rec)));
    return { replay: { score: s.score, iso: s.iso, hi: s.hi, hiMax: s.hiMax, hiOver: s.hiOver, cvn: s.cvn },
             ekranPkt: parseInt(document.getElementById("rPct")?.textContent || "", 10), ver: window.ArcSim.VERSION };
  });

  const trafienia = probki.filter(p => p.fb === przed.napis);
  const pierwsze = probki.findIndex(p => p.fb === przed.napis);
  // Podpowiedź nie ma prawa odezwać się, zanim uzbiera się HI_FB_MIN_S sekundy ściegu.
  const przedCzasem = trafienia.filter(p => p.vT <= 0.5).length;

  console.log(JSON.stringify({ tryb: MODE, material: przed.mat, limitObowiazuje: przed.cvn,
    probek: probki.length, trafienPodpowiedzi: trafienia.length,
    pierwszaProbkaZPodpowiedzia: pierwsze < 0 ? null : pierwsze,
    trafienPrzedHI_FB_MIN_S: przedCzasem, ...out }, null, 1));

  const r = out.replay;
  const ok = [];
  if (SLOW && !SS) {
    ok.push(["podpowiedź padła w trakcie ściegu", trafienia.length > 0]);
    ok.push(["nie odzywa się przed HI_FB_MIN_S", przedCzasem === 0]);
    ok.push(["raport potwierdza przekroczenie", r.hiOver === true && r.iso === "REJECT"]);
  } else {
    ok.push(["podpowiedź MILCZY", trafienia.length === 0]);
    ok.push([SS ? "brak limitu na nierdzewce" : "HI pod sufitem", SS ? r.cvn === false : r.hiOver === false]);
  }
  ok.push(["nagranie zna materiał gracza", przed.recMat === przed.mat && przed.recCvn === (przed.cvn ? 1 : 0)]);
  // Silnik oceny ma być NIETKNIĘTY — podpowiedź to HUD, nie punkty.
  ok.push(["parytet ekran = sim.js", out.ekranPkt === r.score]);
  for (const [n, v] of ok) console.log((v ? "  ✓ " : "  ✗ ") + n);
  const pass = ok.every(([, v]) => v);
  console.log(pass ? "\n✓ przeszło" : "\n✗ NIE PRZESZŁO");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
