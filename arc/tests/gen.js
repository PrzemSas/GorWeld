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
// Generator rund do testu parytetu — buduje surowe zdarzenia wskaźnika, tak jak robi to gra.
const W=1280,H=720,PX=16;
const PROCESS={MMA:{vMul:1.0},MIG:{vMul:1.4},TIG:{vMul:0.7}};
const SPEED={2:5.0,3:4.3,5:3.2,8:2.3,12:1.6};
const POSITIONS={PA:{ang:0,stars:1},PB:{ang:0,stars:2},PC:{ang:0,stars:3},PD:{ang:0,stars:4},
  PE:{ang:0,stars:5},PF:{ang:90,stars:4},PG:{ang:90,stars:3},
  P1G:{ang:0,stars:1,pipe:"flat"},P2G:{ang:0,stars:3,pipe:"wall"},
  P5G:{ang:0,stars:4,pipe:"axis"},HL045:{ang:0,stars:5,pipe:"axis",tilt:45}};
const ELEC_DIA={2:2.0,3:2.5,5:3.25,8:4.0,12:4.0};
const ARC_RISE=1.0,ARC_PUSH=3.5,ARC_LIFT=1.5;

function seam(posKey){
  const P=POSITIONS[posKey],cx=W/2,cy=H*0.66,pts=[];
  if(P.pipe){ const r=Math.min(W,H)*0.30,tilt=(P.tilt||0)*Math.PI/180;
    const yS=P.pipe==="flat"?0.40:P.pipe==="wall"?1.0:0.6;
    for(let a=0;a<=Math.PI*2+0.001;a+=Math.PI/110){const x=Math.cos(a)*r,y=Math.sin(a)*r*yS;
      pts.push({x:cx+x*Math.cos(tilt)-y*Math.sin(tilt),y:cy+x*Math.sin(tilt)+y*Math.cos(tilt)});}
  } else { const len=Math.min(W,H)*0.62,ang=P.ang*Math.PI/180,dx=Math.cos(ang),dy=Math.sin(ang);
    for(let t=-1;t<=1.0001;t+=2/150) pts.push({x:cx+dx*len/2*t,y:cy+dy*len/2*t}); }
  return pts;
}
const q=v=>Math.round(v*100)/100;

// vFac = krotność tempa docelowego; arc = emuluj przyciski; keyPlan(tSec) -> maska klawiszy
function build({proc="MMA",pos="PA",thick=5,bead="steel",joint="butt",amps=null,
                vFac=1,arc=false,ang=false,keyPlan=null,seed=12345,dtMs=8,passes=null}={}){
  const pts=seam(pos), v=SPEED[thick]*PX*PROCESS[proc].vMul*vFac;
  const L0=ELEC_DIA[thick]||2.5;
  const nPass = passes!=null?passes:(thick<=3?1:thick<=5?2:3);
  const ev=[]; let t=0, elec=1;   // elektroda przechodzi MIĘDZY warstwami — silnik jej nie zeruje na `bank`
  for(let pi=0;pi<nPass;pi++){
    if(pi) ev.push({type:"bank",t:Math.round(t),x:0,y:0});
    let arcLen=0, i=0, acc=0;
    const push=(type,p,b,k)=>{const e={type,t:Math.round(t),x:q(p.x),y:q(p.y)};
      if(b!==undefined)e.b=b|0; if(k!==undefined)e.k=k|0; ev.push(e);};
    push("down",pts[0],arc?0:undefined);
    let cur=pts[0];
    while(i<pts.length-1){
      t+=dtMs; const dtS=dtMs/1000;
      // przyciski: „dobry spawacz" — dogrywa, gdy łuk urósł ponad nominał
      let b=0;
      if(arc){ b=(arcLen>L0)?1:0;
        arcLen=Math.max(0,arcLen+(ARC_RISE+((b&2)?ARC_LIFT:0)-((b&1)?ARC_PUSH:0))*dtS); }
      // MMA wypala elektrodę — bez wymiany silnik ucina resztę ściegu (`replacing` → koniec odkładania).
      // Próg 0,13 jest NIŻSZY od silnikowego ELEC_STUB=0,16 CELOWO: świeżą elektrodę silnik podaje
      // wyłącznie na `down` i wyłącznie gdy sam już zdążył ustawić `replacing`. Generator musi więc
      // spóźnić się za nim, a nie go wyprzedzić — inaczej `down` nic nie resetuje i ścieg umiera.
      if(proc==="MMA"){
        elec-=v*dtS/(arc?1000:650); if(arc) elec-=dtS/55;
        if(elec<=0.13){ push("up",cur); t+=20; push("down",cur,arc?0:undefined); arcLen=0; elec=1; } }
      const k=ang?(keyPlan?keyPlan(t/1000):0):undefined;
      acc+=v*dtS;
      while(i<pts.length-1&&acc>=Math.hypot(pts[i+1].x-pts[i].x,pts[i+1].y-pts[i].y)){
        acc-=Math.hypot(pts[i+1].x-pts[i].x,pts[i+1].y-pts[i].y); i++; }
      const a=pts[Math.min(i,pts.length-1)],c=pts[Math.min(i+1,pts.length-1)];
      const seg=Math.hypot(c.x-a.x,c.y-a.y)||1,f=Math.min(1,acc/seg);
      cur={x:a.x+(c.x-a.x)*f,y:a.y+(c.y-a.y)*f};
      push("move",cur,arc?b:undefined,k);
      if(t>60000) break;
    }
    t+=20; push("up",pts[pts.length-1]);
    t+=250;
  }
  const r={seed,W,H,proc,joint,pos,thick,bead,amps,events:ev};
  if(arc) r.arc=1; if(ang) r.ang=1;
  return r;
}
module.exports={build,POSITIONS,SPEED};
