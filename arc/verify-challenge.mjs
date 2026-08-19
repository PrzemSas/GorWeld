#!/usr/bin/env node
/**
 * Weryfikator zgłoszeń ARC CHALLENGE.
 *
 *   node verify-challenge.mjs proof1.json proof2.json ...
 *   cat proof.json | node verify-challenge.mjs -
 *
 * Odtwarza rundę headless przez sim.js i liczy wynik OD NOWA. To, co gracz wpisał
 * w `claimedScore`, jest wyłącznie informacyjne — liczy się tylko wynik z replaya.
 *
 * ⚠ Czego ten skrypt NIE potrafi: odróżnić człowieka od skryptu. Poprawnie
 * wygenerowana tablica zdarzeń przechodzi weryfikację niezależnie od tego, kto ją
 * stworzył. Heurystyki poniżej odsiewają tylko naiwne boty — do nagrody traktuj
 * wynik jako kwalifikację, a rozstrzygaj finałem na udostępnionym ekranie.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const ArcSim = require(join(here, "sim.js"));
const CFG = JSON.parse(readFileSync(join(here, "challenge-config.json"), "utf8"));

const PIN_DEFAULT = ["proc", "joint", "pos", "thick", "bead"];
const PIN = Array.isArray(CFG.pin) && CFG.pin.length ? CFG.pin : PIN_DEFAULT;
// Kursor przychodzi w całych pikselach CSS i jest skalowany przez 1280/rect.width, więc na wąskim
// oknie rośnie krok kwantyzacji. Silnik 1.3.0 tę zależność zdjął — pomiar sterownikiem parity
// (2026-08-19) daje ten sam wynik 92 pkt od 302 px do 1173 px, a rozjeżdża się dopiero przy ≤267 px.
// Stąd próg 400 px: margines nad kolanem, a telefon w poziomie się mieści (poprzednie 600 px
// odbijało iPhone'a SE, który po letterboxie ma ~569 px). MUSI być ten sam co `CHAL_MIN_W` w grze.
const MIN_RW = 400;

function readProof(path) {
  const raw = path === "-" ? readFileSync(0, "utf8") : readFileSync(path, "utf8");
  return JSON.parse(raw);
}

/** Naiwne wykrywanie skryptu: idealny metronom + idealna linia. */
function botSignals(events) {
  const moves = events.filter(e => e.type === "move");
  if (moves.length < 25) return { verdict: "ZA_MALO_PROBEK", detail: `${moves.length} zdarzeń ruchu` };
  const dts = [];
  for (let i = 1; i < moves.length; i++) dts.push(moves[i].t - moves[i - 1].t);
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const std = a => Math.sqrt(mean(a.map(x => (x - mean(a)) ** 2)));
  // odchyłka od cięciwy — u człowieka ręka drga, u bota jest zero
  const resid = [];
  for (let i = 1; i < moves.length - 1; i++) {
    const a = moves[i - 1], b = moves[i], c = moves[i + 1];
    const dx = c.x - a.x, dy = c.y - a.y, len = Math.hypot(dx, dy) || 1;
    resid.push(Math.abs((b.x - a.x) * dy - (b.y - a.y) * dx) / len);
  }
  const dtStd = std(dts), rStd = std(resid), rMean = mean(resid);
  const metronome = dtStd < 0.75, ruler = rMean < 0.08 && rStd < 0.12;
  return {
    verdict: metronome && ruler ? "BOT" : (metronome || ruler ? "PODEJRZANY" : "BEZ_ZASTRZEZEN"),
    detail: `dtStd=${dtStd.toFixed(2)} residMean=${rMean.toFixed(3)} residStd=${rStd.toFixed(3)}`,
  };
}

function verify(path) {
  const proof = readProof(path);
  const r = proof.round || proof;
  const problems = [];

  if ((r.seed >>> 0) !== (CFG.seed >>> 0)) problems.push(`seed ${r.seed >>> 0} ≠ oficjalny ${CFG.seed >>> 0}`);
  if (r.W !== CFG.W) problems.push(`W=${r.W} ≠ ${CFG.W}`);
  if (r.H !== CFG.H) problems.push(`H=${r.H} ≠ ${CFG.H}`);
  for (const k of PIN) if (r[k] !== CFG[k]) problems.push(`${k}=${r[k]} ≠ ${CFG[k]}`);
  if (!Array.isArray(r.events) || !r.events.length) problems.push("brak zdarzeń rundy");
  if (r.rw == null) problems.push("nagranie bez szerokości renderu (silnik starszy niż 1.3.0)");
  else if (r.rw < MIN_RW) problems.push(`okno ${r.rw} px < wymagane ${MIN_RW} px`);

  if (problems.length) return { path, ok: false, problems };

  // runda nagrana starszym silnikiem liczyła się wg innych reguł — oznacz to
  if (proof.engine && proof.engine !== ArcSim.VERSION)
    problems.push(`silnik gracza ${proof.engine} ≠ weryfikatora ${ArcSim.VERSION}`);

  const sim = ArcSim.simulate(r);
  const bot = botSignals(r.events);
  const passed = sim.score >= CFG.minScore;
  const claimed = proof.claimedScore;
  if (claimed != null && claimed !== sim.score) problems.push(`gracz podał ${claimed}, replay daje ${sim.score}`);

  return { path, ok: true, score: sim.score, letter: sim.letter, iso: sim.iso, passed, bot, problems, sim };
}

const args = process.argv.slice(2);
if (!args.length) { console.error("użycie: node verify-challenge.mjs <proof.json ...>   (albo - dla stdin)"); process.exit(2); }

console.log(`Challenge ${CFG.id} — ${CFG.proc} ${CFG.joint} ${CFG.pos} ${CFG.thick}mm ${CFG.bead}, próg ${CFG.minScore}\n`);
let pass = 0;
for (const a of args) {
  let res;
  try { res = verify(a); } catch (e) { console.log(`❌ ${a}: nie dało się wczytać — ${e.message}`); continue; }
  if (!res.ok) { console.log(`❌ ${a}: ODRZUCONE — ${res.problems.join("; ")}`); continue; }
  const mark = res.passed ? (res.bot.verdict === "BOT" ? "🤖" : "✅") : "➖";
  console.log(`${mark} ${res.path}: ${res.score} pkt (${res.letter}) · ISO ${res.iso} · ${res.passed ? "PRÓG ZALICZONY" : "poniżej progu"}`);
  console.log(`     cov=${res.sim.coverage.toFixed(3)} spd=${res.sim.spdAcc.toFixed(3)} even=${res.sim.evenness.toFixed(3)} ovf=${res.sim.overflow.toFixed(3)} por=${res.sim.porosity} spat=${res.sim.spatter}`);
  console.log(`     człowieczeństwo: ${res.bot.verdict} (${res.bot.detail})`);
  if (res.problems.length) console.log(`     ⚠ ${res.problems.join("; ")}`);
  if (res.passed && res.bot.verdict !== "BOT") pass++;
}
console.log(`\n${pass} z ${args.length} zgłoszeń kwalifikuje się do finału.`);
