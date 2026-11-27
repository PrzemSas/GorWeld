/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// BOTY KONTRA NORMA (09): pulpit liczy WYŁĄCZNIE silnikiem. Sprawdzamy:
//  A) simulate(r) bez opcji = bit w bit jak dotąd (Battle/stare testy nie widzą listy wad),
//  B) lista wad z sim.js = te same warunki i progi co inspect() w index.html (porównanie źródeł + kontrola mutacją),
//  C) lista wad zgadza się z odrzutem silnika (major ⇔ rejectReasons) na botach i na rundach z gen.js,
//  D) determinizm ziarna, Krok 1 / Krok 10, „od nowa", E) profile się różnią (porządek z silnika, bez wpisanych średnich),
//  F) teksty wad 1:1 z gry, zero Math.random / sieci / krypto na ścieżce wyniku.
const fs = require("fs"), path = require("path"), vm = require("vm"), cp = require("child_process");
const S = require("../sim.js"), Bt = require("../boty.js"), { build } = require("./gen.js");
let fail = 0; const ok = (n, c, i) => { console.log((c ? "  ✓ " : "  ✗ ") + n + (i !== undefined ? "  " + JSON.stringify(i) : "")); if (!c) fail++; };
const J = o => JSON.parse(JSON.stringify(o));
const ROOT = path.join(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), SIMSRC = fs.readFileSync(path.join(ROOT, "sim.js"), "utf8");
const BOTSRC = fs.readFileSync(path.join(ROOT, "boty.js"), "utf8"), PAGE = fs.readFileSync(path.join(ROOT, "boty.html"), "utf8");
const SEED = 20261126;

// ── A) bez opcji nic się nie zmienia ──
{ const rounds = [];
  for (const proc of ["MMA", "MIG", "TIG"]) for (const vFac of [0.6, 1, 2]) rounds.push({ ...build({ proc, thick: 5, vFac, arc: proc !== "TIG", kb: 9 }), cvn: 1, uf: 1 });
  for (let n = 1; n <= 3; n++) for (let b = 0; b < 3; b++) rounds.push(Bt.buildRound(SEED, b, n));
  let bad = 0, noKey = 0;
  for (const r of rounds) { const a = S.simulate(J(r)), d = S.simulate(J(r), { defects: true }); const { defects, ...rest } = d;
    if (JSON.stringify(a) !== JSON.stringify(rest) || !Array.isArray(defects)) bad++; if (!("defects" in a)) noKey++; }
  ok(`simulate(r) bez opcji: brak pola defects, reszta bit w bit jak z opcją (${rounds.length} rund)`, bad === 0 && noKey === rounds.length, { bad }); }

