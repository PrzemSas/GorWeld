/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// 3.15.0 (kb=9, poprawka 04): fizyka liczy czas także przy stojącej myszy (plan: ARC AI/odpowiedzi/2026-10-31_claude_plan_04_v2.md).
// ETAP A: zamrożony sim-3.14.0.js + dowód, że STARE nagrania (kb≤8 i bez kb) liczą się BIT W BIT jak 3.14.0 —
// porównujemy CAŁY wynik simulate() (JSON), nie tylko punkty. Przypadki z przerwami w nagraniu (stara ścieżka
// ucina krok do 0,25 s) też muszą zostać bez zmian. Sekcje kb=9 dochodzą w etapie B.
const S=require("../sim.js"), OLD=require("./sim-3.14.0.js"), {build}=require("./gen.js");
let fail=0; const ok=(n,c,i)=>{console.log((c?"  ✓ ":"  ✗ ")+n+(i!==undefined?"  "+JSON.stringify(i):"")); if(!c) fail++;};
const J=o=>JSON.parse(JSON.stringify(o));
const same=r=>JSON.stringify(S.simulate(J(r)))===JSON.stringify(OLD.simulate(J(r)));
const CFG=[["PA","butt"],["PC","butt"],["PF","butt"],["PG","butt"],["PB","fillet"],["P5G","pipe"]];
// przerwa w nagraniu W TRAKCIE ściegu: od środkowego `move` pierwszego ściegu wszystko przesunięte o `ms`
// (ręka stoi z palącym się łukiem). ⚠ NIE „od połowy zdarzeń" — tam wypada bank między ściegami, łuk nie
// pali się i test niczego nie sprawdza (kontrola mutacją 0,25→0,26 wykryła to: 0/6 różnic).
const pause=(r,ms)=>{ const e=r.events, d=e.findIndex(x=>x.type==="down"); let end=d+1; while(end<e.length&&e[end].type==="move") end++;
  const h=d+1+Math.floor((end-d-1)/2); return {...r,events:e.map((x,i)=>i>=h?{...x,t:x.t+ms}:x)}; };

// 1) stare nagrania: kb ∈ {brak, 1..8}, mysz i dotyk, różne tempo, z cvn/uf i bez
let n=0,bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [2,5,8,12])
for(const kb of [false,true,2,3,4,5,6,7,8]) for(const arc of [false,true]) for(const vFac of [0.6,1,1.4]) for(const flags of [{},{uf:1,cvn:1}]){
  if(pos==="PG"&&thick>5) continue;
  const r={...build({proc,pos,joint,thick,vFac,kb,arc,ang:arc}),...flags}; n++;
  if(!same(r)) bad.push(`${proc} ${pos} ${thick} kb=${kb} arc=${arc} v=${vFac} ${JSON.stringify(flags)}`); }
ok(`stare nagrania: sim.js == sim-3.14.0 bit w bit, cały wynik (${n} rund)`,bad.length===0,bad.slice(0,4));

// 2) stare nagrania z POSTOJEM (0,3 s / 2 s / 10 s) — stara ścieżka ucina krok do 0,25 s i tak ma zostać
n=0; bad=[];
for(const proc of ["MMA","MIG","TIG"]) for(const kb of [false,7,8]) for(const arc of [false,true]) for(const ms of [300,2000,10000]){
  const r=pause({...build({proc,pos:"PA",joint:"butt",thick:5,kb,arc,ang:arc}),uf:1,cvn:1},ms); n++;
  if(!same(r)) bad.push(`${proc} kb=${kb} arc=${arc} postój=${ms}`); }
ok(`stare nagrania z postojem: bit w bit jak 3.14.0 (${n} rund)`,bad.length===0,bad.slice(0,4));

