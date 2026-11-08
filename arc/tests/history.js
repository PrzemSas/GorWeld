/**
 * GORWELD ARC WELDER — test historii prób (poprawka 06). Nie dotyka oceny.
 * © 2026 Przemysław Sąsiadek (gorweld.com). Wszelkie prawa zastrzeżone / All rights reserved.
 * Oprogramowanie zastrzeżone, NIE open source — warunki w pliku /LICENSE.
 */
// Sprawdza: (1) KAŻDA wada w inspect() ma stały kod `c`, (2) każdy kod ma nazwę i poradę w PL/EN/RU,
// (3) „najczęstszy błąd" i trend liczą się tylko w obrębie tej samej metody, sterowania i wersji silnika,
// (4) import: zły plik nic nie zmienia, obce pola odrzucone, duplikaty pominięte, (5) ta sama runda = aktualizacja wpisu,
// (6) v2 — audyt Codex 06: #1 A→import B→ponownie A, #2 data poza zakresem, #3 formuły w CSV, #4 błąd zapisu przy imporcie,
// (7) v3 — audyt Codex 06 v2: #1 pozycje/materiały z katalogów gry (HL045 = rura 6G), #2 licznik importu po limicie 50, daty z przyszłości.
const fs = require("fs"), vm = require("vm"), path = require("path");
const H = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
let fail = 0; const ok = (n, c, i) => { console.log((c ? "  ✓ " : "  ✗ ") + n + (i !== undefined ? "  " + JSON.stringify(i) : "")); if (!c) fail++; };

