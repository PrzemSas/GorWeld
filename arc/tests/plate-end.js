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
// KONIEC BLACHY (3.5.0): za koncem szwu prostego luk gasnie. Do 3.4.0 strefa „na blasze" siegala
// ~90 px za kazdy koniec (polkole wokol ostatniego punktu szwu) i spoina kladla sie w powietrzu.
const OLD=require("./sim-3.4.0.js");
const NEW=require("../sim.js");
const {build}=require("./gen.js");
console.log("stary silnik",OLD.VERSION,"→ nowy",NEW.VERSION);
const t=[]; const ok=(n,c,extra)=>{t.push([n,!!c]);console.log((c?"  ✓ ":"  ✗ ")+n+(extra?"  "+extra:""));};
const clone=r=>JSON.parse(JSON.stringify(r));

// 1. Rundy, ktore NIE wyjezdzaja za blache (caly zestaw generatora) — bit-w-bit jak 3.4.0
const PROCS=["MMA","MIG","TIG"], THICK=[2,3,5,8,12], BEADS=["steel","ss","alu"];
const POS={MMA:["PA","PB","PC","PD","PE","PF","PG","P1G","P2G","P5G","HL045"],
           MIG:["PA","PC","PE","PF","P2G"], TIG:["PA","PC","PF","HL045"]};
let n=0,bad=[];
for(const proc of PROCS) for(const pos of POS[proc]) for(const thick of THICK) for(const bead of BEADS) for(const vFac of [0.6,1,1.6]) for(const arc of [false,true]){
  const r=build({proc,pos,thick,bead,vFac,arc}),a=OLD.simulate(clone(r)),b=NEW.simulate(clone(r));n++;
  for(const k of Object.keys(a)) if(k!=="version"&&JSON.stringify(a[k])!==JSON.stringify(b[k])){bad.push(`${proc} ${pos} ${thick}mm ${bead} ×${vFac}${arc?" +łuk":""} ${k}: ${a[k]} → ${b[k]}`);break;}
}
ok(`rundy na blasze liczą się bit-w-bit jak 3.4.0 (${n} rund)`,bad.length===0,bad.slice(0,3).join(" | "));

// 2. Przejazd ZA koniec szwu: przed ostatnim "up" dokladamy ruch 90 px dalej w tym samym kierunku
function overrun(r,px){
  const ev=r.events,up=ev.length-1,last=ev[up-1],prev=ev[up-2],dx=last.x-prev.x,dy=last.y-prev.y,L=Math.hypot(dx,dy)||1;
  const extra=[];for(let s=4;s<=px;s+=4)extra.push({type:"move",t:last.t+s*3,x:Math.round((last.x+dx/L*s)*100)/100,y:Math.round((last.y+dy/L*s)*100)/100,...(last.b!==undefined?{b:last.b}:{})});
  ev[up].t=last.t+px*3+20; ev.splice(up,0,...extra); return r;
}
for(const [proc,pos] of [["MMA","PA"],["MIG","PA"],["TIG","PA"],["MMA","PF"],["MMA","PC"]]){
  const base=build({proc,pos,thick:3,bead:"steel"}),over=overrun(clone(base),90);
  const n0=NEW.simulate(clone(base)),n1=NEW.simulate(clone(over)),o0=OLD.simulate(clone(base)),o1=OLD.simulate(clone(over));
  ok(`${proc} ${pos}: za końcem szwu nowy silnik nie kładzie spoiny (baked ${n0.baked} → ${n1.baked})`,n1.baked===n0.baked);
  ok(`${proc} ${pos}: stary silnik kładł ją w powietrzu (test gryzie: baked ${o0.baked} → ${o1.baked})`,o1.baked>o0.baked);
}
// 3. Ta sama regula w grze i w silniku (matematyka jest zduplikowana — README)
{ const fs=require("node:fs"),path=require("node:path");
  const game=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8"),sim=fs.readFileSync(path.join(__dirname,"..","sim.js"),"utf8");
  ok("gra i sim.js mają tę samą tolerancję i regułę końca szwu",/function pastSeamEnd\(x,y\)/.test(game)&&/tol=1\.5\/Math\.sqrt\(L2\)/.test(game)&&/tol = 1\.5 \/ Math\.sqrt\(L2\)/.test(sim)&&/!pastSeamEnd\(x,y\)/.test(game)&&/!pastSeamEnd\(x, y\)/.test(sim));
}
const fail=t.filter(x=>!x[1]).length;
console.log(fail?`✗ NIE PRZESZŁO (${fail}/${t.length})`:`✓ przeszło (${t.length})`);process.exit(fail?1:0);