// 2b) czułość testu postoju: te same rundy z postojem MUSZĄ dać inny wynik niż bez postoju
//     (inaczej sekcja 2 porównywałaby rundy, w których postój niczego nie dotyka)
let diffP=0, nP=0;
for(const proc of ["MMA","MIG","TIG"]) for(const arc of [false,true]){ nP++;
  const r={...build({proc,pos:"PA",joint:"butt",thick:5,kb:8,arc,ang:arc}),uf:1,cvn:1};
  if(JSON.stringify(OLD.simulate(J(r)))!==JSON.stringify(OLD.simulate(J(pause(r,2000))))) diffP++; }
ok(`postój 2 s w trakcie ściegu zmienia wynik (czułość testu): ${diffP}/${nP}`,diffP===nP);

// ════════ ETAP B: kb=9 ════════
const fin=x=>JSON.stringify(x,(k,v)=>typeof v==="number"&&!Number.isFinite(v)?"NIEFIN":v).indexOf("NIEFIN")<0&&JSON.stringify(x).indexOf("null")>=-1;
const hasNaN=x=>/NIEFIN/.test(JSON.stringify(x,(k,v)=>typeof v==="number"&&!Number.isFinite(v)?"NIEFIN":v));
const g9=(o)=>({...build({pos:"PA",joint:"butt",thick:3,kb:9,...o}),uf:1,cvn:1,...(o.round||{})});
const midIdx=r=>{ const e=r.events, d=e.findIndex(x=>x.type==="down"); let end=d+1; while(end<e.length&&e[end].type==="move") end++; return d+1+Math.floor((end-d-1)/2); };
const insAt=(r,i,ev)=>({...r,events:[...r.events.slice(0,i),ev,...r.events.slice(i)]});

// B1) płynna jazda (zdarzenia co 8 ms): kb=9 vs kb=8 tych samych zdarzeń — BEZ obietnicy identyczności (plan v2),
//     tylko strażnik regresji: różnica punktów ≤ 2, zmiana klasy ISO w ≤ 2% rund. Wynik pomiaru wypisany.
{ let n=0,maxd=0,isoChg=0;
  for(const proc of ["MMA","MIG","TIG"]) for(const [pos,joint] of CFG) for(const thick of [3,5,8]) for(const arc of [false,true]) for(const vFac of [0.8,1,1.2]){
    if(pos==="PG"&&thick>5) continue;
    const r={...build({proc,pos,joint,thick,vFac,kb:8,arc,ang:arc}),uf:1,cvn:1}; n++;
    const a8=S.simulate(J(r)), a9=S.simulate(J({...r,kb:9}));
    maxd=Math.max(maxd,Math.abs(a8.score-a9.score)); if(a8.iso!==a9.iso) isoChg++; }
  ok(`B1 płynna jazda kb9 vs kb8 (${n} rund): max |Δpkt|=${maxd}, zmiana klasy ISO w ${isoChg} rundach`,maxd<=2&&isoChg<=Math.ceil(n*0.02),{maxd,isoChg}); }

// B2) granice czasu: równe t, 49/50/51 ms, długa luka — wynik skończony i powtarzalny
{ let bad=[];
  for(const gap of [0,49,50,51,400,5000]) for(const arc of [false,true]){
    const r=g9({proc:"MIG",arc,ang:arc}), i=midIdx(r), e=r.events.map((x,j)=>j>=i?{...x,t:x.t+gap}:x);
    const a=S.simulate(J({...r,events:e})), b2=S.simulate(J({...r,events:e}));
    if(hasNaN(a)||JSON.stringify(a)!==JSON.stringify(b2)) bad.push(`gap=${gap} arc=${arc}`); }
  ok("B2 równe czasy / 49 / 50 / 51 ms / długa luka: wynik skończony i powtarzalny",bad.length===0,bad); }

