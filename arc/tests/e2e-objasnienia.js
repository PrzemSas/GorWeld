/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// E2E objaśnień wad + przełącznika reguły kb:10 (10) na boty.html: prawdziwa przeglądarka, mysz, dotyk i klawiatura.
//   node arc/tests/e2e-objasnienia.js http://127.0.0.1:18898 [katalog_na_zrzuty]
// Komputer: hover = podgląd, klik przypina/odpina. Klawiatura: Tab dochodzi do wady, Enter/Spacja otwiera, Esc zamyka i oddaje
// fokus, aria-expanded się przełącza, widoczny focus. Auto 10 kroków: przypięte objaśnienie zostaje (ten sam kod), fokus nie ucieka.
// PL → EN → RU zmienia treść. Telefon 390 px z dotykiem: tap otwiera/zamyka, bez poziomego scrolla, sterowanie i ISO widoczne,
// cele ≥ 44 px. Przełącznik kb:10: dziennik = Node z flagą, znacznik w dzienniku i na wykresie. Kontrast ≥ 4,5:1. Zero błędów i sieci.
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) { try { ({ chromium } = require(p)); break; } catch (e) {} }
if (!chromium) { console.error("brak playwrighta"); process.exit(2); }
const path = require("path"), Bt = require("../boty.js");
const BASE = (process.argv[2] || "http://127.0.0.1:18898").replace(/\/$/, ""), SHOTS = process.argv[3] || null;
let fail = 0; const ok = (n, c, i) => { console.log((c ? "  ✓ " : "  ✗ ") + n + (i !== undefined ? "  " + JSON.stringify(i) : "")); if (!c) fail++; };
const SEED = 20261126, E = Bt.EXPLAIN || {};
const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

