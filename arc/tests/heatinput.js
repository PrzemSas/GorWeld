// WKŁAD CIEPŁA JAKO LIMIT KODU (3.4.0), nie jako preferencja.
// Na materiale badanym udarnościowo max heat input z WPS jest zmienną istotną dodatkową
// (ASME IX QW-409.1): powyżej granicy kwalifikacja CVN nie pokrywa złącza produkcyjnego,
// więc złącze leci NIEZALEŻNIE od tego, jak ładne jest lico. Stąd trzy rzeczy, których
// pilnuje ten test i które łatwo zepsuć przy kolejnej zmianie:
//   * limit JEST WARUNKIEM DOPUSZCZENIA, a nie karą — `score` MUSI zostać nietknięty;
//   * limit jest JEDNOSTRONNY — od dołu nie ma nowej wady (za mało ciepła gra karze wtopem);
//   * limit działa TYLKO na stali i TYLKO w rundach z flagą `cvn` — inaczej stare nagrania
//     zaczęłyby wracać jako REJECT za regułę, której w chwili spawania nie było.
const fs=require("fs"), path=require("path");
const { build } = require("./gen.js");
const { simulate, heatInputKJmm } = require("../sim.js");
const OLD = require("./sim-3.3.0.js");

const t=[]; const ok=(n,c)=>t.push([n,!!c]);
const base = { proc:"MMA", pos:"PA", thick:5, bead:"steel", joint:"butt", arc:true, ang:true, seed:4242 };

// ── 1. Bez flagi `cvn` silnik liczy bit-w-bit jak 3.3.0 ────────────────────────────────
// Sprawdzamy też rundy skrajnie wolne — czyli dokładnie te, które NOWA reguła by odrzuciła.
let same=true, checked=0;
for(const proc of ["MMA","MIG","TIG"]) for(const thick of [3,5,8]) for(const vFac of [0.25,0.5,1,2]){
  const r = build({...base, proc, thick, vFac});
  const a = OLD.simulate(r), b = simulate(r);
  const keys = Object.keys(a).filter(k=>k in b);
  for(const k of keys) if(JSON.stringify(a[k])!==JSON.stringify(b[k])){
    same=false; console.log(`  ✗ ${proc} ${thick}mm ×${vFac} — ${k}: ${a[k]} → ${b[k]}`); }
  checked++;
}
console.log(`TEST 1 (runda bez flagi `+"`cvn`"+` = silnik 3.3.0): ${same?"✓ bit-w-bit":"✗ ROZJAZD"} (${checked} rund)`);
ok("stare nagrania nietknięte", same);

// ── 2. Jazda po WPS nie płaci nic ───────────────────────────────────────────────────────
let neutral=true, nN=0;
for(const proc of ["MMA","MIG","TIG"]) for(const thick of [3,5,8]) for(const pos of ["PA","PC","PF"]){
  const r = build({...base, proc, thick, pos});
  const woFlag = simulate(r), wFlag = simulate({...r, cvn:1});
  if(wFlag.hiOver || wFlag.score!==woFlag.score || wFlag.iso!==woFlag.iso){
    neutral=false; console.log(`  ✗ ${proc} ${thick}mm ${pos} — hiOver=${wFlag.hiOver} ${woFlag.score}/${woFlag.iso} → ${wFlag.score}/${wFlag.iso}`); }
  nN++;
}
console.log(`TEST 2 (tempo i prąd z WPS — limit milczy): ${neutral?"✓":"✗"} (${nN} kombinacji)`);
ok("kto jedzie po WPS, nie płaci nic", neutral);

