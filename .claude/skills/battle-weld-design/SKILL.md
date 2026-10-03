---
name: battle-weld-design
description: Język wizualny i ceremonie trybu Battle Weld (GORWELD ARC). Używaj przy KAŻDEJ zmianie UI Battle Weld — nowy ekran, przycisk, animacja, HUD, karta pojedynku, dźwięk, linia Veldy — oraz przy przeglądzie wyglądu. Uzupełnia ogólny skill frontend-design; tam, gdzie się różnią, wygrywa ten plik.
---

# Battle Weld — język wizualny

Battle Weld to **tryb gry w stylu industrial fighting game**, nie dashboard i nie cyberpunk.
Wzorzec referencyjny: `battle-weld-ui/prototype/battle-weld.html`. Zanim zaprojektujesz coś nowego, otwórz go i skopiuj istniejące wzorce zamiast wymyślać nowe.

## Zasada nadrzędna

Game feel daje **flow i ceremonie**, nie ilość efektów. Każdy etap ma jedną małą ceremonię. Między ceremoniami interfejs jest cichy.
Podczas samej próby spawania HUD jest maksymalnie spokojny: cienkie linie danych na krawędziach, zero animacji poza jedną wolno pulsującą kropką stanu przeciwnika.

## Tokeny

Jedyne źródło: `battle-weld-ui/tokens.css`. Nie wprowadzaj nowych kolorów bez dopisania ich tam.

- P1 = żar `--ember`, P2 = zimne światło łuku `--arc`. Każdy element przypisany do gracza dziedziczy `--acc` po swojej stronie.
- OK / QUALIFIED = bursztyn `--amber`. **Nigdy zieleń** — to nie jest aplikacja bankowa.
- Błąd / REJECTED / INCOMPARABLE = `--reject` / `--reject-txt`.
- Display: Big Shoulders Display 800–900, wersaliki tylko dla haseł gry (BATTLE WELD, VS, READY, STRIKE ARC, VERDICT, WINS, QUALIFIED, REJECTED, INCOMPARABLE, REMATCH, PLAYER 1/2). Wszystko inne zdaniowo.
- Dane techniczne (hash, wersje, czasy): Chivo Mono. Treść: Archivo.

## Komponenty (jedyne dopuszczalne)

- **Panel stalowy**: szczotkowana stal (powtarzalny gradient 1px/3px) + gradient `--steel-1 → --steel-2`. Panele graczy mają skośną krawędź od strony środka (`clip-path`) i gruby pasek `--acc` od zewnątrz.
- **Nity**: małe radialne kółka w rogach płyt. Tylko na płytach „fizycznych" (płyta zadania, karta werdyktu).
- **Spoina** = jedyny separator. Ścieg z powtarzalnego `radial-gradient` w elipsach. Gorąca (żar) = aktywne/zwycięskie, zimna (stal) = neutralne/zakończone, przerwana/czerwona = odrzucone. Nie używaj zwykłych linii `<hr>` jako głównych separatorów.
- **Przycisk fizyczny `.phys`**: trzy warianty — żarowy (akcja główna, max 1 na ekran), stalowy (`.steel`, powrót/drugorzędne), wciśnięty (`.done`, stan zatwierdzony). Wciśnięcie = przesunięcie w dół o głębokość cienia.
- **Lampka `.lamp`**: off / `.on` bursztyn / `.bad` czerwień. Zamiast ikon statusu.
- **Pieczątka `.stamp`**: LINKED, READY, QUALIFIED, REJECTED. Wbijana skalą z 2.4 do 1, lekko obrócona.

## Ceremonie (kolejność i sygnatury)

| Etap | Ceremonia | Dźwięk |
|---|---|---|
| ENTER BATTLE | skrzydła bramy rozjeżdżają się, iskry z przycisku | crack |
| MATCH LINKED | panele wjeżdżają z boków (`--t-slam`), pieczątki LINKED | thud + tick |
| VS | napis wbija się ze skali 3.4, wstrząs, iskry, zapala się spoina | thud + crack |
| READY CHECK | lampki po kolei: hełm, rękawice u obu → taskHash, engine, scoring | tick na lampkę |
| COUNTDOWN | arena gaśnie (`.dim`), cyfry wypalane | count |
| STRIKE ARC | błysk biały→niebieski, eksplozja iskier żar + łuk | crack + thud |
| INSPECTION | niebieski skaner przesuwa się po spoinie, za nim spoina stygnie; defekty zapalają się na czerwono w miejscu | scan + tick/bad |
| VERDICT | stalowa karta spada z góry i osiada, tytuł wypalany, BP nabijane, pieczątki | land + crack + chime |
| Remis BP | przed kartą panele zderzają się w centrum (wspólny start: rozstrzyga czas serwera; link: DRAW) | crack + land |
| INCOMPARABLE | ekran przecina taśma ostrzegawcza, arena gaśnie, pokazane DOKŁADNIE co się różni | alarm |

Ruch nie wywołany przez gracza dozwolony tylko w tych ceremoniach i w unoszącym się żarze tła. Respektuj `prefers-reduced-motion` (ceremonie skracają się do zmiany stanu).

## Velda

Announcer, nie maskotka. Pojawia się w pasku w lewym dolnym rogu (na mobile u góry), tekst wpisywany, potem znika. **Dokładnie pięć linii** (decyzja D7 w `BATTLE_WELD_MASTER_SPEC.md`), po angielsku, bez wariantów:

- `Gear check.` — start READY CHECK
- `Same task. Same rules.` — parametry zgodne
- `Strike the arc.` — pojawia się STRIKE ARC
- `Inspection complete.` — koniec skanu
- `Verdict locked.` — karta werdyktu osiadła

Velda nigdy nie komentuje wyniku, nie gratuluje, nie mówi przy INCOMPARABLE (tam mówi system).

## Teksty

- Komunikaty błędów mówią, co się stało i co zrobić: „IronMarta ma inną wersję silnika… Zaktualizujcie ARC i połączcie się ponownie." + `3.4.0 ≠ 3.3.2`.
- Ta sama akcja ma tę samą nazwę w całym flow (REMATCH zawsze REMATCH).

## Zakazy

- Żadnych obrazków zamiast UI. Panele, przyciski, liczby, statusy, spoiny, iskry = HTML/CSS/canvas. Obrazki tylko: logo, portret Veldy, ewentualnie tło areny.
- Żadnej zieleni, neonów cyberpunkowych, glassmorphismu, zaokrągleń > 4px na panelach.
- Żadnych animacji wejścia na każdym elemencie. Jedna ceremonia na etap.
- UI nigdy nie liczy werdyktu jako źródła prawdy. Wyświetla to, co zwrócił serwer (patrz skill `battle-weld-system`).

## Kontrola jakości

Po każdej zmianie UI: przejdź cały flow we wszystkich scenariuszach (selektor w prototypie), na 1280×800 i 390×844, ze zrzutami ekranu (skill `webapp-testing`, jeśli zainstalowany). Sprawdź: nic nie nachodzi na Veldę, nicki nie łamią się w środku przy prawdziwym foncie, focus widoczny, działa bez dźwięku.
