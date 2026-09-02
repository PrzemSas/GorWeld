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

Testy wołają silnik przez `require("../sim.js")` — ścieżkę WZGLĘDNĄ. Nie wstawiaj tu ścieżki
bezwzględnej: u autora działa, a każdy inny dostaje `MODULE_NOT_FOUND`, i — gorzej — na maszynie
autora test przechodzi, tylko czyta nie ten silnik, co trzeba. Sprawdzian: skopiuj `arc/sim.js`
i `arc/tests/` do katalogu POZA repo, podmień tam `VERSION` na znacznik i zobacz, czy test go wypisze.

`sim-3.2.0.js` to zamrożony silnik sprzed spoiwa TIG — punkt odniesienia dla `parity.js` i `filler.js`.
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

## Przeglądarka — gra vs `sim.js` (jedyny test, który sprawdza `index.html`)

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
