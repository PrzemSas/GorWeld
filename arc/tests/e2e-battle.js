// E2E WELD BATTLE: host -> link -> guest -> VS -> link zwrotny + błędne linki.
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) {
  try { ({ chromium } = require(p)); break; } catch (e) {}
}
const BASE = process.argv[2];
const EXE = process.env.ARC_CHROME || "/home/gorweld/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const results = [];
if (!chromium) { console.error("brak playwrighta — zainstaluj albo popraw ścieżkę w require"); process.exit(2); }
if (!BASE) { console.error("użycie: node e2e-battle.js <baseURL>"); process.exit(2); }
const ok = (name, cond, info) => { results.push(!!cond); console.log((cond ? "  ✓ " : "  ✗ ") + name + (info !== undefined ? "  " + JSON.stringify(info) : "")); };

async function open(b, url) {
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const pg = await ctx.newPage();
  pg.errors = [];
  pg.on("pageerror", e => pg.errors.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem("gorweld_tut", "1"); } catch (e) {} });
  await pg.goto(url);
  await pg.waitForTimeout(1800);
  await pg.evaluate(() => { if (window.hideSplash) hideSplash(); if (window.openM && openM !== "battleModal") closeModal(openM); });
  await pg.waitForTimeout(400);
  return pg;
}
// Spawanie po szwie w `strokes` pociągnięciach (każde = osobne zajarzenie).
async function weld(pg, strokes) {
  const seam = await pg.evaluate(() => { const r = stage.getBoundingClientRect(), sx = r.width / W, sy = r.height / H;
    return seamPts.map(p => [r.left + p.x * sx, r.top + p.y * sy]); });
  const per = Math.ceil(seam.length / strokes);
  for (let s = 0; s < strokes; s++) {
    const part = seam.slice(Math.max(0, s * per - 1), (s + 1) * per);
    if (!part.length) break;
    await pg.mouse.move(part[0][0], part[0][1]); await pg.mouse.down();
    for (const pt of part.slice(1)) { await pg.mouse.move(pt[0], pt[1]); await pg.waitForTimeout(25); }
    await pg.mouse.up(); await pg.waitForTimeout(300);
  }
  await pg.waitForTimeout(800);
  const has = await pg.evaluate(() => !!(battleState && battleState.cardView && document.getElementById("battleReportSummary").hidden === false));
  if (!has) { await pg.evaluate(() => document.getElementById("inspect").click()); await pg.waitForTimeout(1200); }
}
const state = pg => pg.evaluate(() => battleState && ({ mode: battleState.mode, ready: battleState.ready, done: battleState.done,
  blocked: battleState.blocked, reason: battleState.reason, detail: battleState.detail,
  battleId: battleState.battleId, taskHash: battleState.taskHash,
  roundInspected: battleState.roundInspected,
  attemptsStarted: battleState.history && battleState.history.attemptsStarted,
  attemptsSaved: battleState.history && battleState.history.attempts && battleState.history.attempts.length,
  attemptNumber: battleState.attemptNumber, shareUrl: battleState.shareUrl,
  view: battleState.cardView && { kind: battleState.cardView.kind, verdict: battleState.cardView.verdict,
    p1: battleState.cardView.player1 && [battleState.cardView.player1.score, battleState.cardView.player1.grade, battleState.cardView.player1.inspectionRejected, battleState.cardView.player1.attemptNumber, battleState.cardView.player1.attemptsStarted],
    p2: battleState.cardView.player2 && [battleState.cardView.player2.score, battleState.cardView.player2.grade, battleState.cardView.player2.inspectionRejected, battleState.cardView.player2.attemptNumber, battleState.cardView.player2.attemptsStarted] },
  summary: document.getElementById("battleReportSummary").textContent, ampDisabled: !!document.querySelector(".ampmode") && document.querySelector(".ampmode").disabled }));
