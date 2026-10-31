/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// 3.14.0: krótszy łuk MMA (kb=8): pasmo bez kary 0,5–1,1×Ø (było 0,6–1,6). MIG/TIG i rundy kb≤7 BIT-W-BIT jak 3.13.0 (zamrożony sim-3.13.0.js).
const fs=require("fs"), path=require("path");
const S=require("../sim.js"), OLD=require("./sim-3.13.0.js"), {build}=require("./gen.js");
let fail=0; const ok=(n,c,i)=>{console.log((c?"  ✓ ":"  ✗ ")+n+(i!==undefined?"  "+JSON.stringify(i):"")); if(!c) fail++;};
const J=o=>JSON.parse(JSON.stringify(o));
const CFG=[["PA","butt"],["PC","butt"],["PF","butt"],["PG","butt"],["PB","fillet"],["P5G","pipe"]];

// 1) kb≤7 — bit w bit jak 3.13.0, z łukiem i bez
let n=0,bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [2,5,8,12]) for(const kb of [false,true,2,3,4,5,6,7]) for(const arc of [false,true]) for(const vFac of [0.7,1.2]){
  if(pos==="PG"&&thick>5) continue;
  const r={...build({proc,pos,joint,thick,vFac,kb,arc,ang:arc}),uf:1,cvn:1}; n++;
  if(JSON.stringify(S.simulate(J(r)))!==JSON.stringify(OLD.simulate(J(r)))) bad.push(`${proc} ${pos} ${thick} kb=${kb} arc=${arc}`); }
ok(`kb≤7: 3.14.0 == 3.13.0 bit w bit (${n} rund)`,bad.length===0,bad.slice(0,4));

// 2) kb=8: MIG/TIG (z łukiem) i MMA bez łuku (dotyk) == kb=7 tych samych zdarzeń
n=0; bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [2,5,8,12]) for(const arcT of [0.45,1,1.35]){
  if(pos==="PG"&&thick>5) continue;
  const arc=proc!=="MMA";
  const r={...build({proc,pos,joint,thick,kb:8,arc,ang:arc,arcT}),uf:1,cvn:1}; n++;
  if(JSON.stringify(S.simulate(J(r)))!==JSON.stringify(OLD.simulate(J({...r,kb:7})))) bad.push(`${proc} ${pos} ${thick} arcT=${arcT}`); }
ok(`kb=8 MIG/TIG i MMA dotykiem: wynik == kb=7 (${n} rund)`,bad.length===0,bad.slice(0,6));

// 3) kb=8 MMA z łukiem: łuk ~1,35×Ø (był bez kary) teraz płaci; ~0,45×Ø płaci mniej; nominał nie płaci więcej
const mma=(arcT,kb,sim)=>sim.simulate(J({...build({proc:"MMA",pos:"PA",joint:"butt",thick:8,kb,arc:true,ang:true,arcT}),uf:1,cvn:1}));
const L7=mma(1.35,7,OLD), L8=mma(1.35,8,S), S7=mma(0.45,7,OLD), S8=mma(0.45,8,S), N7=mma(1,7,OLD), N8=mma(1,8,S);
ok("MMA łuk 1,35×Ø: kb=8 kara łuku wyraźnie > kb=7, punkty niżej",L8.arcPen>L7.arcPen+3&&L8.score<L7.score,{kb7:[L7.arcPen,L7.score],kb8:[L8.arcPen,L8.score]});
ok("MMA łuk 1,35×Ø: kb=8 więcej pęcherzy niż kb=7",L8.porosity>L7.porosity,{kb7:L7.porosity,kb8:L8.porosity});
ok("MMA łuk 0,45×Ø: kb=8 kara łuku < kb=7 (dolna granica 0,5 zamiast 0,6)",S8.arcPen<S7.arcPen,{kb7:S7.arcPen,kb8:S8.arcPen});
ok("MMA łuk ~1×Ø: kb=8 kara łuku ≤ kb=7",N8.arcPen<=N7.arcPen,{kb7:[N7.arcPen,N7.score],kb8:[N8.arcPen,N8.score]});
ok("MMA kb=8: bez nowych przywarć i zerwań (ARC_MAX_MUL i ARC_STICK_T bez zmian)",[L8,S8,N8].every((x,i)=>x.stickCount===[L7,S7,N7][i].stickCount&&x.arcBroke===[L7,S7,N7][i].arcBroke));

// 4) stałe w grze 1:1 z sim.js, komunikat 0,4/1,3×Ø, nagranie kb=8, ?v= = VERSION
const H=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8"), num=k=>{ const m=H.match(new RegExp(k+"=([0-9.]+)")); return m?+m[1]:NaN; };
ok("index.html: ARC_LO_MMA/ARC_HI_MMA == sim.js",num("ARC_LO_MMA")===S.ARC_LO_MMA&&num("ARC_HI_MMA")===S.ARC_HI_MMA&&S.ARC_LO_MMA===0.5&&S.ARC_HI_MMA===1.1);
ok("index.html: komunikat MMA 0,4 / 1,3×Ø",num("ARC_FB_LO_MMA")===0.4&&num("ARC_FB_HI_MMA")===1.3);
ok("index.html: nagrywa kb≥8 i ładuje sim.js?v="+S.VERSION,(()=>{const m=H.match(/\n\s*kb:(\d+),/); return !!m&&+m[1]>=8;})()&&H.includes(`sim.js?v=${S.VERSION}"`));
ok("silnik ≥3.14.0, zamrożony 3.13.0",S.VERSION.localeCompare("3.14.0",undefined,{numeric:true})>=0&&OLD.VERSION==="3.13.0");
console.log(fail?`\n✗ ${fail} nie przeszło`:"\n✓ wszystko przeszło"); process.exit(fail?1:0);