// ── B) źródła: każdy warunek wady z inspect() jest w sim.js tak samo (po zdjęciu spacji) ──
const nows = s => s.replace(/\s+/g, "");
const inspBody = (() => { const i = HTML.indexOf("function inspect(){"), j = HTML.indexOf("const major=D.some", i); return nows(HTML.slice(i, j)); })();
const simBlock = s => { const i = s.indexOf("// ── 09: LISTA WAD"), j = s.indexOf("res.defects = D;", i); return nows(s.slice(i, j)); };
// [kod, fragment w grze, fragment w sim.js] — fragmenty po zdjęciu spacji; tam, gdzie nazwy zmiennych się różnią, osobno
const SNIP = [
  ["hi", 'if(hiOver)D.push(', 'if(hiOver)D.push('],
  ["fast", 'if(tooFast)D.push({s:"major",c:"fast"', 'if(tooFast){'],
  ["fast", '(fastV/PX_PER_MM).toFixed(1),(targetPx/PX_PER_MM).toFixed(1)', '(fastV/PX_PER_MM).toFixed(1),(targetPx/PX_PER_MM).toFixed(1)'],
  ["dir", 'D.push({s:"major",c:"dir",t:t(posKey==="PF"?"def_dir_pf":"def_dir_pg")', 'if(dirBad)D.push({s:"major",c:"dir",k:posKey==="PF"?"def_dir_pf":"def_dir_pg"'],
  ["pen", 'if(coverage<0.85)D.push({s:coverage<0.6?"major":"minor",c:"pen"', 'if(coverage<0.85)D.push({s:coverage<0.6?"major":"minor",c:"pen"'],
  ["pen", 'Math.round((1-coverage)*100)', 'Math.round((1-coverage)*100)'],
  ["narrow", 'if(narrow/baked.length>0.25)D.push({s:"minor",c:"narrow"', 'if(cur.narrow/baked.length>0.25)D.push({s:"minor",c:"narrow"'],
  ["wide", 'if(wide/baked.length>0.2)D.push({s:"minor",c:"wide"', 'if(cur.wide/baked.length>0.2)D.push({s:"minor",c:"wide"'],
  ["undercut", 'if(overflow>0.12)D.push({s:overflow>0.3?"major":"minor",c:"undercut"', 'if(overflow>0.12)D.push({s:overflow>0.3?"major":"minor",c:"undercut"'],
  ["porosity", 'if(porosity>0)D.push({s:porosity>3?"major":"minor",c:"porosity"', 'if(porosity>0)D.push({s:porosity>3?"major":"minor",c:"porosity"'],
  // 10: etykieta łuku w sim.js przez arcSh — dla kb≤9 arcSh = arcR<1 jak w grze (sprawdzane niżej), kb:10 = strona większej kary
  ["arc", 'if(arcPen>0)D.push({s:arcPen>=12?"major":"minor",c:arcR<1?"arc_short":"arc_long"', 'if(arcPen>0)D.push({s:arcPen>=12?"major":"minor",c:arcSh?"arc_short":"arc_long"'],
  ["stick", 'if(arcFails>0)D.push({s:arcFails>2?"major":"minor",c:"stick"', 'if(arcFails>0)D.push({s:arcFails>2?"major":"minor",c:"stick"'],
  ["ang", 'constwo=angOverW(angW,posKey)*1.1,to=angOverT(Math.abs(angT))*0.9', 'constwo=angOverW(angW,posKey)*1.1,to=angOverT(Math.abs(angT))*0.9'],
  ["ang", 'constsev=angPen>=10?"major":"minor"', 's:angPen>=10?"major":"minor"'],
  ["ang", 'wo>=to?"ang_work":(angT>0?"ang_drag":"ang_push")', 'wo>=to?"ang_work":(angT>0?"ang_drag":"ang_push")'],
  ["offaxis", 'if(offPen>0)D.push({s:offPen>=OFF_MAJOR?"major":"minor",c:"offaxis"', 'if(offPen>0)D.push({s:offPen>=OFF_MAJOR?"major":"minor",c:"offaxis"'],
  ["filler", 'if(filPen>0)D.push({s:filPen>=FIL_MAJOR?"major":"minor",c:"filler"', 'if(filPen>0)D.push({s:filPen>=FIL_MAJOR?"major":"minor",c:"filler"'],
  ["amp", 'if(e.sev==="major"||(e.sev&&!ampSevT))ampSevT=e.sev', 'if(e.sev==="major"||(e.sev&&!ampSevT))ampSevT=e.sev'],
  ["amp", 'E.filter(e=>e.sev).sort((p,q)=>sv(q.sev)-sv(p.sev)||Math.abs(q.ar-1)-Math.abs(p.ar-1))[0]', 'Ed.filter(e=>e.sev).sort((p,q)=>sv(q.sev)-sv(p.sev)||Math.abs(q.ar-1)-Math.abs(p.ar-1))[0]'],
  ["amp", 'D.push({s:ampSevT,c:ea.ar<1?"amp_low":"amp_high"', 'D.push({s:ampSevT,c:ea.ar<1?"amp_low":"amp_high"'],
  ["amp", 'diaAmps(ea.d,posKey)', 'diaAmps(ea.d,posKey)'],
  ["dia", 'E.filter(e=>e.fit.s).sort((p,q)=>sv(q.fit.sev)-sv(p.fit.sev)||Math.abs(q.fit.s)-Math.abs(p.fit.s))[0]', 'Ed.filter(e=>e.fit.s).sort((p,q)=>sv(q.fit.sev)-sv(p.fit.sev)||Math.abs(q.fit.s)-Math.abs(p.fit.s))[0]'],
  ["dia", 'ed.fit.s<0?"def_dia_small":(joint!=="fillet"&&bl&&bl.lay===0?"def_dia_root":"def_dia_big")', 'ed.fit.s<0?"def_dia_small":(joint!=="fillet"&&bl&&bl.lay===0?"def_dia_root":"def_dia_big")'],
  ["dia", 'D.push({s:ed.fit.sev,c:"dia"', 'D.push({s:ed.fit.sev,c:"dia"'],
  ["amp1", 'elseif(ampF.sev){', 'elseif(ampF.sev&&ampRec!=null)D.push({s:ampF.sev,c:ampF.ar<1?"amp_low":"amp_high"'],
  ["amp1", 'D.push({s:ampF.sev,c:ampF.ar<1?"amp_low":"amp_high"', 'p:[ampsUse,ampRec]'],
  ["spatter", 'if(spatter>4&&proc!=="TIG")D.push({s:"minor",c:"spatter"', 'if(spatter>4&&proc!=="TIG")D.push({s:"minor",c:"spatter"'],
  ["uneven", 'if(evenness<0.6)D.push({s:"minor",c:"uneven"', 'if(evenness<0.6)D.push({s:"minor",c:"uneven"'],
  ["crater", 'if(endGap>0)D.push({s:endGap>1?"major":"minor",c:"crater"', 'if(endGap>0)D.push({s:endGap>1?"major":"minor",c:"crater"'],
  ["rootlack", 'if(passPlanArr[0]==="root"&&rootCov<0.8)D.push({s:"major",c:"rootlack"', 'if(passPlanArr[0]==="root"&&rootCov<0.8)D.push({s:"major",c:"rootlack"'],
  ["edges", 'if(beadPlan&&edgeCov<EDGE_OK)D.push({s:edgeCov<EDGE_MAJOR?"major":"minor",c:"edges"', 'if(kb&&edgeCov<EDGE_OK)D.push({s:edgeCov<EDGE_MAJOR?"major":"minor",c:"edges"'],
  ["interbead", 'if(ibGaps>0)D.push({s:ibMax>=IB_MAJOR?"major":"minor",c:"interbead"', 'if(ibGaps>0)D.push({s:ibMax>=IB_MAJOR?"major":"minor",c:"interbead"'],
  ["slag", 'if(slagCount>0)D.push({s:"major",c:"slag"', 'if(slagCount>0)D.push({s:"major",c:"slag"'],
  ["ok", 'if(D.length===0)D.push({s:"ok",c:"ok",t:t("def_clean")', 'if(D.length===0)D.push({s:"ok",c:"ok",k:"def_clean"']
];
function srcCheck(simText) { const sb = simBlock(simText), miss = [];
  for (const [c, g, s] of SNIP) { if (!inspBody.includes(nows(g))) miss.push("gra:" + c); if (!sb.includes(nows(s))) miss.push("sim:" + c); }
  // kolejność wad = kolejność w grze (ten sam porządek kodów `c:"…"`)
  const order = t => [...t.matchAll(/c:"([a-z_]+)"/g)].map(m => m[1]).filter((x, i, a) => a.indexOf(x) === i);
  const og = order(inspBody), os = order(sb);
  if (JSON.stringify(og) !== JSON.stringify(os)) miss.push("kolejność " + og.join(",") + " ≠ " + os.join(","));
  return miss; }
