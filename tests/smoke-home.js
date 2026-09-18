/**
 * Smoke home: intro NIE jest bramka, a film daje sie odtworzyc na zadanie.
 * Odpal: node smoke-home.js            (lokalne pliki)
 *        SMOKE_URL=https://gorweld.com/ node smoke-home.js
 */
const path = require("path");
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) {
  try { ({ chromium } = require(p)); break; } catch (e) {}
}
if (!chromium) { console.error("brak playwrighta"); process.exit(2); }
const EXE = process.env.ARC_CHROME || "/home/gorweld/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const URL = process.env.SMOKE_URL || ("file://" + path.resolve("/mnt/d/GorWeld/index.html"));

let fail = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fail++; };

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const pg = await b.newPage();
  const navs = [];
  pg.on("framenavigated", f => { if (f === pg.mainFrame()) navs.push(f.url()); });
  await pg.goto(URL, { waitUntil: "load" });
  await pg.waitForTimeout(400);

  // 1. wejscie nie jest zablokowane
  ok(await pg.$eval("#forge-intro", e => e.hidden), "overlay intro ukryty na wejsciu");
  ok(!(await pg.$eval("body", e => e.classList.contains("fi-lock"))), "body nie zablokowane (mozna scrollowac)");
  ok((await pg.$$("#fiHint")).length === 0, "zniknelo 'click to enter'");

  // 2. flagowiec widoczny bez klikania w cokolwiek
  ok(await pg.$eval("#arc", e => e.getBoundingClientRect().height > 100), "sekcja ARC jest w dokumencie");
  const cta = await pg.$eval(".ncta", e => e.textContent.trim());
  ok(/Play ARC/i.test(cta), "CTA 'Play ARC' w nawigacji: " + cta);

  // 3. film na zadanie
  await pg.click("#fiOpen");
  await pg.waitForTimeout(300);
  ok(!(await pg.$eval("#forge-intro", e => e.hidden)), "klik w 'Watch the intro film' otwiera overlay");
  ok(await pg.$eval("body", e => e.classList.contains("fi-lock")), "przy otwartym filmie body zablokowane");

  // 4. Esc zamyka i NIE przerzuca na /forge/
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(900);
  ok(await pg.$eval("#forge-intro", e => e.hidden), "Esc zamyka overlay");
  ok(!(await pg.$eval("body", e => e.classList.contains("fi-lock"))), "body odblokowane po zamknieciu");
  ok(!navs.some(u => /\/forge\//.test(u)), "zero przerzutow na /forge/ (bylo: " + navs.length + " nawigacji)");

  // 4b. KONIEC FILMU zostawia na home (to byl blad: redirect na /forge/)
  await pg.click("#fiOpen");
  await pg.waitForTimeout(250);
  await pg.$eval("#fiFilm", v => v.dispatchEvent(new Event("ended")));
  await pg.waitForTimeout(900);
  ok(await pg.$eval("#forge-intro", e => e.hidden), "koniec filmu zamyka overlay");
  ok(!navs.some(u => /\/forge\//.test(u)), "koniec filmu NIE przerzuca na /forge/");
  ok(/gorweld|127\.0\.0\.1|index\.html/.test(pg.url()), "zostajemy na home: " + pg.url());

  // 5. kontakt i legal
  ok(await pg.$("#contact") !== null, "sekcja #contact istnieje");
  const legal = await pg.$eval("#contact", e => e.textContent);
  ok(/R\.396313/.test(legal), "numer znaku towarowego na stronie");
  ok(/no account and no sign-up/i.test(legal), "nota o prywatnosci ARC");
  const mail = await pg.$eval('#contact a[href^="mailto:"]', e => e.getAttribute("href"));
  ok(!/PLACEHOLDER/.test(mail), "adres e-mail wypelniony (teraz: " + mail + ")");
  // kontakt@gorweld.com ODBIJAL 18.09 (brak aliasu w Google) — niech nie wroci na strone
  // przypadkiem, dopoki ktos nie potwierdzi mailem, ze skrzynka odbiera.
  ok(!/kontakt@gorweld\.com/.test(mail), "na stronie nie ma adresu, ktory odbija");

  await b.close();
  console.log(fail ? "\n" + fail + " NIEZALICZONE" : "\nwszystko zaliczone");
  process.exit(fail ? 1 : 0);
})();
