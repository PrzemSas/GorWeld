# arc/tests — zestaw dowodowy silnika oceny

Matematyka oceny jest ZDUPLIKOWANA w `../index.html` i `../sim.js`. Każda zmiana
w ocenianiu wymaga powtórzenia tych testów, inaczej zwycięzcy konkursu odpadają
na weryfikacji z powodu, którego nie da się wytłumaczyć.

## Node — sam `sim.js` (szybkie, bez przeglądarki)

    node parity.js     # regresja: rundy BEZ nowej mechaniki liczą się bit-w-bit jak w starym silniku
    node angle.js      # kąt: neutralność na WPS, kara rośnie, warstwy się nie blokują
    node amps.js       # prąd: AUTO vs RĘCZNIE — oba tryby zerują się na WPS, kara monotoniczna
    node arcstop.js    # LPM+PPM: gest kończy ścieg, wymaga obu przycisków, nie jest zerwaniem
    node offaxis.js    # tor: odchyłka od grani karana zboczem, nie schodkiem; stałe zgodne w obu plikach
    node filler.js     # spoiwo TIG: bez spacji stary automat bit-w-bit, z spacją rytm oceniany doliną
    node heatinput.js  # wkład ciepła: limit Kodu na materiale badanym udarnościowo — REJECT, nie kara
    node fast.js       # za szybki przejazd (3.6.0): >1,5× tempa WPS = REJECT „underfill"; w tempie bit-w-bit jak 3.5.0
    node kb8.js        # krótszy łuk MMA (3.14.0, kb=8): pasmo bez kary 0,5–1,1×Ø, komunikat 0,4/1,3×Ø; MIG/TIG i kb≤7 bit-w-bit jak 3.13.0
    node kb7.js        # kierunek na ścianie pionowej (3.13.0, kb=7): PF z dołu do góry, PG z góry na dół, zły kierunek = REJECT direction; kb≤6 bit-w-bit jak 3.12.0
    node kb6.js        # elektroda zostaje w uchwycie (3.12.0, kb=6, MMA): Ø nie wraca sama do typowej; kb≤5 bit-w-bit jak 3.11.0
    node kb5.js        # łuk tylko w rowku (3.11.0, kb=5): poza strefą rowka nie zajarzy i nie kładzie metalu; kb≤4 bit-w-bit jak 3.10.0, robota w rowku kb=5 == kb=4
    node kb4.js        # elektrody (3.10.0, kb=4, MMA): Ø per ścieg, prąd z Ø, L0 = Ø, zła Ø = wada, HI per ścieg; kb≤3 i MIG/TIG bit-w-bit jak 3.9.0
    node kb3.js        # skala fizyczna (3.9.0, kb=3): jedna skala px/mm dla każdej grubości; kb=2/1/bez kb bit-w-bit jak 3.8.0
    node kb.js         # kombajn (3.7.0): realna sekwencja ściegów, tory, lico vs faza, 401, żużel; bez `kb` bit-w-bit jak 3.6.0
    node acceptance.js # zaliczenie treningu: odrzut ISO (major albo <50) blokuje ZALICZONE, XP i konfetti; konkurs bez zmian
    node reject-reasons.js # przyczyny odrzutu: REJECT ma co najmniej jedną znaną przyczynę, zaliczenie pustą listę
    node e2e-battle.js http://127.0.0.1:8898 # pełny Battle host → link → gość → VS; wymaga Playwright/Chromium i serwera HTTP

Testy nodowe czytają NAGRANIE, a nie klawiaturę — więc same nie wychwycą błędu, w którym dab
nigdy nie wchodzi do nagrania (tak było w 3.3.0: guard spacji odrzucał zdarzenie, gdy fokus
siedział na przycisku wyboru metody). `filler.js` pilnuje więc guardu wprost w źródle gry, a
pełny przebieg sprawdzają sterowniki `e2e-*.js` (`e2e-filler.js` — spoiwo spacją;
`e2e-heatinput.js` — limit wkładu ciepła i parytet litery ISO; `e2e-battle.js` — pojedynki Battle i błędne linki) — przepis w nagłówku `e2e-filler.js`. W E2E NIE WOLNO robić
`blur()` po kliknięciu w TIG: to właśnie maskowało błąd, bo żywy gracz blura nie robi.

Testy wołają silnik przez `require("../sim.js")` — ścieżkę WZGLĘDNĄ. Nie wstawiaj tu ścieżki
bezwzględnej: u autora działa, a każdy inny dostaje `MODULE_NOT_FOUND`, i — gorzej — na maszynie
autora test przechodzi, tylko czyta nie ten silnik, co trzeba. Sprawdzian: skopiuj `arc/sim.js`
i `arc/tests/` do katalogu POZA repo, podmień tam `VERSION` na znacznik i zobacz, czy test go wypisze.