// ── 3. Sufit: im wolniej, tym więcej ciepła — i gdzieś przechodzi granica ────────────────
console.log("\nTEST 3 (MMA PA 5 mm, stal — im wolniej, tym wyższy wkład ciepła):");
console.log("  tempo   HI kJ/mm   max    wynik  ISO bez limitu  ISO z limitem");
let cliff=true, punished=false;
for(const vFac of [1.6,1.2,1.0,0.8,0.6,0.45,0.3]){
  const r = build({...base, vFac});
  const woFlag = simulate(r), w = simulate({...r, cvn:1});
  console.log(`  ×${vFac.toFixed(2)}  ${String(w.hi).padStart(8)}  ${String(w.hiMax).padStart(5)}  ${String(w.score).padStart(5)}  ${woFlag.iso.padEnd(14)}  ${w.iso}${w.hiOver?"  ← poza zakresem kwalifikacji":""}`);
  // REJECT z tego tytułu MUSI padać dokładnie tam, gdzie HI przebija sufit — bez schodka obok progu
  if(w.hiOver !== (w.hi > w.hiMax)) cliff=false;
  if(w.hiOver && woFlag.iso!=="REJECT" && w.iso!=="REJECT") cliff=false;
  if(w.score !== woFlag.score) punished=true;      // limit NIE MOŻE odejmować punktów
}
ok("odrzut pada dokładnie na przekroczeniu sufitu", cliff);
ok("limit nie odejmuje punktów — to warunek dopuszczenia, nie wada wykonania", !punished);

// ── 4. Limit jest JEDNOSTRONNY — za mało ciepła to nie jest przekroczenie ────────────────
let lowSide=true;
for(const vFac of [1.5,2.0,3.0]){
  const w = simulate({...build({...base, vFac}), cvn:1});
  if(w.hiOver || w.hi > w.hiMax) lowSide=false;
}
console.log(`\nTEST 4 (szybciej niż WPS = mniej ciepła): ${lowSide?"✓ brak nowej wady":"✗"}`);
ok("dołu nie ruszamy — za mały wkład ciepła karze wtop i pokrycie, nie ten limit", lowSide);

// ── 5. Materiały bez próby udarności są zwolnione ───────────────────────────────────────
const slow = build({...base, vFac:0.3});
const steel = simulate({...slow, cvn:1});
let exempt=true;
for(const bead of ["ss","alu"]){
  const w = simulate({...build({...base, bead, vFac:0.3}), cvn:1});
  if(w.hiOver || w.cvn) exempt=false;
}
console.log(`TEST 5 (nierdzewka i alu — bez próby udarności): stal hiOver=${steel.hiOver}, ss/alu zwolnione: ${exempt?"✓":"✗"}`);
ok("limit tylko tam, gdzie Kod go stawia", exempt && steel.hiOver);

// ── 6. Stałe i wzór MUSZĄ być te same w grze i w silniku ────────────────────────────────
// Matematyka jest zduplikowana w `index.html` i `sim.js`. Rozjazd tutaj = gracz widzi na ekranie
// co innego, niż policzy weryfikator, i nie da się tego graczowi wytłumaczyć.
const G = fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const num = re => { const m=G.match(re); return m?m[1]:null; };
ok(`HI_MAX_R zgodne (gra ${num(/const HI_MAX_R=([\d.]+)/)} = silnik 1.25)`, num(/const HI_MAX_R=([\d.]+)/)==="1.25");
ok("CVN_BEADS zgodne (gra {steel:1} = silnik {steel:1})", /const CVN_BEADS=\{steel:1\}/.test(G));
ok("WELD_EFF zgodne", /const WELD_EFF=\{MMA:0\.8,MIG:0\.8,TIG:0\.6\}/.test(G));
ok("gra zapisuje flagę `cvn` w nagraniu", /cvn:CVN_BEADS\[bead\]\?1:0/.test(G));
ok("przekroczenie jest wadą MAJOR (→ REJECT), nie odjęciem punktów",
   /if\(hiOver\) D\.push\(\{s:"major"/.test(G) && !/-\s*hiPen/.test(G));
// wzór 1:1 — ta sama liczba z obu implementacji
const gameHi = (()=>{ const m=G.match(/function heatInputKJmm[\s\S]*?\/1000; \}/);
  return m ? new Function("return ("+m[0]+")")() : null; })();
ok("wzór heatInputKJmm identyczny w obu plikach",
   gameHi && [[24,150,4.3,0.8],[12,90,3.0,0.6]].every(a=>gameHi(...a)===heatInputKJmm(...a)));

let bad=0; console.log("");
for(const [n,o] of t){ console.log(`  ${o?"✓":"✗"} ${n}`); if(!o) bad++; }
console.log(bad?`\n✗ ${bad} NIEZGODNOŚCI`:"\n✓ wszystko przeszło");
process.exit(bad?1:0);
