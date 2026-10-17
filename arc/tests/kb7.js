/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// 3.13.0: kierunek na ścianie pionowej (kb=7): PF z dołu do góry, PG z góry na dół. Rundy kb≤6 BIT-W-BIT jak 3.12.0 (zamrożony sim-3.12.0.js).
const S=require("../sim.js"), OLD=require("./sim-3.12.0.js"), {build}=require("./gen.js");
let fail=0; const ok=(n,c,i)=>{console.log((c?"  ✓ ":"  ✗ ")+n+(i!==undefined?"  "+JSON.stringify(i):"")); if(!c) fail++;};
const J=o=>JSON.parse(JSON.stringify(o));
const CFG=[["PA","butt"],["PC","butt"],["PE","butt"],["PF","butt"],["PG","butt"],["PB","fillet"],["PD","fillet"],["PF","fillet"],["P1G","pipe"],["P2G","pipe"],["P5G","pipe"],["HL045","pipe"]];
const TH=[2,3,5,8,12];
const strip=r=>{ const o=J(r); delete o.dirWrong; return o; };

// 1) kb≤6 — bit w bit jak 3.12.0
let n=0,bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [2,5,8,12]) for(const kb of [false,true,2,3,4,5,6]) for(const vFac of [0.7,1.2]){
  const r={...build({proc,pos,joint,thick,vFac,kb}),uf:1,cvn:1}; n++;
  if(JSON.stringify(S.simulate(J(r)))!==JSON.stringify(OLD.simulate(J(r)))) bad.push(`${proc} ${pos} ${thick} kb=${kb}`); }
ok(`kb≤6: 3.13.0 == 3.12.0 bit w bit (${n} rund)`,bad.length===0,bad.slice(0,4));

// 2) kb=7 we właściwą stronę == kb=6 tych samych zdarzeń (reguła milczy); poza PF/PG bez pola dirWrong
n=0; bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of TH){
  if(pos==="PG"&&thick>5) continue;
  const r7={...build({proc,pos,joint,thick,kb:7}),uf:1,cvn:1}; n++;
  const a=S.simulate(J(r7)), b=OLD.simulate(J({...r7,kb:6}));
  if(JSON.stringify(strip(a))!==JSON.stringify(b)) bad.push(`${proc} ${pos} ${joint} ${thick}`);
  if((pos==="PF"||pos==="PG")!==("dirWrong" in a)) bad.push(`${proc} ${pos} pole dirWrong`); }
ok(`kb=7 właściwy kierunek: wynik == kb=6 (${n} rund)`,bad.length===0,bad.slice(0,6));

// 3) zły kierunek: PF w dół / PG w górę → REJECT z przyczyną direction, punkty bez zmian
n=0; bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of [["PF","butt"],["PG","butt"],["PF","fillet"]]) for(const thick of TH){
  if(pos==="PG"&&thick>5) continue;
  const r={...build({proc,pos,joint,thick,kb:7,wrongDir:true}),uf:1,cvn:1}; n++;
  const a=S.simulate(J(r)), b=OLD.simulate(J({...r,kb:6}));
  if(a.iso!=="REJECT"||!a.rejectReasons.includes("direction")||a.score!==b.score) bad.push(`${proc} ${pos} ${joint} ${thick}: ${a.iso} ${a.rejectReasons} ${a.score}/${b.score}`); }
ok(`kb=7 zły kierunek: REJECT „direction”, punkty jak kb=6 (${n} rund)`,bad.length===0,bad.slice(0,6));

// 4) próg: krótki ścieg (<DIR_MIN px w pionie) się nie liczy; dirWrong per ścieg
const one=S.simulate(J({...build({proc:"MMA",pos:"PF",joint:"butt",thick:8,kb:7}),uf:1,cvn:1}));
ok("PF 8 mm z dołu: każdy ścieg dirWrong 0, bez direction",one.dirWrong.length>=2&&one.dirWrong.every(w=>w===0)&&!one.rejectReasons.includes("direction"),one.dirWrong);
const wr=S.simulate(J({...build({proc:"MMA",pos:"PF",joint:"butt",thick:8,kb:7,wrongDir:true}),uf:1,cvn:1}));
ok("PF 8 mm z góry: każdy ścieg dirWrong 1",wr.dirWrong.every(w=>w===1),wr.dirWrong);

ok("wersja 3.13.0 / ocena 1.8.0, zamrożony 3.12.0, DIR_MIN 40, DIR_BAD 0,5",S.VERSION==="3.13.0"&&S.SCORING_VERSION==="1.8.0"&&OLD.VERSION==="3.12.0"&&S.DIR_MIN===40&&S.DIR_BAD===0.5);
console.log(fail?`\n✗ ${fail} nie przeszło`:"\n✓ wszystko przeszło"); process.exit(fail?1:0);
