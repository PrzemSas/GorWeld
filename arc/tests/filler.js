// TIG MA WŁASNE STEROWANIE (3.3.0): LPM zapala łuk, SPACJA dokłada spoiwo, PPM gasi.
// Do 3.2.0 dab leciał z zegara co 150 ms — druga ręka była tylko RYSOWANA, a karta metody
// kłamała, że gracz dozuje spoiwo. Zgłosił to user, który TIG-iem spawa naprawdę.
// Sedno modelu: SAM ŁUK NIE ROBI SPOINY. Grzeje blachę, a metal pojawia się wyłącznie tam,
// gdzie gracz dołoży spoiwo. Test pilnuje tego, parytetu starych rund i kształtu kary za rytm.
const { build } = require("./gen.js");
const { simulate } = require("../sim.js");
const OLD = require("./sim-3.2.0.js");

const R = { proc:"TIG", pos:"PA", thick:3, bead:"steel", joint:"butt", arc:false, ang:false, seed:77 };
const round = build(R);
const evs = round.events;
// `every` = co ile zdarzeń ruchu gracz stuka spację (bit 16 maski klawiszy)
const dab = every => ({ ...round, tig:1, ang:1, events: evs.map((e,i)=>
  e.type==="move" ? { ...e, k:(i%every===0)?16:0 } : e) });
// łuk pali się i jedzie, ale gracz nie dotyka spacji — metalu ma NIE BYĆ
const noFiller = { ...round, tig:1, ang:1, events: evs.map(e=> e.type==="move" ? { ...e, k:0 } : e) };
// PPM w połowie ściegu = świadome zgaszenie łuku
const cut = { ...round, tig:1, ang:1, events: evs.map((e,i)=>
  e.type==="move" ? { ...e, k:(i%16===0)?16:0, b:(i>evs.length*0.5)?2:0 } : e) };

// ── 1. Runda bez `fil` MUSI liczyć się bit-w-bit jak w silniku sprzed spoiwa ──
const a = OLD.simulate(round), b = simulate(round);
const keys = Object.keys(a).filter(k=>k in b);
const same = keys.every(k => JSON.stringify(a[k])===JSON.stringify(b[k]));
console.log(`TEST 1 (runda sprzed 3.3.0 = stary automat 150 ms): ${same?"✓ bit-w-bit":"✗ ROZJAZD"} (${keys.length} pól)`);
if(!same) for(const k of keys) if(JSON.stringify(a[k])!==JSON.stringify(b[k])) console.log(`  ✗ ${k}: ${a[k]} → ${b[k]}`);

// ── 2. Rytm gracza buduje ścieg i jest oceniany ──
console.log("\nTEST 2 (TIG PA 3 mm, gracz podaje spoiwo co N zdarzeń ruchu):");
console.log("  rytm        daby  filPen  pokrycie  wynik  ISO");
const runs = [2,4,8,16,32,80,200].map(n=>({n, r:simulate(dab(n))}));
for(const {n,r} of runs)
  console.log(`  co ${String(n).padStart(2)} zdarz.  ${String(r.filDabs).padStart(4)}  ${r.filPen.toFixed(1).padStart(6)}  ${(r.coverage*100).toFixed(1).padStart(7)}%  ${String(r.score).padStart(5)}  ${r.iso}`);

// Kara ma kształt DOLINY, nie równi pochyłej: jest optimum, a odchylenie w OBIE strony boli.
// Za gęsto = nadlew i zimne zakłady, za rzadko = niedolew. Tak samo jak prąd wokół WPS.
const best = runs.reduce((a,x)=> x.r.score>a.r.score ? x : a);
const t=[];
t.push(["ręczne podawanie buduje pełny ścieg", runs.some(x=>x.r.coverage>0.9)]);
t.push(["gęstsze podawanie = więcej dabów", runs[0].r.filDabs > runs[4].r.filDabs]);
t.push([`istnieje rytm bez kary (co ${best.n}, ${best.r.score} pkt)`, best.r.filPen===0 && best.r.score===100]);
t.push(["za gęsto boli", runs[0].r.score < best.r.score && runs[0].r.filPen > 0]);
t.push(["za rzadko boli", runs[runs.length-1].r.score < best.r.score]);
const dense = runs.filter(x=>x.n<best.n).sort((a,b)=>a.n-b.n);
t.push(["po stronie gęstej kara rośnie płynnie", dense.every((x,i)=> i===0 || x.r.filPen <= dense[i-1].r.filPen)]);
t.push(["skrajnie rzadki rytm = odrzut", runs[runs.length-1].r.iso === "REJECT"]);
t.push([`${best.r.score} pkt to nie REJECT`, best.r.iso !== "REJECT"]);

