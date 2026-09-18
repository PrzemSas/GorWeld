(function () {
  // Film Veldy jest atrakcja, nie bramka: strona startuje normalnie,
  // a intro odtwarza sie dopiero po swiadomym kliknieciu w sekcji Forge.
  var root = document.getElementById("forge-intro");
  var open = document.getElementById("fiOpen");
  if (!root || !open) return;

  var vid = document.getElementById("fiFilm");
  var close = document.getElementById("fiClose");
  var lastFocus = null;

  function show() {
    lastFocus = document.activeElement;
    root.hidden = false;
    document.body.classList.add("fi-lock");
    if (close) close.focus();
    play();
  }

  function play() {
    if (!vid) return hide();
    root.classList.add("is-playing");
    vid.currentTime = 0;
    vid.muted = false;
    var p = vid.play();
    if (p && p.catch) {
      p.catch(function () {
        // Przegladarka odmowila dzwieku — lecimy bez niego zamiast zostawiac czarny ekran.
        vid.muted = true;
        var q = vid.play();
        if (q && q.catch) q.catch(hide);
      });
    }
  }

  function hide() {
    document.body.classList.remove("fi-lock");
    if (vid) { try { vid.pause(); } catch (e) {} }
    root.classList.add("is-out");
    setTimeout(function () {
      root.hidden = true;
      root.classList.remove("is-out", "is-playing");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }, 700);
  }

  open.addEventListener("click", show);
  if (close) close.addEventListener("click", hide);
  // Koniec filmu zostawia czlowieka tam, gdzie byl — zadnego przerzucania na /forge/.
  if (vid) {
    vid.addEventListener("ended", hide);
    // Brak pliku, blad sieci albo kodeka — nie wiezimy nikogo za czarna plansza.
    vid.addEventListener("error", hide);
  }
  document.addEventListener("keydown", function (e) {
    if (!root.hidden && (e.key === "Escape" || e.key === "Esc")) hide();
  });
})();
