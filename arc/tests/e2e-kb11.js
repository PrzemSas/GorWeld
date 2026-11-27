/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// E2E poprawki 11 na boty.html (Chromium): wybór reguły kb:9 / kb:10 / kb:11 (domyślnie kb:9) klawiaturą i tapnięciem, dziennik = Node
// Bench(ziarno, reguła) bit w bit, kolumna kb, znacznik reguły (kb:11 zawiera kb:10), „Od nowa" zostawia regułę; przy kb:11 treningowy zakres ARC
// w parametrach i wada prądu z zakresem; kąt bezwzględny (średnio) z pasmem bez kary w PL/EN/RU; telefon 360/390/480: wybór reguły ≥ 44×44,
// bez poziomego przewijania; zero błędów konsoli i zapytań sieci. Z argumentem SHOTS zapisuje zrzuty 11.
// Uruchom: python3 battle-server/static-dev.py --port 18898 &  node arc/tests/e2e-kb11.js http://127.0.0.1:18898 [katalog_zrzutów]
const path = require("path");
const { chromium } = require("playwright");
const Bt = require("../boty.js"), S = require("../sim.js");
const BASE = (process.argv[2] || "http://127.0.0.1:18898").replace(/\/$/, ""), SHOTS = process.argv[3] || null, SEED = 20261126;
let fail = 0; const ok = (n, c, i) => { console.log((c ? "  ✓ " : "  ✗ ") + n + (i !== undefined ? "  " + JSON.stringify(i) : "")); if (!c) fail++; };
// 11_v2 (F): napis reguły na wykresie nad polem wykresu — dół napisu (z ogonkami) nad T minus promień kropki (3 px), mieści się w szerokości, nie zachodzi na etykietę osi „100”
const chartTag = pg => pg.evaluate(() => { const cv = document.getElementById("cv"), tg = (cv.dataset.tag || "").split(",").map(Number), T = +cv.dataset.top, w = +cv.dataset.w;
  return { tag: cv.dataset.tag || null, T, w, ok: tg.length === 4 && T >= 18 && tg[3] <= T - 3 && tg[1] >= 0 && tg[2] <= w - 6 && tg[0] >= 26 }; });
