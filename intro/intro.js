(function () {
  var root = document.getElementById("forge-intro");
  if (!root) return;

  var vid = document.getElementById("fiFilm");
  var hit = document.getElementById("fiHit");
  var skip = document.getElementById("fiSkip");
  var hint = document.getElementById("fiHint");

  // sessionStorage rzuca wyjatkiem w trybie prywatnym i przy zablokowanych danych witryny.
  function seen() {
    try { return sessionStorage.getItem("gw-intro") === "1"; } catch (e) { return false; }
  }
  function remember() {
    try { sessionStorage.setItem("gw-intro", "1"); } catch (e) {}
  }

  var skipQ = /(?:^|[?&])skipIntro=1(?:&|$)/.test(location.search);
  var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (skipQ || calm || seen()) {
    done(true);
    return;
  }

  document.body.classList.add("fi-lock");

  function playFilm() {
    if (!vid) return done(false);
    root.classList.add("is-playing");
    if (hint) hint.hidden = true;
    vid.muted = false;
    var p = vid.play();
    if (p && p.catch) {
      p.catch(function () {
        // Przegladarka odmowila dzwieku — lecimy bez niego zamiast zostawiac czarny ekran.
        vid.muted = true;
        var q = vid.play();
        if (q && q.catch) q.catch(function () { done(false); });
      });
    }
  }

  function done(instant) {
    remember();
    document.body.classList.remove("fi-lock");
    if (vid) { try { vid.pause(); } catch (e) {} }
    if (instant) { root.remove(); return; }
    root.classList.add("is-out");
    setTimeout(function () { root.remove(); }, 950);
  }

  if (hit) hit.addEventListener("click", playFilm);
  if (vid) {
    vid.addEventListener("ended", function () { done(false); });
    // Brak pliku, blad sieci albo kodeka — nie wiezimy nikogo za czarna plansza.
    vid.addEventListener("error", function () { done(false); });
  }
  if (skip) skip.addEventListener("click", function () { done(false); });
})();
