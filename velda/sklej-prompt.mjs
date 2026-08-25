#!/usr/bin/env node
/**
 * VELDA — sklejarka promptu na pulpit.
 *
 * Repo jest źródłem prawdy; pulpit ma być tylko jego odbiciem. Ten skrypt odświeża
 * kopie w Desktop\GORWELD\15-VELDA i buduje VELDA-PROMPT-DO-WKLEJENIA.txt —
 * jeden plik, który wystarczy wkleić do dowolnego czatu, żeby model pisał jako Velda.
 *
 * Odpal po KAŻDEJ zmianie w bazie wiedzy albo w system prompcie:
 *   node velda/sklej-prompt.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const HERE = new URL('./', import.meta.url);
const DESK = '/mnt/c/Users/gorwe/Desktop/GORWELD/15-VELDA';
const CZESCI = ['velda-system-prompt.md', 'velda-knowledge.md', 'velda-character-sheet.md'];

if (!existsSync(DESK)){
  console.error(`Nie widzę pulpitu: ${DESK}\nUruchamiasz to spoza WSL-a?`);
  process.exit(1);
}

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const czytaj = {};

for (const f of CZESCI){
  const tresc = readFileSync(new URL(`./${f}`, HERE), 'utf8');
  czytaj[f] = tresc;
  writeFileSync(`${DESK}/${f}`,
    `<!-- KOPIA z D:\\GorWeld\\velda\\${f} — stan ${stamp}.\n` +
    `     Edytuj W REPO, nie tutaj. Velda czyta tamten plik, nie ten. -->\n\n` + tresc);
}

const naglowek = `================================================================================
VELDA — PROMPT GOTOWY DO WKLEJENIA          (zbudowany ${stamp})
================================================================================
Wklej CAŁY ten plik jako pierwszą wiadomość do dowolnego czatu (Grok, ChatGPT,
Claude), a model będzie pisał jako Velda. Skrypt agenta składa dokładnie to samo
automatycznie — to tylko wersja do ręki.

Na końcu dopisz jedną linię, np.:
    Write today's post. Format: night shift report.
Formaty: night shift report / anti-scam reminder / forge status /
         arc welder nudge / two chains lore / receipts

Źródło prawdy: D:\\GorWeld\\velda\\  — po zmianie tam wygeneruj ten plik na nowo:
    node /mnt/d/GorWeld/velda/sklej-prompt.mjs
================================================================================


`;

writeFileSync(`${DESK}/VELDA-PROMPT-DO-WKLEJENIA.txt`, [
  naglowek,
  czytaj['velda-system-prompt.md'],
  '\n\n# KNOWLEDGE FILE — the only facts you may state\n\n',
  czytaj['velda-knowledge.md'],
  '\n\n# HOW YOUR POSTS SOUND — study the rhythm, never copy a line\n\n',
  czytaj['velda-character-sheet.md'],
].join(''));

console.log(`✓ pulpit odświeżony (${CZESCI.length} kopie + prompt do wklejenia)`);
console.log(`  ${DESK}/VELDA-PROMPT-DO-WKLEJENIA.txt`);