// ── 3. SAM ŁUK NIE ROBI SPOINY — o to prosił user ──
const nf = simulate(noFiller);
console.log(`\nTEST 3 (łuk pali się i jedzie, ZERO spacji): pokrycie ${(nf.coverage*100).toFixed(1)}%, dabów ${nf.filDabs}, ISO ${nf.iso}`);
t.push(["sam łuk bez spoiwa nie odkłada metalu", nf.coverage===0 && nf.filDabs===0]);
t.push(["brak spoiwa = odrzut", nf.iso==="REJECT"]);

// ── 4. PPM gasi łuk ──
const cr = simulate(cut);
console.log(`TEST 4 (PPM w połowie ściegu): pokrycie ${(cr.coverage*100).toFixed(1)}%, arcBroke ${cr.arcBroke}`);
t.push(["PPM kończy ścieg", cr.coverage < best.r.coverage - 0.05]);
t.push(["zgaszenie PPM to nie zerwanie łuku", cr.arcBroke===0]);
// ── 3. Stałe zgodne w grze i w silniku (klasyczne miejsce na cichy rozjazd) ──
const fs=require("fs"), path=require("path");
const nums = txt => { const m=/FIL_DT\s*=\s*([\d.]+),\s*FIL_LO\s*=\s*([\d.]+),\s*FIL_HI\s*=\s*([\d.]+),\s*FIL_PEN_CAP\s*=\s*([\d.]+),\s*FIL_MAJOR\s*=\s*([\d.]+)/.exec(txt);
  if(!m) throw new Error("nie znaleziono stałych FIL_*"); return m.slice(1).join("/"); };
const inSim=nums(fs.readFileSync(path.join(__dirname,"..","sim.js"),"utf8"));
const inGame=nums(fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8"));
t.push([`stałe FIL_* zgodne w grze i silniku (${inGame} = ${inSim})`, inGame===inSim]);

// ── 4. Flaga `tig` w nagraniu = „gracz podawał spoiwo RĘCZNIE", nie „to był TIG" ──
// Dotyk jest demo: łuk i kąt stoją, spoiwo leci starym automatem. Gdyby nagranie z telefonu
// dostało `tig:1`, weryfikator szukałby dabów, których nikt nie nagrał — i odesłał REJECT
// za ścieg, który na ekranie wyszedł na 100 pkt. Poniżej cena takiej pomyłki, czarno na białym.
const touch = simulate({ ...round, tig:1 });      // nagranie dotykowe BŁĘDNIE oznaczone jako ręczne
const auto  = simulate(round);                    // to samo nagranie, uczciwie: automat
console.log(`\nTEST 5 (nagranie dotykowe): automat ${(auto.coverage*100).toFixed(1)}% / ${auto.score} pkt` +
            `  vs  błędna flaga tig ${(touch.coverage*100).toFixed(1)}% / ${touch.score} pkt`);
t.push(["błędna flaga tig kasuje ścieg (dlatego pilnujemy jej w grze)", touch.coverage===0 && auto.coverage>0.9]);
// Gra ustawia flagę tam, gdzie żyje `tigLive` — nigdy z samego `proc`.
const game = fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
t.push(["`recStart()` nie zgaduje tig z metody", /arc:0,\s*ang:0,\s*tig:0,/.test(game) && !/tig:\s*proc\s*===/.test(game)]);
t.push(["flaga tig wchodzi tylko przy żywym `tigLive`", /if\(tigLive&&rec\)\s*rec\.tig=1;/.test(game)]);

let bad=same?0:1; console.log("");
for(const [n,ok] of t){ console.log(`  ${ok?"✓":"✗"} ${n}`); if(!ok) bad++; }
console.log(bad?`\n✗ ${bad} NIEZGODNOŚCI`:"\n✓ wszystko przeszło");
process.exit(bad?1:0);
