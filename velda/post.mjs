#!/usr/bin/env node
/**
 * VELDA — generator postów na X.
 *
 * Czyta system prompt + bazę wiedzy + character sheet (few-shoty), wybiera format dnia,
 * generuje jeden post Claude'em, przepuszcza go przez bezpieczniki i dopiero wtedy publikuje.
 *
 * Uruchom:
 *   node velda/post.mjs                 # sucha próba — pokazuje post, NIC nie publikuje
 *   VELDA_LIVE=1 node velda/post.mjs    # publikuje na X
 *   node velda/post.mjs --format=anti-scam reminder    # wymuszony format
 *
 * Zmienne środowiskowe:
 *   ANTHROPIC_API_KEY  — wymagany
 *   VELDA_MODEL        — domyślnie claude-opus-5
 *   VELDA_LIVE=1       — bez tego skrypt NIGDY nie publikuje
 *   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET — tylko przy VELDA_LIVE=1
 *
 * Wymaga Node 20+ i `npm i` w katalogu velda/.
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { postToX } from './x-api.mjs';

const HERE     = new URL('./', import.meta.url);
const MODEL    = process.env.VELDA_MODEL || 'claude-opus-5';
const LIVE     = process.env.VELDA_LIVE === '1';
const LOG      = new URL('./posted-log.jsonl', HERE);
const HISTORY  = 12;                        // ile ostatnich postów pokazujemy modelowi, żeby się nie powtarzał

// Modele, które przyjmują output_config.effort i server-side fallbacks.
const FRONTIER = /^claude-(opus-5|opus-4-8|fable-5|sonnet-5)/.test(MODEL);

const FORMATS = [
  'night shift report',
  'anti-scam reminder',
  'forge status',
  'arc welder nudge',
  'two chains lore',
  'receipts',
];

// ── BEZPIECZNIKI ────────────────────────────────────────────────────────────
// Post nie wychodzi, dopóki nie przejdzie WSZYSTKICH. Awaria = cisza, nie publikacja.

const OFFICIAL_CA  = 'A8cDgfn1tAQbsZfD8oZU5u2xZZqKtJTmq7m9E3PLNMqr';
const ALLOWED_HOST = ['gorweld.com', 'gorweld.fun', 'x.com', 'solscan.io', 'cookiescan.io'];

const BANNED = [
  /\b(moon|100x|10x|pump it|to the moon|ape in|don'?t miss|get in early)\b/i,
  /\b(guaranteed|guarantee|profit|returns?|price target|will rise|going up)\b/i,
  /\b(claim|connect (your )?wallet|airdrop claim|free tokens? here)\b/i,
  /\b(dm me|check (my )?dms|send me)\b/i,
  /\b(giveaway|retweet to win|tag \d+ friends)\b/i,
  /\bnot financial advice\b.*\b(but|however)\b/i,   // klasyczny wytrych
];

// X liczy każdy link jako 23 znaki (t.co), niezależnie od długości.
export function tweetLength(text){
  return text.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length;
}

export function check(text){
  const bad = [];

  if (text.trim() === 'SKIP')      bad.push('model zwrócił SKIP — odmówił napisania posta w regułach');
  if (!text.trim())                bad.push('pusty post');
  if (tweetLength(text) > 280)     bad.push(`za długi: ${tweetLength(text)}/280 znaków`);

  // Każdy ciąg wyglądający na adres na Solanie musi być TYM adresem.
  // Wymagamy osobnego tokenu i mieszanej wielkości liter — inaczej długie ciągi samych
  // małych liter (albo urwany link) wywalałyby fałszywy alarm.
  const ADDR = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z])/g;
  for (const m of text.match(ADDR) || []){
    if (!/[A-Z]/.test(m) || !/[a-z]/.test(m)) continue;
    if (m !== OFFICIAL_CA) bad.push(`obcy adres w treści: ${m}`);
  }

  // Linki tylko na dozwolone domeny.
  for (const url of text.match(/https?:\/\/\S+/g) || []){
    let host;
    try { host = new URL(url).hostname.replace(/^www\./, ''); }
    catch { bad.push(`niepoprawny URL: ${url}`); continue; }
    if (!ALLOWED_HOST.includes(host)) bad.push(`link poza allowlistą: ${host}`);
  }

  for (const re of BANNED){
    const hit = text.match(re);
    if (hit) bad.push(`zakazana fraza: "${hit[0]}"`);
  }

  if (/#\w/.test(text))                                        bad.push('hashtag — Velda nie hashtaguje');
  const emoji = (text.match(/\p{Extended_Pictographic}/gu) || []).length;
  if (emoji > 2)                                               bad.push(`za dużo emoji: ${emoji}`);
  if (/@(?!Przemsas\b|GorWeld\b)\w+/.test(text))               bad.push('oznaczenie obcego konta');

  return bad;
}

// ── HISTORIA ────────────────────────────────────────────────────────────────

function recentPosts(){
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean).slice(-HISTORY);
}

// ── GENERACJA ───────────────────────────────────────────────────────────────

/** Prompt systemowy = kim jest + co wie + jak brzmi. Ten sam dla postów i dla odpowiedzi. */
export function buildSystem(){
  return [
    readFileSync(new URL('./velda-system-prompt.md', HERE), 'utf8'),
    '\n\n# KNOWLEDGE FILE — the only facts you may state\n\n',
    readFileSync(new URL('./velda-knowledge.md', HERE), 'utf8'),
    '\n\n# HOW YOUR POSTS SOUND — study the rhythm, never copy a line\n\n',
    readFileSync(new URL('./velda-character-sheet.md', HERE), 'utf8'),
  ].join('');
}