const miss0 = srcCheck(SIMSRC);
ok("10: etykieta łuku w sim.js dla rund kb≤9 = arcR<1 jak w grze (arcSh = kb10 ? … : arcR < 1)", nows(SIMSRC).includes("constarcSh=kb10?arcLoAcc>=arcHiAcc:arcR<1;") && nows(SIMSRC).includes("constkb10=round.kb>=10;"));
ok(`warunki i progi wad w sim.js = inspect() w grze (${SNIP.length} fragmentów, kolejność kodów)`, miss0.length === 0, miss0.slice(0, 6));
// stałe progów, z których korzystają oba pliki
const constOf = (src, name) => { const m = src.match(new RegExp("\\b" + name + "\\s*=\\s*([0-9.]+)")); return m ? +m[1] : null; };
const CONSTS = ["OFF_MAJOR", "FIL_MAJOR", "EDGE_OK", "EDGE_MAJOR", "IB_MAJOR", "FAST_TOL"];
const cdiff = CONSTS.filter(k => constOf(SIMSRC, k) === null || constOf(SIMSRC, k) !== constOf(HTML, k));
ok("stałe progów w sim.js = index.html (" + CONSTS.join(", ") + ")", cdiff.length === 0, cdiff);
// kody: każdy kod, który gra zapisuje w historii (HIST_CODES), sim.js umie wystawić — i odwrotnie
const HIST = JSON.parse(HTML.match(/HIST_CODES=(\[[^\]]*\])/)[1].replace(/\s/g, ""));
const simCodes = new Set([...simBlock(SIMSRC).matchAll(/"([a-z_]+)"/g)].map(m => m[1]).filter(x => HIST.includes(x) || x === "ok"));
const lack = HIST.filter(c => c !== "stop" && !simCodes.has(c));   // "stop" = podpowiedź o postoju w historii, nie wada z inspect()
ok(`sim.js wystawia każdy kod wady z gry (HIST_CODES: ${HIST.length - 1} bez podpowiedzi „stop")`, lack.length === 0, lack);
// kontrola mutacją: drobna zmiana progu w sim.js MUSI wywalić porównanie źródeł
const MUT = [["coverage < 0.85", "coverage < 0.86"], ["overflow > 0.3 ?", "overflow > 0.31 ?"], ["spatter > 4 &&", "spatter > 5 &&"], ['c: "slag"', 'c: "slagx"']];
const mutOk = MUT.filter(([a, b]) => { const blk = SIMSRC.indexOf("// ── 09: LISTA WAD"); const t = SIMSRC.slice(0, blk) + SIMSRC.slice(blk).replace(a, b); return srcCheck(t).length > 0; }).length;
ok(`kontrola mutacją: ${MUT.length}/${MUT.length} zmian progu wykryte`, mutOk === MUT.length, mutOk);

