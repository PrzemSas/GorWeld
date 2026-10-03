---
description: Przegląd zgodności UI i logiki Battle Weld z zasadami
---
Przejrzyj zmiany (git diff lub wskazane pliki: $ARGUMENTS) pod kątem skilli `battle-weld-design` i `battle-weld-system` oraz decyzji D1–D8 w `BATTLE_WELD_MASTER_SPEC.md`.

Raportuj tylko naruszenia, każde z plikiem:linią i propozycją poprawki:
- UI liczy coś, co powinien liczyć serwer, albo ufa danym klienta (score, BP, czas, wersje, taskHash);
- druga implementacja werdyktu zamiast `arc/battle.js`;
- złamane reguły: BP ≠ score×10, remis w pojedynku przez link inny niż DRAW, brak NO_QUALIFIED_RESULT, karta gracza bez osobnego REJECT/INCOMPLETE;
- kolory spoza `battle-weld-ui/tokens.css`, zieleń, komponenty spoza listy;
- więcej niż jedna ceremonia na etap, animacje w trakcie próby;
- linie Veldy inne niż pięć dozwolonych (D7);
- brak `prefers-reduced-motion`, focusu, wersji mobilnej;
- dane wychodzące z urządzenia poza trybem Battle lub bez zgody;
- regresje zwykłego ARC (Battle nie może zmieniać ustawień, challenge ani kariery po wyjściu).

Na końcu odpal testy z skilla `battle-weld-system`. Nie commituj.
