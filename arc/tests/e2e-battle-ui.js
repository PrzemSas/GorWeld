// Battle Weld Phase 6 visual/accessibility pass. Screens use real Battle renderers with fixture data.
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) {
  try { ({ chromium } = require(p)); break; } catch (_) {}
}
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.argv[2];
const OUT = process.env.BATTLE_SCREEN_DIR || path.resolve(__dirname, "../..", "battle-weld-ui", "screens-phase6");
const EXE = process.env.ARC_CHROME || "/home/gorweld/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const results = [];
if (!chromium || !BASE) { console.error("usage: node e2e-battle-ui.js <baseURL>"); process.exit(2); }
const ok = (name, pass, data) => { results.push(!!pass); console.log((pass ? "  ✓ " : "  ✗ ") + name + (data === undefined ? "" : "  " + JSON.stringify(data))); };

function fixtureTask(){return {seed:1296914737,proc:"MMA",joint:"butt",pos:"PA",thick:3,bead:"steel",amps:60,ampMode:"auto",W:1280,H:720,requiredCoverage:.8};}
function fixtureAttempt(nickname,score,bp,at){return {nickname,score,grade:score>=90?"A":"B",inspectionRejected:false,taskCompleted:true,qualified:true,
  bp,battlePoints:bp,attemptNumber:1,attemptsStarted:1,serverTime:at};}

