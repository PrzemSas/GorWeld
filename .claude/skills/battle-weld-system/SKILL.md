---
name: battle-weld-system
description: Reguły i architektura systemu Battle Weld — werdykt, kwalifikacja, BP, remisy, INCOMPARABLE, NO_QUALIFIED_RESULT, zaufanie do wyników, Battle API (`battle-server/`), replay `sim.js`, realtime, prywatność. Używaj przy każdej pracy nad logiką pojedynku, backendem, API, synchronizacją graczy, kartą pojedynku albo integracją Battle z silnikiem ARC (`arc/battle.js`, `arc/index.html`).
---

# Battle Weld — system

Jedyna pełna specyfikacja: `BATTLE_WELD_MASTER_SPEC.md` (katalog główny repo). Zacznij od tabeli **Decisions D1–D8** na górze — są zablokowane, nie zmieniaj ich bez właściciela.

## Niepodważalne zasady

1. **Serwer jest sędzią.** Klient nigdy nie jest źródłem prawdy dla: score, BP, kwalifikacji, czasu, `engineVersion`, `scoringVersion`, `taskHash`. Wszystko, co da się zmienić w DevTools, to deklaracja do sprawdzenia.
2. **Wynik = replay.** Serwer odtwarza `rec.events` (format z `recStart()`/`recEv()` w `arc/index.html`) przez `arc/sim.js` i sam liczy wynik — tak jak `arc/verify-challenge.mjs`. `score` od klienta jest informacyjny; rozbieżność gra↔serwer = błąd silnika do zalogowania. Nie ma trybu „kontroli wiarygodności” bez replayu.
3. **Jedna logika werdyktu: `arc/battle.js`.** Serwer go importuje, UI tylko wyświetla. Nie twórz drugiej implementacji (np. `verdict.js` z paczki projektowej — odrzucona, D8).
4. **Reguły (D1–D3):** wynik ARC całkowity → BP = score×10 (94 → 940). Kolejność werdyktu: walidacja → porównywalność (`taskHash` + `engineVersion` + `scoringVersion`, inaczej INCOMPARABLE) → kwalifikacja (`taskCompleted && !inspectionRejected`) → BP → remis: wspólny start = wcześniejszy czas serwera, pojedynek przez link = `DRAW`. Nikt niekwalifikowany → `NO_QUALIFIED_RESULT`, ale karta gracza dalej pokazuje osobno REJECT / INCOMPLETE.
5. **Czas tylko z serwera** (wstrzykiwany zegar w `battle-server/core.js`). Zegar klienta nie istnieje dla logiki.
6. **Wersje stempluje serwer** z `ArcSim.VERSION` / `ArcSim.SCORING_VERSION`; `taskHash` przelicza sam przez `arc/battle.js`.
7. **Tożsamość bez kont:** sekret gracza + jednorazowy sekret zaproszenia P2, w bazie tylko hashe. Nick = tylko wyświetlanie.
8. **Prywatność (§14.1):** zwykłe ARC w pełni lokalne; dane wychodzą tylko po świadomym wejściu w Battle i zgodzie.
9. **Lokalnie (D6):** bez wdrożenia, bez kont zewnętrznych, bez commitów — commit robi właściciel.

## Przy każdej zmianie

- Logika Battle w ARC: `node arc/tests/battle.js`, `node arc/tests/acceptance.js`, `node arc/tests/parity.js`, a w przeglądarce `arc/tests/e2e-battle.js` na kopii poza repo (instrukcja w nagłówku; adres BEZ końcowego `/`).
- Backend: `node --test battle-server/tests/`.
- Zmiana scoringu w `sim.js` = to samo w `inspect()` w `arc/index.html` (duplikacja, patrz `arc/tests/README.md`) + podbicie `SCORING_VERSION`.
- Nowy przypadek brzegowy reguł = najpierw test, potem kod, potem spec.
- Nie dodawaj kont, rankingów ani historii między urządzeniami bez decyzji właściciela.
