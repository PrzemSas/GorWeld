#!/usr/bin/env node
/**
 * VELDA — odpowiedź GŁOSEM zamiast tekstem.
 *
 * Pytanie → odpowiedź Veldy → bezpieczniki → ElevenLabs (głos) → wideo pod X.
 * Tłem jest klip Groka z ożywioną Veldą; jego oryginalna ścieżka dźwiękowa jest wyciszana,
 * a klip przycinany albo zapętlany do długości wypowiedzi.
 *
 *   node velda/odpowiedz.mjs "is this a honeypot?"
 *   node velda/odpowiedz.mjs --tekst "..."      # sam tekst, bez głosu (nie wymaga klucza)
 *   node velda/odpowiedz.mjs --glosy            # lista dostępnych głosów z Twojego konta
 *   node velda/odpowiedz.mjs --mow "welcome to the forge."   # powiedz DOKŁADNIE to, bez generowania
 *
 * Wymaga:  ANTHROPIC_API_KEY   (tekst)
 *          ELEVENLABS_API_KEY  (głos)
 *          glos.json           (który głos i jakie tło — patrz obok)
 *
 * NIC NIE PUBLIKUJE. Gotowy plik ląduje w velda/odpowiedzi/ — wysyłasz go sam.
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildSystem, check, tweetLength } from './post.mjs';

const HERE  = new URL('./', import.meta.url);
const MODEL = process.env.VELDA_MODEL || 'claude-opus-5';
const FRONTIER = /^claude-(opus-5|opus-4-8|fable-5|sonnet-5)/.test(MODEL);
const KONFIG = JSON.parse(readFileSync(new URL('./glos.json', HERE), 'utf8'));

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const ma  = (n) => process.argv.includes(n);

// ── GŁOSY ───────────────────────────────────────────────────────────────────

async function listaGlosow(){
  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY || '' },
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const { voices } = await res.json();
  console.log('\nGłosy na Twoim koncie:\n');
  for (const v of voices){
    const opis = [v.labels?.gender, v.labels?.age, v.labels?.accent, v.labels?.description]
      .filter(Boolean).join(', ');
    console.log(`  ${v.voice_id}  ${v.name.padEnd(22)} ${opis}`);
  }
  console.log('\nWybrany wpisz do velda/glos.json → voice_id\n');
}

async function mow(tekst){
  const klucz = process.env.ELEVENLABS_API_KEY;
  if (!klucz) throw new Error('brak ELEVENLABS_API_KEY');

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${KONFIG.voice_id}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': klucz, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: tekst,
        model_id: KONFIG.model_id,
        voice_settings: KONFIG.voice_settings,
      }),
      signal: AbortSignal.timeout(120000),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

// Ten sam łańcuch co próbki B/C na pulpicie: niższy ton, wolniej, ciepłe 180 Hz, ścięte 3 kHz.
function przetworzGlos(wejscie, wyjscie){
  const fx = KONFIG.audio_fx
    || 'asetrate=44100*0.90,aresample=44100,highpass=f=70,equalizer=f=180:width_type=o:width=1:g=3,equalizer=f=3000:width_type=o:width=1:g=-2,acompressor=threshold=-20dB:ratio=4:attack=12:release=250,alimiter=limit=0.95';
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-i', wejscie,
    '-af', fx,
    '-c:a', 'libmp3lame', '-b:a', '192k',
    wyjscie,
  ]);
  if (r.status !== 0) throw new Error('ffmpeg nie przetworzył głosu (filtr B/C)');
}

// ── WIDEO ───────────────────────────────────────────────────────────────────

function dlugoscAudio(plik){
  const r = spawnSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','csv=p=0', plik]);
  return parseFloat(r.stdout.toString().trim());
}

function zloz(tlo, audio, wyjscie){
  const sek = dlugoscAudio(audio);
  if (!(sek > 0)) throw new Error('nie odczytałem długości głosu');

  // -stream_loop -1: klip krótszy od wypowiedzi po prostu leci od nowa.
  // -shortest + -t: wideo kończy się DOKŁADNIE ze słowem, bez ogona ciszy.
  // Oryginalny dźwięk klipu pomijamy (-map 0:v:0 bierze tylko obraz).
  const r = spawnSync('ffmpeg', [
    '-v','error','-y',
    '-stream_loop','-1','-i', tlo,
    '-i', audio,
    '-map','0:v:0','-map','1:a:0',
    '-t', sek.toFixed(2),
    '-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p',
    '-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:a','aac','-b:a','192k','-ar','44100',
    '-movflags','+faststart',
    wyjscie,
  ], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg nie złożył wideo');
  return sek;
}

// ── ODPOWIEDŹ ───────────────────────────────────────────────────────────────

async function odpowiedz(pytanie){
  const client = new Anthropic();

  const zadanie = [
    'REPLY MODE. Someone asked Velda this, publicly:',
    '',
    `"${pytanie}"`,
    '',
    'Answer as Velda. This will be spoken out loud, not read — so:',
    '- no links, no URLs, no "gorweld.com slash" anything (say "the site" instead)',
    '- no contract address read out digit by digit; say "one CA, it is on the site"',
    '- short. two, three sentences. under 280 characters.',
    '- it still has to sound like her: flat, dry, no filler, no "great question"',
    'If the question deserves silence or you cannot answer inside the rules, return exactly: SKIP',
  ].join('\n');

  const req = {
    model: MODEL,
    max_tokens: 4000,
    system: [{ type: 'text', text: buildSystem(), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: zadanie }],
  };
  if (FRONTIER) req.output_config = { effort: 'medium' };

  const res = FRONTIER
    ? await client.beta.messages.create({ ...req, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await client.messages.create(req);

  if (res.stop_reason === 'refusal') throw new Error('model odmówił (refusal)');
  return res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

// ── MAIN ────────────────────────────────────────────────────────────────────

async function main(){
  if (ma('--glosy')) return listaGlosow();

  // --mow: próbka głosu. Tekst idzie do syntezy słowo w słowo, bez pytania modelu.
  // Nie wymaga ANTHROPIC_API_KEY — samo ElevenLabs.
  const doslownie = arg('--mow');
  if (doslownie){
    if (!process.env.ELEVENLABS_API_KEY) throw new Error('brak ELEVENLABS_API_KEY');
    const stempel = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const katalog = new URL(`./odpowiedzi/probka-${stempel}/`, HERE);
    mkdirSync(katalog, { recursive: true });
    const mp3 = new URL('./glos.mp3', katalog);
    const mp4 = new URL('./velda.mp4', katalog);
    console.log(`🔊 mówię: "${doslownie}"`);
    const surowy = new URL('./glos-surowy.mp3', katalog);
    writeFileSync(surowy, await mow(doslownie));
    przetworzGlos(surowy.pathname, mp3.pathname);
    const tlo = KONFIG.tlo.replace('~', process.env.HOME);
    if (existsSync(tlo)){
      const sek = zloz(tlo, mp3.pathname, mp4.pathname);
      console.log(`✅ ${mp4.pathname}  (${sek.toFixed(1)} s)`);
    } else {
      console.log(`✅ ${mp3.pathname}  (bez wideo — nie ma klipu ${tlo})`);
    }
    return;
  }

  const pytanie = arg('--tekst') || process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ');
  if (!pytanie){
    console.error('Podaj pytanie:  node velda/odpowiedz.mjs "is this a honeypot?"');
    process.exit(1);
  }

  console.log(`PYTANIE: ${pytanie}\n`);
  const tekst = await odpowiedz(pytanie);

  console.log('─'.repeat(60));
  console.log(tekst);
  console.log('─'.repeat(60));
  console.log(`${tweetLength(tekst)}/280 znaków\n`);

  const problemy = check(tekst);
  if (problemy.length){
    console.error('❌ BEZPIECZNIKI ODRZUCIŁY ODPOWIEDŹ:');
    for (const p of problemy) console.error(`   • ${p}`);
    console.error('\nGłos nie zostanie wygenerowany — nie płacimy za coś, czego i tak nie wyślesz.');
    process.exit(2);
  }
  console.log('✅ Bezpieczniki przeszły.');

  if (ma('--tekst-only') || !process.env.ELEVENLABS_API_KEY){
    console.log(!process.env.ELEVENLABS_API_KEY
      ? '\nBrak ELEVENLABS_API_KEY — zostaje sam tekst. Klucz: elevenlabs.io → Profile → API key.'
      : '\n--tekst-only: głos pominięty.');
    return;
  }

  const stempel = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const katalog = new URL(`./odpowiedzi/${stempel}/`, HERE);
  mkdirSync(katalog, { recursive: true });

  const mp3 = new URL('./glos.mp3', katalog);
  const mp4 = new URL('./velda.mp4', katalog);

  console.log('\n🔊 generuję głos…');
  const surowy = new URL('./glos-surowy.mp3', katalog);
  writeFileSync(surowy, await mow(tekst));
  przetworzGlos(surowy.pathname, mp3.pathname);

  const tlo = KONFIG.tlo.replace('~', process.env.HOME);
  if (!existsSync(tlo)) throw new Error(`nie ma klipu tła: ${tlo} (popraw "tlo" w glos.json)`);

  console.log('🎬 składam wideo…');
  const sek = zloz(tlo, mp3.pathname, mp4.pathname);

  writeFileSync(new URL('./odpowiedz.txt', katalog),
    `PYTANIE: ${pytanie}\n\nODPOWIEDŹ:\n${tekst}\n\nDługość: ${sek.toFixed(1)} s\n`);

  console.log(`\n✅ gotowe (${sek.toFixed(1)} s):`);
  console.log(`   ${mp4.pathname}`);
  console.log('\nNic nie zostało opublikowane. Wysyłasz sam.');
}

main().catch(err => { console.error(`\n💥 ${err.message}`); process.exit(1); });