// ── C) lista wad ⇔ odrzut silnika ──
const R2C = { coverage: [["pen", "major"]], root: [["rootlack", "major"]], ends: [["crater", "major"]], heatInput: [["hi", "major"]], underfill: [["fast", "major"]],
  edges: [["edges", "major"]], interbead: [["interbead", "major"]], slag: [["slag", "major"]], overflow: [["undercut", "major"]], porosity: [["porosity", "major"]],
  offAxis: [["offaxis", "major"]], electrode: [["dia", "major"]], amps: [["amp_low", "major"], ["amp_high", "major"]], arc: [["arc_short", "major"], ["arc_long", "major"], ["stick", "major"]],
  angle: [["ang_work", "major"], ["ang_drag", "major"], ["ang_push", "major"]], filler: [["filler", "major"]], direction: [["dir", "major"]] };
function consistent(r) { const D = r.defects, maj = D.filter(d => d.s === "major"), rr = r.rejectReasons.filter(x => x !== "score");
  if (r.iso !== "REJECT") return maj.length === 0 && r.rejectReasons.length === 0 && (r.score >= 50);
  if (r.score < 50 && !maj.length) return r.rejectReasons.join() === "score";
  if (!rr.length) return false;
  for (const x of rr) if (!(R2C[x] || []).some(([c, s]) => D.some(d => d.c === c && d.s === s))) return false;   // każda przyczyna ma swoją wadę major
  for (const d of maj) if (!rr.some(x => (R2C[x] || []).some(([c]) => c === d.c))) return false;                // każda wada major ma przyczynę
  return true; }
{ const bench = new Bt.Bench(SEED).step(20); let bad = [];
  for (const e of bench.log) { const r = S.simulate(J(Bt.buildRound(SEED, e.bot, e.n)), { defects: true }); if (!consistent(r)) bad.push(`${e.bot}#${e.n} ${r.iso} ${r.rejectReasons} ${r.defects.map(d => d.c + ":" + d.s)}`); }
  ok(`boty: wada major ⇔ przyczyna odrzutu silnika (${bench.log.length} prób)`, bad.length === 0, bad.slice(0, 3)); }
{ let bad = [], n = 0;
  for (const proc of ["MMA", "MIG", "TIG"]) for (const [pos, joint] of [["PA", "butt"], ["PF", "butt"], ["PC", "fillet"]]) for (const thick of [3, 5, 8]) for (const vFac of [0.5, 1, 2]) for (const amp of [null, 0.6, 1.5]) {
    const ar = S.recommendedAmps(proc, thick, pos); const r = { ...build({ proc, pos, joint, thick, vFac, arc: proc !== "TIG", kb: 9, amps: amp && ar ? Math.round(ar * amp) : null }), cvn: 1, uf: 1 };
    const s = S.simulate(J(r), { defects: true }); n++; if (!consistent(s)) bad.push(`${proc} ${pos} ${thick} ×${vFac} A×${amp}: ${s.iso} ${s.rejectReasons} | ${s.defects.map(d => d.c + ":" + d.s)}`); }
  ok(`gen.js: wada major ⇔ przyczyna odrzutu (${n} rund MMA/MIG/TIG, PA/PF/PC, 3/5/8 mm, tempo, prąd)`, bad.length === 0, bad.slice(0, 3)); }
