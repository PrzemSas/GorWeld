/**
 * GORWELD™ ARC — E2E: POSTÓJ RĘKI (3.15.0, kb:9) — gra na żywo == powtórka (sim.js).
 *
 * PO CO TO JEST
 * Od 3.15.0 fizyka liczy czas także wtedy, gdy mysz stoi: łuk przywiera / rośnie / gaśnie, kąt kręci się
 * z klawiszy, tempo spada, spoiwo TIG podaje się spacją bez ruchu. Gra liczy to timerem, powtórka z czasów
 * zdarzeń — muszą dać TEN SAM werdykt (`window.__parity.diff = []`, poprawka 03), także gdy timer się spóźnia.
 *
 * JAK ODPALIĆ — jak e2e-verdict-parity.js:
 *   node e2e-idle.js http://127.0.0.1:8898 [przypadek]
 *
 * CZEGO OCZEKIWAĆ: w każdym przypadku diff=[] + oczekiwany skutek postoju, wynik ✓ przeszło (kod 0).
 */
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) {
  try { ({ chromium } = require(p)); break; } catch (e) {}
}
if (!chromium) { console.error("brak playwrighta"); process.exit(2); }
const BASE = process.argv[2], ONLY = process.argv[3];
if (!BASE) { console.error("użycie: node e2e-idle.js <baseURL> [przypadek]"); process.exit(2); }
const EXE = process.env.ARC_CHROME;
let fail = 0; const ok = (n, c, i) => { console.log((c ? "  ✓ " : "  ✗ ") + n + (i !== undefined ? "  " + JSON.stringify(i) : "")); if (!c) fail++; };

async function open(b, { proc, thick = 3, bead, touch }) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: !!touch });
  const pg = await ctx.newPage(); const errs = []; pg.on("pageerror", e => errs.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem("gorweld_tut", "1"); localStorage.setItem("gorweld_lang", "pl"); localStorage.setItem("gorweld_tlift", "0"); } catch (e) {} });
  await pg.goto(BASE + "/index.html"); await pg.waitForTimeout(1500);
  await pg.evaluate(() => { if (window.openM) closeModal(openM); });
  await pg.click(`[data-proc="${proc}"]`); await pg.waitForTimeout(150);
  await pg.click(`.thk[data-t="${thick}"]`); await pg.waitForTimeout(150);
  if (bead) { await pg.evaluate(bd => { const x = document.querySelector(`[data-bead="${bd}"]`); x && x.click(); }, bead); await pg.waitForTimeout(150); }
  const g = await pg.evaluate(() => { const r = stage.getBoundingClientRect(), k = r.width / W;
    return { pts: lanePts.map(p => [r.left + p.x * k, r.top + p.y * k]), v: targetPx * k }; });
  const cum = [0]; for (let i = 1; i < g.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(g.pts[i][0] - g.pts[i - 1][0], g.pts[i][1] - g.pts[i - 1][1]));
  const at = d => { let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const f = Math.min(1, Math.max(0, (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1)));
    return [g.pts[i - 1][0] + (g.pts[i][0] - g.pts[i - 1][0]) * f, g.pts[i - 1][1] + (g.pts[i][1] - g.pts[i - 1][1]) * f]; };
  const cdp = touch ? await ctx.newCDPSession(pg) : null;
  const S = { pg, ctx, errs, g, cum, total: cum[cum.length - 1], at, cdp, dist: 0, touch };
  return S;
}
// prowadź rękę ZEGAREM od bieżącej drogi do `upto` (część toru 0..1); mysz dogrywa łuk jak dobry spawacz
async function drive(S, upto, dabMs, gapMs) {   // dabMs: TIG mysz — spacja co tyle ms; gapMs: odstęp między zdarzeniami (rzadkie dostarczanie)
  let lastDabAt = Date.now();
  const { pg, g } = S, end = S.total * upto, d0 = S.dist, t0 = Date.now();
  for (;;) { const d = Math.min(end, d0 + g.v * (Date.now() - t0) / 1000); const [x, y] = S.at(d); S.dist = d;
    if (S.touch) await S.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
    else { const st = await pg.evaluate(() => ({ al: arcLen, L0: arcL0(), w: welding, tig: tigLive }));
      if (!st.w) return false;
      if (!st.tig) { const want = st.al > st.L0; if (want && !S.down) { await pg.mouse.down(); S.down = true; } if (!want && S.down) { await pg.mouse.up(); S.down = false; } }
      await pg.mouse.move(x, y);
      if (dabMs && st.tig && Date.now() - lastDabAt >= dabMs) { await pg.keyboard.press("Space"); lastDabAt = Date.now(); } }
    if (d >= end) return true; await pg.waitForTimeout(gapMs || 8); }
}
async function strike(S) { const [x, y] = S.at(0);
  if (S.touch) await S.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  else { await S.pg.mouse.move(x, y); await S.pg.mouse.down(); S.down = true; } }
