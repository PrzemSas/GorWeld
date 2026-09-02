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
// TEST 1 — REGRESJA: runda BEZ kąta musi liczyć się w 3.0.0 bit-w-bit tak jak w 2.0.0.
const OLD=require("./sim-3.2.0.js");
const NEW=require("../sim.js");
const {build}=require("./gen.js");
console.log("stary silnik",OLD.VERSION,"→ nowy",NEW.VERSION);

const PROCS=["MMA","MIG","TIG"], THICK=[2,3,5,8,12], BEADS=["steel","ss","alu"];
const POS={MMA:["PA","PB","PC","PD","PE","PF","PG","P1G","P2G","P5G","HL045"],
           MIG:["PA","PC","PE","PF","P2G"], TIG:["PA","PC","PF","HL045"]};
const VF=[0.6,1.0,1.6];

let n=0, bad=[];
// pola, które MUSZĄ być identyczne (nowe pola kąta w starym silniku nie istnieją)
const KEYS=["score","letter","iso","coverage","spdAcc","evenness","overflow","porosity",
            "spatter","endGap","baked","passes","difficulty","ampPen","arcPen","arcR",
            "stickCount","arcBroke","volts"];
function cmp(a,b,tag){
  n++;
  for(const k of KEYS) if(a[k]!==b[k]){ bad.push(`${tag}  ${k}: ${a[k]} ≠ ${b[k]}`); return; }
}
for(const proc of PROCS) for(const pos of POS[proc]) for(const thick of THICK) for(const bead of BEADS) for(const vFac of VF){
  for(const arc of [false,true]){
    const r=build({proc,pos,thick,bead,vFac,arc});
    const tag=`${proc} ${pos} ${thick}mm ${bead} v×${vFac}${arc?" +łuk":""}`;
    cmp(OLD.simulate(JSON.parse(JSON.stringify(r))), NEW.simulate(JSON.parse(JSON.stringify(r))), tag);
  }
}
// prąd poza WPS też musi przejść nietknięty
for(const mul of [0.7,0.85,1.15,1.3]){
  const rec=NEW.recommendedAmps("MMA",5,"PA");
  for(const arc of [false,true]){
    const r=build({proc:"MMA",pos:"PA",thick:5,amps:Math.round(rec*mul),arc});
    cmp(OLD.simulate(JSON.parse(JSON.stringify(r))),NEW.simulate(JSON.parse(JSON.stringify(r))),`MMA amps×${mul}${arc?" +łuk":""}`);
  }
}
console.log(`\nTEST 1 (regresja bez kąta): ${n-bad.length}/${n} bit-w-bit`);
bad.slice(0,12).forEach(b=>console.log("  ✗",b));
process.exitCode = bad.length?1:0;
