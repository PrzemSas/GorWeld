/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// KOMBAJN (3.7.0): realna sekwencja ściegów. Bez flagi `kb` silnik ma liczyć BIT-W-BIT jak 3.6.0
// (zamrożony sim-3.6.0.js) — inaczej stare wyniki i pojedynki zmieniłyby się po cichu.
const S=require("../sim.js"), OLD=require("./sim-3.6.0.js"), {build}=require("./gen.js");
let fail=0; const ok=(n,c,i)=>{console.log((c?"  ✓ ":"  ✗ ")+n+(i!==undefined?"  "+JSON.stringify(i):"")); if(!c) fail++;};
const J=o=>JSON.parse(JSON.stringify(o));
const CFG=[["PA","butt"],["PC","butt"],["PE","butt"],["PF","butt"],["PG","butt"],["PB","fillet"],["PF","fillet"],["P1G","pipe"],["P2G","pipe"],["P5G","pipe"],["HL045","pipe"]];

// 1) bez kb — bit w bit jak 3.6.0
let n=0,bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [2,5,8,12]) for(const vFac of [0.6,1,1.3]) for(const arc of [false,true]){
  if(proc==="TIG"&&arc) continue; const r={...build({proc,pos,joint,thick,vFac,arc}),uf:1,cvn:1}; n++;
  if(JSON.stringify(S.simulate(J(r)))!==JSON.stringify(OLD.simulate(J(r)))) bad.push(`${proc} ${pos} ${thick} ×${vFac}`); }
ok(`bez kb: 3.7.0 == 3.6.0 bit w bit (${n} rund)`,bad.length===0,bad.slice(0,4));

// 2) tabela ściegów — realne liczby (12 mm doczołowe)
const cnt=(j,t,p,pr)=>S.weldPlan(j,t,p,pr).length;
ok("12 mm MMA: PC 10 · PE 9 · PA 6 · PF 4 ściegów",[cnt("butt",12,"PC","MMA"),cnt("butt",12,"PE","MMA"),cnt("butt",12,"PA","MMA"),cnt("butt",12,"PF","MMA")].join()==="10,9,6,4");
ok("MAG o warstwę mniej, TIG o warstwę więcej (12 mm PC)",cnt("butt",12,"PC","MIG")<10&&cnt("butt",12,"PC","TIG")>10,[cnt("butt",12,"PC","MIG"),cnt("butt",12,"PC","TIG")]);
ok("2–3 mm: jeden ścieg (złącze I) wszędzie",["PA","PC","PE","PF","PG"].every(p=>cnt("butt",2,p,"MMA")===1&&cnt("butt",3,p,"TIG")===1));
const pc=S.weldPlan("butt",12,"PC","MMA").filter(b=>b.lay===3);
ok("PC: lico od dołu do góry (pierwszy ścieg na torze +1 = dół ekranu)",pc[0].lane===1&&pc[pc.length-1].lane===-1);

// 3) idealnie po torach, z młotkiem — żadnej nowej przyczyny odrzutu
let ideal=0,idealBad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [2,5,8,12]){
  const r={...build({proc,pos,joint,thick,kb:true}),uf:1,cvn:1}, a=S.simulate(J(r)); ideal++;
  const nw=(a.rejectReasons||[]).filter(x=>["edges","interbead","slag"].includes(x));
  if(nw.length||a.edgeCov<0.85||a.ibMax>0) idealBad.push(`${proc} ${pos} ${thick}: ${a.score} ${a.iso} ${nw} edge ${a.edgeCov} ib ${a.ibMax}`); }
ok(`po torach: lico przykrywa fazę, ściegi zlane, bez żużla (${ideal} rund)`,idealBad.length===0,idealBad.slice(0,4));

// 4) wszystkie ściegi przy osi (tory ignorowane) — lico nie przykrywa fazy albo ściegi się nie zlewają
let caught=0,miss=[];
for(const proc of ["MMA","MIG"]) for(const [pos,joint] of [["PC","butt"],["PE","butt"],["PA","butt"],["P2G","pipe"]]){
  const r={...build({proc,pos,joint,thick:12,kb:true,laneFac:0}),uf:1,cvn:1}, a=S.simulate(J(r));
  if(a.iso==="REJECT"&&a.rejectReasons.some(x=>x==="edges"||x==="interbead")) caught++; else miss.push(`${proc} ${pos}: ${a.iso} ${a.rejectReasons} edge ${a.edgeCov}`); }
ok("12 mm, wszystko środkiem: REJECT edges/interbead",miss.length===0,miss);
const far={...build({proc:"MMA",pos:"PC",joint:"butt",thick:12,kb:true,laneFac:1.9}),uf:1,cvn:1}, fa=S.simulate(J(far));
ok("ściegi rozjechane za szeroko: brak wtopienia między ściegami (interbead)",fa.ibGaps>0,{ib:fa.ibMax,reasons:fa.rejectReasons});

// 5) MMA bez młotka — wtrącenie żużla (301)
const ns={...build({proc:"MMA",pos:"PA",joint:"butt",thick:8,kb:true,chip:false}),uf:1,cvn:1}, na=S.simulate(J(ns));
ok("MMA bez czyszczenia żużla: REJECT slag",na.iso==="REJECT"&&na.rejectReasons.includes("slag")&&na.slag>0,{slag:na.slag,reasons:na.rejectReasons});
const mg={...build({proc:"MIG",pos:"PA",joint:"butt",thick:8,kb:true,chip:false}),uf:1,cvn:1}, ma=S.simulate(J(mg));
ok("MAG bez żużla nie dostaje 301",!(ma.rejectReasons||[]).includes("slag")&&!ma.slag,{slag:ma.slag});

ok("wersja 3.7.0 / ocena 1.2.0",S.VERSION==="3.7.0"&&S.SCORING_VERSION==="1.2.0"&&OLD.VERSION==="3.6.0");
console.log(fail?`\n✗ ${fail} nie przeszło`:"\n✓ wszystko przeszło"); process.exit(fail?1:0);