// znane rundy z CZYTAJ: ×1,0 bez def_fast; ×2,0 + uf → def_fast major, underfill, REJECT, punkty jak bez reguły
{ const r1 = { ...build({ proc: "MMA", thick: 5, vFac: 1, arc: true, kb: 9 }), cvn: 1, uf: 1 }, s1 = S.simulate(J(r1), { defects: true });
  ok("×1,0 WPS: brak def_fast, brak underfill", !s1.defects.some(d => d.c === "fast") && !s1.rejectReasons.includes("underfill"), { iso: s1.iso, d: s1.defects.map(d => d.c) });
  const r2 = { ...build({ proc: "MMA", thick: 5, vFac: 2, arc: true, kb: 9 }), cvn: 1, uf: 1 }, s2 = S.simulate(J(r2), { defects: true }), s2n = S.simulate(J({ ...r2, uf: 0 }));
  const f = s2.defects.find(d => d.c === "fast");
  ok("×2,0 WPS + uf: def_fast major, underfill, REJECT, punkty = bez reguły", !!f && f.s === "major" && f.k === "def_fast" && s2.rejectReasons.includes("underfill") && s2.iso === "REJECT" && s2.score === s2n.score,
    { iso: s2.iso, rr: s2.rejectReasons, score: s2.score, bez: s2n.score, p: f && f.p });
  ok("def_fast podaje tempo z silnika (fastR × WPS)", !!f && Math.abs(+f.p[0] - s2.fastR * Bt.SPEED_WPS) < 0.051 && +f.p[1] === Bt.SPEED_WPS, f && f.p);
  const ar = S.recommendedAmps("MIG", 5, "PA"), r3 = { ...build({ proc: "MIG", thick: 5, vFac: 1, arc: true, kb: 9, amps: Math.round(ar * 0.55) }), cvn: 1, uf: 1 }, s3 = S.simulate(J(r3), { defects: true });
  const a3 = s3.defects.find(d => d.c === "amp_low");
  ok("prąd 55% WPS (MIG): def_amp_low z prądem gracza i WPS; major ⇔ przyczyna „amps\"", !!a3 && a3.p[0] === Math.round(ar * 0.55) && a3.p[1] === ar && ((a3.s === "major") === s3.rejectReasons.includes("amps")), { a3, rr: s3.rejectReasons }); }

