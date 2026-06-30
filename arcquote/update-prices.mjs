#!/usr/bin/env node
/**
 * GORWELD — tygodniowy aktualizator cen materiałów (bezpieczny).
 * Pobiera strony sklepów, wyciąga WSZYSTKIE ceny, wybiera najbliższą obecnej
 * (ceny pełzną wolno), akceptuje tylko w pasie ±BAND. Inaczej zostawia starą i flaguje.
 * Zapisuje prices-latest.js (czyta go kalkulator) + update-report.txt.
 *
 * Uruchom:  node update-prices.mjs
 * Wymaga Node 18+ (globalny fetch). Gazy = pomijane (wycena na telefon, zostają ręczne).
 */
import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const BAND = 0.35;            // dopuszczalna zmiana vs obecna cena/jedn.
const OUT_JS = new URL('./prices-latest.js', import.meta.url);
const OUT_LOG = new URL('./update-report.txt', import.meta.url);

// key, url, div (cena_opakowania → cena/jedn.), cur (obecna zweryfikowana cena/jedn.)
const ITEMS = [
  { key:'drut_G3Si1_kg',     div:15, cur:8.60,  url:'https://spawmarket.pl/1884-drut-spawalniczy-sg2-g3si1-fi-10-mm-15-kg-k300.html' },
  { key:'elektroda_E6013_kg',div:5,  cur:15.25, url:'https://schmith.pl/akcesoria-i-osprzet/spawanie/elektrody/elektroda-rutylowa-e6013-5-kg-3-2-350-mm/' },
  { key:'drut_308_kg',       div:15, cur:30.44, url:'https://narzedziownia.shop/22979-drut-spawalniczy-inox-1mm-15kg-metalweld-308lsi.html' },
  { key:'tarcza_listkowa',   div:1,  cur:5.73,  url:'https://www.sklep.majer-hurt.com/pl/andre-tarcze-scierne/2291-tarcza-listkowa-125x22-zra-p40-proline-andre-i.html' },
  { key:'tarcza_ciecia',     div:1,  cur:2.99,  url:'https://www.sklep.staltech.pl/Tarcza-do-ciecia-metalu-125x1-inco-flex/675' },
];

function extractPrices(html){
  const set = new Set();
  const add = s => { const v = parseFloat(String(s).replace(',', '.')); if (v>0 && v<100000) set.add(+v.toFixed(2)); };
  for (const m of html.matchAll(/content="(\d+[.,]\d+)"/g)) add(m[1]);          // itemprop="price"
  for (const m of html.matchAll(/"price"\s*:\s*"?(\d+[.,]\d+)/g)) add(m[1]);    // ld+json / json
  for (const m of html.matchAll(/(\d+[.,]\d{2})\s*z[łl]/gi)) add(m[1]);         // 129,00 zł
  return [...set];
}

async function run(){
  const updated = {};
  const report = [`GORWELD — aktualizacja cen ${new Date().toISOString().slice(0,16).replace('T',' ')}`, ''];

  for (const it of ITEMS){
    try{
      const res = await fetch(it.url, { headers:{'User-Agent':UA}, signal: AbortSignal.timeout(25000) });
      const html = await res.text();
      const perUnit = extractPrices(html).map(p => +(p/it.div).toFixed(2));
      if (!perUnit.length){
        report.push(`⚠ ${it.key}: brak cen na stronie → zostaje ${it.cur} (sprawdź ręcznie)`);
        continue;
      }
      // najbliższa obecnej
      const best = perUnit.reduce((a,b)=> Math.abs(b-it.cur) < Math.abs(a-it.cur) ? b : a);
      const drift = Math.abs(best - it.cur) / it.cur;
      if (drift <= BAND){
        updated[it.key] = best;
        const arrow = best>it.cur ? '▲' : best<it.cur ? '▼' : '=';
        report.push(`✓ ${it.key}: ${it.cur} → ${best} zł/jedn. ${arrow} (${(drift*100).toFixed(0)}%)`);
      } else {
        report.push(`⚠ ${it.key}: znaleziono ${best}, drift ${(drift*100).toFixed(0)}% > ${(BAND*100).toFixed(0)}% → zostaje ${it.cur} (sprawdź ręcznie)`);
      }
    } catch(e){
      report.push(`✗ ${it.key}: błąd pobierania (${e.message}) → zostaje ${it.cur}`);
    }
  }

  // złóż finalne ceny: zaktualizowane nadpisują obecne (cur jako fallback)
  const prices = {};
  for (const it of ITEMS) prices[it.key] = updated[it.key] ?? it.cur;

  const date = new Date().toISOString().slice(0,10);
  const js = `/* auto-generowane przez update-prices.mjs — NIE edytuj ręcznie */\n`
           + `window.GW_PRICES_LATEST = ${JSON.stringify({ updated: date, prices }, null, 2)};\n`;
  writeFileSync(OUT_JS, js);
  writeFileSync(OUT_LOG, report.join('\n') + '\n');
  console.log(report.join('\n'));
}

run().catch(e => { console.error(e); process.exit(1); });
