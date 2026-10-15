/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// 3.8.0: plan ściegów wg praktyki (kb=2). Rundy kb=1 i bez kb mają liczyć BIT-W-BIT jak 3.7.0
// (zamrożony sim-3.7.0.js) — stare wyniki i nagrania nie mogą zmienić się po cichu.
const S=require("../sim.js"), OLD=require("./sim-3.7.0.js"), {build}=require("./gen.js");
let fail=0; const ok=(n,c,i)=>{console.log((c?"  ✓ ":"  ✗ ")+n+(i!==undefined?"  "+JSON.stringify(i):"")); if(!c) fail++;};
const J=o=>JSON.parse(JSON.stringify(o));
const CFG=[["PA","butt"],["PC","butt"],["PE","butt"],["PF","butt"],["PG","butt"],["PB","fillet"],["PD","fillet"],["PF","fillet"],["P1G","pipe"],["P2G","pipe"],["P5G","pipe"],["HL045","pipe"]];

// 1) kb=1 i bez kb — bit w bit jak 3.7.0
let n=0,bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [2,5,8,12]) for(const kb of [false,true]) for(const vFac of [0.7,1.2]){
  const r={...build({proc,pos,joint,thick,vFac,kb}),uf:1,cvn:1}; n++;
  if(JSON.stringify(S.simulate(J(r)))!==JSON.stringify(OLD.simulate(J(r)))) bad.push(`${proc} ${pos} ${thick} kb=${kb}`); }
ok(`kb=1 / bez kb: 3.8.0 == 3.7.0 bit w bit (${n} rund)`,bad.length===0,bad.slice(0,4));
let pl=0,plBad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [2,3,5,8,12]){ pl++;
  if(JSON.stringify(S.weldPlan(joint,thick,pos,proc))!==JSON.stringify(OLD.weldPlan(joint,thick,pos,proc))) plBad.push(`${proc} ${pos} ${joint} ${thick}`); }
ok(`weldPlan bez wersji == 3.7.0 (${pl} kombinacji)`,plBad.length===0,plBad.slice(0,4));

// 2) plan v2: przetop prosty, wypełnienie i lico wahadłem — wszędzie
const P2=(j,t,p,pr)=>S.weldPlan(j,t,p,pr,2), sig=a=>a.map(b=>b.k+(b.wv?"≈":"")).join(" ");
let tb=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG.filter(c=>c[1]!=="fillet")){
  const e={2:"cap",3:"cap",5:"root cap≈",8:"root fill≈ cap≈",12:"root fill≈ cap≈"};
  for(const t of [2,3,5,8,12]) if(sig(P2(joint,t,pos,proc))!==e[t]) tb.push(`${proc} ${pos} ${t}: ${sig(P2(joint,t,pos,proc))}`); }
ok("doczołowe i rura: 12/8 mm = przetop + wypełnienie≈ + lico≈, 5 mm = przetop + lico≈, ≤3 mm = 1 ścieg",tb.length===0,tb.slice(0,4));
ok("pachwina v2 == v1 (bez zmian)",["MMA","MIG","TIG"].every(pr=>["PB","PD","PF","PA","PC"].every(p=>[5,8,12].every(t=>JSON.stringify(P2("fillet",t,p,pr))===JSON.stringify(S.weldPlan("fillet",t,p,pr))))));
ok("12 mm MAG PE: 3 ściegi (było 7)",P2("butt",12,"PE","MIG").length===3&&S.weldPlan("butt",12,"PE","MIG").length===7);

// 3) idealny przejazd kb=2 — żadnej nowej przyczyny odrzutu, lico przykrywa fazę
let ideal=0,idealBad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [2,5,8,12]){
  const r={...build({proc,pos,joint,thick,kb:2}),uf:1,cvn:1}, a=S.simulate(J(r)); ideal++;
  const nw=(a.rejectReasons||[]).filter(x=>["edges","interbead","slag"].includes(x));
  if(r.kb!==2||nw.length||a.edgeCov<0.85||a.ibMax>0) idealBad.push(`${proc} ${pos} ${joint} ${thick}: ${a.score} ${a.iso} ${nw} edge ${a.edgeCov}`); }
ok(`kb=2 idealnie: lico przykrywa fazę, bez 401/301 (${ideal} rund)`,idealBad.length===0,idealBad.slice(0,6));

// 4) kb=2 zmienia tylko to, co ma zmienić
const a1=S.simulate(J({...build({proc:"MMA",pos:"PC",joint:"butt",thick:12,kb:true}),uf:1,cvn:1})), a2=S.simulate(J({...build({proc:"MMA",pos:"PC",joint:"butt",thick:12,kb:2}),uf:1,cvn:1}));
ok("12 mm MMA PC: kb=1 → 10 ściegów, kb=2 → 3",a1.beads===10&&a2.beads===3,{kb1:a1.beads,kb2:a2.beads});
const ns=S.simulate(J({...build({proc:"MMA",pos:"PA",joint:"butt",thick:8,kb:2,chip:false}),uf:1,cvn:1}));
ok("kb=2 MMA bez młotka dalej REJECT slag",ns.iso==="REJECT"&&ns.rejectReasons.includes("slag"),{reasons:ns.rejectReasons});

ok("wersja 3.8.0 / ocena 1.3.0, zamrożony 3.7.0",S.VERSION==="3.8.0"&&S.SCORING_VERSION==="1.3.0"&&OLD.VERSION==="3.7.0");
console.log(fail?`\n✗ ${fail} nie przeszło`:"\n✓ wszystko przeszło"); process.exit(fail?1:0);
