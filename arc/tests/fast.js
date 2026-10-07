/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// ZA SZYBKI PRZEJAZD (3.6.0): średnie tempo ściegu > 1+FAST_TOL·tol × WPS = REJECT „underfill".
// Do progu silnik liczy BIT-W-BIT jak 3.5.0 — inaczej stare wyniki i pojedynki zmieniłyby się po cichu.
const fs=require("fs"), path=require("path");
const S=require("../sim.js"), OLD=require("./sim-3.5.0.js"), {build}=require("./gen.js");
let fail=0; const ok=(n,c,i)=>{console.log((c?"  ✓ ":"  ✗ ")+n+(i!==undefined?"  "+JSON.stringify(i):"")); if(!c) fail++;};
const NEW_KEYS=new Set(["fastR","fastMax","tooFast","rejectReasons"]);
const TOL={steel:1,ss:0.82,alu:0.7};

// 1) w tempie — identycznie jak 3.5.0
const cfg=[];
for(const proc of ["MMA","MIG","TIG"]) for(const bead of ["steel","ss","alu"]) for(const [pos,joint] of [["PA","butt"],["PF","butt"],["PC","fillet"],["P5G","pipe"]])
  for(const thick of [2,3,5,8]) cfg.push({proc,bead,pos,joint,thick});
let same=0,diffs=[],changed=[];
for(const c of cfg) for(const vFac of [0.3,0.6,0.85,1,1.15,1.3]) for(const arc of [false,true]){
  if(c.proc==="TIG"&&arc) continue;
  const r={...build({...c,vFac,arc}),uf:1}, a=S.simulate(JSON.parse(JSON.stringify(r))), b=OLD.simulate(JSON.parse(JSON.stringify(r)));
  const bad=Object.keys(b).filter(k=>!NEW_KEYS.has(k)&&JSON.stringify(a[k])!==JSON.stringify(b[k]));
  if(bad.length) diffs.push(`${c.proc} ${c.bead} ${c.pos} ${c.thick} ×${vFac}: ${bad}`);
  if(a.tooFast) changed.push(`${c.proc} ${c.bead} ${c.pos} ${c.thick} ×${vFac} fastR ${a.fastR}`);
  else same++;
}
ok(`tempo 0,3–1,3× WPS: wynik, litera i ISO bit-w-bit jak 3.5.0 (${same} rund)`,diffs.length===0&&changed.length===0,diffs.concat(changed).slice(0,5));

// 2) za szybko — odrzut z przyczyną „underfill", a punkty bez zmian (to warunek dopuszczenia, nie kara)
let rej=0,miss=[];
for(const c of cfg) for(const vFac of [1.6,2,3,5]){
  const r={...build({...c,vFac}),uf:1}, a=S.simulate(JSON.parse(JSON.stringify(r))), b=OLD.simulate(JSON.parse(JSON.stringify(r)));
  if(a.iso==="REJECT"&&a.rejectReasons.includes("underfill")&&a.score===b.score) rej++; else miss.push(`${c.proc} ${c.bead} ${c.pos} ${c.thick} ×${vFac} → ${a.iso} ${a.rejectReasons} fastR ${a.fastR}/${a.fastMax}`);
}
ok(`1,6–5× WPS: REJECT underfill, punkty jak w 3.5.0 (${rej} rund)`,miss.length===0,miss.slice(0,5));

// 3) próg zależy od materiału
for(const bead of ["steel","ss","alu"]){ const r=S.simulate({...build({proc:"MMA",thick:3,bead,vFac:1}),uf:1});
  ok(`próg ${bead} = 1 + 0,5·${TOL[bead]}`,Math.abs(r.fastMax-(1+0.5*TOL[bead]))<1e-9,r.fastMax); }

// 4) najgorszy ścieg decyduje — szybki tylko jeden z kilku
const multi=build({proc:"MMA",thick:8,vFac:1}), fastPass=build({proc:"MMA",thick:8,vFac:2.5});
const banks=ev=>ev.reduce((a,e,i)=>(e.type==="bank"&&a.push(i),a),[]);
const bm=banks(multi.events), bf=banks(fastPass.events);
const t0=multi.events[bm[1]].t, last=fastPass.events.slice(bf[1]+1), off=t0-fastPass.events[bf[1]].t;
const mixed={...multi,uf:1,events:multi.events.slice(0,bm[1]+1).concat(last.map(e=>({...e,t:e.t+off})))};
const mr=S.simulate(mixed);
ok("jeden za szybki ścieg z trzech wystarczy do odrzutu",mr.iso==="REJECT"&&mr.rejectReasons.includes("underfill"),{fastR:mr.fastR,iso:mr.iso,rr:mr.rejectReasons});

// 5) bez flagi `uf` (nagrania sprzed 3.6.0) — dalej bit-w-bit jak 3.5.0, nawet za szybko
let oldSame=0,oldBad=[];
for(const vFac of [1.6,2,3,5]) for(const proc of ["MMA","MIG","TIG"]){ const r=build({proc,thick:3,vFac});
  const a=S.simulate(JSON.parse(JSON.stringify(r))), b=OLD.simulate(JSON.parse(JSON.stringify(r)));
  const bad=Object.keys(b).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])); if(bad.length||a.tooFast) oldBad.push(`${proc} ×${vFac}: ${bad}`); else oldSame++; }
ok(`nagranie bez \`uf\`: bez nowej reguły (${oldSame} rund)`,oldBad.length===0,oldBad.slice(0,4));

// 6) stałe 1:1 w grze
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
ok("FAST_TOL w index.html = sim.js",/const FAST_TOL=0\.5;/.test(html));
ok("gra liczy tooFast tym samym wzorem",html.includes("tooFast=fastV/targetPx>1+FAST_TOL*MATERIAL[bead].tol"));
ok("gra zapisuje flagę `uf` w nagraniu",/\buf:1,/.test(html));
ok("SCORING_VERSION podbite",S.SCORING_VERSION==="1.1.0"&&OLD.SCORING_VERSION==="1.0.0",S.SCORING_VERSION);

console.log(fail?`\n✗ ${fail} nie przeszło`:"\n✓ wszystko przeszło"); process.exit(fail?1:0);
