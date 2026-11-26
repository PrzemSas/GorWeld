/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// E2E „Boty kontra norma" (09): prawdziwa przeglądarka, prawdziwe kliknięcia.
//   node arc/tests/e2e-boty.js http://127.0.0.1:18898 [katalog_na_zrzuty]
// Sprawdza: Krok 1 / Krok 10 / Auto / Stop, dziennik = ten sam przebieg co Node (bit w bit), ziarno i „od nowa",
// werdykt ISO i zastrzeżenie na ekranie, telefon 390 px bez poziomego przewijania, zero błędów konsoli i zapytań sieci.
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) { try { ({ chromium } = require(p)); break; } catch (e) {} }
if (!chromium) { console.error("brak playwrighta"); process.exit(2); }
const path = require("path"), Bt = require("../boty.js");
const BASE = (process.argv[2] || "http://127.0.0.1:18898").replace(/\/$/, ""), SHOTS = process.argv[3] || null;
let fail = 0; const ok = (n, c, i) => { console.log((c ? "  ✓ " : "  ✗ ") + n + (i !== undefined ? "  " + JSON.stringify(i) : "")); if (!c) fail++; };
const SEED = 20261126;

(async () => {
  const browser = await chromium.launch(process.env.ARC_CHROME ? { executablePath: process.env.ARC_CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
  const errs = [], reqs = [];
  page.on("pageerror", e => errs.push(String(e))); page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("request", r => { if (!r.url().startsWith(BASE)) reqs.push(r.url()); });
  await page.goto(BASE + "/boty.html");
  const rows = () => page.$$eval("#logT tr", t => t.length);
  ok("start: ziarno 20261126 w polu, pusty dziennik", (await page.inputValue("#seed")) === String(SEED) && (await rows()) === 0);
  await page.click("#b1"); await page.waitForFunction(() => window.__boty.n === 1);
  ok("Krok 1: 3 wpisy (po jednej próbie każdego bota)", (await rows()) === 3);
  await page.click("#b10"); await page.waitForFunction(() => window.__boty.n === 11, null, { timeout: 30000 });
  ok("Krok 10: razem 33 wpisy, 11 prób na bota", (await rows()) === 33);
  const logB = await page.evaluate(() => JSON.stringify(window.__boty.log));
  ok("dziennik w przeglądarce = przebieg w Node (to samo ziarno, 11 kroków) bit w bit", logB === JSON.stringify(new Bt.Bench(SEED).step(11).log));
  const iso = (await page.textContent("#vIso")).trim(), last = await page.evaluate(() => window.__boty.log.filter(e => e.bot === 2).pop());
  const isoTxt = { B: Bt.TEXTS.pl.iso_B, C: Bt.TEXTS.pl.iso_C, D: Bt.TEXTS.pl.iso_D, REJECT: Bt.TEXTS.pl.iso_reject }[last.iso];
  ok("werdykt ISO na ekranie = ostatnia próba egzaminatora z silnika", iso === isoTxt && (await page.textContent("#vScore")).trim() === String(last.score), { iso, isoTxt });
  ok("lista wad na ekranie = wady z silnika", (await page.$$eval("#vDef li", l => l.length)) === last.defects.length);
  ok("zastrzeżenie szkoleniowe widoczne", (await page.textContent("footer")).includes(Bt.TEXTS.pl.rep_note) && await page.isVisible("footer #note"));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "podglad_komputer.png"), fullPage: true });
  // Auto → przybywa bez klikania; Stop → przestaje
  await page.click("#bAuto"); await page.waitForFunction(() => window.__boty.n >= 14, null, { timeout: 15000 });
  await page.click("#bStop"); await page.waitForTimeout(300); const nStop = await page.evaluate(() => window.__boty.n);
  await page.waitForTimeout(1800);
  ok("Auto dokłada próby samo, Stop zatrzymuje", nStop >= 14 && (await page.evaluate(() => window.__boty.n)) === nStop, nStop);
  // od nowa z tym samym ziarnem
  await page.click("#bReset"); ok("Od nowa: dziennik pusty", (await rows()) === 0);
  await page.click("#b10"); await page.waitForFunction(() => window.__boty.n === 10, null, { timeout: 30000 });
  ok("Od nowa + Krok 10 = identyczny dziennik jak w Node", (await page.evaluate(() => JSON.stringify(window.__boty.log))) === JSON.stringify(new Bt.Bench(SEED).step(10).log));
  // wpisane ziarno
  await page.fill("#seed", "777"); await page.press("#seed", "Enter"); await page.click("#b1"); await page.waitForFunction(() => window.__boty.n === 1);
  ok("wpisane ziarno 777 = przebieg Node z 777", (await page.evaluate(() => JSON.stringify(window.__boty.log))) === JSON.stringify(new Bt.Bench(777).step(1).log));
  await page.click("#bRand"); const rs = await page.inputValue("#seed");
  ok("Losuj ziarno: nowe ziarno widoczne w polu, dziennik od zera", /^\d+$/.test(rs) && (await rows()) === 0, rs);
  // telefon
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  ph.on("pageerror", e => errs.push(String(e)));
  await ph.goto(BASE + "/boty.html"); await ph.tap("#b10"); await ph.waitForFunction(() => window.__boty.n === 10, null, { timeout: 30000 });
  const lay = await ph.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, stop: r("bStop").top, auto: r("bAuto").bottom, iso: r("vIso").height, fs: parseFloat(getComputedStyle(document.getElementById("vIso")).fontSize) }; });
  // 10_v2: na telefonie rząd Stop / Krok / Auto jest dolnym rzędem paska (przykleja się tylko on, ziarno i przełącznik 44 px przewijają się) → próg „górna połowa ekranu”
  ok("telefon 390 px: bez poziomego przewijania, Stop/Krok/Auto w górnej połowie pierwszego ekranu, werdykt ISO duży", lay.sw <= lay.iw && lay.stop >= 0 && lay.auto < lay.ih / 2 && lay.iso > 0 && lay.fs >= 20, lay);
  if (SHOTS) await ph.screenshot({ path: path.join(SHOTS, "podglad_telefon.png"), fullPage: true });
  ok("zero błędów konsoli", errs.length === 0, errs.slice(0, 3));
  ok("zero zapytań poza własny serwer (brak sieci / analityki)", reqs.length === 0, reqs.slice(0, 3));
  await browser.close();
  console.log(fail ? `\n✗ ${fail} nie przeszło` : "\n✓ wszystko przeszło"); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
