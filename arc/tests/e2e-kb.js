/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// KOMBAJN 3.7.0 E2E: prawdziwa mysz spawa KAŻDY ścieg po SWOIM torze (lanePts), z bankowaniem jak gracz.
// Sprawdza: nagranie ma kb=2 (3.8.0), ekran == sim.js (punkty, ISO, przyczyny), MMA: młotek (C) → bez 301,
// bez młotka → REJECT „slag" na ekranie i w weryfikatorze.
// Użycie: node e2e-kb.js http://localhost:8765/arc [tryb]   tryb: mig-pc | mma-chip | mma-noslag (domyślnie wszystkie)
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) { try { ({ chromium } = require(p)); break; } catch (e) {} }
if (!chromium) { console.error("brak playwrighta"); process.exit(2); }
const BASE = process.argv[2], ONLY = process.argv[3];
const EXE = process.env.ARC_CHROME || "/home/gorweld/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
if (!BASE) { console.error("użycie: node e2e-kb.js <baseURL> [tryb]"); process.exit(2); }
let fail = 0; const ok = (n, c, i) => { console.log((c ? "  ✓ " : "  ✗ ") + n + (i !== undefined ? "  " + JSON.stringify(i) : "")); if (!c) fail++; };

async function run(b, { name, proc, pos, thick, chip, dia, man, keep, dir }) {
  const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; pg.on("pageerror", e => errs.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem("gorweld_tut", "1"); localStorage.setItem("gorweld_lang", "pl"); } catch (e) {} });
  await pg.goto(BASE + "/index.html"); await pg.waitForTimeout(1500);
  await pg.evaluate(() => { if (window.openM) closeModal(openM); });
  await pg.click(`[data-proc="${proc}"]`); await pg.waitForTimeout(200);
  await pg.click(`.thk[data-t="${thick}"]`); await pg.waitForTimeout(200);
  await pg.evaluate(p => { const b = [...document.querySelectorAll(".pos")].find(x => x.dataset.pos === p); b && b.click(); }, pos);
  await pg.waitForTimeout(300);
  if (man) { await pg.click('.ampmode[data-m="man"]'); await pg.waitForTimeout(200); }
  const nBeads = await pg.evaluate(() => passPlanArr.length); let hint = "";
  for (let bi = 0; bi < nBeads; bi++) {
    const g = await pg.evaluate(() => { const r = stage.getBoundingClientRect(), k = r.width / W;
      return { pts: lanePts.map(p => [r.left + p.x * k, r.top + p.y * k]), v: targetPx * k, idx: passIndex }; });
    // 3.13.0: dir "up"/"down" — mysz jedzie tor w górę albo w dół ekranu (PF poprawnie = w górę)
    if (dir && ((dir === "up") === (g.pts[g.pts.length - 1][1] > g.pts[0][1]))) g.pts.reverse();
    if (g.idx !== bi) { ok(`${name}: ścieg ${bi + 1} wystartował`, false, { passIndex: g.idx }); break; }
    // 3.10.0: Ø wybierana klikiem w HUD przed zajarzeniem; RĘCZNIE — pokrętło na prąd Ø ściegu (jak gracz między ściegami)
    // 3.12.0: elektroda zostaje w uchwycie — dobry spawacz bierze typową (★), chyba że przypadek mówi inaczej
    if (dia && dia[bi]) { await pg.click(`#toolhud [data-dia="${dia[bi]}"]`); await pg.waitForTimeout(100); }
    else if (proc === "MMA" && !keep) { await pg.click("#toolhud .dia.typ"); await pg.waitForTimeout(100); }
    if (keep && bi === 1) { await pg.waitForTimeout(1300); hint = await pg.evaluate(() => toast.textContent); }
    if (man) { await pg.evaluate(() => setAmpSet(diaAmps(curDia(), posKey))); await pg.waitForTimeout(100); }
    // dobry spawacz: dogrywa elektrodę, gdy łuk urósł ponad nominał; po zgaśnięciu (wymiana) zajarza od nowa
    let down = false;
    await pg.mouse.move(g.pts[0][0], g.pts[0][1]); await pg.mouse.down(); down = true;
    pass: for (let i = 1; i < g.pts.length; i++) {
      const d = Math.hypot(g.pts[i][0] - g.pts[i - 1][0], g.pts[i][1] - g.pts[i - 1][1]);
      const sub = Math.max(1, Math.round(d / 2));
      for (let s = 1; s <= sub; s++) {
        const x = g.pts[i - 1][0] + (g.pts[i][0] - g.pts[i - 1][0]) * s / sub, y = g.pts[i - 1][1] + (g.pts[i][1] - g.pts[i - 1][1]) * s / sub;
        const st = await pg.evaluate(() => ({ welding, al: arcLen, L0: arcL0(), live: arcLive, pi: passIndex }));
        if (st.pi !== bi) break pass;   // gra zamknęła ścieg (np. łuk zgasł przy pełnym pokryciu) — nie zajarzać na starym torze
        if (!st.welding) { if (down) { await pg.mouse.up(); down = false; } await pg.mouse.move(x, y); await pg.mouse.down(); down = true; continue; }
        if (st.live) { const want = st.al > st.L0; if (want && !down) { await pg.mouse.down(); down = true; } if (!want && down) { await pg.mouse.up(); down = false; } }
        await pg.mouse.move(x, y);
        await pg.waitForTimeout(Math.max(1, (d / sub) / g.v * 1000 - 4));
      }
    }
    // koniec ściegu: LPM+PPM gasi łuk (świadomie, bez kary)
    const L = g.pts[g.pts.length - 1];
    const open = await pg.evaluate(b => passIndex === b, bi);
    if (!open) { if (down) { await pg.mouse.up(); down = false; } }
    else {
    if (!down) { await pg.mouse.down(); down = true; }
    await pg.mouse.down({ button: "right" }); await pg.mouse.move(L[0] + 0.5, L[1]); await pg.waitForTimeout(120);
    await pg.mouse.up({ button: "right" }); await pg.mouse.up(); down = false;
    }
    await pg.waitForTimeout(450);
    // młotek dopiero, gdy gra go przyjmie (ścieg zamknięty, żużel do zbicia) — jak gracz, który widzi przycisk
    if (bi < nBeads - 1 && proc === "MMA" && chip) {
      await pg.waitForFunction(() => needChip && !welding, null, { timeout: 5000 }).catch(() => {});
      await pg.keyboard.press("c"); await pg.waitForTimeout(150);
    }
  }
  await pg.waitForTimeout(800);
  const out = await pg.evaluate(() => {
    if (!document.getElementById("repModal").classList.contains("open")) inspect();
    const s = ArcSim.simulate(JSON.parse(JSON.stringify(rec)));
    const iso = (document.getElementById("rIso").textContent || "").replace("≈ ISO 5817 · ", "").trim();
    return { kb: rec.kb, am: rec.am || 0, dias: rec.events.filter(e => e.type === "dia").map(e => e.d), amps: rec.events.filter(e => e.type === "amp").map(e => e.a),
      elec: s.elec, diaPen: s.diaPen, ampPen: s.ampPen, chips: rec.events.filter(e => e.type === "chip").length, banks: rec.events.filter(e => e.type === "bank").length,
      beads: passPlanArr.length, live: rec.liveScore, sim: s.score, simIso: s.iso, ekranIso: iso,
      isoOk: iso === t(s.iso === "REJECT" ? "iso_reject" : "iso_" + s.iso), reasons: s.rejectReasons, dirWrong: s.dirWrong, edge: s.edgeCov, ib: s.ibMax, slag: s.slag,
      defects: [...document.querySelectorAll("#rDefects li")].map(l => l.textContent.slice(0, 60)) };
  });
  await pg.close();
  out.hint = hint; return { out, errs };
}
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--mute-audio"] });
  const cases = [
    { name: "mig-pc", proc: "MIG", pos: "PC", thick: 8 },
    { name: "mma-chip", proc: "MMA", pos: "PA", thick: 8, chip: true },
    { name: "mma-noslag", proc: "MMA", pos: "PA", thick: 8, chip: false },
    { name: "mma-pc12", proc: "MMA", pos: "PC", thick: 12, chip: true },   // 3.8.0: 3 ściegi (było 10)
    { name: "mma-dia", proc: "MMA", pos: "PA", thick: 8, chip: true, dia: { 0: 32, 2: 25 } },   // 3.10.0: +1 na grani (REJECT electrode), −1 na licu
    { name: "mma-keep", proc: "MMA", pos: "PA", thick: 8, chip: true, keep: true },          // 3.12.0: gracz nie zmienia Ø — 2,5 zostaje na wszystkich ściegach
    { name: "mma-man", proc: "MMA", pos: "PA", thick: 12, chip: true, man: true },             // 3.10.0: RĘCZNIE, prąd przestawiany między ściegami
    { name: "mma-pf-up", proc: "MMA", pos: "PF", thick: 8, chip: true, dir: "up" },             // 3.13.0: PF z dołu do góry — bez odrzutu za kierunek
    { name: "mma-pf-down", proc: "MMA", pos: "PF", thick: 8, chip: true, dir: "down" },         // 3.13.0: PF z góry na dół — REJECT direction
  ].filter(c => !ONLY || c.name === ONLY);
  for (const c of cases) {
    const { out, errs } = await run(b, c);
    console.log(c.name, JSON.stringify(out));
    ok(`${c.name}: nagranie ma kb=9 i ${out.beads} ściegów (${out.banks} bank)`, out.kb === 9 && out.banks === out.beads - 1);   // 3.15.0: kb=9
    ok(`${c.name}: ekran == sim.js (punkty i ISO)`, out.live === out.sim && out.isoOk, { live: out.live, sim: out.sim, iso: out.ekranIso, simIso: out.simIso });
    ok(`${c.name}: zero błędów JS`, errs.length === 0, errs.slice(0, 2));
    if (c.name === "mig-pc") ok("mig-pc: po torach — lico przykrywa fazę, ściegi zlane", !(out.reasons || []).some(r => ["edges", "interbead"].includes(r)) && out.ib === 0, { edge: out.edge, ib: out.ib, reasons: out.reasons });
    if (c.name === "mma-pc12") ok("mma-pc12: 3 ściegi, bez nowych odrzutów", out.beads === 3 && !(out.reasons || []).some(r => ["edges", "interbead", "slag"].includes(r)), { beads: out.beads, reasons: out.reasons, edge: out.edge, chips: out.chips, banks: out.banks, slag: out.slag });
    if (c.name === "mma-dia") ok("mma-dia: dia w nagraniu, Ø per ścieg, REJECT electrode na ekranie i w weryfikatorze", JSON.stringify(out.dias) === "[32,25]" && JSON.stringify((out.elec || []).map(e => e.d)) === "[32,32,25]" && (out.reasons || []).includes("electrode") && out.defects.some(d => /elektroda/.test(d)), { dias: out.dias, elec: out.elec, reasons: out.reasons, defects: out.defects });
    if (c.name === "mma-keep") ok("mma-keep: Ø2,5 zostaje w uchwycie (25/25/25), kara Ø, podpowiedź o typowej", JSON.stringify((out.elec || []).map(e => e.d)) === "[25,25,25]" && out.diaPen > 0 && /Ø3,2/.test(out.hint || ""), { elec: (out.elec || []).map(e => [e.d, e.typ]), diaPen: out.diaPen, hint: out.hint });
    if (c.name === "mma-man") ok("mma-man: am=1, `amp` między ściegami (160/115), bez kary prądu", out.am === 1 && JSON.stringify(out.amps) === "[160,115]" && out.ampPen === 0 && !(out.reasons || []).includes("amps"), { am: out.am, amps: out.amps, ampPen: out.ampPen, elec: out.elec, reasons: out.reasons });
    if (c.name === "mma-pf-up") ok("mma-pf-up: PF z dołu — brak „direction” (ekran i weryfikator), dirWrong 0", !(out.reasons || []).includes("direction") && !out.defects.some(d => /PF jechany/.test(d)) && (out.dirWrong || []).every(w => w === 0), { reasons: out.reasons, dirWrong: out.dirWrong });
    if (c.name === "mma-pf-down") ok("mma-pf-down: PF z góry — REJECT direction na ekranie i w weryfikatorze", (out.reasons || []).includes("direction") && out.defects.some(d => /PF jechany/.test(d)) && out.simIso === "REJECT" && out.isoOk, { reasons: out.reasons, dirWrong: out.dirWrong, iso: out.ekranIso });
    if (c.name === "mma-chip") ok("mma-chip: młotek w nagraniu, brak 301", out.chips === out.beads - 1 && !out.slag, { chips: out.chips, slag: out.slag });
    if (c.name === "mma-noslag") ok("mma-noslag: bez młotka REJECT slag (ekran i weryfikator)", out.slag > 0 && (out.reasons || []).includes("slag") && out.defects.some(d => /żużl/.test(d)), { slag: out.slag, reasons: out.reasons });
  }
  await b.close();
  console.log(fail ? `\n✗ ${fail} nie przeszło` : "\n✓ przeszło"); process.exit(fail ? 1 : 0);
})();