// ── D) determinizm, kroki, od nowa ──
const sig = b => JSON.stringify(b.log);
{ const a = new Bt.Bench(SEED).step(10), b = new Bt.Bench(SEED).step(10);
  ok("ziarno 20261126, 10 kroków × 3 boty: dwa przebiegi bit w bit (score, litera, ISO, przyczyny, wady, parametry)", sig(a) === sig(b) && a.log.length === 30, a.log.length);
  // osobny proces Node — żadnego stanu współdzielonego między przebiegami
  const out = cp.execFileSync(process.execPath, ["-e", `const B=require(${JSON.stringify(path.join(ROOT, "boty.js"))});process.stdout.write(JSON.stringify(new B.Bench(${SEED}).step(10).log))`], { maxBuffer: 1 << 26 }).toString();
  ok("to samo w osobnym procesie Node", out === sig(a));
  // parytet z silnikiem: każdy wpis = ArcSim.simulate(ta sama runda) — bez opcji, czyli dokładnie to, co liczy Battle
  let bad = []; for (const e of a.log) { const r = Bt.buildRound(SEED, e.bot, e.n), s = S.simulate(J(r));
    for (const k of ["score", "letter", "iso", "amps", "ampsWps", "volts", "waDeg", "taDeg", "fastR", "fastMax", "hi", "hiMax", "coverage"]) if (JSON.stringify(e[k]) !== JSON.stringify(s[k])) bad.push(`${e.bot}#${e.n}.${k}`);
    if (JSON.stringify(e.rejectReasons) !== JSON.stringify(s.rejectReasons)) bad.push(`${e.bot}#${e.n}.rejectReasons`);
    if (JSON.stringify(e.defects) !== JSON.stringify(S.simulate(J(r), { defects: true }).defects)) bad.push(`${e.bot}#${e.n}.defects`); }
  ok("każdy wpis pulpitu = ArcSim.simulate(runda): zero rozjazdów (30 prób × 14 pól)", bad.length === 0, bad.slice(0, 5));
  // kontrola: test parytetu łapie podmianę wyniku
  const fake = J(a.log); fake[4].score += 1; const s4 = S.simulate(J(Bt.buildRound(SEED, fake[4].bot, fake[4].n)));
  ok("kontrola: dopisany 1 punkt w dzienniku zostałby wykryty", fake[4].score !== s4.score);
  const c = new Bt.Bench(SEED); c.step(1); const n1 = c.log.length; c.step(10);
  ok("Krok 1 = +1 próba każdego bota (3 wpisy), Krok 10 = +10 (30 wpisów)", n1 === 3 && c.log.length === 33 && c.n === 11 && [0, 1, 2].every(b => c.stats(b).n === 11), { n1, all: c.log.length, n: c.n });
  ok("każdy wpis to skończona próba (wszystkie ściegi z planu silnika)", c.log.every(e => e.passes === S.weldPlan("butt", 5, "PA", "MMA", 2).length), c.log[0].passes);
  c.reset(SEED); ok("od nowa: dziennik pusty", c.log.length === 0 && c.n === 0);
  c.step(10); ok("od nowa z tym samym ziarnem: dziennik identyczny", sig(c) === sig(a));
  const d = new Bt.Bench(SEED + 1).step(10); ok("inne ziarno = inny dziennik", sig(d) !== sig(a)); }