// (1) kody wad w inspect() spawania
const insp = H.slice(H.indexOf("function inspect(){"), H.indexOf("  lastReport={score,letter,iso,std:\"ISO 5817\""));
const pushes = insp.match(/D\.push\(\{[^\n]*/g) || [];
const noCode = pushes.filter(p => !/\bc:/.test(p));
ok(`inspect(): każda wada ma kod c (${pushes.length} miejsc)`, pushes.length >= 20 && noCode.length === 0, noCode.map(x => x.slice(0, 60)));

// (2) kody → teksty
const codes = JSON.parse(H.match(/HIST_CODES=(\[[^\]]*\])/)[1].replace(/\s/g, ""));
const used = [...new Set([].concat(...pushes.map(p => [...p.matchAll(/"([a-z_]+)"/g)].map(m => m[1]))).filter(x => codes.includes(x)))];
ok("kody z inspect() są na liście HIST_CODES", ["pen", "porosity", "slag", "hi", "dir", "arc_long", "ang_drag"].every(c => used.includes(c)), used.length);
const langs = ["pl", "en", "ru"].map(l => { const i = H.indexOf("hint_lbl:", H.indexOf(l === "pl" ? "pl:{" : l === "en" ? "en:{" : "ru:{")); return H.slice(i, i + 20000); });
const missing = []; for (const c of codes.concat(["ok"])) langs.forEach((blk, li) => { if (!blk.includes("hc_" + c + ":") || !blk.includes("ht_" + c + ":")) missing.push(["pl", "en", "ru"][li] + ":" + c); });
ok(`każdy kod ma nazwę i poradę w PL/EN/RU (${codes.length + 1} kodów)`, missing.length === 0, missing.slice(0, 6));

// funkcje historii w piaskownicy z atrapą localStorage
const src = H.slice(H.indexOf("const HIST_KEY="), H.indexOf("function renderHist(){"));
// katalogi gry (klucze POSITIONS i MATERIAL) prosto z index.html — walidator historii ma korzystać z tych samych list
const catKeys = (name) => { const s = H.indexOf("const " + name); let i = H.indexOf("{", s), d = 0, j = i; for (; j < H.length; j++) { if (H[j] === "{") d++; else if (H[j] === "}" && !--d) break; }
  const body = H.slice(i + 1, j), keys = []; let dd = 0; for (let k = 0; k < body.length; k++) { if (body[k] === "{") dd++; else if (body[k] === "}") dd--; else if (dd === 0) { const m = body.slice(k).match(/^\s*([A-Za-z0-9_]+)\s*:\s*\{/); if (m && (k === 0 || /[,\n{]/.test(body[k - 1]))) { keys.push(m[1]); k += m[0].length - 2; } } }
  return Object.fromEntries(keys.map(k => [k, {}])); };
const POSITIONS = catKeys("POSITIONS"), MATERIAL = catKeys("MATERIAL");
const store = {}; const ctx = { POSITIONS, MATERIAL, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  window: { ArcSim: { VERSION: "3.15.0" } }, t: k => k, fmt: (k, a) => k + ":" + a.join("|"), console };
vm.createContext(ctx); vm.runInContext(src + "\nthis.api={histValid,histLoad,histRecord,histTop,histTrend,histImport,histCSV,histHintText};", ctx);
const A = ctx.api;
const E = (o) => Object.assign({ at: Date.now(), ver: "3.15.0", proc: "MIG", pos: "PA", thick: 3, mat: "steel", joint: "butt", sc: 80, L: "B", iso: "C", ok: true, prof: "m", mode: "tr", d: [{ c: "pen", s: 2 }], stop: null }, o);
// (5) ta sama runda = aktualizacja
const r1 = {}, r2 = {};
A.histRecord(E({ at: 1000, sc: 70 }), r1); A.histRecord(E({ at: 1001, sc: 75 }), r1);
ok("ta sama runda drugi raz = aktualizacja (1 wpis, ocena 75)", A.histLoad().length === 1 && A.histLoad()[0].sc === 75);
A.histRecord(E({ at: 2000 }), r2); A.histRecord(E({ at: 3000, d: [{ c: "porosity", s: 1 }] }), {});
A.histRecord(E({ at: 3500, prof: "t", d: [{ c: "slag", s: 2 }] }), {}); A.histRecord(E({ at: 3600, ver: "3.14.0", d: [{ c: "slag", s: 2 }] }), {});
const top = A.histTop("MIG", "m", "3.15.0");
ok("najczęstszy błąd: pen (2 z 3), bez prób dotykiem i ze starej wersji", top && top.c === "pen" && top.k === 2 && top.of === 3, top);
ok("< 3 prób tą metodą = brak porady", A.histTop("TIG", "m", "3.15.0") === null);
ok("postój ręki trafia do wad jako `stop`", (A.histRecord(E({ at: 3700, d: [], stop: 2 }), {}), A.histLoad().slice(-1)[0].d.some(x => x.c === "stop" && x.s === 2)));
for (let i = 0; i < 9; i++) A.histRecord(E({ at: 4000 + i, sc: i < 5 ? 60 : 80, pos: "PF" }), {});
ok("trend: 9 prób = jeszcze bez trendu", A.histTrend("MIG", "PF", "m", "3.15.0") === null);
A.histRecord(E({ at: 4009, sc: 80, pos: "PF" }), {});
const tr = A.histTrend("MIG", "PF", "m", "3.15.0");
ok("trend: 10 prób → średnio 60 (5 wcześniejszych) → 80 (5 ostatnich)", tr && tr.now === 80 && tr.before === 60 && tr.n === 5, tr);
// (4) import
const before = A.histLoad().length;
ok("import: zły JSON nic nie zmienia", A.histImport("{zepsuty").ok === false && A.histLoad().length === before);
ok("import: plik bez wpisów historii nic nie zmienia", A.histImport(JSON.stringify({ foo: 1 })).ok === false && A.histLoad().length === before);
const bad = E({ at: 9000, proc: "<img>" }), good = E({ at: 9001, sc: 99, extra: "<script>" }), dup = A.histLoad()[0];
const res = A.histImport(JSON.stringify({ history: [bad, good, dup] }));
const last = A.histLoad().slice(-1)[0];
ok("import: 1 nowy dodany, zły odrzucony, duplikat pominięty, obce pola usunięte", res.ok && res.added === 1 && last.sc === 99 && !("extra" in last), res);
ok("historia przycięta do 50 wpisów", (() => { for (let i = 0; i < 60; i++) A.histRecord(E({ at: 20000 + i }), {}); return A.histLoad().length === 50; })());
// pamięć zablokowana
const ctx2 = { POSITIONS, MATERIAL, localStorage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }, window: {}, t: k => k, fmt: k => k };
vm.createContext(ctx2); vm.runInContext(src + "\nthis.api={histLoad,histRecord};", ctx2);
ok("pamięć zablokowana: histLoad = [] i histRecord bez wyjątku", (() => { try { ctx2.api.histRecord(E({}), {}); return ctx2.api.histLoad().length === 0; } catch (e) { return false; } })());
ok("CSV: nagłówek + wiersze, cudzysłowy", /^data,metoda/.test(A.histCSV(A.histLoad())) && A.histCSV(A.histLoad()).split("\n").length === 51);

// ── v2: przypadki z audytu Codex 06 ─────────────────────────────────────────
const mk = (over) => { const st = {}, fail = over && over.failSet; const c = { localStorage: { getItem: k => (k in st ? st[k] : null), setItem: (k, v) => { if (c.failSet) throw new Error("QuotaExceededError"); st[k] = String(v); } },
  window: { ArcSim: { VERSION: "3.15.0" } }, t: k => k, fmt: (k, a) => k + ":" + a.join("|"), console, failSet: !!fail, POSITIONS, MATERIAL };
  vm.createContext(c); vm.runInContext(src + "\nthis.api={histLoad,histRecord,histImport,histCSV,histValid};", c); return c; };
// #1 A → import nowszej B → ponowna inspekcja A
{ const c = mk(), B1 = c.api, rA = {};
  B1.histRecord(E({ at: 1700000000000, sc: 80 }), rA);
  const expA = JSON.stringify({ history: B1.histLoad() });            // kopia A sprzed ponownej inspekcji
  B1.histImport(JSON.stringify({ history: [E({ id: "bbbbbbbb", at: 1700000500000, sc: 90 })] }));
  B1.histRecord(E({ at: 1700000900000, sc: 80 }), rA);                 // ten sam raport A otwarty ponownie
  const h = B1.histLoad();
  ok("#1 A → import B → ponownie A: A raz, B zostaje", h.length === 2 && h.filter(x => x.sc === 80).length === 1 && h.some(x => x.sc === 90 && x.id === "bbbbbbbb"), h.map(x => [x.id, x.sc]));
  ok("#1 ponowna inspekcja zachowuje pierwotny czas A", h.find(x => x.sc === 80).at === 1700000000000);
  const r = B1.histImport(expA);
  ok("#1 ponowny import wcześniejszej kopii A = duplikat (0 nowych)", r.ok && r.added === 0 && B1.histLoad().length === 2, r);
  B1.histRecord(E({ at: 1700001000000, sc: 70 }), {});                 // nowa runda = nowy wpis
  ok("#1 nowa runda po tym = osobny wpis", B1.histLoad().length === 3); }
// #2 data poza zakresem
{ const c = mk(), B2 = c.api;
  B2.histRecord(E({ at: 1700000000000 }), {});
  const r = B2.histImport(JSON.stringify({ history: [E({ at: 1e20 }), E({ at: 1.5 }), E({ at: -5 }), E({ at: "1700000000001" })] }));
  ok("#2 import: data 1e20 / ułamek / ujemna / tekst odrzucone", r.ok === false && B2.histLoad().length === 1, r);
  c.localStorage.setItem("gorweld_history", JSON.stringify([E({ at: 1e20 })].concat(JSON.parse(c.localStorage.getItem("gorweld_history")))));
  let csv = null; try { csv = B2.histCSV(B2.histLoad()); } catch (e) { csv = "WYJATEK " + e.message; }
  ok("#2 zła data już w pamięci: odczyt ją pomija, CSV poprawnych prób działa", B2.histLoad().length === 1 && /^data,/.test(csv) && csv.split("\n").length === 2, csv && csv.slice(0, 80)); }
// #3 formuły w CSV i pola o stałym zbiorze wartości
{ const c = mk(), B3 = c.api;
  const evil = ["mat", "joint", "pos", "ver", "mode", "L"].map(f => E({ at: 1700000000000 + f.length, [f]: "=1+1" }));
  const r = B3.histImport(JSON.stringify({ history: evil }));
  ok("#3 import: `=1+1` w materiale / złączu / pozycji / wersji / trybie / literze odrzucone", r.ok === false && B3.histLoad().length === 0, r);
  const csv = B3.histCSV([{ at: 1700000000000, proc: "MIG", pos: "=PA", thick: 3, mat: "+steel", sc: 80, L: "-B", iso: "@C", ok: 1, prof: "m", mode: "\tx", d: [], stop: null, ver: "=1+1" }]);
  const cells = csv.split("\n")[1];
  ok("#3 CSV: tekst od = + - @ tab dostaje apostrof (nie formuła)", !/"[=+\-@\t]/.test(cells) && cells.includes('"\'=1+1"') && cells.includes('"\'+steel"'), cells);
  ok("#3 CSV: zwykłe wartości bez zmian", B3.histCSV([E({ at: 1700000000000 })]).split("\n")[1].includes('"MIG","PA","3","steel","80"')); }
// #4 zapis odrzucony przez przeglądarkę
{ const c = mk(), B4 = c.api;
  B4.histRecord(E({ at: 1700000000000 }), {});
  c.failSet = true;
  const r = B4.histImport(JSON.stringify({ history: [E({ at: 1700000500000, sc: 91 })] }));
  ok("#4 import przy błędzie zapisu: brak komunikatu o sukcesie (err=save)", r.ok === false && r.err === "save" && r.added === 0, r);
  ok("#4 historia bez zmian po nieudanym zapisie", B4.histLoad().length === 1);
  ok("#4 histRecord przy błędzie zapisu zwraca false bez wyjątku", B4.histRecord(E({ at: 1700000600000 }), {}) === false);
  ok("#4 komunikat h_imp_save istnieje w PL/EN/RU", langs.every(b => b.includes("h_imp_save:")) && H.includes('res.err==="save"?"h_imp_save"')); }
// ── v3: przypadki z audytu Codex 06 v2 ──────────────────────────────────────
ok("v3 katalogi z gry: 11 pozycji z HL045, 3 materiały", Object.keys(POSITIONS).length === 11 && "HL045" in POSITIONS && Object.keys(MATERIAL).join() === "steel,ss,alu", Object.keys(POSITIONS));
{ const c = mk(), V = c.api;   // #1 rura 6G (HL045) + każda pozycja i materiał z gry
  ok("v3 #1 zapis TIG rura 6G HL045 90 pkt", V.histRecord(E({ at: 1700000000000, proc: "TIG", joint: "pipe", pos: "HL045", thick: 3, sc: 90, L: "A" }), {}) === true && V.histLoad()[0].pos === "HL045");
  const c2 = mk(), r = c2.api.histImport(JSON.stringify({ history: [E({ at: 1700000000000, proc: "TIG", joint: "pipe", pos: "HL045", sc: 90, L: "A" })] }));
  ok("v3 #1 import HL045", r.ok && r.added === 1, r);
  const c3 = mk(); let n = 0; Object.keys(POSITIONS).forEach((p, i) => Object.keys(MATERIAL).forEach((m, j) => { if (c3.api.histRecord(E({ at: 1700000000000 + i * 10 + j, pos: p, mat: m }), {})) n++; }));
  ok("v3 #1 każda pozycja × materiał z gry zapisuje się (11 × 3)", n === 33 && c3.api.histLoad().length === 33, n);
  ok("v3 #1 nieznana pozycja / klucz z prototypu odrzucone", !V.histValid(E({ pos: "PX" })) && !V.histValid(E({ pos: "toString" })) && !V.histValid(E({ mat: "__proto__" })));
  const joints = [...new Set([...H.matchAll(/data-joint="([a-z]+)"/g)].map(m => m[1]).concat([...H.matchAll(/joint:"([a-z]+)"/g)].map(m => m[1])))];
  ok("v3 każde złącze z gry (przyciski + kupony) przechodzi walidację", joints.length >= 3 && joints.every(j => V.histValid(E({ joint: j }))), joints); }
{ const c = mk(), V = c.api;   // #2 pełna historia + import starszej próby
  for (let i = 0; i < 50; i++) V.histRecord(E({ at: 1700000000000 + i * 1000, sc: 50 + (i % 40) }), {});
  const before = c.localStorage.getItem("gorweld_history");
  const r = V.histImport(JSON.stringify({ history: [E({ id: "oldoldold", at: 1600000000000, sc: 77 })] }));
  ok("v3 #2 pełna historia + starsza próba: added 0, cut 1, pamięć bez zmian", r.ok && r.added === 0 && r.cut === 1 && c.localStorage.getItem("gorweld_history") === before, r);
  const r2 = V.histImport(JSON.stringify({ history: [E({ id: "old2old2", at: 1600000000000 }), E({ id: "new1new1", at: 1700000999000, sc: 66 }), E({ id: "new2new2", at: 1700001000000, sc: 67 })] }));
  const h = V.histLoad();
  ok("v3 #2 mieszany import: added 2 (zachowane), cut 1, nadal 50, najnowsze na końcu", r2.ok && r2.added === 2 && r2.cut === 1 && h.length === 50 && h[48].id === "new1new1" && h[49].id === "new2new2", r2);
  const r3 = V.histImport(JSON.stringify({ history: [E({ id: "futfutfut", at: Date.now() + 3 * 864e5 })] }));
  ok("v3 import: data z przyszłości (> teraz + 1 doba) odrzucona", r3.ok === false && !V.histLoad().some(e => e.id === "futfutfut"), r3);
  ok("v3 komunikat h_imp_cut w PL/EN/RU", langs.every(b => b.includes("h_imp_cut:"))); }
console.log(fail ? `\n✗ ${fail} nie przeszło` : "\n✓ wszystko przeszło"); process.exit(fail ? 1 : 0);