async function generate(format, avoid){
  const client = new Anthropic();
  const system = buildSystem();

  const task = [
    `Write today's post. Format: **${format}**.`,
    avoid.length
      ? `\nYour last ${avoid.length} posts (do not repeat an angle, an opening line, or a closing line):\n\n` +
        avoid.map(p => `- [${p.format}] ${p.text.replace(/\n+/g, ' / ')}`).join('\n')
      : '',
    '\nOne post. Text only.',
  ].join('\n');

  const req = {
    model: MODEL,
    max_tokens: 4000,
    // Prompt jest stały bajt w bajt, zmienna jest tylko wiadomość — cache trafia od drugiego przebiegu.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: task }],
  };
  if (FRONTIER) req.output_config = { effort: 'medium' };

  // Fallback po stronie serwera: gdyby klasyfikator odmówił, ten sam request idzie na model zapasowy.
  const res = FRONTIER
    ? await client.beta.messages.create({ ...req, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await client.messages.create(req);

  if (res.stop_reason === 'refusal') throw new Error('model odmówił wygenerowania posta (refusal)');

  return res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

// ── MAIN ────────────────────────────────────────────────────────────────────

async function main(){
  const forced = process.argv.slice(2).join(' ').match(/--format=(.+)/)?.[1]?.trim();
  // Rotacja po dniu roku — bez trzymania stanu, a i tak nie powtarza formatu przez 6 dni.
  const day    = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
  const format = forced || FORMATS[day % FORMATS.length];

  if (forced && !FORMATS.includes(forced)){
    console.error(`Nieznany format: "${forced}". Dostępne: ${FORMATS.join(', ')}`);
    process.exit(1);
  }

  console.log(`VELDA — format: ${format} | model: ${MODEL} | tryb: ${LIVE ? 'PUBLIKACJA' : 'sucha próba'}\n`);

  const text = await generate(format, recentPosts());
  console.log('─'.repeat(60));
  console.log(text);
  console.log('─'.repeat(60));
  console.log(`${tweetLength(text)}/280 znaków\n`);

  const problems = check(text);
  if (problems.length){
    console.error('❌ BEZPIECZNIKI ODRZUCIŁY POST:');
    for (const p of problems) console.error(`   • ${p}`);
    console.error('\nNic nie opublikowano. Odpal ponownie albo popraw bazę wiedzy.');
    process.exit(2);
  }
  console.log('✅ Bezpieczniki przeszły.');

  if (!LIVE){
    console.log('Tryb suchej próby — nic nie poszło na X. Publikacja: VELDA_LIVE=1');
    return;
  }

  // GORWELD LOCK — publikacja to wyjście poza ten komputer. Pytamy człowieka.
  // W GitHub Actions bramki nie ma (i być nie może) — tam rolę hasła pełni sekret VELDA_LIVE,
  // którego nie da się ustawić z tej maszyny.
  if (!process.env.GITHUB_ACTIONS){
    const gate = spawnSync(`${process.env.HOME}/.gorweld/gorweld-lock`,
      ['check', `Velda publikuje na X: "${text.replace(/\n+/g, ' / ').slice(0, 60)}…"`],
      { stdio: 'inherit' });
    if (gate.status !== 0){
      console.error('\nZatrzymane przez GORWELD LOCK. Nic nie poszło na X.');
      process.exit(3);
    }
  }

  const tweet = await postToX(text);
  appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), format, text, id: tweet.id }) + '\n');
  console.log(`🔥 Opublikowane: https://x.com/i/web/status/${tweet.id}`);
}

// Odpalone bezpośrednio → generuj. Zaimportowane (testy) → tylko eksportuj bezpieczniki.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href){
  main().catch(err => { console.error(`\n💥 ${err.message}`); process.exit(1); });
}