// ── E) profile: porządek z silnika, bez wpisanych średnich ──
{ const b = new Bt.Bench(SEED).step(20), n = b.stats(0), m = b.stats(1), x = b.stats(2);
  ok("ziarno 20261126, 20 prób: egzaminator ma wyższy pass rate i średnią niż nowicjusz", x.pass > n.pass && x.avg > n.avg, { nowicjusz: [+n.avg.toFixed(1), n.pass], sredni: [+m.avg.toFixed(1), m.pass], egzaminator: [+x.avg.toFixed(1), x.pass] });
  ok("średniozaawansowany pomiędzy (średnia punktów)", n.avg < m.avg && m.avg < x.avg);
  const usesSim = b.log.every(e => e.score === S.simulate(J(Bt.buildRound(SEED, e.bot, e.n))).score);
  ok("statystyki liczone z wyników silnika (60/60 prób)", usesSim); }

// ── F) teksty i czystość kodu ──
{ const i = HTML.indexOf("const I18N={"); let dd = 0, j = i + 11; for (; j < HTML.length; j++) { const ch = HTML[j]; if (ch === "{") dd++; else if (ch === "}") { dd--; if (!dd) break; } }
  const I = vm.runInNewContext("(" + HTML.slice(i + 11, j + 1) + ")"), bad = [];
  // 11: klucze z zakresem prądu (TEXTS_KB11) są tylko na pulpicie (reguła kb:11) — gra ich nie ma i nie może ich mieć (gra nietknięta)
  const K11 = Bt.TEXTS_KB11 || [];
  for (const l of ["pl", "en"]) for (const k of Object.keys(Bt.TEXTS[l])) if (K11.indexOf(k) < 0 && Bt.TEXTS[l][k] !== I[l][k]) bad.push(l + ":" + k);
  for (const k of K11) if (I.pl[k] !== undefined || !/%3/.test(Bt.TEXTS.pl[k] || "")) bad.push("kb11:" + k);
  const keys = new Set([...simBlock(SIMSRC).matchAll(/"(def_[a-z_]+)"/g)].map(m => m[1]));
  const noTxt = [...keys].filter(k => !Bt.TEXTS.pl[k] || !Bt.TEXTS.en[k]);
  ok(`teksty wad, klas ISO i zastrzeżenia 1:1 z I18N gry (${Object.keys(Bt.TEXTS.pl).length} kluczy × PL/EN)`, bad.length === 0 && noTxt.length === 0, bad.concat(noTxt).slice(0, 5)); }
const code = BOTSRC.replace(/\/\*TEXTS\*\/[\s\S]*?\/\*\/TEXTS\*\//, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");   // bez komentarzy
ok("boty.js: zero Math.random / Date / sieci", !/Math\.random|Date\.now|new Date|fetch\(|XMLHttpRequest|WebSocket|localStorage/.test(code));
ok("boty.html: zero Math.random, sieci, zapisu w przeglądarce i obcych skryptów", !/Math\.random|fetch\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|https?:\/\//.test(PAGE.replace(/<!--[\s\S]*?-->/g, "")) && (PAGE.match(/<script src="[^"]+"/g) || []).join() === '<script src="sim.js",<script src="boty.js"');
ok("pulpit pokazuje zastrzeżenie z gry (rep_note) i nie liczy własnej oceny", PAGE.includes("TEXTS.pl.rep_note") && !/score\s*[+\-*]=|\.score\s*=[^=]/.test(PAGE));
ok("zero krypto i tokena w kodzie i na ekranie", !/token|solana|airdrop|wallet|portfel|\$gorweld|perp|ticker|giełd|płynnoś|order ?book/i.test(BOTSRC + PAGE));
ok("ocena nietknięta: SCORING_VERSION i VERSION jak przed 09", S.SCORING_VERSION === "1.10.0" && S.VERSION === "3.15.0", [S.VERSION, S.SCORING_VERSION]);

console.log(fail ? `\n✗ ${fail} nie przeszło` : "\n✓ wszystko przeszło"); process.exit(fail ? 1 : 0);
