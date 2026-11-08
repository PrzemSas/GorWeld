/**
 * GORWELD™ ARC — E2E: HISTORIA PRÓB (poprawka 06). Ocena bez zmian — tylko zapis w przeglądarce i porady.
 *
 * Sprawdza prawdziwymi rundami (dotyk, MIG PA 3 mm, za szybko → ta sama wada za każdym razem):
 *  - 3 rundy = 3 wpisy w localStorage "gorweld_history" z kodem wady, wersją silnika i sterowaniem,
 *  - po 3. rundzie raport ma linię "Ćwicz: Najczęstszy błąd ..." (#rHistHint),
 *  - ponowne otwarcie raportu tej samej rundy NIE dodaje wpisu,
 *  - KARIERA pokazuje listę; eksport JSON pobiera plik z 3 wpisami; import złego pliku nic nie zmienia,
 *  - v2 (audyt Codex 06): import nowszej próby + ponowny raport nie gubi jej; pełna pamięć = komunikat o błędzie zapisu,
 *  - v3 (audyt Codex 06 v2): wszystkie pozycje gry (HL045 = rura 6G) w historii; import przy pełnej liście liczy tylko zachowane.
 *  - zablokowany localStorage: runda i raport działają bez błędów JS.
 *   node e2e-history.js http://127.0.0.1:8898
 */
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) { try { ({ chromium } = require(p)); break; } catch (e) {} }
if (!chromium) { console.error("brak playwrighta"); process.exit(2); }
const BASE = process.argv[2]; if (!BASE) { console.error("użycie: node e2e-history.js <baseURL>"); process.exit(2); }
const EXE = process.env.ARC_CHROME, fs = require("fs"), os = require("os"), path = require("path");
let fail = 0; const ok = (n, c, i) => { console.log((c ? "  ✓ " : "  ✗ ") + n + (i !== undefined ? "  " + JSON.stringify(i) : "")); if (!c) fail++; };

