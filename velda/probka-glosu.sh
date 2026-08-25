#!/usr/bin/env bash
# VELDA — próbka głosu z pulpitu.
#
# Klucz ElevenLabs NIE leży w tym pliku. Siedzi zaszyfrowany w sejfie
# (~/.config/gorweld/elevenlabs.env.enc) i jest odczytywany do pamięci po podaniu hasła.
#
#   probka-glosu.sh --klucz          jednorazowo: wpisz klucz i zamknij go w sejfie
#   probka-glosu.sh "tekst"          powiedz to
#   probka-glosu.sh                  zapyta, co ma powiedzieć
set -u
VELDA="/mnt/d/GorWeld/velda"
SEJF="$HOME/.config/gorweld/elevenlabs.env.enc"
VAULT="$HOME/.gorweld/gorweld-vault"
PULPIT="/mnt/c/Users/gorwe/Desktop"

red(){ printf '\033[31m%s\033[0m\n' "$*"; }
grn(){ printf '\033[32m%s\033[0m\n' "$*"; }
dim(){ printf '\033[2m%s\033[0m\n' "$*"; }

# ── jednorazowe zamknięcie klucza w sejfie ──────────────────────────────────
if [ "${1:-}" = "--klucz" ]; then
  mkdir -p "$HOME/.config/gorweld"
  printf '\033[33mWklej klucz z elevenlabs.io (Profile → API key), Enter:\033[0m ' > /dev/tty
  stty -echo < /dev/tty 2>/dev/null; IFS= read -r K < /dev/tty; stty echo < /dev/tty 2>/dev/null
  printf '\n' > /dev/tty
  [ -n "$K" ] || { red 'Nic nie wpisałeś.'; exit 1; }

  # klucz przechodzi przez RAM, nie przez dysk
  TMP="$(mktemp /dev/shm/elk.XXXXXX)"; chmod 600 "$TMP"
  trap 'rm -f "$TMP"' EXIT INT TERM
  printf 'ELEVENLABS_API_KEY=%s\n' "$K" > "$TMP"
  unset K

  "$VAULT" seal "$TMP" || exit 1
  mv "$TMP.enc" "$SEJF"; chmod 600 "$SEJF"
  rm -f "$TMP.plain-backup"
  grn "✓ Klucz zamknięty w sejfie: $SEJF"
  dim '  Od teraz każda próbka pyta o hasło GORWELD LOCK.'
  exit 0
fi

# ── tekst do wypowiedzenia ──────────────────────────────────────────────────
TEKST="${*:-}"
if [ -z "$TEKST" ]; then
  printf '\033[33mCo ma powiedzieć Velda? (Enter = domyślne)\033[0m\n> ' > /dev/tty
  IFS= read -r TEKST < /dev/tty
fi
[ -n "$TEKST" ] || TEKST="welcome to the forge. mind the sparks."

# ── klucz z sejfu ───────────────────────────────────────────────────────────
if [ -z "${ELEVENLABS_API_KEY:-}" ]; then
  if [ ! -f "$SEJF" ]; then
    red 'Nie ma klucza ElevenLabs.'
    dim "Zamknij go w sejfie raz:   $0 --klucz"
    exit 1
  fi
  ELEVENLABS_API_KEY="$("$VAULT" open "$SEJF" | sed -n 's/^ELEVENLABS_API_KEY=//p')" || exit 1
  [ -n "$ELEVENLABS_API_KEY" ] || { red 'Sejf otwarty, ale klucza w nim nie ma.'; exit 1; }
  export ELEVENLABS_API_KEY
fi

# ── synteza ─────────────────────────────────────────────────────────────────
cd "$VELDA" || exit 1
node odpowiedz.mjs --mow "$TEKST" || exit 1

# najświeższy wynik ląduje na pulpicie pod stałą nazwą — łatwo kliknąć
NOWY="$(ls -dt "$VELDA"/odpowiedzi/probka-*/ 2>/dev/null | head -1)"
if [ -n "$NOWY" ] && [ -f "$NOWY/velda.mp4" ]; then
  cp "$NOWY/velda.mp4" "$PULPIT/VELDA-PROBKA.mp4"
  cp "$NOWY/glos.mp3"  "$PULPIT/VELDA-PROBKA.mp3" 2>/dev/null
  grn "✓ Na pulpicie: VELDA-PROBKA.mp4 (i .mp3)"
elif [ -n "$NOWY" ] && [ -f "$NOWY/glos.mp3" ]; then
  cp "$NOWY/glos.mp3" "$PULPIT/VELDA-PROBKA.mp3"
  grn '✓ Na pulpicie: VELDA-PROBKA.mp3 (bez wideo — brak klipu tła)'
fi
