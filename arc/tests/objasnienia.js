/**
 * GORWELD ARC WELDER — zestaw dowodowy silnika oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * GORWELD® — zarejestrowany znak towarowy UPRP, prawo wyłączne nr R.396313 (kl. 9, 36, 37, 42).
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// OBJAŚNIENIA WAD (10) na pulpicie boty.html. Kody wad liczone ze ŹRÓDŁA sim.js (blok listy wad), nie z ręcznej listy.
// Sprawdzamy: każdy kod × PL/EN/RU ma 4 niepuste pola; numery ISO 6520-1 tylko z listy dozwolonej (sprawdza Codex ze źródłem)
// i zgodne z numerami, które podaje raport gry; odchyłka procesu = uczciwe „to nie jest niezgodność wg ISO 5817";
// teksty wad RU 1:1 z gry; PL ok. 60 słów; MMA bez gazu z butli; bez „certyfikatu"; strona ma przyciski z aria-* i Esc.
// 10_v2: krater 511 (2025 tylko „ARC nie mierzy”), 506 tylko bez wtopienia, kąt ciągnięcia ~70° z silnika, jedno pasmo łuku, cele 44 px na telefonie.
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const Bt = require("../boty.js");
let fail = 0; const ok = (n, c, i) => { console.log((c ? "  ✓ " : "  ✗ ") + n + (i !== undefined ? "  " + JSON.stringify(i) : "")); if (!c) fail++; };
const SIM = fs.readFileSync(path.join(ROOT, "sim.js"), "utf8"), HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const PAGE = fs.readFileSync(path.join(ROOT, "boty.html"), "utf8"), BOTSRC = fs.readFileSync(path.join(ROOT, "boty.js"), "utf8");
const E = Bt.EXPLAIN || {}, LANGS = ["pl", "en", "ru"];

// kody ze źródła: wszystkie klucze def_* wystawiane w bloku listy wad sim.js
const blk = (() => { const i = SIM.indexOf("// ── 09: LISTA WAD"), j = SIM.indexOf("res.defects = D;", i); return i > 0 && j > i ? SIM.slice(i, j) : ""; })();
// + kody składane w locie ("def_" + c, np. kąt: ang_work / ang_drag / ang_push) — literały kodów z tej samej linii
const composed = blk.split("\n").flatMap((l, i, A) => /"def_" \+ c/.test(l) ? [A[i - 1] + l] : []).flatMap(l => [...l.matchAll(/"([a-z_]+)"/g)].map(m => m[1]).filter(x => !/^(major|minor|def_)$/.test(x)).map(x => "def_" + x));
const CODES = [...new Set([...blk.matchAll(/"(def_[a-z_]+)"/g)].map(m => m[1]).filter(x => x !== "def_").concat(composed))].sort();
ok(`kody wad wyliczone ze źródła sim.js: ${CODES.length}`, CODES.length >= 30, CODES);

// 1) pokrycie kod × język × 4 pola
{ const miss = [];
  for (const l of LANGS) { const L = E[l] || {};
    if (!(Array.isArray(L.labels) && L.labels.length === 4 && L.labels.every(s => typeof s === "string" && s.trim()))) miss.push(l + ":labels");
    for (const k of ["gone", "close", "title"]) if (!(typeof L[k] === "string" && L[k].trim())) miss.push(l + ":" + k);
    for (const c of CODES) { const x = L[c]; if (!(Array.isArray(x) && x.length === 4 && x.every(s => typeof s === "string" && s.trim().length >= 3))) miss.push(l + ":" + c); } }
  ok(`każdy kod × PL/EN/RU: 4 niepuste pola (${CODES.length} × 3)`, miss.length === 0, miss.slice(0, 6));
  const extra = LANGS.flatMap(l => Object.keys(E[l] || {}).filter(k => /^def_/.test(k) && CODES.indexOf(k) < 0).map(k => l + ":" + k));
  ok("brak objaśnień do kodów, których silnik nie wystawia", extra.length === 0, extra); }

// 2) numery ISO 6520-1: tylko z listy dozwolonej (do potwierdzenia ze źródłem przez Codexa) i zgodne z raportem gry
const ALLOWED = ["301", "401", "4011", "4012", "4013", "402", "4021", "502", "504", "505", "506", "510", "511", "517", "5011", "5012", "2011", "2012", "2017", "2025", "602"];
const STANDARDS = ["5817", "6520-1", "15614-1", "6947", "17637"];
const HONEST = { pl: /To nie jest niezgodność wg ISO 5817|Nie dotyczy/, en: /Not an imperfection under ISO 5817|Not applicable/, ru: /Это не несоответствие по ISO 5817|Не применимо/ };
const nums = s => { const t = s.replace(/ISO\s+\d+(-\d+)?/g, " "); return (t.match(/\b\d{3,4}\b/g) || []); };
{ const bad = [], std = [], honest = [];
  for (const l of LANGS) for (const c of CODES) { const iso = (E[l] && E[l][c] || [])[3] || "";
    for (const n of nums(iso)) if (ALLOWED.indexOf(n) < 0) bad.push(l + ":" + c + ":" + n);
    for (const m of iso.matchAll(/ISO\s+(\d+(?:-\d+)?)/g)) if (STANDARDS.indexOf(m[1]) < 0) std.push(l + ":" + c + ":" + m[1]);
    if (!nums(iso).length && !HONEST[l].test(iso)) honest.push(l + ":" + c);
    if (/To nie jest|Not an imperfection|Это не несоответствие/.test(iso) && !HONEST[l].test(iso)) honest.push(l + ":" + c + ":język"); }
  ok("numery ISO 6520-1 tylko z listy dozwolonej (" + ALLOWED.join(", ") + ")", bad.length === 0, bad.slice(0, 6));
  ok("normy tylko: ISO " + STANDARDS.join(", ISO "), std.length === 0, std);
  ok("pole „Odniesienie”: numer albo uczciwe „to nie jest niezgodność wg ISO 5817” / „nie dotyczy” (w języku objaśnienia)", honest.length === 0, honest);
  // zgodność z raportem gry: każdy numer z tekstu wady w grze (PL) jest w objaśnieniu (dokładnie albo jako podgrupa, np. 401 → 4011)
  const I = (() => { const i = HTML.indexOf("const I18N={"); let d = 0, j = i + 11; for (; j < HTML.length; j++) { const ch = HTML[j]; if (ch === "{") d++; else if (ch === "}") { d--; if (!d) break; } } return vm.runInNewContext("(" + HTML.slice(i + 11, j + 1) + ")"); })();
  const diff = [];
  for (const c of CODES) { const g = I.pl[c] || ""; const m = g.match(/\((?:ISO 5817: )?([\d, ]+)\)/); if (!m) continue;
    for (const n of m[1].split(/[, ]+/).filter(Boolean)) for (const l of LANGS) if (!nums(((E[l] || {})[c] || [])[3] || "").some(x => x.startsWith(n))) diff.push(l + ":" + c + ":" + n); }
  ok("numery zgodne z raportem gry (fast 511/401, dir_pf 401, dia 401 / 504, 510, edges 511/401, interbead 401, slag 301)", diff.length === 0, diff);
  // teksty wad RU 1:1 z gry (PL/EN pilnuje boty.js)
  const ru = Bt.TEXTS.ru ? Object.keys(Bt.TEXTS.pl).filter(k => Bt.TEXTS.ru[k] !== I.ru[k]) : ["brak TEXTS.ru"];
  ok(`teksty wad, klas ISO i zastrzeżenia RU 1:1 z I18N gry (${Object.keys(Bt.TEXTS.pl).length} kluczy)`, ru.length === 0, ru.slice(0, 5)); }

// 3) merytoryka i forma
{ const words = s => s.trim().split(/\s+/).length, long = [];
  for (const c of CODES) { const x = (E.pl || {})[c]; if (!x) continue; const w3 = words(x.slice(0, 3).join(" ")), w4 = words(x.join(" ")); if (w3 > 55 || w4 > 65) long.push(c + ":" + w3 + "/" + w4); }
  ok("PL krótko: co + przyczyna + jak ≤ 55 słów, z odniesieniem ≤ 65 (cel ok. 60)", long.length === 0, long);
  const all = LANGS.map(l => JSON.stringify(E[l] || {})).join(" ");
  ok("MMA (111): bez gazu osłonowego z butli i argonu (osłoną jest otulina)", !/butl|argon|gaz osłonow|shielding gas|gas cylinder|защитн\S* газ|баллон|аргон/i.test(all));
  ok("pozycja szkoleniowa: nigdzie „certyfikat”", !/certyfik|certific|сертифик/i.test(all + PAGE));
  ok("o otulinie: krótki/długi łuk, pory (łuk, wilgoć, technika zajarzenia elektrodą zasadową)", (() => { const j = c => ((E.pl || {})[c] || []).join(" "); return /otulin/i.test(j("def_arc_long")) && /zasadow/.test(j("def_porosity")) && /zajarz/.test(j("def_porosity")) && /suche/.test(j("def_porosity")) && /przywier/.test(j("def_arc_short")); })());
  ok("łuk ~1×Ø i pasmo silnika 0,5–1,1×Ø w objaśnieniu krótkiego łuku (zgodne z ARC_LO_MMA/ARC_HI_MMA)", /0,5–1,1×Ø/.test(((E.pl || {}).def_arc_short || [])[2] || "") && require("../sim.js").ARC_LO_MMA === 0.5 && require("../sim.js").ARC_HI_MMA === 1.1);
  ok("wkład ciepła odsyła do WPS / kwalifikacji technologii, nie do ISO 5817", (() => { const h = ((E.pl || {}).def_hi_over || [])[3] || ""; return /WPS/.test(h) && /15614-1/.test(h) && /nie jest niezgodność wg ISO 5817/.test(h); })());
  ok("zastrzeżenie szkoleniowe na górze objaśnienia (rep_note gry w każdym języku)", /dxNote/.test(PAGE) && /B\.TEXTS\[lang\]\.rep_note/.test(PAGE) && LANGS.every(l => Bt.TEXTS[l] && Bt.TEXTS[l].rep_note)); }

// 3b) 10_v2 — uwagi audytu Codexa (2026-11-26_codex_audyt_10.md, pkt 7) i przeglądu Groka (2026-11-26_grok-bot.md, pkt 4–7)
{ const F = (l, c, i) => (((E[l] || {})[c] || [])[i] || ""), all = (l, c) => ((E[l] || {})[c] || []).join(" ");
  const NOTM = { pl: /w praktyce[^.]*2025[^.]*ARC tego nie mierzy/i, en: /in practice[^.]*2025[^.]*ARC does not measure/i, ru: /на практике[^.]*2025[^.]*ARC её не измеряет/i };
  const cr = LANGS.filter(l => { const iso = F(l, "def_crater", 3), n = nums(iso); return !(n[0] === "511" && (n.indexOf("2025") < 0 || NOTM[l].test(iso))); });
  ok("def_crater: numerem jest 511; 2025 najwyżej jako „w praktyce, ARC tego nie mierzy” (PL/EN/RU)", cr.length === 0, cr);
  const NOFUS = { pl: /bez wtopienia/, en: /without fusion/, ru: /без сплавления/ };
  const uc = LANGS.filter(l => { const iso = F(l, "def_undercut", 3), n = nums(iso);
    return !(n.indexOf("5011") >= 0 && n.indexOf("5012") >= 0) || n.some(x => x === "504" || x === "509") || (n.indexOf("506") >= 0 && !iso.split(/[.;]/).some(z => /506/.test(z) && NOFUS[l].test(z))); });
  ok("def_undercut: 5011/5012; 506 tylko w zdaniu o nawisie bez wtopienia (bez 504/509)", uc.length === 0, uc);
  // kąt ciągnięcia: wada od WPS + pasmo (TA_IDEAL.MMA + TA_BAND z sim.js) → kąt do blachy ≈ 90° − to; tekst „ok. 70°” ma się zgadzać (±3°)
  const taW = +(SIM.match(/TA_IDEAL = \{ MMA: (\d+)/) || [])[1], taB = +(SIM.match(/TA_BAND = (\d+)/) || [])[1], plate = 90 - taW - taB;
  const HOLD = { pl: /[Uu]chwyt[^.]*wyprzedza/, en: /holder leads/, ru: /[Дд]ержатель[^.]*опережает/ };
  const dr = LANGS.filter(l => { const co = F(l, "def_ang_drag", 0), m = co.match(/(\d+)°/); return !(HOLD[l].test(co) && m && Math.abs(+m[1] - plate) <= 3); });
  ok(`def_ang_drag: uchwyt wyprzedza końcówkę, kąt do blachy poniżej ok. 70° (silnik: wada od ${taW}+${taB}° = ${plate}° do blachy)`, dr.length === 0 && plate >= 67 && plate <= 73, dr);
  // długość łuku: jedno pasmo w obu wadach, liczby z ARC_LO_MMA/ARC_HI_MMA; elektrody zasadowe krótszym łukiem niż rutylowe
  const S = require("../sim.js"), fmtN = (l, x) => l === "en" ? String(x) : String(x).replace(".", ",");
  const BAS = { pl: /zasadow[^.;]*krótsz[^.;]*rutylow/, en: /basic[^.;]*shorter[^.;]*rutile/, ru: /основн[^.;]*коротк[^.;]*рутилов/ };
  const OLD = /(dłuższy niż|longer than|длиннее) (ok\.|about|примерно) 1×Ø|poniżej 1×Ø|below about 1×Ø|меньше 1×Ø/;
  const al = LANGS.flatMap(l => { const band = fmtN(l, S.ARC_LO_MMA) + "–" + fmtN(l, S.ARC_HI_MMA) + "×Ø", lo = fmtN(l, S.ARC_LO_MMA) + "×Ø", hi = fmtN(l, S.ARC_HI_MMA) + "×Ø";
    const sh = all(l, "def_arc_short"), lg = all(l, "def_arc_long"), e = [];
    if (!(sh.includes(band) && lg.includes(band))) e.push(l + ":pasmo"); if (!F(l, "def_arc_short", 0).includes(lo)) e.push(l + ":short<" + lo); if (!F(l, "def_arc_long", 0).includes(hi)) e.push(l + ":long>" + hi);
    if (OLD.test(sh + " " + lg)) e.push(l + ":stare 1×Ø jako granica"); if (!(BAS[l].test(sh) && BAS[l].test(lg))) e.push(l + ":zasadowe/rutylowe"); return e; });
  ok("def_arc_short / def_arc_long: to samo pasmo ARC 0,5–1,1×Ø (granice z sim.js) + zasadowe krótszym łukiem niż rutylowe", al.length === 0, al);
  ok("telefon ≤ 480 px: CSS daje 44×44 przyciskom sterowania, polu ziarna i przełącznikowi z etykietą", /@media \(max-width:480px\)\{[\s\S]*?\.bar button,#seed\{min-height:44px;min-width:44px/.test(PAGE) && /@media \(max-width:480px\)\{[\s\S]*?\.tg\{min-height:44px;min-width:44px/.test(PAGE)); }

// 4) strona: przyciski, aria, Esc, fokus, bez hover-only, bez nowych zależności
{ ok("wada = <button> z aria-expanded i aria-controls, objaśnienie = element w treści (#dx), nie dymek", /<button type="button" class="defb"[^>]*aria-controls="dx"[^>]*aria-expanded=/.test(PAGE) && /<div id="dx" class="dx"/.test(PAGE) && !/title=.*def_/.test(PAGE));
  ok("klawiatura: Esc zamyka i zwraca fokus; widoczny :focus-visible", /ev\.key === "Escape"/.test(PAGE) && /closeDx/.test(PAGE) && /\.focus\(/.test(PAGE) && /:focus-visible\{outline:2px/.test(PAGE));
  ok("dotyk: podgląd tylko dla myszy (pointerType), klik/tap przypina — nic nie wymaga najechania", /ev\.pointerType !== "mouse"/.test(PAGE) && /addEventListener\("click"/.test(PAGE));
  ok("cel dotyku ≥ 44 px (przycisk wady i Zamknij)", /button\.defb\{[^}]*min-height:44px/.test(PAGE) && /\.dx \.x\{[^}]*min-width:44px;min-height:44px/.test(PAGE));
  ok("PL → EN → RU na przycisku języka", /const LANGS = \["pl", "en", "ru"\]/.test(PAGE));
  ok("zero nowych skryptów, czcionek i adresów sieci", (PAGE.match(/<script src="[^"]+"/g) || []).join() === '<script src="sim.js",<script src="boty.js"' && !/https?:\/\/|@import|<link /.test(PAGE.replace(/<!--[\s\S]*?-->/g, "")) && !/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(BOTSRC + PAGE));
  ok("zero emoji na pulpicie i w objaśnieniach", !/(?![©®™])\p{Extended_Pictographic}/u.test(PAGE + BOTSRC)); }

console.log(fail ? `\n✗ ${fail} nie przeszło` : "\n✓ wszystko przeszło"); process.exit(fail ? 1 : 0);
