# battle-weld-ui — wzorzec UI Battle Weld (faza 6)

Materiał referencyjny z zewnętrznej paczki projektowej (03.10.2026). NIE jest częścią strony
(wykluczony w `_config.yml`) ani źródłem logiki.

- `prototype/battle-weld.html` — cały flow: brama → VS → READY → 3·2·1 → STRIKE ARC → HUD →
  INSPECTION → VERDICT → karta. Selektor scenariuszy w prawym górnym rogu.
- `tokens.css` — kolory, fonty, krzywe ruchu (jedyne źródło tokenów dla UI Battle).

⚠ Prototyp liczy werdykt lokalnie na danych `SCEN` — tylko podgląd. Jego kopia werdyktu
NIE uwzględnia decyzji D2 (DRAW w pojedynku przez link) ani D1 (BP = wielokrotność 10).
Jedyna logika werdyktu: `arc/battle.js`. Reguły: `BATTLE_WELD_MASTER_SPEC.md`.
Zasady wyglądu: `.claude/skills/battle-weld-design/SKILL.md`.