// B3) wejście bez ruchu: przyciski, klawisze, spoiwo TIG
{ const r=g9({proc:"MIG",arc:true,ang:true}), i=midIdx(r), P=pause(r,2000), q=P.events[i-1], t0=q.t;
  const inp=(dt,b,k)=>({type:"inp",t:t0+dt,x:q.x,y:q.y,b,k});
  const held=S.simulate(J(insAt(P,i,inp(1,1,0))));
  const rel=S.simulate(J({...P,events:[...P.events.slice(0,i),inp(1,1,0),inp(400,0,0),...P.events.slice(i)]}));
  ok("B3 LPM trzymany 2 s bez ruchu → przywarcie",held.stickCount===1,{stick:held.stickCount});
  ok("B3 LPM puszczony bez ruchu po 0,4 s → bez przywarcia",rel.stickCount===0,{stick:rel.stickCount});
  const P1=pause(r,1000);
  const dH=S.simulate(J(insAt(P1,i,inp(1,0,2))));
  const dPR=S.simulate(J({...P1,events:[...P1.events.slice(0,i),inp(1,0,2),inp(201,0,0),...P1.events.slice(i)]}));
  ok("B3 D trzymane 1 s bez ruchu → kąt roboczy rośnie",dH.waDeg>20,{waDeg:dH.waDeg});
  ok("B3 D wciśnięte i puszczone po 0,2 s bez ruchu → kąt mniejszy niż przy trzymaniu, > 0",dPR.waDeg>0&&dPR.waDeg<dH.waDeg,{waDeg:dPR.waDeg});
  // TIG mysz: spacja na postoju = dokładnie jeden dab
  const T={...g9({proc:"TIG",arc:true,ang:true}),tig:1}, it=midIdx(T), PT=pause(T,1000), qt=PT.events[it-1];
  const dab=(dt)=>({type:"inp",t:qt.t+dt,x:qt.x,y:qt.y,b:qt.b|0,k:16});
  // `baked` = liczba odłożonych porcji metalu (filDabs liczy ODSTĘPY między dabami, więc pierwszy dab go nie zmienia)
  const base=S.simulate(J(PT)).baked, one=S.simulate(J(insAt(PT,it,dab(100)))).baked,
        two=S.simulate(J({...PT,events:[...PT.events.slice(0,it),dab(100),dab(300),...PT.events.slice(it)]})).baked;
  ok("B3 TIG: 1 spacja na postoju = +1 dab, 2 spacje = +2",one===base+1&&two===base+2,{base,one,two}); }

// B4) postój w trakcie ściegu: im dłużej, tym gorzej (mysz i dotyk); 2 s na stali 3 mm MIG = REJECT heatInput
{ let bad=[];
  for(const [proc,arc] of [["MIG",true],["MIG",false],["MMA",true],["MMA",false],["TIG",false]]){
    const r=g9({proc,arc,ang:arc}), a0=S.simulate(J(r)), a3=S.simulate(J(pause(r,300))), a20=S.simulate(J(pause(r,2000)));
    if(!(a0.score>=a3.score&&a3.score>=a20.score&&a20.score<a0.score)) bad.push(`${proc} ${arc?"mysz":"dotyk"} ${a0.score}/${a3.score}/${a20.score}`);
    if(proc!=="TIG"&&!(a20.hi>a0.hi)) bad.push(`${proc} hi ${a0.hi}->${a20.hi}`); }
  ok("B4 postój 0 / 0,3 / 2 s: punkty nie rosną, 2 s < 0 s; HI rośnie",bad.length===0,bad);
  const m=S.simulate(J(pause(g9({proc:"MIG",arc:false}),2000)));
  ok("B4 MIG dotyk, stal 3 mm, postój 2 s → REJECT heatInput",m.iso==="REJECT"&&m.rejectReasons.includes("heatInput"),{iso:m.iso,rr:m.rejectReasons,hi:m.hi,hiMax:m.hiMax}); }