`sim-3.13.0.js` to zamrożony silnik sprzed „krótszego łuku MMA” (punkt odniesienia dla `kb8.js`); `sim-3.12.0.js` — sprzed „kierunku PF/PG” (punkt odniesienia dla `kb7.js`); `sim-3.11.0.js` — zamrożony silnik sprzed „elektrody w uchwycie” (punkt odniesienia dla `kb6.js`); `sim-3.10.0.js` — sprzed strefy łuku (punkt odniesienia dla `kb5.js`); `sim-3.9.0.js` — sprzed elektrod per ścieg (punkt odniesienia dla `kb4.js`); `sim-3.8.0.js` — sprzed fizycznej skali blachy (punkt odniesienia dla `kb3.js`); `sim-3.7.0.js` — sprzed planu 3.8.0 (`kb2.js`); `sim-3.6.0.js` to zamrożony silnik sprzed kombajnu (punkt odniesienia dla `kb.js`; E2E z prawdziwą myszą: `e2e-kb.js <baseURL>`); `sim-3.5.0.js` to zamrożony silnik sprzed progu za szybkiego przejazdu (punkt odniesienia dla `fast.js`); `sim-3.3.0.js` — sprzed limitu heat input; `sim-3.2.0.js` sprzed spoiwa TIG — punkt odniesienia dla `parity.js` i `filler.js`.
`sim-3.1.0.js` (sprzed kary za odchyłkę toru), `sim-3.0.0.js` (sprzed gestu gaszenia) i `sim-2.0.0.js`
(sprzed kąta) leżą obok jako starsze punkty.
Przy następnej zmianie zamroź obok niego bieżącą wersję i podmień `require`.

`gen.js` buduje surowe zdarzenia wskaźnika. Dwie pułapki, które już kosztowały czas:
 * elektroda MMA przechodzi MIĘDZY warstwami — silnik jej nie zeruje na `bank`,
   więc generator musi ją wymieniać, inaczej drugi ścieg jest ucięty i pokrycie
   siada do ~62% NIE Z WINY testowanej zmiany;
 * próg wymiany w generatorze (0,13) jest NIŻSZY od silnikowego `ELEC_STUB` (0,16)
   CELOWO — świeżą elektrodę silnik podaje tylko na `down` i tylko gdy sam już
   ustawił `replacing`. Generator musi spóźnić się za nim, a nie go wyprzedzić.

## Przeglądarka — gra vs `sim.js` (testy, które sprawdzają `index.html`)

**Od poprawki 03 (2026-10-31): parytet PODSTAWOWYCH pól werdyktu.** Po inspekcji gra zapisuje
`window.__parity = {live, sim, diff[]}` — punkty, litera, odrzut, klasa ISO (ten sam kod, który idzie na
ekran), pokrycie (liczba 0..1, ±1e-6; NaN/brak = rozjazd), próg pokrycia 0,8 i wada major (po stronie
`sim.js` = `rejectReasons` bez samego `score`). Listy przyczyn odrzutu NIE porównujemy — gra ma teksty wad,
nie kody. Rozjazd = `console.warn('[PARITY] ROZJAZD WERDYKTU …')`. Nic nie zmienia oceny.

    node e2e-verdict-parity.js http://127.0.0.1:8898 [przypadek]   # 8 rund z oczekiwanym wynikiem + 4 kontrole
    node e2e-angle-focus.js    http://127.0.0.1:8898               # klawisze kąta a fokus kontrolek (poprawka 01)
    node e2e-input-lock.js     http://127.0.0.1:8898               # blokada mysz↔dotyk, też przy palącym się łuku (poprawka 02)

Każda runda ma oczekiwany wynik (przyjęta / REJECT z daną przyczyną), sprawdzaną pozycję, liczbę ściegów
i tryb sterowania; wymagana jest co najmniej jedna runda przyjęta — inaczej zły bot i same zgodne odrzuty
dałyby zielony test. Kontrole psują wynik powtórki (`kontrola` = odwrócony werdykt przy tych samych
punktach, `kontrola-nan` / `-brak` / `-delta` = pokrycie) — test MUSI je wykryć.

⚠ Bot sterowany „krok + sleep" jedzie 2–3× za wolno (każdy odczyt stanu kosztuje ms), więc każda
runda wpada w REJECT za wkład ciepła i test widzi same odrzuty. `e2e-verdict-parity.js` prowadzi
rękę ZEGAREM (droga = v·t) — tak trzeba pisać nowe sterowniki.

Automat: `.github/workflows/arc-tests.yml` odpala przy każdym pushu/PR w `arc/` lub `battle-server/`
wszystkie testy Node, `node --test battle-server/tests/` i E2E w Chromium (serwery jak wyżej:
`static-dev.py` + `dev-server.js`). E2E mają jedno powtórzenie, bo zależą od tempa maszyny.

`parity-driver-3.0.0.js` = `../parity-driver.js` + klawisze kąta (`?k=KeyD&kn=40`).
Przepis uruchomieniowy w nagłówku `../parity-driver.js`. Trzeba czasu wirtualnego:
bez `--virtual-time-budget` `--dump-dom` zrzuca stronę, zanim runda się skończy.

⚠ Sterownik pod czasem wirtualnym dostaje duże `dtS` i spawa fatalnie (wynik ~11).
To ARTEFAKT, nie regresja — sprawdź to samo na zamrożonym silniku, zanim zaczniesz
szukać winy w swojej zmianie. Liczy się `match:true`, nie wysokość wyniku.

`amps.js` jako jedyny nie czyta `sim.js`, tylko wycina tablice WPS i blok pokrętła prosto
z `../index.html`. Powód: tryb prądu (AUTO/RĘCZNIE) jest wyborem INTERFEJSU, nie fizyki —
silnik dostaje gotową liczbę amperów i nie wie, skąd ona jest. Gdyby test trzymał własną
kopię tablic, przestałby pilnować tego, co trzeba: że oba tryby na wartości z WPS dają
`ar === 1` co do bita, bo na tym stoi porównywalność wszystkich rund od 1.4.0.
