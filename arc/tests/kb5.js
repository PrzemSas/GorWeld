/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// 3.11.0: łuk tylko w strefie rowka (kb=5). Rundy kb≤4 mają liczyć BIT-W-BIT jak 3.10.0 (zamrożony sim-3.10.0.js),
// a przejazd w rowku z kb=5 — dokładnie jak z kb=4 (strefa nie może zmienić dobrej roboty).
const S=require("../sim.js"), OLD=require("./sim-3.10.0.js"), {build}=require("./gen.js");
let fail=0; const ok=(n,c,i)=>{console.log((c?"  ✓ ":"  ✗ ")+n+(i!==undefined?"  "+JSON.stringify(i):"")); if(!c) fail++;};
const J=o=>JSON.parse(JSON.stringify(o));
const CFG=[["PA","butt"],["PC","butt"],["PE","butt"],["PF","butt"],["PG","butt"],["PB","fillet"],["PD","fillet"],["PF","fillet"],["P1G","pipe"],["P2G","pipe"],["P5G","pipe"],["HL045","pipe"]];
const TH=[2,3,5,8,12];

// 1) kb≤4 — bit w bit jak 3.10.0
let n=0,bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [2,5,8,12]) for(const kb of [false,true,2,3,4]) for(const vFac of [0.7,1.2]){
  const r={...build({proc,pos,joint,thick,vFac,kb}),uf:1,cvn:1}; n++;
  if(JSON.stringify(S.simulate(J(r)))!==JSON.stringify(OLD.simulate(J(r)))) bad.push(`${proc} ${pos} ${thick} kb=${kb}`); }
ok(`kb≤4: 3.11.0 == 3.10.0 bit w bit (${n} rund)`,bad.length===0,bad.slice(0,4));

// 2) robota w rowku: kb=5 == kb=4 (bez łuku i z łukiem + kątem)
n=0; bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of TH) for(const arc of [false,true]){
  const r5={...build({proc,pos,joint,thick,kb:5,arc,ang:arc,keyPlan:t=>t%3<1?2:0}),uf:1,cvn:1}, r4={...r5,kb:4}; n++;
  if(JSON.stringify(S.simulate(J(r5)))!==JSON.stringify(OLD.simulate(J(r4)))) bad.push(`${proc} ${pos} ${joint} ${thick} arc=${arc}`); }
ok(`w rowku: kb=5 == kb=4 (${n} rund)`,bad.length===0,bad.slice(0,6));

// 3) „byle gdzie po blasze": zygzak przez całą blachę (±85% połowy blachy), 3 mm (jeden ścieg)
function zigzag(kb,{arc=false,thick=3,pos="PA",joint="butt",proc="MMA"}={}){
  const base=build({proc,pos,joint,thick,kb}), m=base.events.filter(e=>e.type==="move"), A=m[0], B=m[m.length-1];
  const ev=[{type:"down",t:0,x:A.x,y:A.y,...(arc?{b:0}:{})}]; let t=0, al=0;
  for(let i=1;i<=900;i++){ t+=8; const f=i/900, x=A.x+(B.x-A.x)*f, y=A.y+Math.sin(i/9)*90;
    let b; if(arc){ b=al>2.5?1:0; al=Math.max(0,al+(1-(b?3.5:0))*0.008); }
    ev.push({type:"move",t,x:Math.round(x*100)/100,y:Math.round(y*100)/100,...(arc?{b}:{})}); }
  return {...base,events:ev,uf:1,cvn:1,...(arc?{arc:1}:{})}; }
const z4=S.simulate(J(zigzag(4))), z5=S.simulate(J(zigzag(5)));
ok("zygzak po blasze: kb=4 kładzie metal daleko poza fazą (dowód problemu)",z4.overflow>0.5,{overflow:z4.overflow,baked:z4.baked});
ok("zygzak po blasze: kb=5 kładzie metal tylko w strefie rowka (odsetek poza fazą ≤ połowa kb=4)",z5.overflow<=z4.overflow*0.5,{baked:[z4.baked,z5.baked],overflow:[z4.overflow,z5.overflow]});
const za5=S.simulate(J(zigzag(5,{arc:true}))), za4=S.simulate(J(zigzag(4,{arc:true})));
ok("z łukiem: wyjazd ze strefy gasi łuk — kb=5 kładzie mniej niż kb=4",za5.baked<za4.baked,{baked:[za4.baked,za5.baked]});

// 4) zajarzenie poza rowkiem (na blasze) — ignorowane
const r=J({...build({proc:"MMA",pos:"PA",joint:"butt",thick:8,kb:5}),uf:1,cvn:1}); const d0=r.events.findIndex(e=>e.type==="down");
const far=J(r); far.events=far.events.slice(0,d0).concat([{type:"down",t:far.events[d0].t,x:far.events[d0].x+200,y:far.events[d0].y+70}],
  far.events.slice(d0+1,d0+60).map(e=>e.type==="move"?{...e,y:e.y+70}:e));
const fs5=S.simulate(J(far)), fs4=S.simulate(J({...far,kb:4}));
ok("zajarzenie 70 px od osi (na blasze): kb=4 kładzie metal, kb=5 nic",fs4.baked>0&&fs5.baked===0,{kb4:fs4.baked,kb5:fs5.baked});

ok("wersja 3.11.0 / ocena 1.6.0, zamrożony 3.10.0, ZONE_BW 1,5",S.VERSION==="3.11.0"&&S.SCORING_VERSION==="1.6.0"&&OLD.VERSION==="3.10.0"&&S.ZONE_BW===1.5);
console.log(fail?`\n✗ ${fail} nie przeszło`:"\n✓ wszystko przeszło"); process.exit(fail?1:0);
