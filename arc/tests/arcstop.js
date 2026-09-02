// Świadome zgaszenie łuku (3.1.0): LPM+PPM naraz. Test pilnuje trzech rzeczy —
// że gest w ogóle kończy ścieg, że wymaga OBU przycisków, i że NIE jest karany
// jak zerwanie łuku. Ta ostatnia jest najważniejsza: zerwanie to utrata kontroli
// (`arcBroke`), zgaszenie to decyzja spawacza i kosztuje tylko to, czego nie zaspawał.
const { build } = require("./gen.js");
const { simulate } = require("../sim.js");

const R = { proc:"MMA", pos:"PA", thick:3, bead:"steel", joint:"butt", arc:true, seed:4242 };
const round = build(R);
const run = ev => simulate({ ...round, events:ev });

const base = round.events;
const moves = base.map((e,i)=>e.type==="move"?i:-1).filter(i=>i>=0);
const cut = moves[Math.floor(moves.length*0.55)];

// wariant A: LPM+PPM w połowie ściegu. Gra po zgaszeniu kończy pociągnięcie, więc
// dalszych zdarzeń po prostu NIE MA w nagraniu — test musi to odwzorować, nie doklejać.
const stop = base.slice(0,cut+1).map((e,i)=> i===cut ? {...e,b:3} : e);
// wariant B: sam PPM w tym samym miejscu — gest ma wymagać obu przycisków
const one  = base.map((e,i)=> i===cut ? {...e,b:2} : e);
// wariant C: PPM wciśnięty bez przerwy — elektroda ucieka, łuk się RWIE (to ma boleć)
const tear = base.map(e => e.type==="move" ? {...e,b:2} : e);

const [B,S,O,T] = [base,stop,one,tear].map(run);
const pc = r => (r.coverage*100).toFixed(1).padStart(5);   // `coverage` to UŁAMEK 0..1, nie procent
const row = (n,r)=>console.log(`  ${n.padEnd(22)} pokrycie ${pc(r)}%   arcBroke ${r.arcBroke}   wynik ${r.score}`);
console.log("MMA PA 3 mm, żywy łuk:");
row("bez gestu",B); row("LPM+PPM w 55% ściegu",S); row("sam PPM w 55%",O); row("PPM trzymany non-stop",T);

const t=[];
t.push(["gest kończy ścieg (pokrycie spada)", S.coverage < B.coverage - 0.05]);
t.push(["zgaszenie NIE liczy się jako zerwanie", S.arcBroke === 0]);
t.push(["jeden przycisk nie gasi łuku", O.coverage > B.coverage - 0.05]);
t.push(["zerwanie dalej jest zerwaniem", T.arcBroke > 0]);

let bad=0;
console.log("");
for(const [n,ok] of t){ console.log(`  ${ok?"✓":"✗"} ${n}`); if(!ok) bad++; }
console.log(bad?`\n✗ ${bad} NIEZGODNOŚCI`:"\n✓ wszystko przeszło");
process.exit(bad?1:0);
