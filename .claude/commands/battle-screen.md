---
description: Zbuduj lub dopracuj ekran Battle Weld w ustalonym języku wizualnym
---
Ekran / zmiana: $ARGUMENTS

1. Przeczytaj skill `battle-weld-design` (i `frontend-design`, jeśli jest zainstalowany). Otwórz `battle-weld-ui/prototype/battle-weld.html` jako wzorzec i `BATTLE_WELD_MASTER_SPEC.md` (D1–D8).
2. Napisz krótki plan: który stan ze specu obsługuje ekran, jaka jest jego jedna ceremonia, jakie komponenty z listy dopuszczalnych użyjesz, jakie dźwięki. Jeśli plan wymaga nowego komponentu albo koloru — zatrzymaj się i zapytaj.
3. Zbuduj. Kolory tylko z `battle-weld-ui/tokens.css`. Werdykt tylko z `arc/battle.js` / odpowiedzi serwera — UI wyświetla, nie liczy.
4. Nie psuj zwykłego ARC: po zmianach w `arc/` odpal testy z skilla `battle-weld-system`.
5. Sprawdź: wszystkie scenariusze, 1280×800 i 390×844 (oraz 360 px), `prefers-reduced-motion`, bez dźwięku, widoczny focus, PL/EN/RU. Zrzuty ekranu obejrzyj przed oddaniem.
6. Pokaż zrzuty i jedną listę: co zmieniłeś, co świadomie pominąłeś. Nie commituj.
