/**
 * GORWELD™ ARC — sterownik testu PARYTETU (gra ↔ sim.js).
 *
 * PO CO TO JEST
 * Gra pokazuje graczowi wynik policzony w `index.html`, a `verify-challenge.mjs` liczy ten sam
 * przebieg jeszcze raz w `sim.js`. Obie liczby MUSZĄ być identyczne — inaczej zwycięzcy konkursu
 * odpadają na weryfikacji z powodu, którego nie da się wytłumaczyć. Matematyka jest zduplikowana
 * w dwóch plikach, więc KAŻDA zmiana w ocenianiu wymaga powtórzenia tego testu.
 *
 * CO ROBI
 * Spawa rundę PRAWDZIWYMI zdarzeniami wskaźnika (nie wywołuje funkcji gry na skróty), a potem każe
 * `sim.js` odtworzyć dokładnie to nagranie i porównuje oba wyniki. Wypluwa `<pre id="PARITY">`
 * z JSON-em, żeby dało się to odczytać z `--dump-dom`.
 *
 * JAK ODPALIĆ (WSL + Edge z Windows; sprawdzone 2026-08-15)
 *   1. Skopiuj `index.html`, `sim.js`, `challenge-config.json` i ten plik do katalogu roboczego
 *      POZA repo, a w kopii `index.html` dopnij przed `</body>`:
 *          <script src="parity-driver.js"></script>
 *   2. Serwuj po HTTP — `file://` NIE zadziała, bo `fetch(challenge-config.json)` padnie na CORS
 *      i tryb challenge zablokuje start:
 *          python3 -m http.server 8901 --bind 127.0.0.1
 *   3. Odpal Edge headless (rozmiar okna steruje szerokością stanowiska — to jest zmienna, o którą
 *      w tym teście chodzi; `--virtual-time-budget` przewija `setTimeout` w czasie wirtualnym,
 *      więc runda 18-sekundowa leci w ułamek sekundy):
 *          "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
 *            --headless=new --disable-gpu --no-sandbox --mute-audio \
 *            --window-size=720,500 --virtual-time-budget=600000 \
 *            --user-data-dir='C:\Users\...\Temp\arcparity' --dump-dom \
 *            "http://127.0.0.1:8901/parity.html?challenge=1" | grep -o 'PARITY_JSON {.*}'
 *
 * ⚠️ PUŁAPKI, KTÓRE JUŻ KOSZTOWAŁY CZAS
 *  - CDP przez `--remote-debugging-port` NIE działa z WSL: Edge słucha na windowsowym loopbacku,
 *    którego WSL nie dosięga. Stąd cała ta droga przez `--dump-dom`.
 *  - Bez `--user-data-dir` na ścieżce WINDOWSOWEJ Edge potrafi odmówić startu.
 *  - Tutorial otwiera się 1,1 s po starcie i `modalOpen()` blokuje `start()` — sterownik go zamyka.
 *  - Okno musi być poziome i dać stanowisko ≥ `CHAL_MIN_W`, inaczej challenge celowo nie wystartuje
 *    (to też warto przetestować: poniżej progu oczekujemy `events: 0`).
 *
 * Odpowiedniki tego testu w Node (bez przeglądarki) nie zastąpią go w 100%: sprawdzają `sim.js`,
 * ale nie sprawdzają, czy `index.html` liczy tak samo.
 */
(async () => {
  const out = (o) => { const d = document.createElement("pre"); d.id = "PARITY";
    d.textContent = "PARITY_JSON " + JSON.stringify(o); document.body.appendChild(d); };
  try {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    await sleep(1500);                                  // splash gaśnie po 900 ms, tutorial wchodzi po 1100 ms
    try { dismissTut(); } catch (e) {}
    try { closeModal("tutModal"); } catch (e) {}

    const stage = document.getElementById("stage");
    // Pole gry jest stałe 1280×720 i letterboxowane CSS-em, więc trzeba przeliczyć play-space na
    // współrzędne klienta. Zaokrąglamy do CAŁYCH pikseli CSS, bo dokładnie tak podaje je przeglądarka
    // — inaczej test szedłby na danych ładniejszych niż prawdziwe.
    const toClient = (x, y) => { const r = stage.getBoundingClientRect();
      return { x: Math.round(r.left + x * r.width / 1280), y: Math.round(r.top + y * r.height / 720) }; };
    const fire = (type, c) => { const e = new PointerEvent(type, { pointerId: 1, pointerType: "mouse",
      button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: c.x, clientY: c.y, bubbles: true, cancelable: true });
      (type === "pointerup" ? window : stage).dispatchEvent(e); };

    const yc = 720 * 0.66, len = 720 * 0.62, xa = 640 - len / 2, xb = 640 + len / 2;  // szew PA/butt, 1:1 z sim.js
    const v = 3.2 * 16, dt = 8;                         // tempo docelowe MMA 5 mm [px/s], próbkowanie 125 Hz
    const passes = 2;                                   // 5 mm = root + cap
    for (let pass = 0; pass < passes; pass++) {
      let x = xa, down = false, guard = 0;
      while (x <= xb && guard++ < 4000) {
        const c = toClient(x, yc);
        if (!down) { fire("pointerdown", c); down = true; } else fire("pointermove", c);
        await sleep(dt);
        x += v * dt / 1000;
        // MMA wypala elektrodę w trakcie ściegu — gracz musi ją wymienić, więc sterownik też
        if (typeof replacing !== "undefined" && replacing) { fire("pointerup", c); down = false; }
      }
      fire("pointerup", toClient(Math.min(x, xb), yc));  // `end()` sam zbankuje pass albo odpali inspect()
      await sleep(250);
    }
    try { if (!lastReport) inspect(); } catch (e) {}     // gdyby pokrycie nie dobiło 0.9 i inspect nie poszedł sam
    await sleep(200);

    const gameScore = (typeof lastReport !== "undefined" && lastReport) ? lastReport.score : null;
    const round = (typeof rec !== "undefined" && rec) ? rec : null;
    const simRes = round && round.events.length ? ArcSim.simulate(round) : null;
    out({
      ok: true, engine: ArcSim.VERSION,
      stageW: Math.round(stage.getBoundingClientRect().width),
      recRw: round ? round.rw : null,
      events: round ? round.events.length : 0,
      gameScore, simScore: simRes ? simRes.score : null,
      match: simRes ? gameScore === simRes.score : null,   // null = runda nie ruszyła (np. blokada szerokości)
      gameLetter: (typeof lastReport !== "undefined" && lastReport) ? lastReport.letter : null,
      simLetter: simRes ? simRes.letter : null,
      proof: (typeof buildProof === "function") ? buildProof() : null,
    });
  } catch (err) { out({ ok: false, error: String(err && err.stack || err) }); }
})();
