// E2E Battle server. Run from repo root:
// python3 /mnt/c/Users/gorwe/.claude/skills/webapp-testing/scripts/with_server.py \
//   --server "exec env PORT=18899 BATTLE_DEV_ORIGINS=http://127.0.0.1:18898 node battle-server/dev-server.js" --port 18899 \
//   --server "exec python3 -m http.server 18898 --directory arc" --port 18898 -- \
//   node arc/tests/e2e-battle-server.js http://127.0.0.1:18898 http://127.0.0.1:18899
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) {
  try { ({ chromium } = require(p)); break; } catch (e) {}
}
const fs = require("node:fs");
const path = require("node:path");
const Gen = require("./gen.js");
const ArcSimNode = require("../sim.js");
const BASE = process.argv[2];
const API = process.argv[3];
const EXE = process.env.ARC_CHROME || "/home/gorweld/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const SCREEN_DIR = process.env.BATTLE_SCREEN_DIR || path.resolve(__dirname, "../..", "battle-weld-ui", "screens-phase6");
const results = [];
if (!chromium) { console.error("brak playwrighta — użyj ścieżki z e2e-battle.js"); process.exit(2); }
if (!BASE || !API) { console.error("użycie: node e2e-battle-server.js <arcURL> <apiURL>"); process.exit(2); }
const ok = (name, cond, info) => { results.push(!!cond); console.log((cond ? "  ✓ " : "  ✗ ") + name + (info !== undefined ? "  " + JSON.stringify(info) : "")); };
const appUrl = api => BASE + "/index.html?battleApi=" + encodeURIComponent(api);

