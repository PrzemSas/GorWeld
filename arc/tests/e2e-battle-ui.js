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
  const errors=[],requests=[];page.on("pageerror",e=>errors.push(e.message));page.on("request",r=>requests.push(r.url()));
  await page.addInitScript(()=>{try{localStorage.setItem("gorweld_tut","1");localStorage.setItem("gorweld_lang","en");}catch(_){} });
  await page.goto(BASE+"/index.html");await page.waitForTimeout(1050);
  await page.evaluate(()=>{if(window.hideSplash)hideSplash();if(openM)closeModal(openM);});

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
        document.getElementById("bwInspectionText").textContent=bwc("verifying");document.getElementById("bwInspectionVelda").textContent=bwc("veldaInspect");
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
    await page.waitForTimeout(name==="live"?260:330);
  }
  async function screenshot(name,locale,width,height){
    await page.setViewportSize({width,height});
    await render(name,locale);
    const metrics=await page.evaluate(()=>{
      const root=document.getElementById("battleModal"),shell=root.querySelector(".bw-shell"),r=shell&&shell.getBoundingClientRect();
      const buttons=[...root.querySelectorAll("button")].filter(b=>!b.hidden&&getComputedStyle(b).display!=="none");
      return {scrollWidth:document.documentElement.scrollWidth,innerWidth,rootHidden:root.hidden,screen:root.dataset.screen,
        box:r&&{left:r.left,right:r.right,top:r.top,bottom:r.bottom},buttonsInside:buttons.every(b=>{const q=b.getBoundingClientRect();return q.left>=0&&q.right<=innerWidth;}),
        tag:document.getElementById("bwInspection").hidden?document.getElementById("battleModeTag").textContent:document.getElementById("bwInspectionMode").textContent};
    });
    const card=(name==="share-card"),live=(name==="live"),inspection=(name==="inspection");
    const target=card?"#cardModal":live?"#bwHud":inspection?"#bwInspection":"#battleModal";
    const visible=await page.locator(target).evaluate(el=>getComputedStyle(el).display!=="none"&&!el.hidden);
    const fit=metrics.scrollWidth<=width&&metrics.buttonsInside&&visible&&(card||live||inspection||metrics.box.left>=-0.1&&metrics.box.right<=width+0.1);
    ok(`${name} ${locale} ${width}x${height} fits`,fit,metrics);
    if(name==="verdict"){
      const copy=await page.evaluate(()=>({title:document.getElementById("battleMessage").textContent,summary:document.getElementById("battleModalSummary").textContent,
        scoreboard:document.getElementById("bwScoreboard").textContent}));
      const unit=locale==="pl"?"pkt":locale==="ru"?"очк.":"pts";
      ok(`verdict uses nickname, point units and attempt counts ${locale} ${width}px`,copy.title.includes("Night Shift")&&copy.summary.includes("94 "+unit)&&!copy.summary.includes("94%")&&copy.scoreboard==="P1 1 · P2 1",copy);
    }
    if(name==="incomparable"){
      const velda=await page.evaluate(()=>({text:document.getElementById("bwCeremonyLine").textContent,hidden:document.getElementById("bwCeremonyLine").hidden}));
      ok(`Velda stays silent on INCOMPARABLE ${locale} ${width}px`,velda.hidden&&!velda.text,velda);
    }
    fs.mkdirSync(OUT,{recursive:true});
    await page.screenshot({path:path.join(OUT,`${name}-${locale}-${width}x${height}.png`)});
  }

  try{
    for(const locale of ["pl","ru"])for(const [width,height] of [[1280,800],[375,812]])
      for(const screen of ["enter","create-profile","consent","join","ready","countdown","live","inspection","verdict","incomparable","share-card"])
        await screenshot(screen,locale,width,height);
    for(const width of [360,390]){
      await page.setViewportSize({width,height:812});await render("verdict","ru");
      const fit=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
        buttons:[...document.querySelectorAll("#battleModal .bw-actions button")].filter(button=>!button.hidden).map(button=>{const r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})}));
      ok(`Russian verdict controls fit ${width}px`,fit.scrollWidth<=width&&fit.buttons.length>0&&fit.buttons.every(Boolean),fit);
    }
    const checks=await page.evaluate(()=>{
      const durations=[...document.querySelectorAll("#battleModal *, .bw-inspection *, .bw-hud *")].map(el=>parseFloat(getComputedStyle(el).animationDuration)||0);
      const stageBefore=stage.getBoundingClientRect().toJSON();
      battleState.hudActive=true;battleUiUpdateHud();const stageHud=stage.getBoundingClientRect().toJSON();
      battleState.hudActive=false;battleUiUpdateHud();const stageNoHud=stage.getBoundingClientRect().toJSON();
      const was=soundOn,oldInit=initAudio;let initCalls=0;initAudio=()=>{initCalls++;};soundOn=false;battleUiSound("impact");initAudio=oldInit;soundOn=was;
      return {reduced:matchMedia("(prefers-reduced-motion: reduce)").matches,stageStable:JSON.stringify(stageBefore)===JSON.stringify(stageHud)&&JSON.stringify(stageBefore)===JSON.stringify(stageNoHud),mutedInitCalls:initCalls};
    });
    ok("HUD leaves ARC stage geometry unchanged",checks.stageStable,checks);
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
    const external=requests.filter(url=>{try{return new URL(url).origin!==new URL(BASE).origin;}catch(_){return false;}});
    ok("Battle visual flow uses only same-origin requests",external.length===0,external);
    ok("sound respects ARC mute switch",checks.mutedInitCalls===0,checks.mutedInitCalls);
    ok("all Velda lines match the five approved English lines",await page.evaluate(()=>{
      const values=["veldaGear","veldaRules","veldaStrike","veldaInspect","veldaVerdict"].map(key=>BATTLE_UI_COPY.en[key]);
      return JSON.stringify(values)==JSON.stringify(["Gear check.","Same task. Same rules.","Strike the arc.","Inspection complete.","Verdict locked."]);
    }));
    await page.evaluate(()=>{lang="en";applyI18N();battleState.serverBattle.engineVersion="0.0.0";battleState.serverBattle.scoringVersion="old-score";battleState.serverBattle.taskHash="f".repeat(64);battleState.taskHash="e".repeat(64);battleUiRefresh(bt("ready"),"",bt("readyText"));});
    const mismatchStamps=await page.evaluate(()=>[...document.querySelectorAll("#bwCheckStamps [data-check]")].map(el=>({text:el.textContent,bad:el.classList.contains("bad")})));
    ok("system stamps group labels and show both mismatched values in red",mismatchStamps[0].text==="HASH ✕ ffffffff ≠ eeeeeeee"&&mismatchStamps[0].bad&&mismatchStamps[1].text.includes("ENGINE ✕ 0.0.0 ≠ 3.4.0")&&mismatchStamps[1].bad&&mismatchStamps[2].text.includes("SCORING ✕ old-score ≠ 1.0.0")&&mismatchStamps[2].bad,mismatchStamps);
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
    ok("Velda stays silent on error and server-down screens",downVelda.hidden&&!downVelda.text&&downVelda.screen==="error",downVelda);
    ok("no uncaught JavaScript errors",errors.length===0,errors);
  }finally{await context.close();await browser.close();}
  if(results.includes(false)){console.error(`FAIL ${results.filter(Boolean).length}/${results.length}`);process.exitCode=1;}
  else console.log(`PASS ${results.length} visual/accessibility checks`);
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
