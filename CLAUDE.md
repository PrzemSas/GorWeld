# GorWeld — repo strony gorweld.com

Statyczny HTML/JS serwowany przez GitHub Pages wprost z tego repo (repo jest PUBLICZNE:
żadnych sekretów, kluczy, adresów portfeli ani prywatnych notatek w commitach).

- `arc/` — Arc Welder (symulator spawania w przeglądarce): `index.html` (gra) + `sim.js`
  (silnik oceny), testy w `arc/tests/`.
- `arcquote/` — ArcQuote (wycena), `index.html` + ceny (`prices-latest.js`, `update-prices.mjs`).

## Zasady dla arc/
- Matematyka oceny jest zduplikowana w `arc/sim.js` i `arc/index.html` — oba pliki muszą
  liczyć 1:1. Zmiana oceny = nowa flaga + zamrożony stary silnik + test bit-w-bit.
- Po każdej zmianie w `arc/` odpal testy z `arc/tests/` (lista i przepis w `arc/tests/README.md`).

## Ciągłość pracy
- Na początku każdej sesji przeczytaj `claude-progress.txt` (jeśli istnieje) i krótko powiedz,
  na czym skończyliśmy i co jest następne.
- Na koniec pracy, albo gdy powiem "koniec", zaktualizuj `claude-progress.txt`: data, co zrobione,
  co przetestowane i działa, co nie działa, następny krok. Max ~30 linijek, najstarsze wpisy skracaj.
- Po każdej działającej zmianie przygotuj commit z krótkim opisem po polsku (opis + komenda);
  commit i push robi właściciel z terminala (GORWELD LOCK), Claude nie commituje.
