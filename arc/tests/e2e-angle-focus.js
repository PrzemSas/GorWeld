/**
 * GORWELD™ ARC — E2E: KLAWISZE KĄTA A FOKUS KONTROLEK (odbiór klawisza, nie ocenianie).
 *
 * PO CO TO JEST
 * Dwa błędy z tym samym źródłem — guard w angKey() odrzucał zdarzenie, gdy fokus był na INPUT/SELECT:
 *  A) "suwak": gracz ustawia prąd RĘCZNIE suwakiem #ampRange, fokus zostaje na suwaku (start()
 *     robi preventDefault, klik w planszę go nie zabiera) → przez CAŁĄ spoinę A/D/W/S i strzałki
 *     nie działają, keyMask=0. Znalezione przez Claude 2026-10-30 (rozszerzenie #3 audytu Codex).
 *  B) "keyup": D wciśnięte na planszy, fokus przechodzi do INPUT, D puszczone → bit zostaje,
 *     kąt kręci się sam. Audyt Codex 2026-10-30, #3.
 * Testy jednostkowe czytają nagranie, nie klawiaturę — tego nie widzą. Ten sterownik widzi.
 *
 * ⚠ NIE robić blur() po kliknięciu suwaka — fokus NA SUWAKU jest warunkiem testu (jak w e2e-filler.js).
 *
 * JAK ODPALIĆ — tak jak e2e-filler.js (kopia poza repo, serwer HTTP):
 *   node e2e-angle-focus.js http://127.0.0.1:8898
 *
 * CZEGO OCZEKIWAĆ (po poprawce)
 *   A suwak:  fokus po zajarzeniu = BODY, keyMask po D = 2, w nagraniu są zdarzenia move z k&2
 *   B keyup:  keyMask po puszczeniu D przy fokusie w INPUT = 0
 *   wynik: OK (kod wyjścia 0). Przed poprawką: A daje keyMask 0, B daje 2 → FAIL (kod 1).
 */
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) {
  try { ({ chromium } = require(p)); break; } catch (e) {}
}
const BASE = process.argv[2] || "http://127.0.0.1:8898";

async function setup(b) {
  const p = await b.newPage({ viewport: { width: 1366, height: 768 }, locale: "pl-PL" });
  await p.addInitScript(() => { try { localStorage.setItem("gorweld_tut", "1"); } catch (e) {} });
  await p.goto(BASE + "/"); await p.waitForTimeout(1200);
  await p.evaluate(() => { try { if (typeof hideSplash === "function") hideSplash(); } catch (e) {}
    document.querySelectorAll(".modal").forEach(m => { try { closeModal(m.id); } catch (e) {} }); });
  await p.click('button.proc[data-proc="MMA"]'); await p.waitForTimeout(300);
  return p;
}
async function seamClient(p, i) {
  return p.evaluate((i) => { const r = document.querySelector("canvas").getBoundingClientRect(); const s = seamPts[i];
    return { x: r.x + s.x * r.width / W, y: r.y + s.y * r.height / H }; }, i);
}
const active = p => p.evaluate(() => document.activeElement.id || document.activeElement.tagName);

(async () => {
  const b = await chromium.launch(); const out = {}; let ok = true;

  // A — suwak prądu trzyma fokus
  { const p = await setup(b);
    await p.getByRole("button", { name: /RĘCZNIE/ }).click(); await p.waitForTimeout(200);
    await p.locator("#ampRange").click();
    out.A_fokusPrzed = await active(p);
    const s0 = await seamClient(p, 5); await p.mouse.move(s0.x, s0.y); await p.mouse.down(); await p.waitForTimeout(80);
    out.A_fokusPo = await active(p);
    await p.keyboard.down("KeyD");
    for (let i = 6; i < 20; i++) { const q = await seamClient(p, i); await p.mouse.move(q.x, q.y); await p.waitForTimeout(40); }
    out.A_keyMask = await p.evaluate(() => keyMask);
    out.A_movesZD = await p.evaluate(() => rec ? rec.events.filter(e => e.type === "move" && (e.k | 0) & 2).length : -1);
    await p.keyboard.up("KeyD"); await p.mouse.up();
    if (out.A_fokusPrzed !== "ampRange") { ok = false; out.A_uwaga = "suwak nie dostal fokusu - test nic nie sprawdza"; }
    if (out.A_keyMask !== 2 || out.A_movesZD < 1) ok = false;
    await p.close(); }

  // B — keyup przy fokusie w INPUT
  { const p = await setup(b);
    const s0 = await seamClient(p, 5); await p.mouse.move(s0.x, s0.y); await p.mouse.down(); await p.waitForTimeout(80);
    await p.keyboard.down("KeyD");
    out.B_keyMaskWcisniete = await p.evaluate(() => keyMask);
    // Pole tekstowe dokładane przez test: prawdziwe pola panelu bywają ukryte (display:none nie przyjmie fokusu),
    // a liczy się tylko to, że activeElement to INPUT w chwili puszczenia klawisza.
    await p.evaluate(() => { const i = document.createElement("input"); i.id = "e2eProbe";
      i.style.cssText = "position:fixed;left:2px;top:2px;width:40px;z-index:99999"; document.body.appendChild(i); i.focus(); });
    out.B_fokus = await active(p);
    await p.keyboard.up("KeyD");
    out.B_keyMaskPuszczone = await p.evaluate(() => keyMask);
    await p.mouse.up();
    if (out.B_fokus !== "e2eProbe") { ok = false; out.B_uwaga = "pole nie dostalo fokusu - test nic nie sprawdza"; }
    if (out.B_keyMaskWcisniete !== 2 || out.B_keyMaskPuszczone !== 0) ok = false;
    await p.close(); }

  await b.close();
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? "OK" : "FAIL"); process.exit(ok ? 0 : 1);
})();
