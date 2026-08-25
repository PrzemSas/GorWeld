# VELDA — nocna zmiana Dumpster Forge

Agent, który pisze jeden post dziennie na X w imieniu forge'a. Leży gotowy.
**Startuje po wklejeniu kluczy** — kodu już nie trzeba dotykać.

```
velda/
├── velda-system-prompt.md    ← kim jest i czego jej nie wolno (idzie do modelu)
├── velda-knowledge.md        ← MÓZG: jedyne fakty, które może wypowiedzieć
├── velda-character-sheet.md  ← lore + few-shoty (rytm postów)
├── post.mjs                  ← generator + bezpieczniki
├── x-api.mjs                 ← publikacja na X (OAuth 1.0a, zero zależności)
└── posted-log.jsonl          ← co i kiedy poszło (powstaje po pierwszym poście)
```

---

## Uruchomienie na sucho (nic nie publikuje)

```bash
cd velda
npm install
export ANTHROPIC_API_KEY=sk-ant-...
node post.mjs                              # format wg rotacji dnia
node post.mjs --format="anti-scam reminder"  # wymuszony format
```

Skrypt pokaże post, długość i wynik bezpieczników. **Bez `VELDA_LIVE=1` nie idzie nic na X** — nawet z kluczami X w środowisku.

Formaty: `night shift report`, `anti-scam reminder`, `forge status`, `arc welder nudge`, `two chains lore`, `receipts`.

---

## Odpalenie na żywo — 4 kroki

1. **Konto X dla Veldy** + bio z character sheeta + avatar.
2. **developer.x.com → aplikacja NA KONCIE VELDY**, uprawnienia **Read and write**, wygeneruj 4 klucze:
   `API Key`, `API Secret`, `Access Token`, `Access Token Secret`.
   ⚠️ Access Token trzeba wygenerować **po** ustawieniu uprawnień na write — inaczej token jest read-only i X zwróci 403.
   Darmowy plan: ~500 postów/miesiąc zapisu. Przy 1 poście dziennie to 6% limitu.
3. **GitHub → Settings → Secrets and variables → Actions**, dodaj sekrety:
   `ANTHROPIC_API_KEY`, `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`.
   Opcjonalnie zmienna (nie sekret) `VELDA_MODEL`, jeśli chcesz inny model niż `claude-opus-5`.
4. **Włączenie publikacji:** dodaj sekret `VELDA_LIVE` = `1`.
   Dopóki go nie ma, workflow chodzi codziennie na sucho i pokazuje post w logu Actions — dokładnie tak wygląda tydzień testów z planu.

Ręczne odpalenie: zakładka **Actions → Velda — nocna zmiana → Run workflow** (można wpisać format i `live=1` jednorazowo).
Harmonogram: codziennie 20:00 UTC (22:00 CEST).

---

## Bezpieczniki

`post.mjs` sprawdza wygenerowany post **zanim** cokolwiek wyjdzie. Awaria = cisza, nigdy publikacja na ślepo.

- każdy ciąg wyglądający na adres Solany musi być **oficjalnym CA** — inaczej stop
- linki tylko na: `gorweld.com`, `gorweld.fun`, `x.com`, `solscan.io`, `cookiescan.io`
- zakazane frazy: moon / 100x / guaranteed / profit / claim / connect wallet / DM me / giveaway…
- limit 280 znaków (link liczony jak X liczy — 23 znaki)
- zero hashtagów, max 2 emoji, żadnych oznaczeń kont poza @Przemsas i @GorWeld
- model może zwrócić `SKIP`, jeśli nie da się napisać posta w regułach — wtedy też nic nie leci

Reguła nadrzędna: **czego nie ma w `velda-knowledge.md`, tego Velda nie wie.**
Zmiana w forge'u → edycja tego jednego pliku (da się z telefonu przez GitHub) → Velda wie od następnego posta.

---

## Odpowiedź GŁOSEM zamiast tekstem  (`odpowiedz.mjs`)

Ktoś zadaje pytanie → Velda odpowiada **wideo z własnym głosem**, nie postem.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export ELEVENLABS_API_KEY=...
node odpowiedz.mjs --glosy                      # raz: wybierz głos, wpisz voice_id do glos.json
node odpowiedz.mjs "is this a honeypot?"        # pytanie → gotowy mp4
node odpowiedz.mjs --tekst-only "..."           # sam tekst, bez płacenia za głos
```

Co się dzieje po kolei:
1. odpowiedź generowana tym samym system promptem i tą samą bazą wiedzy co posty
2. **te same bezpieczniki** — obce CA, moon, claim, obcy link, długość. Odrzucona odpowiedź
   **nie idzie do syntezy**, więc nie płacisz za nagranie, którego i tak byś nie wysłał
3. ElevenLabs (`eleven_multilingual_v2`) zamienia tekst na głos
4. ffmpeg nakłada głos na klip Veldy (`VELDA-klip.mp4`), wycisza oryginalną ścieżkę,
   przycina albo zapętla obraz **dokładnie** do długości wypowiedzi
5. plik ląduje w `velda/odpowiedzi/<data>/velda.mp4` — **nic nie jest publikowane**

Tryb mówiony ma własne reguły w prompcie: żadnych linków ani adresów czytanych na głos
(„one CA, it's on the site"), dwa–trzy zdania, ten sam płaski ton.

Ustawienia głosu w `glos.json`: `stability 0.65` (ma mówić równo, nie grać),
`style 0.15` (minimum aktorstwa), `speed 0.94` (jak ktoś po dwunastu godzinach przy łuku).

**Czego to NIE robi:** nie czyta wzmianek z X. Darmowy plan X pozwala publikować, ale nie
czytać — automatyczne odpowiadanie na pytania wymaga planu Basic (~$200/mies). Dziś: Ty
wklejasz pytanie, dostajesz gotowy plik, Ty decydujesz czy leci.

---

## Koszt

| Element | Koszt |
|---|---|
| Konto X + Free API | $0 |
| GitHub Actions (cron) | $0 |
| Claude Opus 5, 1 post/dzień (~3k in / ~300 out) | **~$0,60/mies** |

**Głos (ElevenLabs), stan na 22.08.2026:** Free 10k znaków/mies — ale **bez licencji komercyjnej**,
więc do konta projektu się nie nadaje. Najtańszy z licencją to **Starter $6/mies, 30k znaków** —
przy odpowiedziach po ~250 znaków to około **120 nagrań miesięcznie**. Cztery dziennie.

Tańszy wariant tekstu: `VELDA_MODEL=claude-haiku-4-5` (~$0,10/mies). Przy jednym poście dziennie różnica to złotówka — model schodzi w dół dopiero, gdyby Velda miała masowo odpowiadać na wzmianki.

---

## Czego v1 NIE robi

- nie odpowiada na wzmianki i DM-y (to wymaga płatnego planu X i osobnej pętli)
- nie czyta on-chain w czasie rzeczywistym — fakty bierze z pliku wiedzy
- nie ogłasza konkursów, dropów ani listingów. **Nigdy.** Ogłasza Welder, nie maszyna.
