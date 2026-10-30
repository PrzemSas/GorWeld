/**
 * GORWELD™ ARC — E2E: BLOKADA PROFILU STEROWANIA (mysz ↔ dotyk) W JEDNEJ PRÓBIE.
 *
 * PO CO TO JEST
 * start() wybiera tryb (mysz = łuk/kąt/spoiwo na żywo, dotyk = demo) przy KAŻDYM zajarzeniu,
 * a nagranie ma flagi arc/ang/tig dla CAŁEJ rundy i sim.js czyta je raz. Zmiana urządzenia
 * w połowie próby przeliczała wcześniejsze ściegi w innym trybie (audyt Codex 2026-10-30, #2).
 * Po poprawce profil jest zamknięty od pierwszego zajarzenia do ✕ WYCZYŚĆ.
 *
 * JAK ODPALIĆ — jak e2e-filler.js (kopia poza repo, serwer HTTP):
 *   ARC_CHROME=<ścieżka do chrome>  node e2e-input-lock.js http://127.0.0.1:8898
 *
 * CZEGO OCZEKIWAĆ (po poprawce)
 *   A mysz→dotyk: tap NIE dokłada zdarzeń do nagrania, toast t_inputlock
 *   B po ✕ WYCZYŚĆ: tap dotykiem działa (nowa próba, nowe nagranie)
 *   C dotyk→mysz: LPM NIE dokłada zdarzeń, toast t_inputlock
 *   D dotyk PRZY PALĄCYM SIĘ ŁUKU z myszy (bez gaszenia — audyt Codex 02): dotyk nie dokłada
 *     zdarzeń, nie zmienia przycisków (btnMask), jego puszczenie nie gasi łuku; mysz dalej spawa
 *   wynik OK (kod 0). Przed poprawką A, C i D przepuszczają obce urządzenie → FAIL (kod 1).
 */
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) {
  try { ({ chromium } = require(p)); break; } catch (e) {}
}
const BASE = process.argv[2] || "http://127.0.0.1:8898";
const EXE = process.env.ARC_CHROME;

async function setup(ctx) {
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem("gorweld_tut", "1"); localStorage.setItem("gorweld_tlift", "0"); } catch (e) {} });   // łuk NAD palcem wyłączony — tap trafia w rowek
  await p.goto(BASE + "/"); await p.waitForTimeout(1200);
  await p.evaluate(() => { try { if (typeof hideSplash === "function") hideSplash(); } catch (e) {}
    document.querySelectorAll(".modal").forEach(m => { try { closeModal(m.id); } catch (e) {} }); });
  await p.click('button.proc[data-proc="MIG"]'); await p.waitForTimeout(300);
  return p;
}
const seam = (p, i) => p.evaluate((i) => { const r = document.querySelector("canvas").getBoundingClientRect(); const s = seamPts[i];
  return { x: r.x + s.x * r.width / W, y: r.y + s.y * r.height / H }; }, i);
const nEv = p => p.evaluate(() => rec ? rec.events.length : 0);
const toastTxt = p => p.evaluate(() => document.getElementById("toast") ? document.getElementById("toast").textContent : "");
const LOCK = p => p.evaluate(() => t("t_inputlock"));
async function mouseBead(p, a, b) {
  const s = await seam(p, a); await p.mouse.move(s.x, s.y); await p.mouse.down();
  for (let i = a + 1; i <= b; i++) { const q = await seam(p, i); await p.mouse.move(q.x, q.y); await p.waitForTimeout(30); }
  await p.mouse.down({ button: "right" }); await p.waitForTimeout(50);   // LPM+PPM gasi łuk
  await p.mouse.up({ button: "right" }); await p.mouse.up(); await p.waitForTimeout(150);
  await p.evaluate(() => { if (welding) { try { end(null); } catch (e) {} } });
}
async function tap(p, i) { const s = await seam(p, i); await p.touchscreen.tap(s.x, s.y); await p.waitForTimeout(150);
  await p.evaluate(() => { if (welding) { try { end(null); } catch (e) {} } }); }

(async () => {
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, hasTouch: true, locale: "pl-PL" });
  const out = {}; let ok = true;

  { const p = await setup(ctx);
    await mouseBead(p, 5, 25);
    out.A_przed = await nEv(p);
    await tap(p, 30);
    out.A_po = await nEv(p); out.A_toast = (await toastTxt(p)) === (await LOCK(p));
    if (out.A_przed < 2 || out.A_po !== out.A_przed || !out.A_toast) ok = false;

    await p.click("#clear"); await p.waitForTimeout(300);
    out.B_poWyczysc = await nEv(p);
    await tap(p, 30);
    out.B_poTap = await nEv(p);
    if (out.B_poWyczysc !== 0 || out.B_poTap < 1) ok = false;

    // C: ta sama runda zaczęta dotykiem → mysz zablokowana
    await mouseBead(p, 40, 50);
    out.C_po = await nEv(p); out.C_toast = (await toastTxt(p)) === (await LOCK(p));
    if (out.C_po !== out.B_poTap || !out.C_toast) ok = false;
    await p.close(); }

  // D: łuk z myszy PALI SIĘ, w tym czasie dotyk (start/ruch/koniec przez CDP) — bez gaszenia łuku
  { const p = await setup(ctx);
    const cdp = await ctx.newCDPSession(p);
    // krótkie LPM = zajarzenie (trzymane LPM dosuwa elektrodę i po chwili przywiera — to nie jest ten test)
    const s0 = await seam(p, 5); await p.mouse.move(s0.x, s0.y); await p.mouse.down(); await p.mouse.up();
    for (let i = 6; i <= 9; i++) { const q = await seam(p, i); await p.mouse.move(q.x, q.y); await p.waitForTimeout(20); }
    out.D_spawa = await p.evaluate(() => welding);
    const nA = await nEv(p), mA = await p.evaluate(() => btnMask);
    const t1 = await seam(p, 60), t2 = await seam(p, 70);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: t1.x, y: t1.y, id: 7 }] }); await p.waitForTimeout(40);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: t2.x, y: t2.y, id: 7 }] }); await p.waitForTimeout(40);
    out.D_maskaPodczasDotyku = await p.evaluate(() => btnMask);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await p.waitForTimeout(60);
    out.D_zdarzeniaOdDotyku = (await nEv(p)) - nA;
    out.D_spawaPoDotyku = await p.evaluate(() => welding);
    out.D_maskaPrzed = mA; out.D_maskaPo = await p.evaluate(() => btnMask);
    const q = await seam(p, 10); await p.mouse.move(q.x, q.y); await p.waitForTimeout(20);
    out.D_myszDalej = (await nEv(p)) - nA;
    if (!out.D_spawa || out.D_zdarzeniaOdDotyku !== 0 || !out.D_spawaPoDotyku || out.D_maskaPodczasDotyku !== mA || out.D_maskaPo !== mA || out.D_myszDalej < 1) ok = false;
    await p.close(); }

  await b.close();
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? "OK" : "FAIL"); process.exit(ok ? 0 : 1);
})();
