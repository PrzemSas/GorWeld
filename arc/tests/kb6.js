/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// 3.12.0: elektroda zostaje w uchwycie na następny ścieg (kb=6, MMA). Rundy kb≤5 BIT-W-BIT jak 3.11.0 (zamrożony sim-3.11.0.js).
const S=require("../sim.js"), OLD=require("./sim-3.11.0.js"), {build}=require("./gen.js");
let fail=0; const ok=(n,c,i)=>{console.log((c?"  ✓ ":"  ✗ ")+n+(i!==undefined?"  "+JSON.stringify(i):"")); if(!c) fail++;};
const J=o=>JSON.parse(JSON.stringify(o));
const CFG=[["PA","butt"],["PC","butt"],["PE","butt"],["PF","butt"],["PG","butt"],["PB","fillet"],["PD","fillet"],["PF","fillet"],["P1G","pipe"],["P2G","pipe"],["P5G","pipe"],["HL045","pipe"]];
const TH=[2,3,5,8,12];

// 1) kb≤5 — bit w bit jak 3.11.0
let n=0,bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [2,5,8,12]) for(const kb of [false,true,2,3,4,5]) for(const vFac of [0.7,1.2]){
  const r={...build({proc,pos,joint,thick,vFac,kb}),uf:1,cvn:1}; n++;
  if(JSON.stringify(S.simulate(J(r)))!==JSON.stringify(OLD.simulate(J(r)))) bad.push(`${proc} ${pos} ${thick} kb=${kb}`); }
ok(`kb≤5: 3.12.0 == 3.11.0 bit w bit (${n} rund)`,bad.length===0,bad.slice(0,4));

// 2) MIG/TIG kb=6 == kb=5 (elektrody tylko MMA)
n=0; bad=[];
for(const proc of ["MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of TH){ const r6={...build({proc,pos,joint,thick,kb:6}),uf:1,cvn:1}; n++;
  if(JSON.stringify(S.simulate(J(r6)))!==JSON.stringify(OLD.simulate(J({...r6,kb:5})))) bad.push(`${proc} ${pos} ${thick}`); }
ok(`MIG/TIG kb=6 == kb=5 (${n} rund)`,bad.length===0,bad.slice(0,4));

// 3) MMA: dobry spawacz (typowa na każdy ścieg, zmiana zdarzeniem dia) — bez odrzutu, bez kary Ø
n=0; bad=[];
for(const [pos,joint] of CFG) for(const thick of TH){ const a=S.simulate(J({...build({proc:"MMA",pos,joint,thick,kb:6}),uf:1,cvn:1})); n++;
  if(a.iso==="REJECT"||a.diaPen!==0||a.elec.some(e=>e.d!==e.typ)) bad.push(`${pos} ${joint} ${thick}: ${a.score} ${a.iso} ${a.rejectReasons}`); }
ok(`MMA kb=6, typowa Ø zmieniana na każdy ścieg: bez odrzutu, kara Ø 0 (${n} rund)`,bad.length===0,bad.slice(0,6));

// 4) bez zmiany elektrody — zostaje ta z przetopu (sedno 3.12.0)
const lazy8=S.simulate(J({...build({proc:"MMA",pos:"PA",joint:"butt",thick:8,kb:6,lazy:true}),uf:1,cvn:1}));
ok("8 mm, gracz nie zmienia elektrody: Ø2,5 zostaje na wypełnieniu i licu (kara Ø, ostrzeżenie)",JSON.stringify(lazy8.elec.map(e=>e.d))==="[25,25,25]"&&lazy8.diaPen>0,{elec:lazy8.elec.map(e=>[e.d,e.typ]),diaPen:lazy8.diaPen,iso:lazy8.iso});
const lazy5old=OLD.simulate(J({...build({proc:"MMA",pos:"PA",joint:"butt",thick:8,kb:5}),uf:1,cvn:1}));
ok("dla porównania kb=5: bez zdarzeń Ø wracała do typowej (2,5 → 3,2 → 3,2)",JSON.stringify(lazy5old.elec.map(e=>e.d))==="[25,32,32]");
const keep32=S.simulate(J({...build({proc:"MMA",pos:"PA",joint:"butt",thick:8,kb:6,lazy:true,dia:(pi)=>pi===1?32:null}),uf:1,cvn:1}));
ok("zmiana na 3,2 przed wypełnieniem zostaje też na licu",JSON.stringify(keep32.elec.map(e=>e.d))==="[25,32,32]"&&keep32.diaPen===0,keep32.elec.map(e=>e.d));

ok("wersja 3.12.0 / ocena 1.7.0, zamrożony 3.11.0",S.VERSION==="3.12.0"&&S.SCORING_VERSION==="1.7.0"&&OLD.VERSION==="3.11.0");
console.log(fail?`\n✗ ${fail} nie przeszło`:"\n✓ wszystko przeszło"); process.exit(fail?1:0);
