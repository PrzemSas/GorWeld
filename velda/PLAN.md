# VELDA — plan wdrożenia
### Agent AI dla ekosystemu GorWeld / Dumpster Forge
*(aktualizacja: 2026-08-22)*

---

## CO JEST GOTOWE

- ✅ **Character sheet** — `velda-character-sheet.md` (lore, osobowość, styl, few-shoty, 3 bio na X)
- ✅ **Baza wiedzy** — `velda-knowledge.md`: jedyne źródło faktów, jakie Velda może wypowiedzieć.
  Zmiana w forge'u → edycja tego pliku (da się z telefonu przez GitHub) → Velda wie od następnego posta
- ✅ **System prompt** — `velda-system-prompt.md`: kim jest, jak pisze, czego jej nie wolno
- ✅ **Skrypt agenta** — `post.mjs`: rotacja 6 formatów, pamięć ostatnich 12 postów (żeby się nie powtarzała),
  bezpieczniki sprawdzające post **przed** publikacją. Bez `VELDA_LIVE=1` nie wysyła nic
- ✅ **Publikacja na X** — `x-api.mjs`: OAuth 1.0a bez zewnętrznych bibliotek, X API v2, darmowy plan
- ✅ **Hosting** — `.github/workflows/velda.yml`: cron codziennie 20:00 UTC, zero VPS, zero kosztów.
  Klucze wyłącznie w GitHub Secrets
- ✅ **Katalog wykluczony z gorweld.com** (`_config.yml`) — prompt i baza wiedzy zostają w repo, ale nie na serwerze
- ✅ **Testy bezpieczników** — 11/11 przechodzi (obce CA, moon, claim page, obcy link, hashtag, długość, SKIP…)

---

## CO ZOSTAŁO — tylko rzeczy, których nie zrobię za Ciebie

1. ~~**Konto X dla Veldy**~~ ✅ **@Velda_DF** — zostaje wkleić bio z character sheeta §6
2. **Avatar** — maszyna-spawaczka, hełm z wizjerem, iskry, post-apo
3. **Klucze API** — `developer.x.com` na koncie Veldy, uprawnienia **Read and write**,
   Access Token generowany **po** ustawieniu write (inaczej 403). Plus `ANTHROPIC_API_KEY`
4. **Wklejenie sekretów do GitHuba** i dodanie `VELDA_LIVE=1`, gdy ma zacząć publikować

Kroki 1–3 kosztują $0. Krok 4 to jedno pole w ustawieniach repo.

---

## KOSZTY

| Element | Koszt |
|---|---|
| Konto X + Free API (~500 postów/mies zapisu) | $0 |
| GitHub Actions (cron) | $0 |
| Claude Opus 5, 1 post/dzień | ~$0,60/mies |
| **RAZEM** | **~2,5 zł/mies** |

Opcjonalnie później: X API Basic (~$200/mies) dopiero gdy Velda ma masowo odpowiadać na wzmianki.
VPS ($5/mies) — gdy ma działać real-time. Na dziś **niepotrzebne**.

---

## TRYB TESTOWY (zero ryzyka)

Workflow chodzi codziennie **bez** sekretu `VELDA_LIVE`. Generuje post, pokazuje go w logu Actions,
nie publikuje nic. To jest dokładnie ten „tydzień ręcznego zatwierdzania" z pierwotnego planu —
tylko że nie trzeba niczego uruchamiać ręcznie. Podoba się tydzień postów → dodajesz `VELDA_LIVE=1`.

---

## CZEGO VELDA NIE ROBI (świadomie)

- nie odpowiada na wzmianki i DM-y (v2, wymaga płatnego X API)
- nie czyta on-chain w czasie rzeczywistym — fakty bierze z pliku wiedzy
- **nie ogłasza konkursów, dropów, listingów ani dat.** Ogłasza Welder, nie maszyna
- nie mówi o cenie. „i weld, i don't chart"
