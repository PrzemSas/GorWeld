# arc/tests — zestaw dowodowy silnika oceny

Matematyka oceny jest ZDUPLIKOWANA w `../index.html` i `../sim.js`. Każda zmiana
w ocenianiu wymaga powtórzenia tych testów, inaczej zwycięzcy konkursu odpadają
na weryfikacji z powodu, którego nie da się wytłumaczyć.

## Node — sam `sim.js` (szybkie, bez przeglądarki)

    node parity.js     # regresja: rundy BEZ nowej mechaniki liczą się bit-w-bit jak w starym silniku
    node angle.js      # kąt: neutralność na WPS, kara rośnie, warstwy się nie blokują

`sim-2.0.0.js` to zamrożony silnik sprzed kąta — punkt odniesienia dla `parity.js`.
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
