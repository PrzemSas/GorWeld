/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// 3.10.0: elektrody (kb=4, MMA) — Ø per ścieg, prąd z Ø, L0 = Ø, zła Ø = wada, HI per ścieg.
// Rundy kb≤3 (każda metoda) i MIG/TIG z kb=4 mają liczyć BIT-W-BIT jak 3.9.0 (zamrożony sim-3.9.0.js).
const S=require("../sim.js"), OLD=require("./sim-3.9.0.js"), {build}=require("./gen.js");
let fail=0; const ok=(n,c,i)=>{console.log((c?"  ✓ ":"  ✗ ")+n+(i!==undefined?"  "+JSON.stringify(i):"")); if(!c) fail++;};
const J=o=>JSON.parse(JSON.stringify(o)), D=[20,25,32,40];
const CFG=[["PA","butt"],["PC","butt"],["PE","butt"],["PF","butt"],["PG","butt"],["PB","fillet"],["PD","fillet"],["PF","fillet"],["P1G","pipe"],["P2G","pipe"],["P5G","pipe"],["HL045","pipe"]];
const TH=[2,3,5,8,12];
const shift=(sh,only)=>(pi,b,typ)=>(only&&!only(pi,b))?null:D[Math.max(0,Math.min(3,D.indexOf(typ)+sh))];
const run=o=>S.simulate(J({...build({proc:"MMA",kb:4,...o}),uf:1,cvn:o.bead==="ss"||o.bead==="alu"?0:1}));

// 1) kb≤3 — bit w bit jak 3.9.0
let n=0,bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [2,5,8,12]) for(const kb of [false,true,2,3]) for(const vFac of [0.7,1.2]){
  const r={...build({proc,pos,joint,thick,vFac,kb}),uf:1,cvn:1}; n++;
  if(JSON.stringify(S.simulate(J(r)))!==JSON.stringify(OLD.simulate(J(r)))) bad.push(`${proc} ${pos} ${thick} kb=${kb}`); }
ok(`kb≤3: 3.10.0 == 3.9.0 bit w bit (${n} rund)`,bad.length===0,bad.slice(0,4));
// z łukiem i kątem (inna ścieżka: L0, napięcie)
n=0; bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of [["PA","butt"],["PF","butt"],["PB","fillet"],["P5G","pipe"]]) for(const thick of TH){
  const r={...build({proc,pos,joint,thick,kb:3,arc:true,ang:true,keyPlan:t=>t%3<1?2:0}),uf:1,cvn:1}; n++;
  if(JSON.stringify(S.simulate(J(r)))!==JSON.stringify(OLD.simulate(J(r)))) bad.push(`${proc} ${pos} ${thick}`); }
ok(`kb=3 z łukiem i kątem: bit w bit (${n} rund)`,bad.length===0,bad.slice(0,4));