async function round(pg, cdp, spd, lift = 0) {   // jedna runda dotykiem, ręka prowadzona zegarem; lift: łuk NAD palcem (px)
  const g = await pg.evaluate(() => { const r = stage.getBoundingClientRect(), k = r.width / W; return { pts: lanePts.map(p => [r.left + p.x * k, r.top + p.y * k]), v: targetPx * k }; });
  const cum = [0]; for (let i = 1; i < g.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(g.pts[i][0] - g.pts[i - 1][0], g.pts[i][1] - g.pts[i - 1][1]));
  const total = cum[cum.length - 1], at = d => { let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const f = Math.min(1, Math.max(0, (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1))); return [g.pts[i - 1][0] + (g.pts[i][0] - g.pts[i - 1][0]) * f, g.pts[i - 1][1] + (g.pts[i][1] - g.pts[i - 1][1]) * f]; };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: g.pts[0][0], y: g.pts[0][1] + lift, id: 1 }] });
  const t0 = Date.now(); for (;;) { const d = Math.min(total, g.v * spd * (Date.now() - t0) / 1000), [x, y] = at(d);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + lift, id: 1 }] }); if (d >= total) break; await pg.waitForTimeout(8); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await pg.waitForTimeout(500);
  await pg.evaluate(() => { if (!document.getElementById("repModal").classList.contains("open")) inspect(); });
  return pg.evaluate(() => ({ hist: (() => { try { return JSON.parse(localStorage.getItem("gorweld_history") || "[]"); } catch (e) { return null; } })(),
    hint: (document.getElementById("rHistHint") || {}).textContent || null, rep: document.getElementById("repModal").classList.contains("open") }));
}
async function next(pg) { await pg.evaluate(() => { closeModal("repModal"); document.getElementById("clear").click(); }); await pg.waitForTimeout(300); }
async function setup(ctx) {
  const pg = await ctx.newPage(); const errs = []; pg.on("pageerror", e => errs.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem("gorweld_tut", "1"); localStorage.setItem("gorweld_lang", "pl"); localStorage.setItem("gorweld_tlift", "0"); } catch (e) {} });
  await pg.goto(BASE + "/index.html"); await pg.waitForTimeout(1500); await pg.evaluate(() => { if (window.openM) closeModal(openM); });
  await pg.click('[data-proc="MIG"]'); await pg.waitForTimeout(150); await pg.click('.thk[data-t="3"]'); await pg.waitForTimeout(150);
  return { pg, errs, cdp: await ctx.newCDPSession(pg) };
}
(async () => {
  const b = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--mute-audio"] }, EXE ? { executablePath: EXE } : {}));
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, acceptDownloads: true }); const { pg, errs, cdp } = await setup(ctx);
    let o; for (let i = 0; i < 3; i++) { o = await round(pg, cdp, 2.4); if (i < 2) await next(pg); }
    const h = o.hist;
    ok("3 rundy = 3 wpisy w historii", h.length === 3, h.length);
    ok("wpis: dotyk, wersja silnika, MIG PA 3 mm, kod wady", h.every(e => e.prof === "t" && /^3\.\d+\.\d+$/.test(e.ver) && e.proc === "MIG" && e.pos === "PA" && e.thick === 3 && e.d.length >= 1), h.map(e => e.d.map(x => x.c).join(",")));
    ok("po 3. rundzie raport: Ćwicz — Najczęstszy błąd …", /Najczęstszy błąd/.test(o.hint || ""), o.hint);
    await pg.evaluate(() => inspect()); const again = await pg.evaluate(() => JSON.parse(localStorage.getItem("gorweld_history")).length);
    ok("ponowne otwarcie raportu tej samej rundy nie dodaje wpisu", again === 3, again);
    await pg.evaluate(() => { closeModal("repModal"); openCareer(); }); await pg.waitForTimeout(300);
    const rows = await pg.evaluate(() => document.querySelectorAll("#histBox .hrow").length);
    ok("KARIERA: lista 3 prób", rows === 3, rows);
    const [dl] = await Promise.all([pg.waitForEvent("download", { timeout: 5000 }), pg.click("#hExpJ")]);
    const fp = path.join(os.tmpdir(), "arc-hist-" + Date.now() + ".json"); await dl.saveAs(fp); const j = JSON.parse(fs.readFileSync(fp, "utf8"));
    ok("eksport JSON: plik z 3 wpisami", j.kind === "history" && j.history.length === 3, j.history && j.history.length);
    const badF = path.join(os.tmpdir(), "arc-zly-" + Date.now() + ".json"); fs.writeFileSync(badF, '{"to nie":"historia"}');
    await pg.setInputFiles("#hFile", badF); await pg.waitForTimeout(400);
    const afterBad = await pg.evaluate(() => JSON.parse(localStorage.getItem("gorweld_history")).length);
    ok("import złego pliku nic nie zmienia", afterBad === 3, afterBad);
    const goodF = path.join(os.tmpdir(), "arc-dobry-" + Date.now() + ".json"); const extra = Object.assign({}, j.history[0], { id: "eeeeeeee", at: j.history[0].at - 86400000, sc: 55 });
    fs.writeFileSync(goodF, JSON.stringify({ history: j.history.concat([extra]) })); await pg.setInputFiles("#hFile", goodF); await pg.waitForTimeout(400);
    const afterGood = await pg.evaluate(() => JSON.parse(localStorage.getItem("gorweld_history")).length);
    ok("import: 1 nowy wpis dodany, 3 duplikaty pominięte", afterGood === 4, afterGood);
    // v2 (audyt Codex 06 #1): import NOWSZEJ próby B, potem ponowne otwarcie raportu tej samej rundy → B zostaje, runda nie dubluje się
    const bF = path.join(os.tmpdir(), "arc-b-" + Date.now() + ".json"); const B = Object.assign({}, j.history[2], { id: "bbbbbbbb", at: j.history[2].at + 3600000, sc: 97 });
    fs.writeFileSync(bF, JSON.stringify({ history: [B] })); await pg.setInputFiles("#hFile", bF); await pg.waitForTimeout(400);
    await pg.evaluate(() => { closeModal("carModal"); inspect(); }); await pg.waitForTimeout(200);
    const hB = await pg.evaluate(() => JSON.parse(localStorage.getItem("gorweld_history")));
    ok("#1 import nowszej B → ponowny raport tej rundy: B zostaje, 5 wpisów, ostatnia runda raz", hB.length === 5 && hB.some(e => e.id === "bbbbbbbb" && e.sc === 97) && hB.filter(e => e.id === j.history[2].id).length === 1, hB.map(e => [e.id, e.sc]));
    // v2 (audyt Codex 06 #4): przeglądarka odmawia zapisu → komunikat o błędzie, nie o sukcesie, historia bez zmian
    await pg.evaluate(() => { closeModal("repModal"); openCareer(); Storage.prototype._set = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error("QuotaExceededError"); }; });
    const qF = path.join(os.tmpdir(), "arc-q-" + Date.now() + ".json"); fs.writeFileSync(qF, JSON.stringify({ history: [Object.assign({}, B, { id: "qqqqqqqq", at: B.at + 60000, sc: 42 })] }));
    await pg.setInputFiles("#hFile", qF); await pg.waitForTimeout(400);
    const q = await pg.evaluate(() => { Storage.prototype.setItem = Storage.prototype._set; return { toast: document.getElementById("toast").textContent, n: JSON.parse(localStorage.getItem("gorweld_history")).length }; });
    ok("#4 pełna pamięć: komunikat „nie zapisała”, historia bez zmian", /nie zapisała/.test(q.toast) && q.n === 5, q);
    // v3 (audyt Codex 06 v2): prawdziwy katalog gry — każda pozycja (w tym HL045 = rura 6G) i materiał przechodzi walidację historii
    const cat = await pg.evaluate(() => { const base = { at: 1700000000000, ver: ArcSim.VERSION, proc: "TIG", thick: 3, joint: "pipe", sc: 90, L: "A", iso: "B", ok: true, prof: "m", mode: "tr", d: [], stop: null };
      const bad = []; Object.keys(POSITIONS).forEach(p => Object.keys(MATERIAL).forEach(m => { if (!histValid(Object.assign({}, base, { pos: p, mat: m }))) bad.push(p + "/" + m); }));
      return { n: Object.keys(POSITIONS).length, hl: "HL045" in POSITIONS, bad }; });
    ok("v3 każda pozycja × materiał z gry (z HL045) przechodzi walidację historii", cat.hl && cat.bad.length === 0, cat);
    // v3: pełna historia 50 + import starszej próby → komunikat bez fałszywego „dodano 1”
    await pg.evaluate(() => { const a = JSON.parse(localStorage.getItem("gorweld_history")); const t0 = Date.now() - 864e5; while (a.length < 50) a.push(Object.assign({}, a[a.length - 1], { id: "fill" + a.length + "x", at: t0 + a.length })); localStorage.setItem("gorweld_history", JSON.stringify(a.sort((p, q) => p.at - q.at))); });
    const before50 = await pg.evaluate(() => localStorage.getItem("gorweld_history"));
    const oF = path.join(os.tmpdir(), "arc-old-" + Date.now() + ".json"); fs.writeFileSync(oF, JSON.stringify({ history: [Object.assign({}, B, { id: "oldoldold", at: 1600000000000 })] }));
    await pg.setInputFiles("#hFile", oF); await pg.waitForTimeout(400);
    const o50 = await pg.evaluate(() => ({ toast: document.getElementById("toast").textContent, n: JSON.parse(localStorage.getItem("gorweld_history")).length, s: localStorage.getItem("gorweld_history") }));
    ok("v3 pełna historia + starsza próba: „Wczytano nowych prób: 0 · … pominięto: 1”, pamięć bez zmian", /prób: 0/.test(o50.toast) && /pominięto: 1/.test(o50.toast) && o50.n === 50 && o50.s === before50, o50.toast);
    ok("zero błędów JS", errs.length === 0, errs.slice(0, 2));
    await ctx.close(); }
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    await ctx.addInitScript(() => { const thr = () => { throw new Error("blocked"); }; try { Object.defineProperty(window, "localStorage", { get: thr }); } catch (e) {} });
    const pg = await ctx.newPage(); const errs = []; pg.on("pageerror", e => errs.push(e.message));
    // bez pamięci gra nie pamięta, że samouczek był widziany — zamykamy wszystkie otwarte okna
    await pg.goto(BASE + "/index.html"); await pg.waitForTimeout(1500); await pg.evaluate(() => { document.querySelectorAll(".modal.open").forEach(m => closeModal(m.id)); });
    await pg.click('[data-proc="MIG"]'); await pg.click('.thk[data-t="3"]'); await pg.waitForTimeout(150);
    const cdp = await ctx.newCDPSession(pg);
    // bez pamięci nie da się wyłączyć „łuku nad palcem" (gorweld_tlift) — palec idzie o TOUCH_LIFT niżej (w px ekranu)
    const lift = await pg.evaluate(() => TOUCH_LIFT);   // TOUCH_LIFT jest w px CSS = px ekranu
    let rep; try { const o = await round(pg, cdp, 1, lift); rep = o.rep && o.hist === null; } catch (e) { rep = "ERR " + String(e).slice(0, 120); }
    await pg.evaluate(() => { closeModal("repModal"); openCareer(); });
    ok("zablokowana pamięć: pełna runda, raport się otwiera, historii brak (bez pamięci)", rep === true, rep);
    ok("zablokowana pamięć: zero błędów JS z historii", !errs.some(e => /hist|localStorage/i.test(e)), errs.slice(0, 2));
    await ctx.close(); }
  await b.close(); console.log(fail ? `\n✗ ${fail} nie przeszło` : "\n✓ przeszło"); process.exit(fail ? 1 : 0);
})();
