// Prąd: AUTO vs RĘCZNIE (3.1.0). Test czyta ŻYWY `../index.html` i wycina z niego
// prawdziwe tablice WPS oraz prawdziwy blok pokrętła — nie kopię. Kopia rozjeżdża się
// po cichu i test zaczyna chwalić kod, którego nikt nie uruchamia.
const fs=require("fs"), path=require("path"), vm=require("vm");
const SRC=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");

function slice(from,to,label){
  const a=SRC.indexOf(from); if(a<0) throw new Error("nie znaleziono początku: "+label);
  const b=SRC.indexOf(to,a);  if(b<0) throw new Error("nie znaleziono końca: "+label);
  return SRC.slice(a,b+to.length);
}
const tables=slice("const POSITIONS = {","function recommendedVolts(p, t){ return tableLookup(VOLT_TABLES[p], t); }","tablice WPS");
const knob  =slice("// 3.1.0 — DWA TRYBY POKRĘTŁA.","por: ar<0.85 ? Math.round((0.85-ar)*6) : 0}; }","blok pokrętła");

const ctx={localStorage:{getItem:()=>null,setItem:()=>{}},console};
vm.createContext(ctx);
vm.runInContext("let proc='MMA', thick=3, posKey='PA';\n"+tables+"\n"+knob,ctx);
const S=(k,v)=>vm.runInContext(`${k}=${JSON.stringify(v)}`,ctx);
const G=e=>vm.runInContext(e,ctx);

const PROCS=["MMA","MIG","TIG"], THICKS=[2,3,5,8,12];
const POS=Object.keys(G("POSITIONS"));
let fail=0, n=0;
const ok=(c,m)=>{ n++; if(!c){ fail++; console.log("  ✗ "+m); } };

// ── 1. AUTO liczy dokładnie tak, jak przed rozdzieleniem trybów ──────────────
S("ampMode","auto"); S("ampSet",null);
for(const p of PROCS) for(const t of THICKS) for(const k of POS) for(const m of [0.7,0.85,1,1.15,1.3]){
  S("proc",p); S("thick",t); S("posKey",k); S("ampMul",m);
  const r=G(`recommendedAmps(proc,thick,posKey)`);
  ok(G("ampsSetFor(posKey)")===(r==null?null:Math.round(r*m)), `AUTO ${p} ${t}mm ${k} ×${m}`);
}
console.log(`TEST 1 (AUTO = stara formuła krotności): ${n-fail}/${n}`);

// ── 2. WPS to punkt zerowy w OBU trybach — inaczej parytet z 1.4.0 pada ──────
let n2=0,f2=0;
for(const p of PROCS) for(const t of THICKS) for(const k of POS){
  S("proc",p); S("thick",t); S("posKey",k);
  const r=G("recommendedAmps(proc,thick,posKey)"); if(r==null) continue;
  for(const mode of ["auto","man"]){
    S("ampMode",mode); S("ampMul",1); S("ampSet",mode==="man"?r:null);
    G("updateAmpF()"); const f=G("ampF"); n2++;
    const zero = f.ar===1 && f.w===1 && f.pen===0 && f.sev===null && f.spatAdd===0 && f.por===0;
    if(!zero){ f2++; console.log(`  ✗ ${mode} ${p} ${t}mm ${k}: ${JSON.stringify(f)}`); }
  }
}
console.log(`TEST 2 (prąd wg WPS = zero kosztu, oba tryby): ${n2-f2}/${n2}`);

// ── 3. Sedno rozdzielenia: AUTO idzie za blachą, RĘCZNIE zostaje ────────────
S("proc","MMA"); S("posKey","PA"); S("thick",3); S("ampMul",1); S("ampMode","auto"); S("ampSet",null);
const auto3=G("ampsSetFor(posKey)"); S("thick",12); const auto12=G("ampsSetFor(posKey)");
S("thick",3); S("ampMode","man"); S("ampSet",auto3);
const man3=G("ampsSetFor(posKey)"); S("thick",12); const man12=G("ampsSetFor(posKey)");
S("posKey","PE"); const manPE=G("ampsSetFor(posKey)");
console.log("\nTEST 3 — 3 mm → 12 mm → pozycja PE (MMA):");
console.log(`  AUTO:    ${auto3} A → ${auto12} A            (prostownik przekręca się sam)`);
console.log(`  RĘCZNIE: ${man3} A → ${man12} A → ${manPE} A (gracz zostawił, gdzie zostawił)`);
const t3 = auto12!==auto3 && man12===man3 && manPE===man3;
console.log(t3?"TEST 3: ✓ tryby robią to, co obiecują":"TEST 3: ✗ TRYBY SIĘ ZLEWAJĄ"); if(!t3) fail++;

// ── 4. Ręczne zejście/podbicie prądu boli monotonicznie ─────────────────────
S("proc","MMA"); S("thick",5); S("posKey","PA"); S("ampMode","man");
const rec=G("recommendedAmps(proc,thick,posKey)");
const row=a=>{ S("ampSet",a); G("updateAmpF()"); return G("ampF"); };
console.log(`\nTEST 4 (MMA PA 5 mm, WPS ${rec} A) — co robi pokrętło:`);
console.log("  prąd   ar     pen   odprysk  pory  waga");
const seen=[];
for(const a of [G(`AMP_LO(${rec})`), Math.round(rec*0.8), rec, Math.round(rec*1.2), G(`AMP_HI(${rec})`)]){
  const f=row(a); seen.push(f);
  console.log(`  ${String(a).padStart(4)}A  ${f.ar.toFixed(2)}  ${f.pen.toFixed(1).padStart(5)}  ${f.spatAdd.toFixed(2).padStart(7)}  ${String(f.por).padStart(4)}  ${f.w.toFixed(3)}`);
}
const mono = seen[0].pen>seen[1].pen && seen[1].pen>seen[2].pen
          && seen[3].pen>seen[2].pen && seen[4].pen>seen[3].pen
          && seen[0].w<seen[2].w && seen[4].w>seen[2].w
          && seen[0].por>0 && seen[4].spatAdd>0;
console.log(mono?"TEST 4: ✓ kara rośnie w obie strony, jeziorko idzie za prądem":"TEST 4: ✗ KRZYWA KARY NIEMONOTONICZNA"); if(!mono) fail++;

// ── 5. Suwak nie wypuszcza gracza poza sensowny zakres ──────────────────────
let n5=0,f5=0;
for(const p of PROCS) for(const t of THICKS) for(const k of POS){
  S("proc",p); S("thick",t); S("posKey",k);
  const r=G("recommendedAmps(proc,thick,posKey)"); if(r==null) continue;
  const lo=G(`AMP_LO(${r})`), hi=G(`AMP_HI(${r})`); n5++;
  if(!(lo>=5 && lo<r && r<hi)){ f5++; console.log(`  ✗ zakres ${p} ${t}mm ${k}: ${lo}..${hi} przy WPS ${r}`); }
}
console.log(`\nTEST 5 (skala suwaka obejmuje WPS z zapasem w obie strony): ${n5-f5}/${n5}`);

const bad=fail+f2+f5;
console.log(bad?`\n✗ ${bad} NIEZGODNOŚCI`:"\n✓ wszystko przeszło");
process.exit(bad?1:0);
