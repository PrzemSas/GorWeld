// Odchyłka toru od grani (3.2.0). Do 3.1.0 zjechanie z osi kosztowało DOKŁADNIE ZERO aż do
// progu podtopienia, a tuż za nim leciał REJECT — bo `depositBead()` przyciąga kroplę 40%
// z powrotem do grani, więc `coverage` odchyłki nie widziało. Zgłosił to ROY (@ROYXIAO2000)
// na X: „ścieżka spawania może odbiegać od zamierzonej". Miał rację.
// Test pilnuje, żeby kara była ZBOCZEM, nie schodkiem — i żeby zero odchyłki dalej dawało zero.
const { build } = require("./gen.js");
const { simulate } = require("../sim.js");

const R = { proc:"MMA", pos:"PA", thick:5, bead:"steel", joint:"butt", arc:false, seed:99 };
const round = build(R);
const run = ev => simulate({ ...round, events:ev });
// ścieg PA leży poziomo, więc „w bok od grani" = oś Y
const shift = (dy,f=null) => round.events.map((e,i)=> (e.type==="move"||e.type==="down"||e.type==="up")
  ? { ...e, y:+(e.y + (f?f(i):dy)).toFixed(2) } : e);

const D=[0,3,6,9,12,16,22], res=D.map(d=>run(d?shift(d):round.events));
console.log("MMA PA 5 mm — tor przesunięty w bok od grani (1 mm = 16 px):\n");
console.log("  odchyłka   offPen  pokrycie  poza rowkiem  wynik  ISO");
D.forEach((d,i)=>{ const r=res[i];
  console.log(`  ${String(d+" px").padStart(6)}   ${r.offPen.toFixed(1).padStart(5)}  ${(r.coverage*100).toFixed(1).padStart(7)}%  ${(r.overflow*100).toFixed(1).padStart(11)}%  ${String(r.score).padStart(5)}  ${r.iso}`);});

const t=[];
// 1. Punkt zerowy: ścieg w grani nie kosztuje NIC. Na tym stoi parytet ze starymi rundami —
//    generator prowadzi dokładnie po osi, więc każda runda sprzed 3.2.0 liczy się jak dotąd.
t.push(["tor po grani = zero kary", res[0].offPen === 0 && res[0].score === 100]);
// 2. W rowku ścieg ma prawo być — dopiero wyjście poza niego kosztuje.
t.push(["w rowku dalej za darmo", res[1].offPen === 0 && res[2].offPen === 0]);
// 3. SEDNO NAPRAWY: monotoniczne zbocze, bez schodka.
let mono=true; for(let i=3;i<D.length;i++){ if(!(res[i].score < res[i-1].score)) mono=false; }
t.push(["kara rośnie z odchyłką (zbocze, nie schodek)", mono]);
// 4. Zbocze musi być ŁAGODNE tam, gdzie dawniej było zero: żaden krok poniżej progu
//    podtopienia nie może sam z siebie wywalić rundy na REJECT.
t.push(["87 pkt to jeszcze nie REJECT", res[4].iso !== "REJECT" && res[4].score > 80]);
// 5. Ale wyjechanie poza rowek dalej jest odrzutem — tego progu nie ruszamy.
t.push(["poza rowkiem dalej REJECT", res[5].iso === "REJECT" && res[6].iso === "REJECT"]);
// 6. Pływanie ręką bije w równomierność I w tor — obie kary działają naraz, nie wykluczają się.
const wob = run(shift(0,i=>Math.sin(i/25)*12));
t.push(["pływanie ręką też kosztuje", wob.score < res[0].score && wob.evenness < res[0].evenness]);

// 7. Klasyczny dryf: matematyka oceny jest ZDUPLIKOWANA w index.html i sim.js. Stałe muszą
//    się zgadzać co do liczby, inaczej gra pokaże inny wynik niż weryfikator konkursu.
const fs=require("fs"), path=require("path");
const nums = txt => { const m=/OFF_CAP\s*=\s*([\d.]+),\s*OFF_SLOPE\s*=\s*([\d.]+),\s*OFF_PEN_CAP\s*=\s*([\d.]+),\s*OFF_MAJOR\s*=\s*([\d.]+)/.exec(txt);
  if(!m) throw new Error("nie znaleziono stałych OFF_*"); return m.slice(1).join("/"); };
const inSim  = nums(fs.readFileSync(path.join(__dirname,"..","sim.js"),"utf8"));
const inGame = nums(fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8"));
t.push([`stałe OFF_* zgodne w grze i silniku (${inGame} = ${inSim})`, inGame === inSim]);

let bad=0; console.log("");
for(const [n,ok] of t){ console.log(`  ${ok?"✓":"✗"} ${n}`); if(!ok) bad++; }
console.log(bad?`\n✗ ${bad} NIEZGODNOŚCI`:"\n✓ wszystko przeszło");
process.exit(bad?1:0);
