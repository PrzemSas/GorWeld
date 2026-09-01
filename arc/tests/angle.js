/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 * Proprietary software. Copying, redistribution or commercial use without prior written
 * permission is prohibited.
 *
 * Opublikowane po to, zeby KAZDY mogl sam sprawdzic, ze gra i weryfikator licza tak samo —
 * od tego zalezy wiarygodnosc oceny w konkursie. Patrz README.md w tym katalogu.
 */
const NEW=require("../sim.js");
const {build}=require("./gen.js");
const J=r=>JSON.parse(JSON.stringify(r));

// ── TEST 2 — NEUTRALNOŚĆ: kąt włączony, ale gracz nie dotyka klawiatury ──
// Musi wyjść dokładnie tyle samo, co runda w ogóle bez modelu kąta.
let n2=0,bad2=[];
for(const proc of ["MMA","MIG","TIG"]) for(const pos of ["PA","PC","PE","PF","HL045"])
  for(const thick of [2,3,5,8,12]) for(const arc of [false,true]){
    const off=NEW.simulate(J(build({proc,pos,thick,arc})));
    const on =NEW.simulate(J(build({proc,pos,thick,arc,ang:true,keyPlan:()=>0})));
    n2++;
    for(const k of ["score","coverage","spdAcc","evenness","overflow","porosity","spatter","baked"])
      if(off[k]!==on[k]){ bad2.push(`${proc} ${pos} ${thick}mm${arc?" +łuk":""}  ${k}: ${off[k]} ≠ ${on[k]}`); break; }
  }
console.log(`TEST 2 (kąt na WPS = zero kosztu): ${n2-bad2.length}/${n2}`);
bad2.slice(0,8).forEach(b=>console.log("  ✗",b));

// ── TEST 3 — MECHANIKA GRYZIE: odjazd od WPS ma kosztować i wołać wadę ──
const base={proc:"MMA",pos:"PA",thick:5,arc:true,ang:true};
const hold=bit=>()=>bit;
const runs=[
  ["kąt wg WPS (nic nie wciśnięte)", ()=>0],
  ["A — roboczy w lewo do oporu",    hold(1)],
  ["D — roboczy w prawo do oporu",   hold(2)],
  ["W — pchanie do oporu",           hold(4)],
  ["S — ciągnięcie do oporu",        hold(8)],
  ["machanie D↔A co 0,5 s",          s=>(Math.floor(s*2)%2?1:2)],
];
console.log("\nTEST 3 (MMA PA 5 mm, żywy łuk) — co robi kąt z wynikiem:");
console.log("  " + "przebieg".padEnd(34) + "wynik  angPen  pokr.  wa°     ta°");
const out=[];
for(const [lbl,kp] of runs){
  const r=NEW.simulate(J(build({...base,keyPlan:kp})));
  out.push({lbl,r});
  console.log("  " + lbl.padEnd(34) +
    String(r.score).padStart(5) + String(r.angPen.toFixed(1)).padStart(8) +
    (r.coverage*100).toFixed(1).padStart(7) + String(r.waDeg).padStart(8) + String(r.taDeg).padStart(8));
}
const wps=out[0].r;
const fails=[];
if(wps.coverage<0.999) fails.push(`przebieg wzorcowy nie domyka szwu (${(wps.coverage*100).toFixed(1)}%) — test nic nie mierzy`);
if(wps.angPen!==0) fails.push("runda wg WPS naliczyła karę kąta");
for(const {lbl,r} of out.slice(1)){
  if(r.angPen<=0) fails.push(`"${lbl}" nie naliczył kary`);
  if(r.score>=wps.score) fails.push(`"${lbl}" nie stracił punktów wobec WPS`);
  // ⚠ NAJWAŻNIEJSZE: kąt NIE MOŻE zbić pokrycia — to ten sam licznik, który przełącza warstwy
  // (`coverageNow()>=0.9`). Mierzymy WZGLĘDEM przebiegu wg WPS, bo to on jest wzorcem.
  if(r.coverage < wps.coverage-0.02) fails.push(`"${lbl}" zbił pokrycie ${(wps.coverage*100).toFixed(1)}% → ${(r.coverage*100).toFixed(1)}% — GRA BY SIĘ ZABLOKOWAŁA`);
  if(r.passes!==wps.passes) fails.push(`"${lbl}" zmienił liczbę warstw`);
}
console.log(`\nTEST 3: ${fails.length?"✗":"✓"} ${fails.length?fails.join(" | "):"kara rośnie, pokrycie i warstwy nietknięte"}`);

// ── TEST 4 — pokrycie przy maksymalnym przekręceniu, na CAŁEJ macierzy ──
let n4=0,bad4=[];
for(const proc of ["MMA","MIG","TIG"]) for(const pos of ["PA","PB","PC","PE","PF","P2G","HL045"])
  for(const thick of [2,3,5,8,12]) for(const bit of [1,2,4,8]){
    const r=NEW.simulate(J(build({proc,pos,thick,arc:true,ang:true,keyPlan:()=>bit})));
    const ref=NEW.simulate(J(build({proc,pos,thick,arc:true,ang:true,keyPlan:()=>0})));
    n4++; if(r.coverage < ref.coverage-0.02) bad4.push(`${proc} ${pos} ${thick}mm klawisz ${bit} → pokrycie ${(ref.coverage*100).toFixed(1)}% → ${(r.coverage*100).toFixed(1)}%`);
  }
console.log(`TEST 4 (kąt do oporu nie blokuje warstw): ${n4-bad4.length}/${n4}`);
bad4.slice(0,8).forEach(b=>console.log("  ✗",b));

process.exitCode=(bad2.length||fails.length||bad4.length)?1:0;
