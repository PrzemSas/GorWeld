/**
 * Sterownik testu PARYTETU (gra ↔ sim.js) — wariant 3.0.0, z klawiszami kąta.
 * ?k=KeyD   → sterownik przytrzymuje ten klawisz przez cały ścieg (kąt jedzie do oporu).
 * Bez ?k    → nikt nie dotyka klawiatury: kąt stoi na WPS.
 */
(async () => {
  const out = (o) => { const d=document.createElement("pre"); d.id="PARITY";
    d.textContent="PARITY_JSON "+JSON.stringify(o); document.body.appendChild(d); };
  try {
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const Q=new URLSearchParams(location.search);
    const KEY=Q.get("k")||"", KN=+(Q.get("kn")||0);   // kn = po ilu ruchach puścić klawisz (0 = trzymaj do końca)
    await sleep(1500);
    try{ dismissTut(); }catch(e){}
    try{ closeModal("tutModal"); }catch(e){}

    const stage=document.getElementById("stage");
    const toClient=(x,y)=>{ const r=stage.getBoundingClientRect();
      return {x:Math.round(r.left+x*r.width/1280), y:Math.round(r.top+y*r.height/720)}; };
    const fire=(type,c)=>{ const e=new PointerEvent(type,{pointerId:1,pointerType:"mouse",
      button:0,buttons:type==="pointerup"?0:1,clientX:c.x,clientY:c.y,bubbles:true,cancelable:true});
      (type==="pointerup"?window:stage).dispatchEvent(e); };
    const key=(type,code)=>{ if(!code) return;
      dispatchEvent(new KeyboardEvent(type,{code,key:code,bubbles:true,cancelable:true})); };

    const yc=720*0.66, len=720*0.62, xa=640-len/2, xb=640+len/2;
    const v=3.2*16, dt=8;
    const passes=2;
    let moves=0;
    if(KEY) key("keydown",KEY);                       // klawisz trzymany przez cały test (albo do KN ruchów)
    for(let pass=0;pass<passes;pass++){
      let x=xa,down=false,guard=0;
      while(x<=xb&&guard++<4000){
        const c=toClient(x,yc);
        if(!down){ fire("pointerdown",c); down=true; } else fire("pointermove",c);
        if(KN&&KEY&&++moves===KN) key("keyup",KEY);
        await sleep(dt);
        x+=v*dt/1000;
        if(typeof replacing!=="undefined"&&replacing){ fire("pointerup",c); down=false; }
      }
      fire("pointerup",toClient(Math.min(x,xb),yc));
      await sleep(250);
    }
    if(KEY) key("keyup",KEY);
    try{ if(!lastReport) inspect(); }catch(e){}
    await sleep(200);

    const gameScore=(typeof lastReport!=="undefined"&&lastReport)?lastReport.score:null;
    const round=(typeof rec!=="undefined"&&rec)?rec:null;
    const simRes=round&&round.events.length?ArcSim.simulate(round):null;
    out({ ok:true, engine:ArcSim.VERSION, key:KEY||"(brak)",
      stageW:Math.round(stage.getBoundingClientRect().width),
      events:round?round.events.length:0,
      recArc:round?round.arc:null, recAng:round?round.ang:null,
      keyedEvents:round?round.events.filter(e=>e.k).length:0,
      gameScore, simScore:simRes?simRes.score:null,
      match:simRes?gameScore===simRes.score:null,
      gameLetter:(typeof lastReport!=="undefined"&&lastReport)?lastReport.letter:null,
      simLetter:simRes?simRes.letter:null,
      simWa:simRes?simRes.waDeg:null, simTa:simRes?simRes.taDeg:null,
      gameWa:(typeof waDeg!=="undefined")?+waDeg.toFixed(2):null,
      gameTa:(typeof taDeg!=="undefined")?+taDeg.toFixed(2):null,
      simAngPen:simRes?simRes.angPen:null });
  } catch(err){ out({ok:false,error:String(err&&err.stack||err)}); }
})();