// 2) MIG/TIG z kb=4 = kb=3 (elektrody dotyczą tylko MMA)
n=0; bad=[];
for(const proc of ["MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of TH) for(const arc of [false,true]){
  const b4={...build({proc,pos,joint,thick,kb:4,arc}),uf:1,cvn:1}, b3={...b4,kb:3}; n++;
  if(JSON.stringify(S.simulate(J(b4)))!==JSON.stringify(OLD.simulate(J(b3)))) bad.push(`${proc} ${pos} ${thick}`); }
ok(`MIG/TIG kb=4 == kb=3 (${n} rund)`,bad.length===0,bad.slice(0,4));

// 3) MMA kb=4 idealnie, typowa Ø — bez odrzutu
let id=0; bad=[];
for(const [pos,joint] of CFG) for(const thick of TH){ const a=run({pos,joint,thick}); id++;
  if(a.iso==="REJECT"||a.diaPen!==0||a.ampPen!==0||!a.elec||a.elec.some(e=>e.d!==e.typ)) bad.push(`${pos} ${joint} ${thick}: ${a.score} ${a.iso} ${a.rejectReasons}`); }
ok(`MMA kb=4 idealnie, typowa Ø: bez odrzutu, kara 0 (${id} rund)`,bad.length===0,bad.slice(0,6));
const p12=run({pos:"PA",joint:"butt",thick:12});
ok("12 mm PA: grań 2,5 / wypełnienie 4,0 / lico 3,2, prąd z Ø (80/160/115 A)",JSON.stringify(p12.elec.map(e=>[e.d,e.amps]))==="[[25,80],[40,160],[32,115]]",p12.elec.map(e=>[e.d,e.amps]));
const pf8=run({pos:"PF",joint:"butt",thick:8});
ok("PF: prąd × pozycja (3,2 → 98 A)",pf8.elec[2].amps===98,pf8.elec.map(e=>e.amps));

// 4) zła Ø
const typ=run({pos:"PA",joint:"butt",thick:8});
const thin=run({pos:"PA",joint:"butt",thick:8,dia:shift(-1)});
ok("−1 rozmiar: bez odrzutu, wynik niższy, kara Ø",thin.iso!=="REJECT"&&thin.score<typ.score&&thin.diaPen>0,{typ:typ.score,thin:thin.score,diaPen:thin.diaPen});
const rootBig=run({pos:"PA",joint:"butt",thick:8,bead:"ss",dia:shift(1,pi=>pi===0)});
ok("+1 na grani doczołowej (nierdzewka, bez limitu HI) = REJECT electrode",rootBig.iso==="REJECT"&&rootBig.rejectReasons.includes("electrode")&&!rootBig.hiOver,rootBig.rejectReasons);
const capBigSS=run({pos:"PA",joint:"butt",thick:8,bead:"ss",dia:shift(1,pi=>pi===2)});
ok("+1 na licu (nierdzewka) = drobna wada, bez odrzutu",capBigSS.iso!=="REJECT"&&capBigSS.diaPen>0,{score:capBigSS.score,iso:capBigSS.iso});
const two=run({pos:"PA",joint:"butt",thick:8,bead:"ss",dia:shift(-2)});
ok("−2 rozmiary = REJECT electrode",two.iso==="REJECT"&&two.rejectReasons.includes("electrode"),two.rejectReasons);
const filBig=run({pos:"PB",joint:"fillet",thick:5,bead:"ss",dia:shift(1)});
ok("pachwina +1 (nierdzewka) bez odrzutu — grań doczołowa to nie pachwina",filBig.iso!=="REJECT",{reasons:filBig.rejectReasons,score:filBig.score});
// stal: za gruba Ø na licu w AUTO = większy prąd = HI ponad sufit, chyba że jedziesz szybciej
const capBig=run({pos:"PA",joint:"butt",thick:8,dia:shift(1,pi=>pi===2)});
ok("stal, +1 na licu w tempie WPS = REJECT heatInput",capBig.hiOver&&capBig.rejectReasons.includes("heatInput"),{hi:capBig.hi,hiMax:capBig.hiMax});
ok("HI liczony per ścieg, referencja = prąd typowej Ø",capBig.elec[2].amps===160&&capBig.elec[2].ref===115&&capBig.elec[0].hi<capBig.elec[0].hiMax,capBig.elec);

// 5) L0 łuku = Ø (generator trzyma łuk przy nominale wybranej Ø, więc arcR nie zależy od Ø)
const a25=run({pos:"PA",joint:"butt",thick:3,arc:true}), a20=run({pos:"PA",joint:"butt",thick:3,arc:true,dia:shift(-1)});
ok("L0 = Ø: łuk liczony względem wybranej elektrody",Math.abs(a25.arcR-a20.arcR)<0.15&&a20.elec[0].d===20,{a25:a25.arcR,a20:a20.arcR});

// 6) `dia` w trakcie ściegu (po pierwszej kropli) ignorowane
const base=build({proc:"MMA",pos:"PA",joint:"butt",thick:5,kb:4});
const mid=J(base); const iDown=mid.events.findIndex((e,i)=>i>5&&e.type==="up");
mid.events.splice(iDown+1,0,{type:"dia",t:mid.events[iDown].t,x:0,y:0,d:40});
ok("dia po pierwszej kropli ściegu = bez skutku",JSON.stringify(S.simulate(J({...mid,uf:1,cvn:1})))===JSON.stringify(S.simulate(J({...base,uf:1,cvn:1}))));
const junk=J(base); junk.events.unshift({type:"dia",t:0,x:0,y:0,d:33});
ok("dia spoza listy (3,3) = bez skutku",JSON.stringify(S.simulate(J({...junk,uf:1,cvn:1})))===JSON.stringify(S.simulate(J({...base,uf:1,cvn:1}))));
const same=J(base); same.events.unshift({type:"dia",t:0,x:0,y:0,d:25});
ok("dia = typowa → wynik identyczny jak bez zdarzenia",JSON.stringify(S.simulate(J({...same,uf:1,cvn:1})))===JSON.stringify(S.simulate(J({...base,uf:1,cvn:1}))));

// 7) RĘCZNIE (`am`): ampery bezwzględne, ocena względem Ø
const man3=run({pos:"PA",joint:"butt",thick:3,am:true,amps:80}), auto3=run({pos:"PA",joint:"butt",thick:3});
ok("RĘCZNIE 80 A na Ø2,5 == AUTO (ar=1)",man3.score===auto3.score&&man3.ampPen===0);
const man12=run({pos:"PA",joint:"butt",thick:12,am:true,amps:170});
ok("RĘCZNIE 170 A (stara tabela 12 mm) na grani Ø2,5 = REJECT amps",man12.rejectReasons.includes("amps"),man12.rejectReasons);
const man12b=J({...build({proc:"MMA",pos:"PA",joint:"butt",thick:12,kb:4,am:true,amps:80}),uf:1,cvn:1}); { const E=man12b.events; let k=0;
  for(let i=0;i<E.length;i++) if(E[i].type==="bank"){ k++; E.splice(i+1,0,{type:"amp",t:E[i].t,x:0,y:0,a:k===1?160:115}); i++; } }
const m12=S.simulate(man12b);
ok("RĘCZNIE z `amp` między ściegami (80/160/115 A) = bez kary prądu",m12.ampPen===0&&m12.iso!=="REJECT"&&JSON.stringify(m12.elec.map(e=>e.amps))==="[80,160,115]",m12.elec.map(e=>e.amps));
const autoAmp=J({...build({proc:"MMA",pos:"PA",joint:"butt",thick:5,kb:4}),uf:1,cvn:1}); autoAmp.events.unshift({type:"amp",t:0,x:0,y:0,a:200});
ok("`amp` w AUTO = bez skutku",JSON.stringify(S.simulate(J(autoAmp)))===JSON.stringify(S.simulate(J({...build({proc:"MMA",pos:"PA",joint:"butt",thick:5,kb:4}),uf:1,cvn:1}))));
const autoMul=run({pos:"PA",joint:"butt",thick:5,amps:Math.round(S.recommendedAmps("MMA",5,"PA")*1.1),bead:"ss"});
ok("AUTO ×1,1: każdy ścieg +10% swojej Ø (drobna wada prądu)",autoMul.elec.every(e=>Math.abs(e.amps/S.diaAmps(e.d,"PA")-1.1)<0.02)&&autoMul.ampPen>0,autoMul.elec.map(e=>e.amps));

ok("silnik ≥3.10.0 (tu kb=4), zamrożony 3.9.0",S.VERSION.localeCompare("3.10.0",undefined,{numeric:true})>=0&&OLD.VERSION==="3.9.0");
console.log(fail?`\n✗ ${fail} nie przeszło`:"\n✓ wszystko przeszło"); process.exit(fail?1:0);