const local = url => url.replace(/^https?:\/\/[^/]+/, BASE);

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--mute-audio"] });

  console.log("== HOST");
  const host = await open(b, BASE + "/index.html");
  await host.click("#battleLaunch"); await host.waitForTimeout(300);
  const friendlyTag = await host.evaluate(() => ({ hidden: document.getElementById("battleModeTag").hidden,
    text: document.getElementById("battleModeTag").textContent }));
  ok("friendly Battle is labelled unverified", !friendlyTag.hidden && friendlyTag.text === "FRIENDLY · UNVERIFIED", friendlyTag);
  const choices = await host.$$eval("#battleTaskChoices button", bs => bs.map(x => x.textContent));
  ok("lista zadań Battle", choices.length === 3, choices);
  await host.click("#battleTaskChoices button >> nth=0"); await host.waitForTimeout(800);
  await host.click("#battlePrimary"); await host.waitForTimeout(400);
  let s = await state(host);
  ok("host gotowy, kontrolki zablokowane", s && s.ready && !s.blocked && s.ampDisabled, s);
  const readyExit = await host.$$eval("#battleTaskChoices button", bs => bs.map(x=>x.textContent));
  ok("TASK READY zawiera wyjście z Battle", readyExit.some(x=>x==="EXIT BATTLE"||x==="WYJDŹ Z BATTLE"||x==="ВЫЙТИ ИЗ BATTLE"), readyExit);
  await weld(host, 3);
  s = await state(host);
  ok("host: 3 pociągnięcia = 1 próba", s.attemptsStarted === 1 && s.view && s.view.p1 && s.view.p1[3] === 1, { attemptsStarted: s.attemptsStarted, p1: s.view && s.view.p1 });
  ok("host: zaproszenie + link", s.done && s.view.kind === "invite" && /#battle=/.test(s.shareUrl || ""), { summary: s.summary, len: (s.shareUrl || "").length });
  const parity = await host.evaluate(() => { const r = ArcSim.simulate(JSON.parse(JSON.stringify(rec))); return { screen: lastReport.score, sim: r.score, events: rec.events.filter(e => e.type === "down").length }; });
  ok("host: parytet ekran = sim.js, nagranie ma wszystkie zajarzenia", parity.screen === parity.sim && parity.events >= 3, parity);
  const hostResult = await state(host);
  const inviteUrl = local(hostResult.shareUrl);
  await host.setViewportSize({ width: 375, height: 760 });
  await host.evaluate(() => buildBattleCard()); await host.waitForTimeout(300);
  const friendlyCardTag = await host.evaluate(() => ({ hidden: document.getElementById("cardBattleModeTag").hidden,
    text: document.getElementById("cardBattleModeTag").textContent }));
  ok("friendly result card is labelled unverified", !friendlyCardTag.hidden && friendlyCardTag.text === "FRIENDLY · UNVERIFIED", friendlyCardTag);
  const cardFit = await host.evaluate(() => {
    const close=document.getElementById("cardClose").getBoundingClientRect();
    const buttons=[...document.querySelectorAll("#cardModal .card .act button")]
      .filter(el=>getComputedStyle(el).display!=="none"&&!el.hidden).map(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});
    lang="ru"; applyI18N(); const ru=[document.getElementById("cardBattleLink").textContent,document.getElementById("cardBattleShare").textContent];
    lang="en"; applyI18N(); const en=[document.getElementById("cardBattleLink").textContent,document.getElementById("cardBattleShare").textContent];
    return { closeInside:close.left>=0&&close.right<=innerWidth&&close.top>=0&&close.bottom<=innerHeight,
      buttonsInside:buttons.length===5&&buttons.every(Boolean),ru,en };
  });
  ok("karta Battle: przyciski mieszczą się przy 375 px, etykiety linków zmieniają język",
    cardFit.closeInside&&cardFit.buttonsInside&&cardFit.ru[0]==="КОПИРОВАТЬ ССЫЛКУ"&&cardFit.ru[1]==="ПОДЕЛИТЬСЯ ССЫЛКОЙ"&&cardFit.en[0]==="COPY BATTLE LINK"&&cardFit.en[1]==="SHARE LINK",cardFit);
  await host.click("#cardClose"); await host.setViewportSize({ width: 1100, height: 760 });
  const exitGuest = await open(b, inviteUrl);
  const exitLabel = await exitGuest.evaluate(() => BATTLE_TEXT[lang].exitBattle);
  await exitGuest.getByRole("button", { name: exitLabel, exact: true }).click(); await exitGuest.waitForTimeout(300);
  const exitState = await exitGuest.evaluate(() => ({ url:location.href, battle:!!battleState, link:BATTLE_LINK_PRESENT,
    ampDisabled:document.querySelector(".ampmode").disabled,rootHidden:document.getElementById("battleModal").hidden,
    hudHidden:document.getElementById("bwHud").getAttribute("aria-hidden")==="true" }));
  await exitGuest.reload(); await exitGuest.waitForTimeout(1800);
  const afterExitReload = await exitGuest.evaluate(() => ({ url:location.href, battle:battleState,
    link:BATTLE_LINK_PRESENT, badgeHidden:document.getElementById("battleBadge").hidden,
    ampDisabled:document.querySelector(".ampmode").disabled }));
  ok("gość może wyjść z Battle; po F5 wraca zwykły ARC",!/#battle=/.test(exitState.url)&&!exitState.battle&&!exitState.link&&!exitState.ampDisabled&&
    exitState.rootHidden&&exitState.hudHidden&&!/#battle=/.test(afterExitReload.url)&&!afterExitReload.battle&&!afterExitReload.link&&afterExitReload.badgeHidden&&!afterExitReload.ampDisabled,
    {exitState,afterExitReload});
  await host.evaluate(() => battleStartClick()); await host.waitForTimeout(250);
  let resultChoices = await host.$$eval("#battleTaskChoices button", bs => bs.map(x => x.textContent));
  ok("wynik hosta: rewanż, nowe zadanie i wyjście", resultChoices.length === 3 && resultChoices.some(x => x === "REWANŻ" || x === "REMATCH") && resultChoices.some(x => x === "NOWE ZADANIE" || x === "NEW TASK") && resultChoices.some(x => x === "WYJDŹ Z BATTLE" || x === "EXIT BATTLE" || x === "ВЫЙТИ ИЗ BATTLE"), resultChoices);
  await host.click("#battleTaskChoices button >> nth=0"); await host.waitForTimeout(800);
  s = await state(host);
  ok("host: rewanż tworzy nowy pojedynek z tym samym zadaniem", s.mode === "host" && !s.done && s.battleId !== hostResult.battleId && s.taskHash === hostResult.taskHash, { mode: s.mode, done: s.done, oldId: hostResult.battleId, newId: s.battleId, sameTaskHash: s.taskHash === hostResult.taskHash });
  await host.click("#battlePrimary"); await host.waitForTimeout(300);
  await weld(host, 3);
  await host.evaluate(() => battleStartClick()); await host.waitForTimeout(250);
  resultChoices = await host.$$eval("#battleTaskChoices button", bs => bs.map(x => x.textContent));
  await host.click("#battleTaskChoices button >> nth=1"); await host.waitForTimeout(300);
  const hostNewTaskChoices = await host.$$eval("#battleTaskChoices button", bs => bs.length);
  ok("wynik hosta: NOWE ZADANIE otwiera picker", hostNewTaskChoices === 3 && !host.errors.length, { choices: hostNewTaskChoices, errors: host.errors, resultChoices });
  console.log("== GUEST");
  const guest = await open(b, inviteUrl);
  s = await state(guest);
  ok("gość: zaproszenie wczytane", s && s.mode === "guest" && !s.blocked, s && { mode: s.mode, reason: s.reason });
  await guest.click("#battlePrimary"); await guest.waitForTimeout(400);
  s = await state(guest);
  ok("gość: zaakceptował", s.ready, { ready: s.ready });
  await weld(guest, 3);
  s = await state(guest);
  ok("gość: VS po 1. próbie", s.view && s.view.kind === "vs" && s.attemptsStarted === 1, { verdict: s.view && s.view.verdict, p1: s.view && s.view.p1, p2: s.view && s.view.p2, summary: s.summary });
  await guest.evaluate(() => inspect()); await guest.waitForTimeout(300);
  if (await guest.locator("#repModal").evaluate(el => el.classList.contains("open"))) await guest.click("#rClose");
  await guest.waitForTimeout(250);
  const closedBefore=await guest.evaluate(()=>({events:rec.events.length,rect:stage.getBoundingClientRect().toJSON(),point:seamPts[Math.floor(seamPts.length/2)],W,H}));
  await guest.mouse.click(closedBefore.rect.left+closedBefore.point.x*closedBefore.rect.width/closedBefore.W,closedBefore.rect.top+closedBefore.point.y*closedBefore.rect.height/closedBefore.H);
  await guest.waitForTimeout(100);
  const closedAfter=await guest.evaluate(()=>({events:rec.events.length,started:battleState.attemptNumber,hint:toast.textContent,expected:bt("attemptClosed")}));
  ok("friendly Battle blocks another stroke on the inspected plate",closedAfter.events===closedBefore.events&&closedAfter.started===1&&closedAfter.hint===closedAfter.expected,{closedBefore,closedAfter});
  await guest.evaluate(() => inspect()); await guest.waitForTimeout(300);
  s = await state(guest);
  ok("gość: podwójny INSPECT nie zapisuje drugi raz i podpowiada CLEAR", s.attemptsStarted === 1 && s.attemptsSaved === 1 && s.view.p2[3] === 1 && await guest.evaluate(() => document.getElementById("toast").textContent===bt("inspectAgain")), { attemptsStarted: s.attemptsStarted, attemptsSaved: s.attemptsSaved, p2: s.view && s.view.p2 });
  // druga próba: nowa runda
  await guest.evaluate(() => { const btn = document.getElementById("clear") || document.querySelector("[data-i18n=btn_clear]"); if (openM) closeModal(openM); if (btn) btn.click(); else clearWeld(); });
  await guest.waitForTimeout(500);
  await weld(guest, 3);
  s = await state(guest);
  ok("gość: 2. próba liczy się jako 2", s.attemptsStarted === 2 && s.view.p2[4] === 2, { attemptsStarted: s.attemptsStarted, p2: s.view && s.view.p2 });
  const returnUrl = local(s.shareUrl || "");

  console.log("== LINK ZWROTNY");
  const back = await open(b, returnUrl);
  s = await state(back);
  ok("link zwrotny: tryb result z VS", s && s.mode === "result" && s.view && s.view.kind === "vs", s && { mode: s.mode, verdict: s.view && s.view.verdict, reason: s.reason });
  const strike = await back.evaluate(() => battleStartAllowed());
  ok("link zwrotny: spawanie zablokowane", strike === false);
  await back.waitForTimeout(300);
  resultChoices = await back.$$eval("#battleTaskChoices button", bs => bs.map(x => x.textContent));
  ok("wynik gościa: rewanż, nowe zadanie i wyjście", resultChoices.length === 3 && resultChoices.some(x => x === "REWANŻ" || x === "REMATCH") && resultChoices.some(x => x === "NOWE ZADANIE" || x === "NEW TASK") && resultChoices.some(x => x === "WYJDŹ Z BATTLE" || x === "EXIT BATTLE" || x === "ВЫЙТИ ИЗ BATTLE"), resultChoices);
  await back.click("#battleTaskChoices button >> nth=0"); await back.waitForTimeout(800);
  s = await state(back);
  ok("gość: rewanż czyści link zwrotny", s.mode === "host" && !s.done && !/#battle=/.test(back.url()), { mode: s.mode, done: s.done, url: back.url() });
  console.log("== BŁĘDNE LINKI");
  const bad = await open(b, BASE + "/index.html#battle=zepsute!!");
  s = await state(bad);
  ok("uszkodzony link -> BATTLE_LINK_INVALID", s && s.reason === "BATTLE_LINK_INVALID", s && s.reason);
  await bad.click("#battleSecondary"); await bad.waitForTimeout(300);
  await bad.click("#clear"); await bad.click("#inspect");
  const badArc = await bad.evaluate(() => { document.querySelector('.thk[data-t="5"]').click(); return { state: battleState && battleState.reason, proc, thick, seed: roundSeed }; });
  ok("zły link: CLEAR, INSPECT i zmiana ustawień działają w zwykłym ARC", badArc.state === "BATTLE_LINK_INVALID" && badArc.thick === 5 && bad.errors.length === 0, { ...badArc, errors: bad.errors });
  const badPicker = await open(b, BASE + "/index.html#battle=zepsute!!");
  await badPicker.click("#battlePrimary"); await badPicker.waitForTimeout(400);
  const pick = await badPicker.$$eval("#battleTaskChoices button", bs => bs.length);
  ok("uszkodzony link -> NEW BATTLE otwiera listę", pick === 3 && badPicker.errors.length === 0, { pick, errors: badPicker.errors });

  console.log("== ZWYKŁE USTAWIENIA + WYJŚCIE Z BATTLE");
  const restore = await open(b, BASE + "/index.html");
  await restore.click("#career"); await restore.waitForTimeout(250);
  await restore.click("#cgrid .coupon >> nth=0"); await restore.waitForTimeout(250);
  await restore.click('.ampmode[data-m="man"]');
  await restore.locator("#ampNum").fill("95"); await restore.locator("#ampNum").dispatchEvent("change");
  await restore.locator("#ampNum").blur();
  const savedSetup = await restore.evaluate(() => ({ proc, joint, pos:posKey, thick, bead, ampMode, ampSet, activeCoupon, roundSeed }));
  await restore.click("#battleLaunch"); await restore.waitForTimeout(250);
  await restore.click("#battleTaskChoices button >> nth=0"); await restore.waitForTimeout(700);
  await restore.click("#battlePrimary"); await restore.waitForTimeout(350);
  await restore.evaluate(() => { progress.done.c1=100; openCareer(); }); await restore.waitForTimeout(250);
  await restore.click("#cgrid .coupon >> nth=1"); await restore.waitForTimeout(250);
  const couponToast = await restore.locator("#toast").textContent();
  await restore.evaluate(() => { openQs(); document.querySelector('.qs-opt[data-qs="MIG"]').click(); });
  await restore.click("#qsGo"); await restore.waitForTimeout(250);
  const blockedFlows = await restore.evaluate(() => ({ proc, activeCoupon, qsProc, modal:openM, toast:document.getElementById("toast").textContent }));
  ok("aktywny Battle blokuje kupon i quickstart osobnym komunikatem", blockedFlows.proc === "MMA" && blockedFlows.activeCoupon === null && blockedFlows.qsProc === "MIG" && blockedFlows.modal === "qsModal" && couponToast === "Career unavailable during Battle" && blockedFlows.toast === "Career unavailable during Battle", {couponToast,...blockedFlows});
  await restore.click("#qsSkip"); await restore.waitForTimeout(300);
  await restore.evaluate(() => { battleAttemptStart(); battleFinishInspection({score:85,letter:"B",coverage:0.95},{rejected:false}); battleStartClick(); });
  await restore.waitForTimeout(300);
  const snapshotBeforeExit = await restore.evaluate(() => ({ roundSeed, snapshot: battleSnapshot && battleSnapshot.roundSeed, welding, stateSeed:battleState&&battleState.task.seed }));
  await restore.click("#battleTaskChoices button >> nth=1"); await restore.waitForTimeout(300);
  const restoredSetup = await restore.evaluate(() => ({ proc, joint, pos:posKey, thick, bead, ampMode, ampSet, ampNum:document.getElementById("ampNum").value, activeCoupon, roundSeed, picker:document.querySelectorAll("#battleTaskChoices button").length }));
  ok("wyjście z Battle przywraca ręczne 95 A, kupon i seed", restoredSetup.proc === savedSetup.proc && restoredSetup.joint === savedSetup.joint && restoredSetup.pos === savedSetup.pos && restoredSetup.thick === savedSetup.thick && restoredSetup.bead === savedSetup.bead && restoredSetup.ampMode === "man" && restoredSetup.ampSet === 95 && restoredSetup.ampNum === "95" && restoredSetup.activeCoupon === "c1" && snapshotBeforeExit.snapshot === savedSetup.roundSeed && restoredSetup.roundSeed === savedSetup.roundSeed && restoredSetup.picker === 3, { savedSetup, snapshotBeforeExit, restoredSetup });

  console.log("== CHALLENGE");
  const challenge = await open(b, BASE + "/index.html?challenge=1");
  const challengeBefore = await challenge.evaluate(() => ({ desktop:getComputedStyle(document.getElementById("battleLaunch")).display, mobile:getComputedStyle(document.getElementById("battleLaunchMobile")).display, seed:roundSeed, challengeSeed:CHALLENGE.seed }));
  await challenge.evaluate(() => battleStartClick()); await challenge.waitForTimeout(250);
  const challengeState = await challenge.evaluate(() => ({ reason:battleState&&battleState.reason, seed:roundSeed, challengeSeed:CHALLENGE.seed }));
  ok("challenge: ukryte ⚔, konflikt nie zmienia seeda konkursu", challengeBefore.desktop === "none" && challengeBefore.mobile === "none" && challengeState.reason === "BATTLE_MODE_CONFLICT" && challengeBefore.seed === 1296914737 && challengeState.seed === 1296914737 && challengeState.challengeSeed === 1296914737, { challengeBefore, challengeState });
  const challengeGuards = await challenge.evaluate(async() => {
    battleOpenTaskPicker(); const picker=battleState.reason;
    await battleStartHost(battleWpsTasks()[0].task); const hostReason=battleState.reason;
    return { picker, host:hostReason, seed:roundSeed, errors:0 };
  });
  ok("challenge: picker i start host zwracają BATTLE_MODE_CONFLICT", challengeGuards.picker === "BATTLE_MODE_CONFLICT" && challengeGuards.host === "BATTLE_MODE_CONFLICT" && challengeGuards.seed === 1296914737 && !challenge.errors.length, challengeGuards);

  const env = JSON.parse(Buffer.from(inviteUrl.split("#battle=")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  const enc = o => BASE + "/index.html#battle=" + Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const eng = await open(b, enc({ ...env, engineVersion: "9.9.9", player1: { ...env.player1, engineVersion: undefined } }));
  s = await state(eng);
  ok("inna wersja silnika -> blokada", s && s.blocked && s.reason === "ENGINE_VERSION_MISMATCH", s && s.reason);
  await eng.click("#battlePrimary"); await eng.waitForTimeout(400);
  const pick2 = await eng.$$eval("#battleTaskChoices button", bs => bs.length);
  ok("blokada preflight -> NEW BATTLE otwiera listę", pick2 === 3 && eng.errors.length === 0, { pick2, errors: eng.errors });
  const tam = await open(b, enc({ ...env, task: { ...env.task, thick: 5 } }));
  s = await state(tam);
  ok("zmienione zadanie bez hasha -> BATTLE_LINK_INVALID", s && s.reason === "BATTLE_LINK_INVALID", s && { reason: s.reason, detail: s.detail });

  for (const [n, pg] of [["host", host], ["gość", guest], ["zwrotny", back]]) ok("brak błędów JS: " + n, pg.errors.length === 0, pg.errors);
  await b.close();
  const pass = results.every(Boolean);
  console.log(pass ? "\n✓ przeszło" : `\n✗ NIE PRZESZŁO (${results.filter(x => !x).length}/${results.length})`);
  process.exit(pass ? 0 : 1);
})();