(async () => {
  const browser = await chromium.launch(); const errs = [], reqs = [];
  const watch = pg => { pg.on("pageerror", e => errs.push(String(e))); pg.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
    pg.on("request", r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith("data:") && !u.startsWith("about:")) reqs.push(u); }); };
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); watch(page);
  await page.goto(BASE + "/boty.html");
  const st0 = await page.evaluate(() => ({ r: window.__boty.rule, c: ["r9", "r10", "r11"].map(id => document.getElementById(id).checked) }));
  ok("domyślnie reguła kb:9 (jak gra)", st0.r === 9 && st0.c.join() === "true,false,false", st0);
  // klawiatura: fokus na radiu kb:9, strzałka w prawo → kb:10, jeszcze raz → kb:11 (natywna grupa radiowa)
  await page.focus("#r9"); await page.keyboard.press("ArrowRight"); const k1 = await page.evaluate(() => window.__boty.rule);
  await page.keyboard.press("ArrowRight"); const k2 = await page.evaluate(() => ({ r: window.__boty.rule, fv: document.activeElement.id, vis: document.activeElement.matches(":focus-visible") }));
  ok("klawiatura: strzałki zmieniają regułę kb:9 → kb:10 → kb:11, widoczny fokus", k1 === 10 && k2.r === 11 && k2.fv === "r11" && k2.vis, { k1, k2 });
  await page.click("#b10"); await page.waitForFunction(() => window.__boty.n === 10, null, { timeout: 60000 });
  const lg = await page.evaluate(() => JSON.stringify(window.__boty.log));
  const ctD = await chartTag(page); ok("11_v2 (F) komputer: napis „kb:11 · …” nad polem wykresu, nie nachodzi na linie botów ani progów", ctD.ok, ctD);
  const kbCells = await page.$$eval("#logT tr td:nth-child(2)", t => t.map(x => x.textContent));
  const ruleTxt = await page.textContent("#logRule"), eng = await page.textContent("#engine");
  ok("kb:11: dziennik = Node Bench(ziarno, 11) bit w bit, kolumna kb = 11, znacznik „kb:11 … kb:10 + zakres ARC …”", lg === JSON.stringify(new Bt.Bench(SEED, 11).step(10).log) && kbCells.length === 30 && kbCells.every(x => x === "11") && /kb:11/.test(ruleTxt) && /kb:10 \+ zakres ARC/.test(ruleTxt) && /kb:11/.test(eng), ruleTxt);
  const ex = await page.evaluate(() => window.__boty.log.filter(e => e.bot === 2 && e.defects.some(d => /^amp_/.test(d.c))).length);
  ok("kb:11: egzaminator bez wady prądu (10 prób)", ex === 0, ex);
  const nv = await page.evaluate(() => window.__boty.log.filter(e => e.bot === 0).flatMap(e => e.defects.filter(d => /^amp_/.test(d.c)).map(d => d.k + ":" + d.p.join("/"))));
  ok("kb:11: wada prądu nowicjusza (jeśli jest) ma tekst z zakresem (klucz _r, %1 A, zakres ARC)", nv.every(x => /_r:\d+\/\d+\/\d+$/.test(x)), nv.slice(0, 4));
  // parametry: zakres prądu i kąt bezwzględny
  const e2 = await page.evaluate(() => { const L = window.__boty.log.filter(e => e.bot === 2); return L[L.length - 1]; });
  const tab = await page.$eval("#pTab", t => t.innerText.replace(/\s+/g, " "));
  const taA = e2.taIdeal + e2.angT, fmt = v => v.toFixed(1).replace(".", ",");
  const rngTxt = "zakres ARC " + e2.elec.map(x => "Ø" + fmt(x.d / 10) + " " + x.rng[0] + "–" + x.rng[1] + " A").join(" / ");
  ok("kb:11: wiersz prądu pokazuje zakres ARC dla użytej Ø (np. „zakres ARC Ø2,5 70–90 A / Ø3,2 100–130 A”)", tab.includes(rngTxt) && tab.includes("70–90 A") && !/WPS\s+Ø2,5 70–90 A/.test(tab), rngTxt);
  ok("kąt bezwzględny, średnio z próby, z pasmem: „… ciągnięcia (średnio) · WPS: ciągnięcie 10°, pasmo bez kary ±9°”, roboczy „od osi złącza”",
    tab.includes(fmt(Math.abs(taA)) + "° " + (taA >= 0 ? "ciągnięcia" : "pchania") + " (średnio)") && tab.includes("WPS: ciągnięcie 10°, pasmo bez kary ±" + S.TA_BAND + "°") && tab.includes(fmt(e2.angW) + "° od osi złącza (średnio)") && !/WPS 0°/.test(tab), tab.slice(0, 400));
  if (SHOTS) { await page.mouse.move(5, 5); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(SHOTS, "podglad_komputer_11.png"), fullPage: true }); }
  // EN / RU: ten sam kąt w języku opisów
  await page.click("#bLang"); const tEn = await page.$eval("#pTab", t => t.innerText.replace(/\s+/g, " "));
  await page.click("#bLang"); const tRu = await page.$eval("#pTab", t => t.innerText.replace(/\s+/g, " ")); await page.click("#bLang");
  ok("zakres prądu w PL/EN/RU nazywa się ARC range, nigdy WPS range",
    tab.includes("zakres ARC Ø") && !/WPS\s+Ø2,5 70–90 A/.test(tab) && /ARC range Ø/.test(tEn) && !/WPS\s+Ø2\.5 70–90 A/.test(tEn) && /диапазон ARC Ø/.test(tRu) && !/WPS\s+Ø2,5 70–90 A/.test(tRu), [tab.slice(0, 180), tEn.slice(0, 180), tRu.slice(0, 180)]);
  ok("kąt w EN i RU: „drag (average) · WPS: drag 10°, no-penalty band ±9°” / „углом назад (в среднем) · WPS: углом назад 10°”",
    /Drag angle .*(drag|push) \(average\)/.test(tEn) && /WPS: drag 10°, no-penalty band ±9°/.test(tEn) && /Угол наклона назад .*\(в среднем\)/.test(tRu) && /WPS: углом назад 10°/.test(tRu), [tEn.slice(0, 120), tRu.slice(0, 120)]);
  // „Od nowa" zostawia regułę; powrót do kb:9 = jak gra (dziennik 09)
  await page.click("#bReset"); const rs = await page.evaluate(() => ({ n: window.__boty.n, r: window.__boty.rule, c: document.getElementById("r11").checked }));
  ok("„Od nowa” zaczyna od zera i zostawia regułę kb:11", rs.n === 0 && rs.r === 11 && rs.c, rs);
  await page.check("#r9"); await page.click("#b1"); await page.waitForFunction(() => window.__boty.n === 1);
  ok("kb:9: dziennik jak gra (= Bench(ziarno) z 09/10), wiersz prądu bez zakresu („WPS wg Ø: … 80 A”)", (await page.evaluate(() => JSON.stringify(window.__boty.log))) === JSON.stringify(new Bt.Bench(SEED).step(1).log) && /WPS wg Ø: Ø2,5 80 A/.test(await page.$eval("#pTab", t => t.innerText)));
  // telefon: tap w etykiety reguł, 44×44, bez poziomego przewijania
  for (const W of [360, 390, 480]) { const ph = await browser.newPage({ viewport: { width: W, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); watch(ph);
    await ph.goto(BASE + "/boty.html"); await ph.tap('#rule label.rb:has(#r11)', { position: { x: 60, y: 22 } }); const r11 = await ph.evaluate(() => window.__boty.rule);
    await ph.tap("#b1"); await ph.waitForFunction(() => window.__boty.n === 1);
    const sz = await ph.evaluate(() => ({ rb: Array.from(document.querySelectorAll("#rule label.rb")).map(l => { const r = l.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }), sw: document.documentElement.scrollWidth, iw: innerWidth }));
    ok(`telefon ${W} px: tap w „kb:11” wybiera regułę, etykiety reguł ≥ 44×44, bez poziomego przewijania`, r11 === 11 && sz.rb.length === 3 && sz.rb.every(([w, h]) => w >= 44 && h >= 44) && sz.sw <= sz.iw, { r11, ...sz });
    const ct11 = await chartTag(ph); await ph.check("#r10"); await ph.tap("#b1"); await ph.waitForFunction(() => window.__boty.n === 1); const ct10 = await chartTag(ph);
    await ph.check("#r9"); const ct9 = await chartTag(ph); await ph.check("#r11"); await ph.tap("#b10"); await ph.waitForFunction(() => window.__boty.n === 10, null, { timeout: 60000 }); const ct11b = await chartTag(ph);
    ok(`11_v2 (F) telefon ${W} px: napis kb:11 / kb:10 nad polem wykresu (T = 18), kb:9 bez napisu i bez marginesu (T = 6)`, ct11.ok && ct10.ok && ct11b.ok && ct9.tag === null && ct9.T === 6, { ct11, ct10, ct9 });
    if (SHOTS && W === 390) { await ph.evaluate(() => { document.getElementById("cv").scrollIntoView({ block: "start" }); window.scrollBy(0, -60); }); await ph.screenshot({ path: path.join(SHOTS, "podglad_telefon_11_wykres.png"), fullPage: false }); }
    if (SHOTS && W === 390) { await ph.evaluate(() => document.querySelector("#pTab").scrollIntoView({ block: "start" })); await ph.evaluate(() => window.scrollBy(0, -120)); await ph.screenshot({ path: path.join(SHOTS, "podglad_telefon_11.png"), fullPage: false }); }
    await ph.close(); }
  ok("zero błędów konsoli", errs.length === 0, errs.slice(0, 3));
  ok("zero zapytań poza własny serwer", reqs.length === 0, reqs.slice(0, 3));
  // porównanie kb:10 / kb:11: te same próby egzaminatora (dane z silnika, render w przeglądarce)
  if (SHOTS) {
    const a = new Bt.Bench(SEED, 10).step(20).log.filter(e => e.bot === 2), b = new Bt.Bench(SEED, 11).step(20).log.filter(e => e.bot === 2);
    const cell = e => e.score + " · " + (e.iso === "REJECT" ? "ODRZ." : e.iso) + " · " + (e.defects.filter(d => d.c !== "ok").map(d => Bt.defectText(d, "pl").replace(/ — [^(]*/, " ").trim()).join("; ") || "bez wad");
    const rows = a.map((e, i) => `<tr><td>${e.n}</td><td>${e.elec.map(x => x.amps).join("/")} A</td><td>${e.ampPen} / ${e.arcPen}</td><td>${cell(e)}</td><td>${b[i].ampPen} / ${b[i].arcPen}</td><td>${cell(b[i])}</td></tr>`).join("");
    const cp = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await cp.setContent(`<html><body style="margin:0;background:#050709;color:#cfd8de;font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;padding:16px">
      <h2 style="margin:0 0 4px;font-size:15px;letter-spacing:.1em">EGZAMINATOR — TE SAME PRÓBY W REGULE kb:10 I kb:11</h2>
      <div style="color:#9aa7b0;margin-bottom:10px">ziarno ${SEED} · 20 prób · MMA PA 5 mm · zakres ARC Ø2,5 70–90 A, Ø3,2 100–130 A · próg wady łuku ${S.ARC_DEF_MIN} · liczy ArcSim.simulate ${S.VERSION} · ${Bt.TEXTS.pl.rep_note}</div>
      <table style="border-collapse:collapse;width:100%">${"<tr>" + ["#", "prąd ściegów", "kara prądu / łuku kb:10", "kb:10: pkt · ISO · wady", "kara prądu / łuku kb:11", "kb:11: pkt · ISO · wady"].map(h => `<th style="text-align:left;color:#9aa7b0;border-bottom:1px solid #1a242c;padding:4px 6px">${h}</th>`).join("") + "</tr>"}
      ${rows.replace(/<td>/g, '<td style="border-bottom:1px solid #1a242c;padding:4px 6px;vertical-align:top">')}</table></body></html>`);
    await cp.screenshot({ path: path.join(SHOTS, "porownanie_kb10_kb11.png"), fullPage: true }); }
  await browser.close();
  console.log(fail ? `\n✗ ${fail} nie przeszło` : "\n✓ wszystko przeszło"); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