(async () => {
  const browser = await chromium.launch(process.env.ARC_CHROME ? { executablePath: process.env.ARC_CHROME } : {});
  const errs = [], reqs = [];
  const watch = pg => { pg.on("pageerror", e => errs.push(String(e))); pg.on("console", m => { if (m.type() === "error") errs.push(m.text()); }); pg.on("request", r => { if (!r.url().startsWith(BASE)) reqs.push(r.url()); }); };
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }); watch(page);
  await page.goto(BASE + "/boty.html");
  await page.click("#b1"); await page.waitForFunction(() => window.__boty.n === 1);
  const st = () => page.evaluate(() => { const dx = document.getElementById("dx"), a = document.activeElement;
    return { hidden: dx.hidden, k: dx.dataset.k || null, pinned: dx.dataset.pinned || null, exp: Array.from(document.querySelectorAll("#vDef .defb")).filter(b => b.getAttribute("aria-expanded") === "true").map(b => b.dataset.k),
      act: a ? (a.dataset && a.dataset.k ? "defb:" + a.dataset.k : a.id || a.tagName) : null, text: dx.innerText }; });
  const btns = await page.$$eval("#vDef .defb", b => b.map(x => ({ k: x.dataset.k, tag: x.tagName, ctl: x.getAttribute("aria-controls"), exp: x.getAttribute("aria-expanded") })));
  ok("każda wada to <button> z aria-controls=dx i aria-expanded=false; objaśnienie ukryte", btns.length > 0 && btns.every(b => b.tag === "BUTTON" && b.ctl === "dx" && b.exp === "false") && (await st()).hidden, btns.map(b => b.k));
  if (!btns.length || !E.pl) { console.log("\n✗ brak przycisków wad / objaśnień — pulpit sprzed 10"); await browser.close(); process.exit(1); }
  const k0 = btns[0].k, sel0 = `#vDef .defb[data-k="${k0}"]`;
  // hover = podgląd
  await page.hover(sel0); let s = await st();
  ok("komputer: najechanie pokazuje podgląd objaśnienia (treść = EXPLAIN.pl, aria-expanded=true)", !s.hidden && s.k === k0 && s.pinned === "0" && s.text.includes(E.pl[k0][0]) && s.exp.join() === k0, { k: s.k, pinned: s.pinned });
  ok("na górze objaśnienia zastrzeżenie szkoleniowe (rep_note)", s.text.includes(Bt.TEXTS.pl.rep_note) && E.pl.labels.every(l => s.text.toUpperCase().includes(l.toUpperCase())));
  await page.mouse.move(5, 5); s = await st();
  ok("zjechanie myszą bez kliknięcia chowa podgląd", s.hidden && s.exp.length === 0);
  // klik przypina / odpina
  await page.click(sel0); await page.mouse.move(5, 5); s = await st();
  ok("klik przypina: objaśnienie zostaje po zjechaniu myszą", !s.hidden && s.k === k0 && s.pinned === "1" && s.exp.join() === k0);
  await page.click(sel0); await page.mouse.move(5, 5); s = await st();
  ok("drugi klik odpina", s.hidden && s.exp.length === 0);
  // klawiatura: Tab → wada, Enter, Esc (fokus wraca), Spacja
  await page.focus("#grace"); let reached = null;
  for (let i = 0; i < 40 && !reached; i++) { await page.keyboard.press("Tab"); const a = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("defb") ? document.activeElement.dataset.k : null); if (a) reached = a; }
  const fv = await page.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a); return { o: cs.outlineStyle, w: parseFloat(cs.outlineWidth), fv: a.matches(":focus-visible") }; });
  ok("klawiatura: Tab dochodzi do wady, widoczny :focus-visible", !!reached && fv.fv && fv.o !== "none" && fv.w >= 2, { reached, fv });
  await page.keyboard.press("Enter"); s = await st();
  ok("Enter otwiera (przypina), aria-expanded=true", !s.hidden && s.k === reached && s.pinned === "1" && s.exp.join() === reached);
  await page.keyboard.press("Escape"); s = await st();
  ok("Esc zamyka i zwraca fokus na przycisk tej wady, aria-expanded=false", s.hidden && s.act === "defb:" + reached && s.exp.length === 0, s.act);
  await page.keyboard.press(" "); s = await st();
  ok("Spacja otwiera ponownie", !s.hidden && s.k === reached && s.pinned === "1");
  // języki
  await page.click("#bLang"); s = await st(); const en = s.text.includes(E.en[reached][0]) && E.en.labels.every(l => s.text.toUpperCase().includes(l.toUpperCase())) && (await page.textContent("#bLang")).trim() === "EN";
  await page.click("#bLang"); s = await st(); const ru = s.text.includes(E.ru[reached][0]) && s.text.includes(Bt.TEXTS.ru.rep_note) && (await page.textContent("#bLang")).trim() === "RU";
  const ruDef = await page.$$eval("#vDef .defb", b => b.map(x => x.innerText));
  await page.click("#bLang"); s = await st(); const pl = s.text.includes(E.pl[reached][0]) && (await page.textContent("#bLang")).trim() === "PL";
  ok("przełącznik PL → EN → RU → PL zmienia objaśnienie i teksty wad (RU z gry)", en && ru && pl && ruDef.some(t => /[а-яё]/i.test(t)), { en, ru, pl });
  // kontrast i rozmiary
  const look = await page.evaluate(() => { const q = s => document.querySelector(s), c = s => getComputedStyle(q(s)).color;
    const r = q("#vDef .defb").getBoundingClientRect(), x = q("#dxClose").getBoundingClientRect();
    return { cols: { dd: c("#dx dd"), dt: c("#dx dt"), note: c("#dxNote"), h3: c("#dx h3"), defb: c("#vDef .defb"), tag: c("#vDef .tag"), more: c("#vDef .more") }, defb: [r.width, r.height], x: [x.width, x.height] }; });
  const worst = Object.entries(look.cols).map(([k, v]) => [k, +contrast(v, "rgb(5,7,9)").toFixed(2)]).sort((a, b) => a[1] - b[1]);
  ok("kontrast tekstu objaśnienia i wad ≥ 4,5:1 na tle #050709", worst[0][1] >= 4.5, worst.slice(0, 3));
  ok("cele ≥ 44×44 px (wada, Zamknij)", look.defb[0] >= 44 && look.defb[1] >= 44 && look.x[0] >= 44 && look.x[1] >= 44, { defb: look.defb, x: look.x });
  if (SHOTS) { await page.mouse.move(5, 5); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(SHOTS, "podglad_komputer_10.png"), fullPage: true }); }
  // Auto 10 kroków: przypięte zostaje, fokus nie ucieka
  await page.click("#bStop"); s = await st(); const kA = s.k;
  await page.focus(`#vDef .defb[data-k="${kA}"]`);
  const n0 = await page.evaluate(() => window.__boty.n);
  await page.evaluate(() => { window.__dxLog = []; const t = setInterval(() => { const dx = document.getElementById("dx"), a = document.activeElement; window.__dxLog.push([dx.hidden, dx.dataset.k, a && a !== document.body]); }, 50); window.__dxStop = () => clearInterval(t); });
  await page.click("#bAuto"); await page.focus(`#vDef .defb[data-k="${kA}"]`).catch(() => {});
  await page.waitForFunction(n => window.__boty.n >= n + 10, n0, { timeout: 60000 });
  await page.click("#bStop");
  const lg = await page.evaluate(() => { window.__dxStop(); return window.__dxLog; });
  // fokus: kliknięcie Auto/Stop przenosi fokus na te przyciski (zamierzone); sprawdzamy tylko, że objaśnienie nie znika ani nie zmienia kodu
  ok(`Auto ${await page.evaluate(() => window.__boty.n) - n0} kroków: przypięte objaśnienie ani razu nie zniknęło i nie zmieniło kodu (${lg.length} próbek co 50 ms)`, lg.length > 20 && lg.every(x => x[0] === false && x[1] === kA), lg.find(x => x[0] || x[1] !== kA));
  const present = await page.$$eval("#vDef .defb", (b, k) => b.some(x => x.dataset.k === k), kA), gone = await page.$("#dxGone");
  ok("po Auto: jeśli wady nie ma w ostatniej próbie — dopisek „w ostatniej próbie tej wady nie ma”, inaczej bez dopisku", present ? !gone : !!gone && (await gone.textContent()).trim() === E.pl.gone, { present });
  // fokus w trakcie przebudowy listy (krok bez klikania myszą): fokus na wadzie zostaje na wadzie tego samego kodu
  const kf = (await page.$$eval("#vDef .defb", b => b.map(x => x.dataset.k)))[0]; await page.focus(`#vDef .defb[data-k="${kf}"]`);
  const nB = await page.evaluate(() => window.__boty.n); await page.evaluate(() => document.getElementById("b1").click()); await page.waitForFunction(n => window.__boty.n === n + 1, nB);
  const af = await page.evaluate(() => { const a = document.activeElement; return a && a.dataset && a.dataset.k ? "defb:" + a.dataset.k : a ? a.id || a.tagName : null; });
  ok("przebudowa listy przy nowej próbie: fokus nie ucieka (ta sama wada albo Zamknij)", af === "defb:" + kf || af === "dxClose", af);
  // przełącznik kb:10
  await page.check("#grace"); await page.click("#b10"); await page.waitForFunction(() => window.__boty.n === 10, null, { timeout: 60000 });
  const lg10 = await page.evaluate(() => JSON.stringify(window.__boty.log));
  const kbCells = await page.$$eval("#logT tr td:nth-child(2)", t => t.map(x => x.textContent));
  ok("przełącznik „Pomijaj zajarzenie”: dziennik = Node Bench(ziarno, kb:10) bit w bit, kolumna kb = 10, znacznik w nagłówku", lg10 === JSON.stringify(new Bt.Bench(SEED, true).step(10).log) && kbCells.length === 30 && kbCells.every(x => x === "10") && (await page.textContent("#logRule")).includes("kb:10"));
  const exShort = await page.evaluate(() => window.__boty.log.filter(e => e.bot === 2 && e.defects.some(d => d.c === "arc_short")).length);
  ok("z flagą egzaminator bez „za krótkiego łuku” (10 prób)", exShort === 0, exShort);
  await page.uncheck("#grace"); const after = await page.evaluate(() => ({ n: window.__boty.n, g: window.__boty.grace }));
  await page.click("#b1"); await page.waitForFunction(() => window.__boty.n === 1);
  ok("wyłączenie przełącznika: od nowa, kb:9 jak gra (= 09)", after.n === 0 && after.g === false && (await page.evaluate(() => JSON.stringify(window.__boty.log))) === JSON.stringify(new Bt.Bench(SEED).step(1).log));
  // telefon
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); watch(ph);
  await ph.goto(BASE + "/boty.html"); await ph.tap("#b1"); await ph.waitForFunction(() => window.__boty.n === 1);
  const pk = await ph.$eval("#vDef .defb", b => b.dataset.k);
  await ph.tap(`#vDef .defb[data-k="${pk}"]`);
  const pst = await ph.evaluate(() => { const dx = document.getElementById("dx"), r = id => document.getElementById(id).getBoundingClientRect(), b = document.querySelector("#vDef .defb").getBoundingClientRect();
    return { hidden: dx.hidden, k: dx.dataset.k, pinned: dx.dataset.pinned, sw: document.documentElement.scrollWidth, iw: innerWidth, defb: [b.width, b.height], x: [r("dxClose").width, r("dxClose").height] }; });
  ok("telefon 390 px: tap otwiera objaśnienie (bez najechania)", !pst.hidden && pst.k === pk && pst.pinned === "1", pst);
  ok("telefon: bez poziomego przewijania przy otwartym objaśnieniu, cele ≥ 44 px", pst.sw <= pst.iw && pst.defb[1] >= 44 && pst.x[0] >= 44 && pst.x[1] >= 44, pst);
  await ph.evaluate(() => document.getElementById("dx").scrollIntoView({ block: "center" }));
  const cover = await ph.evaluate(() => ["bStop", "b1", "bAuto"].map(id => { const r = document.getElementById(id).getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return id + ":" + (e && (e.id === id || document.getElementById(id).contains(e))); })
    .concat((() => { const v = document.getElementById("vIso"); v.scrollIntoView({ block: "center" }); const r = v.getBoundingClientRect(), e = document.elementFromPoint(r.left + 5, r.top + r.height / 2); return ["vIso:" + (e === v || v.contains(e))]; })()));
  ok("telefon: objaśnienie nie zasłania Stop / Krok / Auto ani werdyktu ISO", cover.every(x => x.endsWith(":true")), cover);
  if (SHOTS) { await ph.evaluate(() => document.querySelector("#vDef").scrollIntoView({ block: "start" })); await ph.evaluate(() => window.scrollBy(0, -140)); await ph.screenshot({ path: path.join(SHOTS, "podglad_telefon_10.png"), fullPage: false }); }
  await ph.tap(`#vDef .defb[data-k="${pk}"]`);
  ok("telefon: drugi tap zamyka", await ph.evaluate(() => document.getElementById("dx").hidden));
  // 10_v2 (Grok pkt 1): telefon do 480 px — każdy cel sterowania ≥ 44×44 px, przełącznik razem z etykietą; przyklejony zostaje tylko rząd Stop / Krok / Auto
  for (const W of [360, 390, 480]) { const pw = await browser.newPage({ viewport: { width: W, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); watch(pw);
    await pw.goto(BASE + "/boty.html"); await pw.tap("#b1"); await pw.waitForFunction(() => window.__boty.n === 1);
    const sz = await pw.evaluate(() => { const ids = ["bStop", "b1", "b10", "bAuto", "seed", "bRand", "bReset", "bLang"], o = {};
      for (const i of ids) { const b = document.getElementById(i).getBoundingClientRect(); o[i] = [Math.round(b.width), Math.round(b.height)]; }
      const t = document.querySelector("label.tg").getBoundingClientRect(); o.tg = [Math.round(t.width), Math.round(t.height)];
      o.tgHit = (() => { const e = document.elementFromPoint(t.left + t.width - 8, t.top + t.height / 2); return !!e && (e.id === "grace" || e.closest("label.tg") !== null); })();
      o.sw = document.documentElement.scrollWidth; o.iw = innerWidth; return o; });
    const small = Object.entries(sz).filter(([k, v]) => Array.isArray(v) && (v[0] < 44 || v[1] < 44)).map(([k, v]) => k + ":" + v.join("×"));
    ok(`telefon ${W} px: Stop / Krok 1 / Krok 10 / Auto / ziarno / Losuj / Od nowa / język i „Pomijaj zajarzenie” z etykietą ≥ 44×44`, small.length === 0 && sz.tgHit && sz.sw <= sz.iw, small.length ? small : sz);
    const g0 = await pw.$eval("#grace", e => e.checked); await pw.tap("label.tg", { position: { x: 40, y: 22 } });
    const g1 = await pw.evaluate(() => ({ c: document.getElementById("grace").checked, g: window.__boty.grace })); await pw.tap("label.tg", { position: { x: 40, y: 22 } });
    ok(`telefon ${W} px: tap w tekst etykiety przełącza regułę (i z powrotem)`, !g0 && g1.c && g1.g === true && !(await pw.$eval("#grace", e => e.checked)), g1);
    await pw.evaluate(() => window.scrollTo(0, document.getElementById("vDef").getBoundingClientRect().top + scrollY - 80)); await pw.waitForTimeout(150);
    const st = await pw.evaluate(() => { const bar = document.querySelector(".bar").getBoundingClientRect(), hit = ["bStop", "b1", "b10", "bAuto"].map(id => { const r = document.getElementById(id).getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && e.id === id && r.top >= 0; });
      return { strip: Math.round(Math.max(0, bar.bottom)), hit, y: Math.round(scrollY) }; });
    ok(`telefon ${W} px: po przewinięciu Stop / Krok / Auto przyklejone i klikalne, pasek zajmuje ≤ 64 px`, st.hit.every(Boolean) && st.strip <= 64 && st.y > 100, st);
    await pw.close(); }
  ok("zero błędów konsoli", errs.length === 0, errs.slice(0, 3));
  ok("zero zapytań poza własny serwer (brak sieci / analityki / czcionek)", reqs.length === 0, reqs.slice(0, 3));
  // porównanie PRZED/PO: te same próby egzaminatora bez flagi i z flagą (dane z silnika, render w przeglądarce)
  if (SHOTS) {
    const a = new Bt.Bench(SEED).step(20).log.filter(e => e.bot === 2), b = new Bt.Bench(SEED, true).step(20).log.filter(e => e.bot === 2);
    const cell = e => e.score + " · " + (e.iso === "REJECT" ? "ODRZ." : e.iso) + " · " + (e.defects.filter(d => d.c !== "ok").map(d => Bt.defectText(d, "pl").split(" — ")[0]).join("; ") || "bez wad");
    const rows = a.map((e, i) => `<tr><td>${e.n}</td><td>${e.arcPen}</td><td>${cell(e)}</td><td>${b[i].arcPen}</td><td>${cell(b[i])}</td></tr>`).join("");
    const cp = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await cp.setContent(`<html><body style="margin:0;background:#050709;color:#cfd8de;font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;padding:16px">
      <h2 style="margin:0 0 4px;font-size:15px;letter-spacing:.1em">EGZAMINATOR — TE SAME PRÓBY BEZ FLAGI (kb:9) I Z FLAGĄ (kb:10)</h2>
      <div style="color:#9aa7b0;margin-bottom:10px">ziarno ${SEED} · 20 prób · MMA PA 5 mm · liczy ArcSim.simulate ${require("../sim.js").VERSION} · ${Bt.TEXTS.pl.rep_note}</div>
      <table style="border-collapse:collapse;width:100%">${"<tr>" + ["#", "arcPen PRZED", "PRZED (kb:9): pkt · ISO · wady", "arcPen PO", "PO (kb:10): pkt · ISO · wady"].map(h => `<th style="text-align:left;color:#9aa7b0;border-bottom:1px solid #1a242c;padding:4px 6px">${h}</th>`).join("") + "</tr>"}
      ${rows.replace(/<td>/g, '<td style="border-bottom:1px solid #1a242c;padding:4px 6px;vertical-align:top">')}</table></body></html>`);
    await cp.screenshot({ path: path.join(SHOTS, "porownanie_przed_po_10.png"), fullPage: true }); }
  await browser.close();
  console.log(fail ? `\n✗ ${fail} nie przeszło` : "\n✓ wszystko przeszło"); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