async function finish(S) {
  const { pg } = S;
  if (S.touch) await S.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  else { if (await pg.evaluate(() => welding)) { if (!S.down) { await pg.mouse.down(); S.down = true; } await pg.mouse.down({ button: "right" }); await pg.waitForTimeout(60); await pg.mouse.up({ button: "right" }); await pg.mouse.up(); S.down = false; } }
  await pg.waitForTimeout(400);
  const out = await pg.evaluate(() => { if (!document.getElementById("repModal").classList.contains("open")) inspect();
    const P = window.__parity; return { diff: P && P.diff, live: P && P.live, sim: P && P.sim, stick: stickCount, brk: arcBroke, ev: rec.events.length,
      inp: rec.events.filter(e => e.type === "inp").length, kb: rec.kb, baked: baked.length, wa: +waDeg.toFixed(2), pause: pauseNote,
      hint: (document.getElementById("rPauseHint") || {}).textContent || null,
      order: rec.events.every((e, i) => i === 0 || e.t >= rec.events[i - 1].t) }; });
  await S.ctx.close(); return out;
}
const still = (S, ms) => S.pg.waitForTimeout(ms);

const CASES = {
  // LPM wciśnięty, ręka stoi 2 s → przywarcie na żywo, powtórka to samo. ⚠ 2 s, nie mniej: łuk ~1,9 mm schodzi
  // do blachy ~0,8 s (dosuw 3,5 − wzrost 1,0 mm/s), potem ARC_STICK_T 0,8 s w kontakcie. Strażnik 2,5 s jest dalej.
  "mig-lpm-stoi": async b => { const S = await open(b, { proc: "MIG" }); await strike(S); await drive(S, 0.4);
    if (!S.down) { await S.pg.mouse.down(); S.down = true; } await still(S, 500);
    const fb = await S.pg.evaluate(() => speedFb); await still(S, 1500);   // krok E: tempomierz mówi „ręka stoi"
    const w = await S.pg.evaluate(() => welding); await S.pg.mouse.up(); S.down = false;
    const o = await finish(S);
    return [o, o.stick === 1 && !w && /STOI|ZA KRÓTKI/.test(fb || "") && /przywarł/.test(o.hint || ""), { stick: o.stick, weldingPo: w, fb, hint: o.hint }]; },
  // bez przycisków, ręka stoi 1,5 s → łuk rośnie (dłuższy łuk) i nie przywiera
  "mig-bez-przyciskow": async b => { const S = await open(b, { proc: "MIG" }); await strike(S); await drive(S, 0.4);
    if (S.down) { await S.pg.mouse.up(); S.down = false; } const a0 = await S.pg.evaluate(() => arcLen); await still(S, 1500);
    const a1 = await S.pg.evaluate(() => arcLen); await drive(S, 1); const o = await finish(S); return [o, a1 > a0 && o.stick === 0, { a0, a1 }]; },
  // D wciśnięte na postoju 0,5 s → kąt roboczy się zmienia (zdarzenia `inp`)
  "mig-kat-stoi": async b => { const S = await open(b, { proc: "MIG" }); await strike(S); await drive(S, 0.4);
    await S.pg.keyboard.down("KeyD"); await still(S, 500); await S.pg.keyboard.up("KeyD"); await drive(S, 1);
    const o = await finish(S); return [o, o.inp >= 2 && Math.abs(o.wa) > 5, { inp: o.inp, wa: o.wa }]; },
  // timer zablokowany 400 ms w trakcie postoju (pętla w wątku strony) → wynik dalej == powtórka
  "mig-timer-zablokowany": async b => { const S = await open(b, { proc: "MIG" }); await strike(S); await drive(S, 0.5);
    await S.pg.evaluate(() => { const t = performance.now(); while (performance.now() - t < 400) {} }); await still(S, 300);
    await drive(S, 1); const o = await finish(S); return [o, true, {}]; },
  // TIG mysz: 2 spacje na postoju = 2 porcje spoiwa
  "tig-spacja-stoi": async b => { const S = await open(b, { proc: "TIG" }); await strike(S); await S.pg.mouse.up(); S.down = false; await drive(S, 0.3, 110);
    const b0 = await S.pg.evaluate(() => baked.length); await S.pg.keyboard.press("Space"); await still(S, 150); await S.pg.keyboard.press("Space"); await still(S, 150);
    const b1 = await S.pg.evaluate(() => baked.length); await drive(S, 1, 110); const o = await finish(S); return [o, b1 - b0 === 2, { b0, b1 }]; },
  // dotyk: postój 1,5 s w środku → tempo i HI, bez łuku; powtórka to samo
  "dotyk-postoj": async b => { const S = await open(b, { proc: "MIG", touch: true }); await strike(S); await drive(S, 0.5); await still(S, 1500); await drive(S, 1);
    const o = await finish(S); return [o, o.live && o.live.score <= 100 && /Zatrzymałeś rękę na 1,[3-6] s/.test(o.hint || ""), { score: o.live && o.live.score, hint: o.hint }]; },   // prawdziwy postój = wskazówka
  // RZADKIE ZDARZENIA (audyt Codex 04): płynny palec, ale zdarzenia co ~170 ms (> GRACE_MS) — ocena jak przy częstych
  "dotyk-rzadko": async b => { const S1 = await open(b, { proc: "MIG", touch: true }); await strike(S1); await drive(S1, 1); const o1 = await finish(S1);
    const S = await open(b, { proc: "MIG", touch: true }); await strike(S); await drive(S, 1, 0, 170); const o = await finish(S);
    const s1 = o1.live && o1.live.score, s2 = o.live && o.live.score;
    // Pilnujemy kierunku błędu z audytu: rzadkie zdarzenia NIE mogą wypaść gorzej (ani dostać odrzutu, którego nie ma przy częstych).
    // Częste zdarzenia bota bywają niżej (drgania próbek podnoszą niestabilność tempa) — tak było też przed 3.15.0.
    // + audyt Codex 04 v2: płynny ruch dostarczany rzadko NIE może dać wskazówki „zatrzymałeś rękę"
    return [o, Array.isArray(o1.diff) && o1.diff.length === 0 && s2 >= s1 - 4 && o.sim && o1.sim && (!o.sim.rejected || o1.sim.rejected) && !o.hint, { czesto: s1, rzadko: s2, hint: o.hint }]; },
  // dotyk: postój 3 s → łuk gaśnie po 2,5 s (strażnik), dalsza jazda nic nie kładzie
  "dotyk-straznik": async b => { const S = await open(b, { proc: "MIG", touch: true }); await strike(S); await drive(S, 0.4); await still(S, 3000);
    const w = await S.pg.evaluate(() => welding); await drive(S, 1); const o = await finish(S);
    return [o, !w && /zgasł/.test(o.hint || ""), { weldingPo3s: w, hint: o.hint }]; },
  // utrata fokusu (blur) w trakcie spawania → łuk gaśnie bez dodatkowej kary (arcBroke bez zmian)
  "mig-blur": async b => { const S = await open(b, { proc: "MIG" }); await strike(S); await drive(S, 0.5); const br0 = await S.pg.evaluate(() => arcBroke);
    await S.pg.evaluate(() => window.dispatchEvent(new Event("blur"))); const w = await S.pg.evaluate(() => welding);
    const o = await finish(S); return [o, !w && o.brk === br0, { weldingPo: w, brk: o.brk, br0 }]; },
  // (zerowy przejazd nie ma tu przypadku: gra nie robi inspekcji ściegu bez metalu — „POŁÓŻ NAJPIERW ŚCIEG".
  //  Reguła chroni powtórkę / serwer przed spreparowanym nagraniem; sprawdza ją kb9.js B5.)
};
(async () => {
  const b = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--mute-audio"] }, EXE ? { executablePath: EXE } : {}));
  for (const [name, fn] of Object.entries(CASES)) { if (ONLY && ONLY !== name) continue;
    let o, cond, info; try { [o, cond, info] = await fn(b); } catch (e) { ok(`${name}: wyjątek`, false, String(e).slice(0, 200)); continue; }
    console.log(name, JSON.stringify({ kb: o.kb, ev: o.ev, inp: o.inp, live: o.live, sim: o.sim, diff: o.diff, pause: o.pause }));
    ok(`${name}: nagranie kb:9`, o.kb === 9);
    ok(`${name}: czasy zdarzeń nie cofają się (serwer Battle tego wymaga)`, o.order === true);
    ok(`${name}: gra == powtórka (diff=[])`, Array.isArray(o.diff) && o.diff.length === 0, o.diff);
    ok(`${name}: oczekiwany skutek postoju`, !!cond, info); }
  await b.close();
  console.log(fail ? `\n✗ ${fail} nie przeszło` : "\n✓ przeszło"); process.exit(fail ? 1 : 0);
})();