async function open(browser, url, mobile = false, finePointer = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 375, height: 812 } : { width: 1280, height: 800 },
    isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage(); page.errors = []; page.apiRequests = []; page.attemptRequests=[];page.requests=[];
  page.on("pageerror", error => page.errors.push(error.message));
  page.on("request", request => {page.requests.push(request.url());if (request.url().startsWith(API)) {page.apiRequests.push(request.url());if(request.url().endsWith("/attempts"))try{page.attemptRequests.push(request.postDataJSON());}catch(e){}} });
  // finePointer: urzadzenie dotykowe Z mysza (tablet + mysz) — blokada profilu Pelnego go nie dotyczy
  if (finePointer) await page.addInitScript(() => { const mm=window.matchMedia.bind(window); window.matchMedia=q=>q==="(pointer: fine)"?{matches:true,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}:mm(q); });
  await page.addInitScript(() => { try { localStorage.setItem("gorweld_tut", "1"); localStorage.setItem("gorweld_lang", "en"); } catch (e) {} window.confirm=()=>true; });
  await page.goto(url); await page.waitForTimeout(1100);
  await page.evaluate(() => { if (window.hideSplash) hideSplash(); if (window.openM && openM !== "battleModal") closeModal(openM); });
  return { context, page };
}
async function screenshot(page, name) {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREEN_DIR, name + ".png"), fullPage: true });
}
async function createBattle(page, mode, profile = "full") {
  await page.click("#battleLaunch");
  await page.locator("#battleTaskChoices button").nth(0).click();
  await page.locator("#battleNickname").fill("Night Shift");
  await page.locator("#battleInputProfile").selectOption(profile);
  if (mode === "link") await page.locator("#battleTaskChoices button").nth(1).click();
  await page.click("#battlePrimary");
  if (await page.locator("#battleTitle").textContent() !== "Battle data") {
    await page.waitForFunction(() => document.getElementById("battleTitle").textContent === "Battle data");
  }
  const beforeConsent = page.apiRequests.length;
  await page.click("#battlePrimary");
  try { await page.waitForFunction(() => battleState && battleState.serverMode && battleState.battleId && battleState.inviteUrl, null, { timeout: 7000 }); }
  catch (error) { console.error("create debug:", await page.evaluate(() => ({title:document.getElementById("battleTitle").textContent,message:document.getElementById("battleMessage").textContent,state:battleState,requests:performance.getEntriesByType("resource").filter(x=>x.name.includes(":8899")).map(x=>x.name)}))); throw error; }
  return { id: await page.evaluate(() => battleState.battleId), invite: await page.evaluate(() => battleState.inviteUrl), beforeConsent };
}
async function joinBattle(browser, invite, mobile = false, finePointer = false) {
  const opened = await open(browser, invite, mobile, finePointer); const page = opened.page;
  await page.waitForFunction(() => document.getElementById("battleTitle").textContent === "Battle data");
  const requestsBeforeConsent = page.apiRequests.length;
  await page.click("#battlePrimary");
  await page.waitForFunction(() => battleState && (battleState.serverRole === "joinPreview" || battleState.reason === "MOUSE_REQUIRED"));
  return { ...opened, requestsBeforeConsent };
}
async function drawRound(page, strokes = 3) {
  const seam = await page.evaluate(() => { const r=stage.getBoundingClientRect(), sx=r.width/W, sy=r.height/H;
    return seamPts.map(p=>[r.left+p.x*sx,r.top+p.y*sy]); });
  const per=Math.ceil(seam.length/strokes);
  for(let i=0;i<strokes;i++){
    const part=seam.slice(Math.max(0,i*per-1),(i+1)*per); if(!part.length)break;
    await page.mouse.move(part[0][0],part[0][1]);await page.mouse.down();
    for(const point of part.slice(1)){await page.mouse.move(point[0],point[1]);await page.waitForTimeout(22);}
    await page.mouse.up();await page.waitForTimeout(260);
  }
  await page.waitForTimeout(700);
  return await page.evaluate(() => ({ baked:baked.length, renderWidth:rec&&rec.rw, events:rec&&rec.events.length }));
}
async function holdNextAttempt(page) {
  await page.evaluate(() => {
    const nativeFetch=window.fetch.bind(window);window.__pauseAttempt=true;
    window.fetch=(url,options)=>{
      if(window.__pauseAttempt&&String(url).includes("/attempts")){
        return new Promise((resolve,reject)=>{window.__releaseAttempt=()=>nativeFetch(url,options).then(resolve,reject);});
      }
      return nativeFetch(url,options);
    };
  });
}
async function releaseAttempt(page) {
  await page.evaluate(() => { window.__pauseAttempt=false;if(window.__releaseAttempt)window.__releaseAttempt(); });
}
async function checkAttemptClosed(page, expectedStarted) {
  await page.setViewportSize({width:1280,height:800});
  if (await page.locator("#repModal").evaluate(el => el.classList.contains("open"))) await page.click("#rClose");
  await page.waitForTimeout(250);
  const before=await page.evaluate(()=>({events:rec.events.length,started:battleState.serverAttemptsStarted,
    rect:stage.getBoundingClientRect().toJSON(),point:seamPts[Math.floor(seamPts.length/2)],W,H}));
  await page.mouse.click(before.rect.left+before.point.x*before.rect.width/before.W,before.rect.top+before.point.y*before.rect.height/before.H);
  await page.waitForTimeout(100);
  const blocked=await page.evaluate(()=>({events:rec.events.length,started:battleState.serverAttemptsStarted,hint:toast.textContent,expected:bt("attemptClosed")}));
  ok("server Battle closes the inspected plate without recording another stroke",blocked.events===before.events&&blocked.started===expectedStarted&&blocked.hint===blocked.expected,{before,blocked});
  await page.click("#clear");
  const fresh=await page.evaluate(()=>({rect:stage.getBoundingClientRect().toJSON(),point:seamPts[Math.floor(seamPts.length/2)],W,H}));
  await page.mouse.click(fresh.rect.left+fresh.point.x*fresh.rect.width/fresh.W,fresh.rect.top+fresh.point.y*fresh.rect.height/fresh.H);
  await page.waitForTimeout(100);
  const next=await page.evaluate(()=>({events:rec.events.length,started:battleState.serverAttemptsStarted,welding}));
  ok("CLEAR opens attempt 2 and its first stroke is recorded",next.events>0&&next.started===expectedStarted+1&&next.welding,next);
}
async function inspectRound(page, tamper = false) {
  if(tamper) await page.evaluate(() => {
    const original=battleFinishInspection;
    window.battleFinishInspection=(report,verdict)=>original({...report,score:report.score===100?0:100},verdict);
  });
  await page.evaluate(() => inspect());
}
async function finishBattle(page) {
  if (await page.locator("#repModal").evaluate(el => el.classList.contains("open"))) await page.click("#rClose");
  await page.evaluate(() => battleServerOpenPanel());
  await page.locator("#battleTaskChoices button").filter({ hasText: "FINISH BATTLE" }).click();
}
function qualifiedRounds(task) {
  const candidates=[];
  for(const vFac of [.75,.8,.85,.9,.95,1,1.05,1.1,1.15,1.2,1.3]){
    const rec=Gen.build({...task,vFac,arc:true,ang:true});
    rec.rw=1280;rec.cvn=rec.bead==="steel"?1:0;rec.tig=rec.proc==="TIG"?1:0;
    const result=ArcSimNode.simulate(rec);
    if(result.coverage>=task.requiredCoverage&&result.iso!=="REJECT")candidates.push({rec,score:result.score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  if(candidates.length<2||candidates[0].score===candidates[candidates.length-1].score)throw new Error("Could not generate two distinct qualified ARC rounds");
  return {winner:candidates[0],guest:candidates[candidates.length-1]};
}
async function submitGeneratedRound(page, rec, claimedScore) {
  const span=rec.events[rec.events.length-1].t-rec.events[0].t;
  const remaining=await page.evaluate(roundSpan=>{
    const battle=battleState.serverBattle,start=battle.mode==="sync"?battle.startAt:battle.joinedAt;
    const elapsed=Date.now()+battleServerOffsetMs-Date.parse(start);
    return Math.max(0,roundSpan-elapsed-1800);
  },span);
  if(remaining)await page.waitForTimeout(remaining);
  await page.evaluate(async ({recording,score})=>{
    rec=structuredClone(recording);window.__round=structuredClone(recording);
    await battleServerSubmitAttempt({score});
  },{recording:rec,score:claimedScore});
}
async function waitForReady(page) {
  await page.waitForFunction(() => battleState && battleState.serverMode && battleState.ready && battleState.task && !battleState.done, null, { timeout: 15_000 });
}
async function modalFit(page) {
  return page.evaluate(() => {
    const modal=document.getElementById("battleModal"),card=modal.querySelector(".bw-shell"),r=card.getBoundingClientRect();
    const buttons=[...modal.querySelectorAll("button")].filter(b=>!b.hidden&&getComputedStyle(b).display!=="none");
    return {width:innerWidth,height:innerHeight,modalOpen:modal.classList.contains("open"),cardInside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,
      buttonsReachable:buttons.every(b=>{const q=b.getBoundingClientRect();return q.left>=0&&q.right<=innerWidth&&q.top>=0&&q.bottom<=innerHeight;})};
  });
}

(async()=>{
  const browser=await chromium.launch({executablePath:EXE,args:["--no-sandbox","--mute-audio"]});
  const pages=[];
  try{
    console.log("== guard + sync server battle");
    const hostOpen=await open(browser,appUrl(API));pages.push(hostOpen);const host=hostOpen.page;
    const guards=await host.evaluate(api=>({remote:battleResolveApi("example.com","?battleApi="+encodeURIComponent(api)),
      local:battleResolveApi("localhost","?battleApi="+encodeURIComponent(api))}),API);
    ok("battleApi accepts private LAN page origins and rejects public page hosts",guards.remote===null&&guards.local===API,guards);
    const localizedErrors=await host.evaluate(()=>{
      const oldLang=lang,oldState=battleState,out={};
      for(const locale of ["pl","en","ru"]){
        lang=locale;battleState={serverMode:true,task:{inputProfile:"full"}};
        out[locale]={width:battleServerFriendlyError("INVALID_ATTEMPT","RENDER_WIDTH_UNSUPPORTED"),
          mouse:battleServerFriendlyError("INPUT_PROFILE_MISMATCH"),tooLong:battleServerFriendlyError("INVALID_ATTEMPT","ROUND_TOO_LONG"),
          task:battleServerFriendlyError("INVALID_ATTEMPT","TASK_MISMATCH"),events:battleServerFriendlyError("INVALID_ATTEMPT","EVENT_LIMIT"),
          duplicate:battleServerFriendlyError("DUPLICATE_ATTEMPT"),limit:battleServerFriendlyError("ATTEMPT_LIMIT"),
          finished:battleServerFriendlyError("PLAYER_FINISHED"),decided:battleServerFriendlyError("BATTLE_DECIDED"),
          notStarted:battleServerFriendlyError("BATTLE_NOT_STARTED")};
        battleState.task.inputProfile="touch";out[locale].touch=battleServerFriendlyError("INPUT_PROFILE_MISMATCH");
      }
      lang=oldLang;battleState=oldState;return out;
    });
    ok("server rejection reasons are localized in PL/EN/RU, including profile mismatch",["pl","en","ru"].every(locale=>
      Object.values(localizedErrors[locale]).every(message=>message&& !/RENDER_WIDTH_UNSUPPORTED|INPUT_PROFILE_MISMATCH|ROUND_TOO_LONG|TASK_MISMATCH|EVENT_LIMIT|DUPLICATE_ATTEMPT|ATTEMPT_LIMIT|PLAYER_FINISHED|BATTLE_DECIDED|BATTLE_NOT_STARTED/.test(message))&&localizedErrors[locale].width.includes("400")&&localizedErrors[locale].mouse!==localizedErrors[locale].touch),localizedErrors);
    const created=await createBattle(host,"sync");
    const visualGuards=await host.evaluate(()=>{
      const stageRect=stage.getBoundingClientRect();
      const fontSizes=[...document.fonts].filter(face=>face.family.startsWith("BW")).map(face=>({family:face.family,status:face.status}));
      const requiredFonts=["BWDisplay","BWArchivo","BWMono"].every(family=>fontSizes.some(face=>face.family===family&&face.status==="loaded"));
      const fontRequests=performance.getEntriesByType("resource").filter(entry=>/\/fonts\/.*\.woff2(?:\?|$)/.test(new URL(entry.name).pathname)).map(entry=>new URL(entry.name).pathname);
      const widths=[...document.querySelectorAll("#battleModal button")].filter(button=>!button.hidden).map(button=>{const r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;});
      return {root:document.getElementById("battleModal").id,fonts:fontSizes,requiredFonts,fontRequests,buttonWidths:widths};
    });
    ok("Battle uses its isolated root and self-hosted fonts; controls stay in viewport",visualGuards.root==="battleModal"&&visualGuards.requiredFonts&&visualGuards.fontRequests.length>=3&&visualGuards.fontRequests.every(url=>url.startsWith("/fonts/"))&&visualGuards.buttonWidths.every(Boolean),visualGuards);
    ok("host consent precedes first server request",created.beforeConsent===0);
    ok("server battle saved credentials and invite link",await host.evaluate(id=>{
      const c=JSON.parse(sessionStorage.getItem("gorweld_bw_"+id));return !!(c&&c.playerSecret&&c.slot==="P1"&&battleState.inviteUrl.includes("#bw="+id+"."));
    },created.id));

    // 05.10 (zgloszenie z live): telefon w pojedynku z profilem Pelnym dostaje blokade dolaczenia zamiast cichego ostrzezenia —
    // inaczej spawal, a serwer odrzucal kazda probe (INPUT_PROFILE_MISMATCH) i gracz mial 0 prob.
    const phoneOpen=await joinBattle(browser,created.invite,true);pages.push(phoneOpen);const phone=phoneOpen.page;
    ok("guest consent precedes first server request",phoneOpen.requestsBeforeConsent===0);
    await screenshot(phone,"join-mobile-375");
    const blocked=await phone.evaluate(()=>({message:document.getElementById("battleMessage").textContent,primaryHidden:document.getElementById("battlePrimary").hidden,
      exit:!document.getElementById("battleSecondary").hidden,blocked:!!(battleState&&battleState.blocked&&battleState.reason==="MOUSE_REQUIRED"),joined:!!(battleState&&battleState.slot)}));
    ok("phone cannot join a Full-profile battle and is told why (no wasted attempts)",blocked.blocked&&blocked.primaryHidden&&blocked.exit&&!blocked.joined&&blocked.message.includes("Touch profile"),blocked);
    let fit=await modalFit(phone);ok("join screen fits 375 px",fit.cardInside&&fit.buttonsReachable,fit);
    const guestOpen=await joinBattle(browser,created.invite,false);pages.push(guestOpen);const guest=guestOpen.page;
    await screenshot(guest,"join-desktop");
    ok("join screen is actually visible on a desktop guest (modal open AND displayed)",await guest.evaluate(()=>{const m=document.getElementById("battleModal");return m.classList.contains("open")&&getComputedStyle(m).display!=="none";}));
    const preview=await guest.evaluate(()=>({message:document.getElementById("battleMessage").textContent,tagHidden:document.getElementById("battleModeTag").hidden,tag:document.getElementById("battleModeTag").textContent}));
    const previewLines=await guest.evaluate(()=>getComputedStyle(document.getElementById("battleMessage")).whiteSpace);
    ok("join preview shows task, replay profile, player 1 and verification mode",preview.message.includes("Task:")&&preview.message.includes("full")&&preview.message.includes("Night Shift")&&!preview.tagHidden&&preview.tag==="SERVER · VERIFIED"&&previewLines==="pre-line",{...preview,previewLines});
    // gracz 2 wpisuje nick przy dolaczaniu; profil odtworzenia ukryty (ustala go gracz 1)
    const joinFields=await guest.evaluate(()=>({nick:getComputedStyle(document.getElementById("battleNickname")).display!=="none"&&!document.getElementById("battleServerFields").hidden,
      profileHidden:getComputedStyle(document.getElementById("battleInputProfile").closest("label")).display==="none",label:document.getElementById("battleNicknameLabel").textContent}));
    await guest.fill("#battleNickname","Arc Runner");
    await guest.click("#battlePrimary");
    await guest.waitForFunction(()=>battleState&&battleState.slot==="P2"&&battleState.serverBattle&&battleState.serverBattle.state==="JOINED");
    const p2Nick=await guest.evaluate(()=>battleState.serverBattle.players.P2&&battleState.serverBattle.players.P2.nickname);
    ok("player 2 can type a nickname on the join screen and the server stores it",joinFields.nick&&joinFields.profileHidden&&p2Nick==="Arc Runner",{joinFields,p2Nick});
    const afterJoin=await guest.evaluate(()=>({hash:location.hash,secret:location.hash.includes("."),taskSeed:battleState.task&&battleState.task.seed}));
    ok("join consumes invite and removes secret from URL",afterJoin.hash==="#bw="+created.id&&!afterJoin.secret,afterJoin);

    await host.waitForFunction(()=>battleState&&battleState.serverBattle&&battleState.serverBattle.players.P2);
    await host.check("#bwHelmetCheck");await host.check("#bwGlovesCheck");await host.click("#battlePrimary");
    await guest.check("#bwHelmetCheck");await guest.check("#bwGlovesCheck");await guest.click("#battlePrimary");
    await host.waitForFunction(()=>document.getElementById("battleMessage").textContent.includes("Starting in 3"),null,{timeout:7000});
    await guest.waitForFunction(()=>document.getElementById("battleMessage").textContent.includes("Starting in 3"),null,{timeout:7000});
    await guest.setViewportSize({width:375,height:812});
    await screenshot(host,"countdown-desktop");await screenshot(guest,"countdown-mobile-375");
    fit=await modalFit(guest);ok("countdown screen fits 375 px",fit.cardInside&&fit.buttonsReachable,fit);
    await guest.setViewportSize({width:1280,height:800});
    await Promise.all([waitForReady(host),waitForReady(guest)]);
    await host.waitForTimeout(250);await guest.waitForTimeout(250);
    await guest.setViewportSize({width:375,height:812});
    const narrowStart=await guest.evaluate(()=>({allowed:battleStartAllowed(),message:toast.textContent,welding}));
    ok("server battle blocks strike below 400 px with localized guidance",!narrowStart.allowed&&narrowStart.message.includes("400")&&!narrowStart.welding,narrowStart);
    await guest.setViewportSize({width:1280,height:800});
    const rounds=await Promise.all([drawRound(host),drawRound(guest)]);
    ok("both recorded real ARC rounds at replayable width",rounds.every(r=>r.baked>=10&&r.renderWidth>=400),rounds);
    await Promise.all([holdNextAttempt(host),holdNextAttempt(guest)]);
    await Promise.all([inspectRound(host),inspectRound(guest)]);
    await Promise.all([host.waitForFunction(()=>document.querySelector("#repModal #battleReportSummary").textContent.includes("VERIFYING")),
      guest.waitForFunction(()=>document.querySelector("#repModal #battleReportSummary").textContent.includes("VERIFYING"))]);
    await guest.setViewportSize({width:375,height:812});
    await screenshot(host,"verifying-desktop");await screenshot(guest,"verifying-mobile-375");
    const reportFits=await guest.evaluate(()=>{const r=document.querySelector("#repModal .card").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});
    ok("verification screen fits 375 px",reportFits);
    await Promise.all([releaseAttempt(host),releaseAttempt(guest)]);
    await Promise.all([host.waitForFunction(()=>battleState.serverLastAttempt&&battleState.serverBattle.players.P1.best),
      guest.waitForFunction(()=>battleState.serverLastAttempt&&battleState.serverBattle.players.P2.best)]);
    const parity=await Promise.all([host,guest].map(page=>page.evaluate(()=>({live:lastReport.score,server:battleState.serverLastAttempt.score,
      replay:ArcSim.simulate(window.__round).score,bp:battleState.serverLastAttempt.battlePoints}))));
    ok("server attempt score matches screen and sim.js",parity.every(x=>x.live===x.server&&x.replay===x.server&&x.bp===x.server*10),parity);
    // 05.10 (zgloszenie z live): przycisk „WYNIK SERWERA” w raporcie otwiera pokoj pojedynku, a nie blad „Link Battle jest uszkodzony”
    { const btn=await host.evaluate(()=>{const b=document.getElementById("rBattleShare");return {shown:!b.hidden&&document.getElementById("repModal").classList.contains("open"),text:b.textContent};});
      await host.evaluate(()=>{toast.textContent="";document.getElementById("rBattleShare").click();});await host.waitForTimeout(300);
      const after=await host.evaluate(()=>({room:document.getElementById("battleModal").classList.contains("open"),rep:document.getElementById("repModal").classList.contains("open"),toast:toast.textContent,badLink:bt("badLink"),title:document.getElementById("battleTitle").textContent}));
      ok("SERVER RESULT button opens the battle room instead of a broken-link error",btn.shown&&after.room&&!after.rep&&after.toast!==after.badLink,{btn,after});
      await host.evaluate(()=>closeModal("battleModal"));await host.waitForTimeout(300); }
    await checkAttemptClosed(host,1);await checkAttemptClosed(guest,1);
    await Promise.all([finishBattle(host),finishBattle(guest)]);
    await Promise.all([host.waitForFunction(()=>battleState&&battleState.serverBattle&&battleState.serverBattle.verdict),
      guest.waitForFunction(()=>battleState&&battleState.serverBattle&&battleState.serverBattle.verdict)]);
    const verdicts=await Promise.all([host,guest].map(page=>page.evaluate(()=>({code:battleState.serverBattle.verdict.code,
      localCard:battleState.cardView&&battleState.cardView.verdict,summary:document.getElementById("battleModalSummary").textContent}))));
    ok("both screens render the same server verdict",verdicts[0].code===verdicts[1].code&&verdicts.every(v=>v.localCard===v.code),verdicts);
    const serverVerdictChrome=await host.evaluate(()=>({tagHidden:document.getElementById("battleModeTag").hidden,
      tagText:document.getElementById("battleModeTag").textContent,
      fieldsHidden:document.getElementById("battleServerFields").hidden,
      friendlyDisplay:getComputedStyle(document.getElementById("battleModeTag")).display,
      fieldsDisplay:getComputedStyle(document.getElementById("battleServerFields")).display}));
    ok("server verdict shows VERIFIED tag and hides host-only fields",!serverVerdictChrome.tagHidden&&serverVerdictChrome.tagText==="SERVER · VERIFIED"&&serverVerdictChrome.fieldsHidden&&
      serverVerdictChrome.friendlyDisplay!=="none"&&serverVerdictChrome.fieldsDisplay==="none",serverVerdictChrome);
    await host.setViewportSize({width:1280,height:800});await guest.setViewportSize({width:375,height:812});
    await screenshot(host,"verdict-desktop");await screenshot(guest,"verdict-mobile-375");
    fit=await modalFit(guest);ok("verdict screen fits 375 px",fit.cardInside&&fit.buttonsReachable,fit);
    await host.reload();await host.waitForFunction(()=>battleState&&battleState.serverMode&&battleState.serverBattle&&battleState.serverBattle.verdict);
    ok("host reload resumes from stored credentials and #bw id",await host.evaluate(id=>location.hash==="#bw="+id&&battleState.slot==="P1",created.id));
    const stageGuard=await host.evaluate(()=>{
      const before=stage.getBoundingClientRect().toJSON();battleState.hudActive=true;battleUiUpdateHud();
      const on=stage.getBoundingClientRect().toJSON();battleState.hudActive=false;battleUiUpdateHud();const off=stage.getBoundingClientRect().toJSON();
      document.body.classList.add("battle-active","bw-welding");
      return {same:JSON.stringify(before)===JSON.stringify(on)&&JSON.stringify(before)===JSON.stringify(off),hidden:document.getElementById("bwHud").getAttribute("aria-hidden")==="true",
        share:[document.getElementById("battleShareCanvas").width,document.getElementById("battleShareCanvas").height]};
    });
    ok("Battle HUD does not resize the ARC stage; share canvas is 1200×675",stageGuard.same&&stageGuard.hidden&&stageGuard.share[0]===1200&&stageGuard.share[1]===675,stageGuard);
    await host.setViewportSize({width:1280,height:560});
    const hudHidden=await host.evaluate(()=>({display:getComputedStyle(document.getElementById("bwHud")).display,classes:document.body.className}));
    ok("LIVE strip is hidden at max-height 560 px",hudHidden.display==="none",hudHidden);
    await host.evaluate(()=>document.body.classList.remove("battle-active","bw-welding"));await host.setViewportSize({width:1280,height:800});
    ok("sync pages have no uncaught JS errors",host.errors.length===0&&guest.errors.length===0,{host:host.errors,guest:guest.errors});

    console.log("== link mode + authoritative score tamper");
    const linkHostOpen=await open(browser,appUrl(API));pages.push(linkHostOpen);const linkHost=linkHostOpen.page;
    const linkBattle=await createBattle(linkHost,"link");
    const linkGuestOpen=await joinBattle(browser,linkBattle.invite,true,true);pages.push(linkGuestOpen);const linkGuest=linkGuestOpen.page;
    await linkGuest.evaluate(()=>document.getElementById("battlePrimary").click());
    await linkGuest.waitForFunction(()=>battleState&&battleState.slot==="P2"&&battleState.serverBattle&&battleState.serverBattle.state==="JOINED");
    await linkGuest.setViewportSize({width:1280,height:800});
    await Promise.all([linkHost.waitForFunction(()=>battleState&&battleState.ready&&battleState.task),
      linkGuest.waitForFunction(()=>battleState&&battleState.ready&&battleState.task)]);
    await linkHost.waitForTimeout(200);await linkGuest.waitForTimeout(200);
    const linkRound=await drawRound(linkGuest);
    ok("link mode opens welding after P2 joins without READY",linkRound.baked>=10&&await linkGuest.evaluate(()=>battleState.serverBattle.state==="JOINED"));
    await inspectRound(linkGuest,true);
    await linkGuest.waitForFunction(()=>battleState.serverLastAttempt&&document.querySelector("#repModal #battleReportSummary").textContent.includes("SERVER RESULT"),null,{timeout:15000});
    const tamper=await linkGuest.evaluate(()=>({shown:battleState.serverLastAttempt.score,replay:ArcSim.simulate(window.__round).score}));
    const claimed=linkGuest.attemptRequests.at(-1)&&linkGuest.attemptRequests.at(-1).clientScore;
    ok("tampered displayed score cannot override server replay",claimed===100&&tamper.shown===tamper.replay&&tamper.shown!==claimed,{...tamper,submittedClientScore:claimed});
    await checkAttemptClosed(linkGuest,1);
    const task=await linkHost.evaluate(()=>battleState.task);
    const generated=qualifiedRounds(task);
    await submitGeneratedRound(linkHost,generated.winner.rec,generated.winner.score);
    await submitGeneratedRound(linkGuest,generated.guest.rec,100);
    await Promise.all([linkHost.waitForFunction(()=>battleState.serverBattle.players.P1.best&&battleState.serverBattle.players.P2.best&&battleState.serverBattle.players.P2.best.qualified),
      linkGuest.waitForFunction(()=>battleState.serverBattle.players.P1.best&&battleState.serverBattle.players.P2.best&&battleState.serverBattle.players.P2.best.qualified)]);
    const qualified=await Promise.all([linkHost,linkGuest].map(page=>page.evaluate(()=>({guestBest:battleState.serverBattle.players.P2.best.score,
      guestQualified:battleState.serverBattle.players.P2.best.qualified,attemptSummary:document.getElementById("battleReportSummary").textContent}))));
    const qualifiedClaim=linkGuest.attemptRequests.at(-1)&&linkGuest.attemptRequests.at(-1).clientScore;
    ok("qualified gen.js rounds replay and guest claim 100 is replaced",qualifiedClaim===100&&qualified.every(x=>x.guestBest===generated.guest.score&&x.guestQualified)&&qualified[1].attemptSummary.includes(String(generated.guest.score)),{expectedGuest:generated.guest.score,expectedWinner:generated.winner.score,qualifiedClaim,qualified});
    await finishBattle(linkHost);await finishBattle(linkGuest);
    await Promise.all([linkHost.waitForFunction(()=>battleState.serverBattle.verdict),linkGuest.waitForFunction(()=>battleState.serverBattle.verdict)]);
    const qualifiedVerdicts=await Promise.all([linkHost,linkGuest].map(page=>page.evaluate(()=>({code:battleState.serverBattle.verdict.code,
      summary:document.getElementById("battleModalSummary").textContent}))));
    ok("both verdict screens show the same qualified P1_WINS with server scores and nicknames",qualifiedVerdicts.every(v=>v.code==="P1_WINS"&&v.summary.includes("Night Shift")&&v.summary.includes(String(generated.winner.score))&&v.summary.includes(String(generated.guest.score))),qualifiedVerdicts);

    console.log("== touch profile: computer (mouse) vs computer");
    // 05.10 (zgloszenie z live: GorWeld na komputerze mial 0 prob w pojedynku z profilem Dotykowym) —
    // mysz w pojedynku Dotykowym spawa jak palec, wiec serwer przyjmuje probe (rec.arc/ang = 0).
    { const tHostOpen=await open(browser,appUrl(API));pages.push(tHostOpen);const tHost=tHostOpen.page;
      const tBattle=await createBattle(tHost,"link","touch");
      const tGuestOpen=await joinBattle(browser,tBattle.invite,false);pages.push(tGuestOpen);const tGuest=tGuestOpen.page;
      await tGuest.evaluate(()=>document.getElementById("battlePrimary").click());
      await tGuest.waitForFunction(()=>battleState&&battleState.slot==="P2"&&battleState.ready&&battleState.task,null,{timeout:15000});
      await tGuest.waitForTimeout(200);await drawRound(tGuest);
      await tGuest.evaluate(()=>{if(!battleState.roundInspected)inspect();});
      await tGuest.waitForFunction(()=>battleState.serverLastAttempt,null,{timeout:15000}).catch(()=>{});
      const sent=tGuest.attemptRequests.at(-1)&&tGuest.attemptRequests.at(-1).rec;
      const res=await tGuest.evaluate(()=>({accepted:!!battleState.serverLastAttempt,profile:battleState.serverBattle.inputProfile,count:battleState.serverBattle.players.P2.attemptsCount}));
      ok("Touch-profile battle: a mouse attempt from a computer is recorded as touch and accepted by the server",sent&&sent.arc!==1&&sent.ang!==1&&res.accepted&&res.profile==="touch",{arc:sent&&sent.arc,ang:sent&&sent.ang,...res}); }

    console.log("== unavailable server");
    const downOpen=await open(browser,appUrl("http://127.0.0.1:1"));pages.push(downOpen);const down=downOpen.page;
    await down.click("#battleLaunch");await down.locator("#battleTaskChoices button").nth(0).click();await down.click("#battlePrimary");
    await down.waitForFunction(()=>document.getElementById("battleTitle").textContent==="Battle data");await down.click("#battlePrimary");
    await down.waitForFunction(()=>battleState&&battleState.serverMode&&battleState.reason==="SERVER_UNAVAILABLE");
    const unavailable=await down.evaluate(()=>({message:document.getElementById("battleMessage").textContent,mode:battleState.mode,local:battleState.localMode}));
    ok("server outage is clear and never falls back to friendly",unavailable.message.includes("unavailable")&&unavailable.local!==true,unavailable);
    ok("server-down page has no uncaught JS errors",down.errors.length===0,down.errors);
    const allowedOrigins=new Set([new URL(BASE).origin,new URL(API).origin,"http://localhost","http://127.0.0.1"]);
    const nonLocal=pages.flatMap(({page})=>page.requests).filter(url=>{try{const parsed=new URL(url);
      return !allowedOrigins.has(parsed.origin)&&!["localhost","127.0.0.1","[::1]"].includes(parsed.hostname);}catch(e){return false;}});
    ok("full server Battle flow makes no off-origin requests (same-origin private LAN accepted)",nonLocal.length===0,{allowed:[...allowedOrigins],nonLocal});
  }catch(error){
    console.error("E2E exception:",error&&error.stack||error);results.push(false);
  }finally{
    for(const item of pages){try{await item.context.close();}catch(e){}}
    await browser.close();
  }
  const pass=results.every(Boolean);console.log(pass?`\n✓ przeszło (${results.length})`:`\n✗ NIE PRZESZŁO (${results.filter(x=>!x).length}/${results.length})`);
  process.exit(pass?0:1);
})();
