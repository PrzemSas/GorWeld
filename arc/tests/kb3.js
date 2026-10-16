/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// 3.9.0: fizyczna skala blachy (kb=3). Rundy kb=2, kb=1 i bez kb mają liczyć BIT-W-BIT jak 3.8.0
// (zamrożony sim-3.8.0.js) — stare wyniki i nagrania nie mogą zmienić się po cichu.
const S=require("../sim.js"), OLD=require("./sim-3.8.0.js"), {build}=require("./gen.js");
let fail=0; const ok=(n,c,i)=>{console.log((c?"  ✓ ":"  ✗ ")+n+(i!==undefined?"  "+JSON.stringify(i):"")); if(!c) fail++;};
const J=o=>JSON.parse(JSON.stringify(o));
const CFG=[["PA","butt"],["PC","butt"],["PE","butt"],["PF","butt"],["PG","butt"],["PB","fillet"],["PD","fillet"],["PF","fillet"],["P1G","pipe"],["P2G","pipe"],["P5G","pipe"],["HL045","pipe"]];
const TH=[2,3,5,8,12];

// 1) kb=2 / kb=1 / bez kb — bit w bit jak 3.8.0
let n=0,bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [2,5,8,12]) for(const kb of [false,true,2]) for(const vFac of [0.7,1.2]){
  const r={...build({proc,pos,joint,thick,vFac,kb}),uf:1,cvn:1}; n++;
  if(JSON.stringify(S.simulate(J(r)))!==JSON.stringify(OLD.simulate(J(r)))) bad.push(`${proc} ${pos} ${thick} kb=${kb}`); }
ok(`kb=2 / kb=1 / bez kb: 3.9.0 == 3.8.0 bit w bit (${n} rund)`,bad.length===0,bad.slice(0,4));

// 2) geometria: jedna skala px/mm dla każdej grubości, grubość rośnie proporcjonalnie
const kOf=t=>S.grooveGeom(t,true).gh*1.25/S.capHalfMm(t);
ok("jedna skala VIS_K dla 2/3/5/8/12 mm",TH.every(t=>Math.abs(kOf(t)-S.VIS_K)<1e-9),TH.map(t=>+kOf(t).toFixed(3)));
const oldK=TH.map(t=>S.grooveGeom(t,false).gh*1.25/S.capHalfMm(t));
ok("3.8.0 miało różne skale (dowód problemu)",Math.max(...oldK)-Math.min(...oldK)>0.3,oldK.map(k=>+k.toFixed(2)));
ok("12 mm na ekranie = 4× 3 mm (krawędź blachy t·k)",Math.abs((12*kOf(12))/(3*kOf(3))-4)<1e-9);
ok("bevelW rośnie w proporcji do lica",TH.every(t=>{const a=S.grooveGeom(t,false),b=S.grooveGeom(t,true); return Math.abs(b.bw/b.gh-a.bw/a.gh)<1e-9;}));
ok("3 mm prawie bez zmian (±1%)",Math.abs(S.grooveGeom(3,true).gh/S.grooveGeom(3,false).gh-1)<0.01);

// 3) idealny przejazd kb=3 — bez odrzutu, lico przykrywa fazę
let ideal=0,idealBad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [2,3,5,8,12]){
  const r={...build({proc,pos,joint,thick,kb:3}),uf:1,cvn:1}, a=S.simulate(J(r)); ideal++;
  if(r.kb!==3||a.iso==="REJECT"||a.edgeCov<0.85||a.ibMax>0) idealBad.push(`${proc} ${pos} ${joint} ${thick}: ${a.score} ${a.iso} ${a.rejectReasons} edge ${a.edgeCov}`); }
ok(`kb=3 idealnie: bez odrzutu, lico przykrywa fazę (${ideal} rund)`,idealBad.length===0,idealBad.slice(0,6));

// 4) kb=3 vs kb=2 na idealnym przejeździe — wynik tego samego rzędu (skala nie może zmienić trudności)
let dmax=0,dw="";
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of [["PA","butt"],["PF","butt"],["PB","fillet"],["P5G","pipe"]]) for(const thick of TH){
  const a2=S.simulate(J({...build({proc,pos,joint,thick,kb:2}),uf:1,cvn:1})), a3=S.simulate(J({...build({proc,pos,joint,thick,kb:3}),uf:1,cvn:1}));
  const d=Math.abs(a3.score-a2.score); if(d>dmax){dmax=d; dw=`${proc} ${pos} ${thick}: ${a2.score}→${a3.score}`;} }
ok("idealnie: kb=3 vs kb=2 różnica wyniku ≤ 3 pkt",dmax<=3,{dmax,dw});
const ns=S.simulate(J({...build({proc:"MMA",pos:"PA",joint:"butt",thick:8,kb:3,chip:false}),uf:1,cvn:1}));
ok("kb=3 MMA bez młotka dalej REJECT slag",ns.iso==="REJECT"&&ns.rejectReasons.includes("slag"),{reasons:ns.rejectReasons});
ok("kb=3 = plan ściegów 3.8.0",["MMA","MIG","TIG"].every(pr=>TH.every(t=>S.simulate(J({...build({proc:pr,pos:"PA",joint:"butt",thick:t,kb:3}),uf:1,cvn:1})).beads===S.weldPlan("butt",t,"PA",pr,2).length)));

ok("wersja 3.9.0 / ocena 1.4.0, zamrożony 3.8.0",S.VERSION==="3.9.0"&&S.SCORING_VERSION==="1.4.0"&&OLD.VERSION==="3.8.0");
console.log(fail?`\n✗ ${fail} nie przeszło`:"\n✓ wszystko przeszło"); process.exit(fail?1:0);