// B5) zerowy przejazd: zajarzenie, 1 s stania, koniec — bez żadnego ruchu
{ const mk=(proc,arc,bead)=>{ const r=g9({proc,arc,ang:arc,bead}), d=r.events.find(x=>x.type==="down");
    return {...r,bead,events:[{...d,t:1000,b:arc?0:undefined},{type:"inp",t:1500,x:d.x,y:d.y,b:0,k:0},{type:"up",t:2000,x:d.x,y:d.y}]}; };
  let bad=[];
  for(const proc of ["MIG","MMA","TIG"]) for(const arc of [false,true]){
    const st=S.simulate(J(mk(proc,arc,"steel"))), ss=S.simulate(J(mk(proc,arc,"ss")));
    if(!st.rejectReasons.includes("heatInput")||st.hi!==null) bad.push(`${proc} ${arc?"mysz":"dotyk"} stal: ${JSON.stringify([st.rejectReasons,st.hi])}`);
    if(ss.rejectReasons.includes("heatInput")) bad.push(`${proc} ${arc?"mysz":"dotyk"} nierdzewka: heatInput`);
    if(hasNaN(st)||hasNaN(ss)) bad.push(`${proc} NaN`); }
  ok("B5 zerowy przejazd: stal (mysz i DOTYK) → REJECT heatInput, hi=null; nierdzewka → bez heatInput; bez NaN",bad.length===0,bad); }

// B6) strażnik 2,5 s: po dłuższym postoju łuk zgasł — dalsze ruchy nie kładą metalu (dotyk, bez modelu łuku)
{ const r=g9({proc:"MIG",arc:false}), a2=S.simulate(J(pause(r,2000))), a3=S.simulate(J(pause(r,3000)));
  ok("B6 postój 3 s (> 2,5 s) gasi łuk: pokrycie wyraźnie niższe niż przy 2 s",a3.coverage<a2.coverage-0.2,{cov2:a2.coverage,cov3:a3.coverage}); }

// B7) `inp` w starym nagraniu (kb≤8) nic nie zmienia — stara ścieżka go ignoruje (serwer i tak go odrzuci)
{ const r={...build({proc:"MIG",pos:"PA",joint:"butt",thick:3,kb:8,arc:true,ang:true}),uf:1,cvn:1}, i=midIdx(r), q=r.events[i-1];
  ok("B7 kb=8 + inp: wynik jak bez inp",JSON.stringify(S.simulate(J(insAt(r,i,{type:"inp",t:q.t,x:q.x,y:q.y,b:1,k:2}))))===JSON.stringify(S.simulate(J(r)))); }

// B8) WOLNY SPRZĘT: płynna ręka, zdarzenia rzadziej (60 … 300 ms) — to NIE jest postój. Sprawdza też GRANICĘ GRACE_MS
//     (149/150/151/160 ms) — audyt Codex 04: w pierwszej wersji 150 ms dawało 100 pkt, a 151 ms 64 pkt i REJECT.
//     Wynik w granicach 3 pkt od zdarzeń co 8 ms i ten sam werdykt.
{ let bad=[];
  for(const proc of ["MIG","MMA","TIG"]) for(const arc of [false,true]){
    const sc=dt=>S.simulate(J({...build({proc,pos:"PA",joint:"butt",thick:3,kb:9,arc,ang:arc,dtMs:dt}),uf:1,cvn:1}));
    const a8=sc(8); for(const dt of [60,120,140,149,150,151,160,200,300]){ const a=sc(dt);
      if(Math.abs(a.score-a8.score)>3||a.iso==="REJECT"!==(a8.iso==="REJECT")) bad.push(`${proc} ${arc?"mysz":"dotyk"} ${dt} ms: ${a8.score}→${a.score} ${a.iso}`); } }
  ok("B8 płynna ręka przy zdarzeniach co 60–300 ms (w tym 149/150/151/160) = jak co 8 ms",bad.length===0,bad); }