(async()=>{
  const browser=await chromium.launch({executablePath:EXE,args:["--no-sandbox","--mute-audio"]});
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();
  const errors=[],requests=[],battleAssetRequests=[],battleAssetResponses=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("request",r=>{requests.push(r.url());if(new URL(r.url()).pathname.includes("/battle-assets/"))battleAssetRequests.push(r.url());});
  page.on("response",r=>{if(new URL(r.url()).pathname.includes("/battle-assets/"))battleAssetResponses.push((async()=>({url:r.url(),status:r.status(),bytes:(await r.body()).byteLength}))().catch(()=>({url:r.url(),status:r.status(),bytes:0})));});
  await page.addInitScript(()=>{try{localStorage.setItem("gorweld_tut","1");localStorage.setItem("gorweld_lang","en");}catch(_){} });
  await page.goto(BASE+"/index.html");await page.waitForTimeout(1050);
  await page.evaluate(()=>{if(window.hideSplash)hideSplash();if(openM)closeModal(openM);});
  const normalAssetRequests=battleAssetRequests.length;
  ok("normal ARC load requests no Battle assets",normalAssetRequests===0,{battleAssetRequests:normalAssetRequests});
  await page.locator("#battleLaunch").click({force:true});
  await page.waitForSelector("#battleModal.open");
  await page.waitForTimeout(900);
  await page.evaluate(async()=>Promise.all([...document.querySelectorAll("#battleModal img[src*='/battle-assets/']")].map(img=>img.decode().catch(()=>null))));
  const gateOpened=await page.evaluate(()=>({played:document.getElementById("battleModal").dataset.gatesPlayed,open:document.getElementById("battleModal").classList.contains("bw-gates-open"),images:["bwGateLeft","bwGateRight"].map(id=>document.getElementById(id).naturalWidth>0)}));
  ok("ENTER gate halves load and slide apart once",gateOpened.played==="1"&&gateOpened.open&&gateOpened.images.every(Boolean),gateOpened);
  const openingAssets=await Promise.all(battleAssetResponses);
  const openingAssetBytes=openingAssets.reduce((sum,item)=>sum+item.bytes,0);
  const openingAssetExternal=openingAssets.filter(item=>new URL(item.url).origin!==new URL(BASE).origin);
  ok("opening Battle loads only successful same-origin assets",openingAssets.length>0&&openingAssets.every(item=>item.status===200)&&openingAssetExternal.length===0,{count:openingAssets.length,external:openingAssetExternal,transferredImageBytes:openingAssetBytes,assets:openingAssets.map(({url,status,bytes})=>({path:new URL(url).pathname,status,bytes}))});
  ok("Battle logo has accessible name",await page.getByRole("img",{name:"BATTLE WELD"}).count()===1);
  const battleTasks=await page.evaluate(()=>battleWpsTasks().map(item=>({label:battleTaskLabel(item.task),thick:item.task.thick})));
  ok("every Battle task is a single pass (thick <= 3 mm, no root+cap)",battleTasks.length===3&&battleTasks.every(task=>task.thick<=3),battleTasks);

  async function render(name,locale){
    await page.evaluate(({name,locale,task})=>{
      if(openM)closeModal(openM);battleReset();
      lang=locale;applyI18N();soundOn=false;
      const p1={nickname:"Night Shift",score:94,grade:"A",inspectionRejected:false,taskCompleted:true,qualified:true,bp:940,battlePoints:940,attemptNumber:1,attemptsStarted:1,serverTime:"2026-10-03T12:00:00.000Z"};
      const p2={nickname:"Arc Runner",score:88,grade:"B",inspectionRejected:false,taskCompleted:true,qualified:true,bp:880,battlePoints:880,attemptNumber:1,attemptsStarted:1,serverTime:"2026-10-03T12:00:01.000Z"};
      const battle={battleId:"bw_phase6_visual01",mode:"sync",state:"JOINED",task,taskHash:"f".repeat(64),engineVersion:ArcSim.VERSION,
        scoringVersion:ArcSim.SCORING_VERSION,serverTime:"2026-10-03T12:00:02.000Z",startAt:new Date(Date.now()+2600).toISOString(),
        players:{P1:{nickname:"Night Shift",ready:false,attemptsCount:1,best:p1,status:"idle",finished:false},
          P2:{nickname:"Arc Runner",ready:false,attemptsCount:1,best:p2,status:"idle",finished:false}}};
      battleState={serverMode:true,localMode:false,mode:"server",modeType:"sync",serverRole:"host",battleId:battle.battleId,slot:"P1",
        task,serverTask:task,taskHash:battle.taskHash,engineVersion:battle.engineVersion,scoringVersion:battle.scoringVersion,ready:false,
        blocked:false,done:false,serverBattle:battle,serverUpdateSeq:0,serverAttemptsStarted:1,cardView:null,credentials:{battleId:battle.battleId}};
      document.body.classList.add("battle-active");document.getElementById("battleBadge").hidden=false;document.getElementById("battleBadge").textContent=bt("serverTag");
      if(name==="enter"){
        battleState=null;document.body.classList.remove("battle-active");document.getElementById("battleBadge").hidden=true;
        battleShow(bt("choose"),bt("chooseNote"),battleWpsTasks().map(item=>({label:battleTaskLabel(item.task),action:()=>{}})),"",null,bt("close"),()=>{});
      }else if(name==="create-profile"){
        battleServerChooseTask(task);document.getElementById("battleServerFields").hidden=false;
      }else if(name==="consent"){
        battleServerConsent("new",()=>{});
      }else if(name==="join"){
        battleServerSetJoinPreview(battle.battleId,"visualinvite",battle);
      }else if(name==="ready"){
        battleServerRenderRoom();
      }else if(name==="countdown"){
        battleShow(bt("ready"),bt("countdown").replace("%1","3"),[],"",null,"",null);
        document.getElementById("battleModal").dataset.screen="countdown";document.getElementById("battleTitle").textContent="3";
      }else if(name==="live"){
        battleState.ready=true;battleState.hudActive=true;battleState.serverBattle.state="LOCKED";
        battleState.serverBattle.players.P2.status="welding";battleUiUpdateHud();closeModal("battleModal");
        setTimeout(()=>{},230);
      }else if(name==="inspection"){
        document.getElementById("bwInspection").hidden=false;document.getElementById("bwInspectionTitle").textContent=bwc("inspection");
        document.getElementById("bwInspectionText").textContent=bwc("verifying");battleUiSetInspectionVelda(true);
        document.getElementById("bwInspectionMode").textContent=bt("serverTag");
      }else if(name==="verdict"||name==="share-card"){
        battleState.serverBattle.state="VERDICT";battleState.serverBattle.verdict={code:"P1_WINS"};
        battleState.serverBattle.players.P1.best=p1;battleState.serverBattle.players.P2.best=p2;
        battleServerRenderVerdict();
        if(name==="share-card")buildBattleCard();
      }else if(name==="incomparable"){
        battleState.serverBattle.engineVersion="0.0.0";
        battleServerShowFailure({code:"ENGINE_VERSION_MISMATCH"},false);
      }
      window.__battleScreen=name;
    },{name,locale,task:fixtureTask()});
    await page.evaluate(()=>document.fonts.ready);
    if(name==="share-card")await page.evaluate(()=>window.__bwBattleCardReady);
    await page.waitForTimeout(name==="live"?260:330);
  }
  async function screenshot(name,locale,width,height){
    await page.setViewportSize({width,height});
    await render(name,locale);
    const metrics=await page.evaluate(()=>{
      const root=document.getElementById("battleModal"),shell=root.querySelector(".bw-shell"),r=shell&&shell.getBoundingClientRect();
      const buttons=[...root.querySelectorAll("button")].filter(b=>!b.hidden&&getComputedStyle(b).display!=="none");
      const primary=document.getElementById("battlePrimary").getBoundingClientRect(),footer=root.querySelector(".bw-footer").getBoundingClientRect();
      const readyActionsClear=root.dataset.screen!=="ready"||(!document.getElementById("battlePrimary").hidden&&primary.bottom<=footer.top+1);
      return {scrollWidth:document.documentElement.scrollWidth,innerWidth,rootHidden:root.hidden,screen:root.dataset.screen,
        box:r&&{left:r.left,right:r.right,top:r.top,bottom:r.bottom},buttonsInside:buttons.every(b=>{const q=b.getBoundingClientRect();return q.left>=0&&q.right<=innerWidth;}),
        readyActionsClear,
        tag:document.getElementById("bwInspection").hidden?document.getElementById("battleModeTag").textContent:document.getElementById("bwInspectionMode").textContent};
    });
    const card=(name==="share-card"),live=(name==="live"),inspection=(name==="inspection");
    const target=card?"#cardModal":live?"#bwHud":inspection?"#bwInspection":"#battleModal";
    const visible=await page.locator(target).evaluate(el=>getComputedStyle(el).display!=="none"&&!el.hidden);
    const fit=metrics.scrollWidth<=width&&metrics.buttonsInside&&metrics.readyActionsClear&&visible&&(card||live||inspection||metrics.box.left>=-0.1&&metrics.box.right<=width+0.1);
    ok(`${name} ${locale} ${width}x${height} fits`,fit,metrics);
    if(name==="verdict"){
      const copy=await page.evaluate(()=>({title:document.getElementById("battleMessage").textContent,summary:document.getElementById("battleModalSummary").textContent,
        scoreboard:document.getElementById("bwScoreboard").textContent}));
      const unit=locale==="pl"?"pkt":locale==="ru"?"очк.":"pts";
      ok(`verdict uses nickname, point units and attempt counts ${locale} ${width}px`,copy.title.includes("Night Shift")&&copy.summary.includes("94 "+unit)&&!copy.summary.includes("94%")&&copy.scoreboard==="P1 1 · P2 1",copy);
    }
    if(name==="incomparable"){
      const velda=await page.evaluate(()=>({text:document.getElementById("bwCeremonyLine").textContent,hidden:document.getElementById("bwCeremonyLine").hidden,portraitHidden:document.getElementById("bwVeldaPortrait").hidden}));
      ok(`Velda stays silent on INCOMPARABLE ${locale} ${width}px`,velda.hidden&&!velda.text&&velda.portraitHidden,velda);
    }
    const expectedPortrait=name==="inspection"?"velda-focus.webp":name==="countdown"?"velda-focus.webp":name==="verdict"||name==="share-card"?"velda-verdict.webp":["enter","create-profile","consent","join","ready"].includes(name)?"velda-calm.webp":null;
    if(expectedPortrait){
      const portrait=await page.evaluate(name=>{const el=document.getElementById(name==="inspection"?"bwInspectionPortrait":"bwVeldaPortrait");return {asset:el.dataset.asset||"",hidden:el.hidden,alt:el.alt};},name);
      ok(`Velda portrait follows approved line mapping ${name} ${locale} ${width}px`,portrait.asset===expectedPortrait&&!portrait.hidden&&portrait.alt==="",portrait);
      if(width>=900&&height>=700){
        const size=await page.evaluate(name=>{const el=document.getElementById(name==="inspection"?"bwInspectionPortrait":"bwVeldaPortrait"),r=el.getBoundingClientRect();return {height:r.height,hidden:el.hidden};},name);
        ok(`desktop Velda portrait is large enough ${name} ${locale}`,size.height>=88&&!size.hidden,size);
      }
    }
    if(name==="share-card"){
      const card=await page.locator("#battleShareCanvas").evaluate(el=>({background:el.dataset.backgroundAsset,logo:el.dataset.logoAsset}));
      ok(`share card uses decoded background and banner logo ${locale} ${width}px`,card.background==="card-bg.webp"&&card.logo==="battle-weld-wordmark-v2.svg",card);
      const gap=await page.locator("#battleShareCanvas").evaluate(el=>Number(el.dataset.modeTagGapPx));
      ok(`share card mode tag clears logo by at least 16px ${locale} ${width}px`,gap>=16,{gap});
    }
    if(["enter","create-profile","consent","join","ready","verdict"].includes(name)){
      const arena=await page.evaluate(()=>getComputedStyle(document.getElementById("bwArenaBackdrop")).backgroundImage);
      const expected=width<=600?"arena-tall.webp":"arena-wide.webp";
      ok(`arena uses ${expected} for ${width}px ${locale}`,arena.includes(expected),arena);
    }
    fs.mkdirSync(OUT,{recursive:true});
    await page.screenshot({path:path.join(OUT,`${name}-${locale}-${width}x${height}.png`)});
  }

  try{
    for(const locale of ["pl","ru"])for(const [width,height] of [[1280,800],[375,812]])
      for(const screen of ["enter","create-profile","consent","join","ready","countdown","live","inspection","verdict","incomparable","share-card"])
        await screenshot(screen,locale,width,height);
    async function enterClipping(width,height,locale){
      await page.setViewportSize({width,height});await render("enter",locale);
      const data=await page.evaluate(()=>{
        const root=document.getElementById("battleModal"),shell=root.querySelector(".bw-shell");
        const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return !el.hidden&&s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity||1)>.01&&r.width>0&&r.height>0;};
        const targets=[...shell.querySelectorAll("button,[aria-label],h1,h2,h3,p,small,strong,b,span,label")].filter(el=>visible(el)&&
          (el.matches("button")||el.children.length===0&&el.textContent.trim()));
        const clipped=[];
        for(const el of targets){const r=el.getBoundingClientRect();for(let ancestor=el.parentElement;ancestor;ancestor=ancestor.parentElement){
          const s=getComputedStyle(ancestor),clips=[s.overflowX,s.overflowY].some(v=>["hidden","auto","scroll","clip"].includes(v));
          if(!clips)continue;const a=ancestor.getBoundingClientRect();
          if(r.left<a.left-1||r.right>a.right+1||r.top<a.top-1||r.bottom>a.bottom+1)clipped.push({text:(el.innerText||el.getAttribute("aria-label")||el.tagName).trim().slice(0,70),ancestor:ancestor.id||ancestor.className||ancestor.tagName,rect:{x:r.x,y:r.y,w:r.width,h:r.height},clip:{x:a.x,y:a.y,w:a.width,h:a.height}});
        }}
        const close=document.getElementById("battleSecondary"),cr=close.getBoundingClientRect();
        return {clipped,closeVisible:visible(close),closeInside:cr.top>=0&&cr.bottom<=innerHeight,screen:root.dataset.screen,intro:getComputedStyle(root.querySelector(".bw-intro")).display};
      });
      ok(`ENTER text and buttons are not clipped ${locale} ${width}x${height}`,data.clipped.length===0&&data.closeVisible&&data.closeInside&&data.screen==="enter"&&data.intro==="none",data);
      fs.mkdirSync(OUT,{recursive:true});await page.screenshot({path:path.join(OUT,`enter-${locale}-${width}x${height}.png`)});
    }
    for(const [width,height] of [[1280,800],[1366,768],[1280,720],[1024,600],[375,812]])
      for(const locale of ["pl","ru"])await enterClipping(width,height,locale);
    // 05.10 (po przegladzie Codexa): READY i VERDICT tez bez przyciec na niskich ekranach komputera
    async function screenClipping(name,width,height,locale,renderName){
      await page.setViewportSize({width,height});await render(renderName||name,locale);
      const data=await page.evaluate(()=>{
        const root=document.getElementById("battleModal"),shell=root.querySelector(".bw-shell");
        const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return !el.hidden&&s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity||1)>.01&&r.width>0&&r.height>0;};
        const targets=[...shell.querySelectorAll("button,h1,h2,h3,p,small,strong,b,span,label")].filter(el=>visible(el)&&
          (el.matches("button")||el.children.length===0&&el.textContent.trim()));
        const clipped=[];
        for(const el of targets){const r=el.getBoundingClientRect();for(let ancestor=el.parentElement;ancestor;ancestor=ancestor.parentElement){
          const s=getComputedStyle(ancestor),clips=[s.overflowX,s.overflowY].some(v=>["hidden","auto","scroll","clip"].includes(v));
          if(!clips)continue;const a=ancestor.getBoundingClientRect();
          if(r.top<a.top-1||r.bottom>a.bottom+1)clipped.push({text:(el.innerText||el.tagName).trim().slice(0,50),ancestor:ancestor.id||ancestor.className||ancestor.tagName});
        }}
        return {clipped,screen:root.dataset.screen};
      });
      ok(`${name.toUpperCase()} text and buttons are not clipped ${locale} ${width}x${height}`,data.clipped.length===0&&data.screen===name,data);
      fs.mkdirSync(OUT,{recursive:true});await page.screenshot({path:path.join(OUT,`${renderName||name}-clip-${locale}-${width}x${height}.png`)});
    }
    for(const name of ["ready","verdict"])for(const [width,height] of [[1280,800],[1366,768],[1280,720]])
      for(const locale of ["pl","ru"])await screenClipping(name,width,height,locale);
    // 05.10: produkcyjny tekst zgody (serwer w Niemczech, retencja) — dluzszy, musi sie zmiescic bez przyciec
    await page.evaluate(()=>{window.__bwForceProdCopy=true;});
    for(const [width,height] of [[1280,800],[1366,768],[1280,720],[375,812]])for(const locale of ["pl","ru"]){
      await screenClipping("setup",width,height,locale,"consent");
      const copy=await page.evaluate(()=>document.getElementById("battleMessage").textContent);
      ok(`production consent copy shown ${locale} ${width}x${height}`,/Hetzner/.test(copy)&&/30/.test(copy)&&/180/.test(copy)&&!/lokaln|local|локальн/i.test(copy.split(/ARC/)[0]),copy.slice(0,90));
    }
    await page.evaluate(()=>{window.__bwForceProdCopy=false;});
    for(const width of [360,390]){
      for(const locale of ["pl","ru"]){
        await page.setViewportSize({width,height:812});await render("verdict",locale);
        const fit=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
          buttons:[...document.querySelectorAll("#battleModal .bw-actions button")].filter(button=>!button.hidden).map(button=>{const r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})}));
        ok(`${locale.toUpperCase()} verdict controls fit ${width}px`,fit.scrollWidth<=width&&fit.buttons.length>0&&fit.buttons.every(Boolean),fit);
      }
    }
    await page.setViewportSize({width:375,height:380});await render("ready","pl");
    const shortVelda=await page.evaluate(()=>({hidden:document.getElementById("bwVeldaPortrait").hidden,display:getComputedStyle(document.getElementById("bwVeldaPortrait")).display,
      scrollWidth:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll("#battleModal .bw-actions button")].filter(b=>!b.hidden).every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})}));
    ok("Velda portrait hides on short view while buttons remain reachable",shortVelda.display==="none"&&shortVelda.scrollWidth<=375&&shortVelda.buttons,shortVelda);
    const checks=await page.evaluate(()=>{
      const durations=[...document.querySelectorAll("#battleModal *, .bw-inspection *, .bw-hud *")].map(el=>parseFloat(getComputedStyle(el).animationDuration)||0);
      const stageBefore=stage.getBoundingClientRect().toJSON();
      battleState.hudActive=true;battleUiUpdateHud();const stageHud=stage.getBoundingClientRect().toJSON();
      battleState.hudActive=false;battleUiUpdateHud();const stageNoHud=stage.getBoundingClientRect().toJSON();
      const was=soundOn,oldInit=initAudio;let initCalls=0;initAudio=()=>{initCalls++;};soundOn=false;battleUiSound("impact");initAudio=oldInit;soundOn=was;
      return {reduced:matchMedia("(prefers-reduced-motion: reduce)").matches,stageStable:JSON.stringify(stageBefore)===JSON.stringify(stageHud)&&JSON.stringify(stageBefore)===JSON.stringify(stageNoHud),mutedInitCalls:initCalls};
    });
    ok("HUD leaves ARC stage geometry unchanged",checks.stageStable,checks);
    // 05.10 (zgloszenie z live): karta z jednym graczem (P2 bez proby) rysuje sie do konca — z werdyktem i "BRAK WYNIKU"
    const soloCard=await page.evaluate(async()=>{
      const saved=battleState;battleState={...saved,serverMode:true,slot:"P1",battleId:"bw_solo",serverBattle:{...(saved&&saved.serverBattle||{}),battleId:"bw_solo",players:{P1:{nickname:"GorWeld"},P2:{nickname:""}}},
        cardView:{kind:"server",verdict:"NO_QUALIFIED_RESULT",player1:{nickname:"GorWeld",score:24,grade:"F",inspectionRejected:true,taskCompleted:true,qualified:false,battlePoints:240,attemptNumber:1,attemptsStarted:1,serverTime:"2026-10-05T18:39:09.000Z"},player2:null}};
      buildBattleCard();try{await window.__bwBattleCardReady;}catch(e){}
      const rendered=document.getElementById("battleShareCanvas").dataset.rendered;closeModal("cardModal");battleState=saved;await new Promise(r=>setTimeout(r,320));return rendered;});
    ok("result card with only one player renders to the end (no-result side + verdict)",soloCard==="1",soloCard);
    // 05.10 muzyka Battle (wariant A): petla tylko w lobby, cisza w odliczaniu/spawaniu, akcent werdyktu z perspektywy gracza, mute ARC
    const music=await page.evaluate(async()=>{
      const saved={soundOn,battleState},oldInit=initAudio;let initCalls=0;
      soundOn=false;initAudio=()=>{initCalls++;};bwMusicSync("enter");const mutedPlaying=bwMusic.playing;initAudio=oldInit;
      soundOn=true;bwMusic.log.length=0;bwMusic.cueKey="";
      bwMusicSync("enter");const lobby=bwMusic.playing;bwMusicSync("ready");const keeps=bwMusic.playing&&bwMusic.log.filter(x=>x==="loop").length===1;
      bwMusicSync("countdown");const countdownSilent=!bwMusic.playing;
      battleState={serverMode:true,slot:"P2",battleId:"bw_music",cardView:{verdict:"P1_WINS",player1:{inspectionRejected:false},player2:{inspectionRejected:false}}};
      bwMusicSync("verdict");const verdictCue=bwMusic.log[bwMusic.log.length-1];bwMusicSync("verdict");const once=bwMusic.log.filter(x=>x==="lose").length===1;
      bwMusicSync("enter");document.getElementById("snd").click();const muteStops=!bwMusic.playing&&!soundOn;document.getElementById("snd").click();
      bwMusicStop();soundOn=saved.soundOn;battleState=saved.battleState;
      return {mutedPlaying,mutedInitCalls:initCalls,lobby,keeps,countdownSilent,verdictCue,once,muteStops};
    });
    ok("Battle music: lobby loop, silent countdown, P2 hears lose cue once, ARC mute stops it, muted = no audio init",
      !music.mutedPlaying&&music.mutedInitCalls===0&&music.lobby&&music.keeps&&music.countdownSilent&&music.verdictCue==="lose"&&music.once&&music.muteStops,music);
    async function hudClearance(width,height){
      await page.setViewportSize({width,height});await render("live","en");
      return page.evaluate(()=>{
        const hud=document.getElementById("bwHud"),hr=hud.getBoundingClientRect();
        const selectors=[".top button",".bottom button","#toolhud","#mobHud","#info","#rankbar",".grav","#covbar"];
        const targets=selectors.flatMap(selector=>[...document.querySelectorAll(selector)]).filter(el=>{
          const r=el.getBoundingClientRect(),s=getComputedStyle(el);return s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity)>.05&&r.width>0&&r.height>0;
        });
        const saved=targets.map(el=>[el,el.style.pointerEvents]);targets.forEach(el=>{el.style.pointerEvents="auto";});
        const checks=targets.map(el=>{
          const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
          const hit=document.elementFromPoint(x,y),hitTarget=hit===el||el.contains(hit);
          const overlap=hr.left<r.right&&hr.right>r.left&&hr.top<r.bottom&&hr.bottom>r.top;
          return {target:el.id||el.className||el.tagName,hitTarget,overlap,hitHud:!!(hit&&hit.closest&&hit.closest("#bwHud"))};
        });
        saved.forEach(([el,value])=>{el.style.pointerEvents=value;});
        return {width:innerWidth,height:innerHeight,hud:{x:hr.x,y:hr.y,width:hr.width,height:hr.height},checks};
      });
    }
    for(const [width,height] of [[1280,800],[375,812]]){
      const clearance=await hudClearance(width,height);
      ok(`LIVE HUD clears every visible ARC control/readout at ${width}px`,clearance.checks.length>0&&clearance.checks.every(item=>item.hitTarget&&!item.overlap&&!item.hitHud),clearance);
    }
    await page.emulateMedia({reducedMotion:"reduce"});
    const reduced=await page.evaluate(()=>({matches:matchMedia("(prefers-reduced-motion: reduce)").matches,duration:getComputedStyle(document.querySelector(".bw-scan")).animationDuration}));
    ok("reduced motion collapses Battle ceremony",reduced.matches&&parseFloat(reduced.duration)<.01,reduced);
    const gatesReduced=await page.evaluate(()=>getComputedStyle(document.getElementById("bwGates")).display==="none");
    ok("reduced motion hides the gate halves",gatesReduced);
    const avatarNames=await page.evaluate(()=>["bwPlayer1Avatar","bwPlayer2Avatar"].map(id=>document.getElementById(id).dataset.asset));
    const avatarPage=await context.newPage();await avatarPage.goto(BASE+"/index.html");
    const secondAvatarNames=await avatarPage.evaluate(()=>{
      const id="bw_phase6_visual01";battleState={battleId:id,serverBattle:{battleId:id,players:{P1:{},P2:{}}}};
      document.getElementById("battleModal").classList.add("bw-assets-active");battleUiAssignAvatars();
      return ["bwPlayer1Avatar","bwPlayer2Avatar"].map(name=>document.getElementById(name).dataset.asset);
    });
    ok("default avatars are deterministic across two pages",JSON.stringify(avatarNames)===JSON.stringify(secondAvatarNames),{avatarNames,secondAvatarNames});
    await avatarPage.close();
    const contrast=await page.evaluate(async()=>{
      const shellStyle=getComputedStyle(document.querySelector("#battleModal .bw-shell"));
      const alpha=Number(shellStyle.backgroundImage.match(/rgba\(35, 38, 41, ([\d.]+)\)/)?.[1]||0);
      const foreground=[243,245,246],linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
      const lum=(r,g,b)=>.2126*linear(r)+.7152*linear(g)+.0722*linear(b);
      const blend=(image,overlay,a)=>image*(1-a)+overlay*a;
        const rows=[];
      for(const name of ["arena-wide.webp","arena-tall.webp"]){const img=await battleLoadAsset(name);const c=document.createElement("canvas");c.width=160;c.height=90;
        const ctx=c.getContext("2d");ctx.drawImage(img,0,0,c.width,c.height);const p=ctx.getImageData(0,0,c.width,c.height).data;let min=1,max=0,minRgb=[0,0,0],maxRgb=[0,0,0];
        for(let i=0;i<p.length;i+=4){const rgb=[p[i],p[i+1],p[i+2]],l=lum(...rgb);if(l<min){min=l;minRgb=rgb;}if(l>max){max=l;maxRgb=rgb;}}
        const overlay=[35,38,41],after=rgb=>lum(...rgb.map((v,i)=>blend(v,overlay[i],alpha)));
        const light=lum(...foreground),darkest=after(minRgb),brightest=after(maxRgb);
        rows.push({asset:name,minLuminance:min,maxLuminance:max,darkestContrast:(light+.05)/(darkest+.05),brightestContrast:(light+.05)/(brightest+.05),shellOverlayAlpha:alpha});}
      return rows;
    });
    const insideShellContrast=await page.evaluate(()=>{const style=getComputedStyle(document.querySelector("#battleModal .bw-shell"));const content=getComputedStyle(document.querySelector("#battleModal .bw-content"));return {gradient:style.backgroundImage,content:content.backgroundImage,outerOverlay:getComputedStyle(document.querySelector("#bwArenaBackdrop"),"::after").backgroundColor};});
    const outerAlpha=Number(insideShellContrast.outerOverlay.match(/,\s*([\d.]+)\)$/)?.[1]||0);
    ok("arena overlay keeps light text at WCAG AA contrast inside the Battle shell",contrast.every(row=>row.darkestContrast>=4.5&&row.brightestContrast>=4.5)&&contrast[0].shellOverlayAlpha>=.9&&outerAlpha<.5&&insideShellContrast.content.includes("rgba(41, 44, 47, 0.92"),{contrast,insideShellContrast});
    const external=requests.filter(url=>{try{return new URL(url).origin!==new URL(BASE).origin;}catch(_){return false;}});
    ok("Battle visual flow uses only same-origin requests",external.length===0,external);
    ok("sound respects ARC mute switch",checks.mutedInitCalls===0,checks.mutedInitCalls);
    ok("all Velda lines match the five approved English lines",await page.evaluate(()=>{
      const values=["veldaGear","veldaRules","veldaStrike","veldaInspect","veldaVerdict"].map(key=>BATTLE_UI_COPY.en[key]);
      return JSON.stringify(values)==JSON.stringify(["Gear check.","Same task. Same rules.","Strike the arc.","Inspection complete.","Verdict locked."]);
    }));
    await page.evaluate(()=>{lang="en";applyI18N();battleState.serverBattle.engineVersion="0.0.0";battleState.serverBattle.scoringVersion="old-score";battleState.serverBattle.taskHash="f".repeat(64);battleState.taskHash="e".repeat(64);battleUiRefresh(bt("ready"),"",bt("readyText"));});
    const mismatchStamps=await page.evaluate(()=>[...document.querySelectorAll("#bwCheckStamps [data-check]")].map(el=>({text:el.textContent,bad:el.classList.contains("bad")})));
    const engineNow=await page.evaluate(()=>ArcSim.VERSION);
    ok("system stamps group labels and show both mismatched values in red",mismatchStamps[0].text==="HASH ✕ ffffffff ≠ eeeeeeee"&&mismatchStamps[0].bad&&mismatchStamps[1].text.includes("ENGINE ✕ 0.0.0 ≠ "+engineNow)&&mismatchStamps[1].bad&&mismatchStamps[2].text.includes("SCORING ✕ old-score ≠ 1.0.0")&&mismatchStamps[2].bad,mismatchStamps);
    const fontRequests=requests.filter(url=>url.includes("/fonts/")).map(url=>new URL(url).pathname);
    const polishFonts=await page.evaluate(async()=>{
      const [display,mono]=await Promise.all([document.fonts.load("800 20px BWDisplay","ŻŹŁÓĆ"),document.fonts.load("500 12px BWMono","ŻŹŁÓĆ")]);
      return {display:display.length,mono:mono.length,displayCheck:document.fonts.check("800 20px BWDisplay","ŻŹŁÓĆ"),monoCheck:document.fonts.check("500 12px BWMono","ŻŹŁÓĆ")};
    });
    ok("Polish extended display and mono glyphs load from local WOFF2",fontRequests.some(url=>url.endsWith("big-shoulders-display-latin-ext.woff2"))&&fontRequests.some(url=>url.endsWith("chivo-mono-latin-ext.woff2"))&&polishFonts.display>0&&polishFonts.mono>0&&polishFonts.displayCheck&&polishFonts.monoCheck,{fontRequests,polishFonts});
    await page.evaluate(()=>{lang="ru";applyI18N();});
    const russianFont=await page.evaluate(()=>({root:getComputedStyle(document.getElementById("battleModal")).fontFamily,button:getComputedStyle(document.getElementById("battlePrimary")).fontFamily,
      hud:getComputedStyle(document.getElementById("bwHud")).fontFamily}));
    ok("Russian Battle UI uses one consistent system font stack",russianFont.root===russianFont.button&&russianFont.root===russianFont.hud&&russianFont.root.includes("Arial Narrow"),russianFont);
    await page.evaluate(()=>{battleServerShowFailure({code:"SERVER_UNAVAILABLE"},false);});
    const downVelda=await page.evaluate(()=>({text:document.getElementById("bwCeremonyLine").textContent,hidden:document.getElementById("bwCeremonyLine").hidden,screen:document.getElementById("battleModal").dataset.screen}));
    const downPortrait=await page.evaluate(()=>document.getElementById("bwVeldaPortrait").hidden);
    ok("Velda stays silent on error and server-down screens",downVelda.hidden&&!downVelda.text&&downVelda.screen==="error"&&downPortrait,{...downVelda,portraitHidden:downPortrait});
    const failurePage=await context.newPage();
    await failurePage.route("**/battle-assets/battle-weld-logo.svg",route=>route.fulfill({status:404,body:"missing"}));
    await failurePage.route("**/battle-assets/battle-weld-wordmark.svg",route=>route.fulfill({status:404,body:"missing"}));
    await failurePage.route("**/battle-assets/battle-weld-wordmark-v2.svg",route=>route.fulfill({status:404,body:"missing"}));
    await failurePage.route("**/battle-assets/card-bg.webp",route=>route.fulfill({status:404,body:"missing"}));
    await failurePage.goto(BASE+"/index.html");await failurePage.evaluate(()=>{if(window.hideSplash)hideSplash();if(openM)closeModal(openM);});
    await failurePage.locator("#battleLaunch").click({force:true});
    await failurePage.waitForFunction(()=>document.getElementById("battleModal").classList.contains("open")&&document.getElementById("bwBrand").classList.contains("logo-failed"));
    const logoFallback=await failurePage.evaluate(()=>({name:document.getElementById("bwBrand").getAttribute("aria-label"),text:getComputedStyle(document.getElementById("bwBrandFallback")).display,imageHidden:document.getElementById("bwBrandImage").hidden}));
    ok("logo 404 shows the accessible text fallback",logoFallback.name==="BATTLE WELD"&&logoFallback.text!=="none"&&logoFallback.imageHidden,logoFallback);
    await failurePage.evaluate(()=>{
      const task={seed:1296914737,proc:"MMA",joint:"butt",pos:"PA",thick:3,bead:"steel",amps:60,ampMode:"auto",W:1280,H:720,requiredCoverage:.8};
      const player=(nickname,score,bp)=>({nickname,score,grade:"A",inspectionRejected:false,taskCompleted:true,qualified:true,battlePoints:bp,attemptNumber:1,attemptsStarted:1,serverTime:"2026-10-03T12:00:00.000Z"});
      battleState={serverMode:true,mode:"server",modeType:"sync",battleId:"bw_phase7_fallback01",task,serverBattle:{battleId:"bw_phase7_fallback01",engineVersion:ArcSim.VERSION,scoringVersion:ArcSim.SCORING_VERSION,players:{}},cardView:{kind:"server",player1:player("Night Shift",94,940),player2:player("Arc Runner",88,880),verdict:"P1_WINS"}};
      buildBattleCard();
    });
    await failurePage.evaluate(()=>window.__bwBattleCardReady);
    const fallbackCard=await failurePage.locator("#battleShareCanvas").evaluate(el=>({background:el.dataset.backgroundAsset,logo:el.dataset.logoAsset,painted:el.getContext("2d").getImageData(500,300,1,1).data[3]>0}));
    ok("share card still renders with both background and logo unavailable",fallbackCard.background==="fallback"&&fallbackCard.logo==="fallback"&&fallbackCard.painted,fallbackCard);
    await failurePage.close();
    const finalAssets=await Promise.all(battleAssetResponses),finalAssetBytes=finalAssets.reduce((sum,item)=>sum+item.bytes,0);
    ok("all requested Battle assets are same-origin and HTTP 200",finalAssets.every(item=>item.status===200&&new URL(item.url).origin===new URL(BASE).origin),{assetCount:finalAssets.length,transferredImageBytes:finalAssetBytes,failed:finalAssets.filter(item=>item.status!==200)});
    ok("no uncaught JavaScript errors",errors.length===0,errors);
  }finally{await context.close();await browser.close();}
  if(results.includes(false)){console.error(`FAIL ${results.filter(Boolean).length}/${results.length}`);process.exitCode=1;}
  else console.log(`PASS ${results.length} visual/accessibility checks`);
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
