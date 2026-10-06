/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// PRZYCZYNY ODRZUTU (karta Battle): sim.js zwraca rejectReasons — przy REJECT co najmniej jedną
// znaną przyczynę, przy zaliczeniu pustą listę. Pole jest tylko opisem: wynik się nie zmienia.
const SIM=require("../sim.js");
const {build}=require("./gen.js");
const KNOWN=new Set(["coverage","root","ends","heatInput","overflow","porosity","offAxis","amps","arc","angle","filler","score"]);
const t=[]; const ok=(n,c,extra)=>{t.push(!!c);console.log((c?"  ✓ ":"  ✗ ")+n+(extra?"  "+extra:""));};
const clone=r=>JSON.parse(JSON.stringify(r));
const cut=(r,f)=>{const ev=r.events,k=Math.max(3,Math.floor(ev.length*f));const last=ev[k-1];r.events=ev.slice(0,k).concat([{type:"up",t:last.t+20,x:last.x,y:last.y}]);return r;};

const PROCS=["MMA","MIG","TIG"], POS={MMA:["PA","PF","PC","P5G"],MIG:["PA","PF"],TIG:["PA","PC"]};
let n=0,rejected=0,bad=[],seen=new Set();
for(const proc of PROCS) for(const pos of POS[proc]) for(const thick of [2,3,8,12]) for(const bead of ["steel","ss","alu"])
for(const vFac of [0.3,0.6,1,1.6,3]) for(const arc of [false,true]) for(const part of [1,0.7,0.35]){
  const base=build({proc,pos,thick,bead,vFac,arc}),r=part<1?cut(clone(base),part):base;
  const res=SIM.simulate(clone(r));n++;
  const rr=res.rejectReasons;
  if(!Array.isArray(rr)){bad.push("brak tablicy");continue;}
  if(res.iso==="REJECT"){rejected++; if(!rr.length||!rr.every(c=>KNOWN.has(c))) bad.push(`${proc} ${pos} ${thick} ${bead} ×${vFac} ${part}: ${JSON.stringify(rr)}`); rr.forEach(c=>seen.add(c));}
  else if(rr.length) bad.push(`${proc} ${pos} zaliczona, a ma przyczyny ${rr}`);
}
ok(`REJECT ⇔ co najmniej jedna znana przyczyna (${n} rund, ${rejected} odrzutów)`,bad.length===0&&rejected>0,bad.slice(0,3).join(" | "));
ok("zestaw obejmuje kilka różnych przyczyn",seen.size>=3,[...seen].join(","));

// że pole nie zmienia wyniku, pilnują parity.js i plate-end.js (bit-w-bit ze starszymi silnikami)
const pass=t.every(Boolean);console.log(pass?`\n✓ przeszło (${t.length})`:`\n✗ NIE PRZESZŁO`);process.exit(pass?0:1);