// B9) ZMIENNE tempo dostarczania zdarzeń: ta sama płynna trajektoria (co 8 ms), z której losowo wypadają ruchy
//     (przerwy 8 … ~300 ms, jak na obciążonym telefonie). Wynik jak bez wypadania (±3 pkt, ten sam werdykt).
{ let bad=[]; const rng=(seed=>()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; })(4242);
  for(const proc of ["MIG","MMA","TIG"]) for(const arc of [false,true]) for(const drop of [0.5,0.8,0.95]){
    const r={...build({proc,pos:"PA",joint:"butt",thick:3,kb:9,arc,ang:arc,dtMs:8}),uf:1,cvn:1};
    // wypadają tylko ruchy BEZ zmiany przycisków (inaczej zmieniłoby się sterowanie, a nie dostarczanie)
    const ev=r.events.filter((e,i)=>!(e.type==="move"&&i>0&&i<r.events.length-1&&r.events[i+1].type==="move"&&(e.b|0)===(r.events[i-1].b|0)&&rng()<drop));
    const a8=S.simulate(J(r)), a=S.simulate(J({...r,events:ev}));
    // TIG dotykiem: automat spoiwa kładzie dab TYLKO przy zdarzeniu ruchu (od 3.3.0) — przy przerwach ~0,5 s spada pokrycie
    // już w 3.14.0 (100→93). To nie jest skutek 04, więc tu porównujemy z 3.14.0 dla tych samych zdarzeń (kb=8), nie z ideałem.
    const ref=(proc==="TIG"&&!arc&&drop>=0.95)?OLD.simulate(J({...r,kb:8,events:ev})):a8;
    if(Math.abs(a.score-ref.score)>3||a.iso==="REJECT"!==(ref.iso==="REJECT")) bad.push(`${proc} ${arc?"mysz":"dotyk"} drop=${drop}: ${ref.score}→${a.score} ${a.iso}`); }
  ok("B9 zmienne tempo dostarczania zdarzeń (wypada 50/80/95% ruchów) = ta sama ocena",bad.length===0,bad); }

// B10) POSTÓJ NA KOŃCU ściegu (przed `up`): 149 / 150 / 151 / 160 ms prawie bez różnicy (ciągłość, bez skoku na granicy),
//      a długi postój (1,5 s) wyraźnie obniża tempo.
{ let bad=[];
  for(const proc of ["MIG","MMA","TIG"]) for(const arc of [false,true]){
    const r={...build({proc,pos:"PA",joint:"butt",thick:3,kb:9,arc,ang:arc}),uf:1,cvn:1}, iu=r.events.map(e=>e.type).lastIndexOf("up");
    const dwell=ms=>{ const e=r.events.map(x=>({...x})), lastMv=e[iu-1].t; e[iu].t=lastMv+ms; for(let j=iu+1;j<e.length;j++) e[j].t=Math.max(e[j].t,e[iu].t); return S.simulate(J({...r,events:e})); };
    const d=[149,150,151,160].map(dwell), long=dwell(1500);
    if(Math.max(...d.map(x=>x.score))-Math.min(...d.map(x=>x.score))>1) bad.push(`${proc} ${arc?"mysz":"dotyk"} granica: ${d.map(x=>x.score)}`);
    if(!(long.spdAcc<d[0].spdAcc)) bad.push(`${proc} ${arc?"mysz":"dotyk"} 1,5 s nie obniża tempa`); }
  ok("B10 postój przed końcem ściegu: 149/150/151/160 ms ciągle (±1 pkt), 1,5 s obniża tempo",bad.length===0,bad); }

// 3) zamrożony silnik to naprawdę 3.14.0 / ocena 1.9.0
ok("sim-3.14.0.js = wersja 3.14.0 / ocena 1.9.0; sim.js = 3.15.0 / 1.10.0, krok 50 ms, strażnik 2,5 s",OLD.VERSION==="3.14.0"&&OLD.SCORING_VERSION==="1.9.0"&&S.VERSION==="3.15.0"&&S.SCORING_VERSION==="1.10.0"&&S.STEP_MS===50&&S.GRACE_MS===150&&S.IDLE_MS===2500);
console.log(fail?`\n✗ ${fail} nie przeszło`:"\n✓ wszystko przeszło"); process.exit(fail?1:0);
