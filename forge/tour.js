(function () {
  var rooms = {
    hall: {
      vid: "hall.mp4", still: "hall.jpg",
      line: "this is the floor. pick a door. i'll talk, then you walk.",
      href: null
    },
    arc: {
      vid: "arc.mp4", still: "arc.jpg",
      line: "welding bay. mig, tig, mma. you don't watch — you hold the torch.",
      href: "/arc/"
    },
    quote: {
      vid: "quote.mp4", still: "quote.jpg",
      line: "scrap has a price. i count, you weld.",
      href: "/arcquote/"
    },
    relics: {
      vid: "relics.mp4", still: "relics.jpg",
      line: "what didn't burn. genesis on the shelf.",
      href: "/relics/"
    },
    docs: {
      vid: "docs.mp4", still: "docs.jpg",
      line: "one mint. the rest is scrap. no claim page — nobody here asks you to sign anything. the door is open both ways, but the ones who walk in, they stay.",
      href: "/docs/"
    },
    demo: {
      vid: "demo.mp4", still: "demo.jpg",
      line: "the yard. play if you want. it's still a prototype.",
      href: "/demo/"
    },
    drop: {
      vid: "drop.mp4", still: "drop.jpg",
      line: "drops come from the welder. no claim page. ever.",
      href: "/airdrop/"
    },
    shift: {
      vid: "hall.mp4", still: "hall.jpg",
      line: "that's me. night shift. i keep the fire.",
      href: "/shift/"
    },
    origin: {
      vid: "origin.mp4", still: "origin.jpg",
      line: "he struck the first arc — and never took his hand off it. every weld, every drop goes through the welder. i'm the night shift. the forge is never left alone.",
      href: "/przemsas/",
      hrefLabel: "the welder",
      href2: "/docs/",
      href2Label: "the mint"
    }
  };

  // Wersja zasobow — podbij, gdy podmienisz ktorykolwiek mp4/jpg w tym folderze.
  // Bez tego przegladarka trzyma stary plik pod tym samym adresem.
  var V = "?v=12";

  var overlay = document.getElementById("room");
  var vid = document.getElementById("roomVid");
  var still = document.getElementById("roomStill");
  var line = document.getElementById("roomLine");
  var enter = document.getElementById("roomEnter");
  var enter2 = document.getElementById("roomEnter2");
  var back = document.getElementById("roomBack");

  function openRoom(id) {
    var r = rooms[id];
    if (!r) return;
    line.textContent = r.line;
    if (r.href) {
      enter.href = r.href;
      enter.style.display = "";
      enter.textContent = r.hrefLabel || "enter";
    } else {
      enter.style.display = "none";
    }
    if (r.href2) {
      enter2.href = r.href2;
      enter2.style.display = "";
      enter2.textContent = r.href2Label || "enter";
    } else {
      enter2.style.display = "none";
    }
    ustawKadr(r.pion);
    still.src = r.still + V;
    still.style.display = "block";
    vid.style.display = "none";
    vid.removeAttribute("src");
    overlay.classList.add("on");
    vid.src = r.vid + V;
    vid.oncanplay = function () {
      still.style.display = "none";
      vid.style.display = "block";
      vid.muted = false;
      var p = vid.play();
      if (p && p.catch) p.catch(function () {
        vid.muted = true;
        vid.play().catch(function () {});
      });
    };
  }

  function closeRoom() {
    overlay.classList.remove("on");
    try { vid.pause(); } catch (e) {}
    vid.removeAttribute("src");
  }

  // Klipy poziome wypelniaja ekran (cover). Pionowe pokazujemy w CALOSCI (contain) —
  // inaczej cover rozciaga je na szerokosc i zostaje mocno powiekszony wycinek.
  // Ustawiane synchronicznie przy otwarciu pokoju, nie po zdarzeniu ladowania.
  function ustawKadr(pion) {
    // Klasa na kontenerze zamiast stylu inline — regula siedzi w tour.css.
    if (pion) { overlay.classList.add("pion"); }
    else { overlay.classList.remove("pion"); }
    vid.style.transform = "none";
    still.style.transform = "none";
  }

  // Gdy film nie wstanie (siec, kodek, brak pliku) — zostaje kadr, zamiast pustej ramki.
  vid.addEventListener("error", function () {
    vid.style.display = "none";
    still.style.display = "block";
  });

  document.querySelectorAll("[data-room]").forEach(function (el) {
    el.addEventListener("click", function () { openRoom(el.getAttribute("data-room")); });
  });
  back.addEventListener("click", closeRoom);
  // Kotwica w adresie otwiera konkretny pokoj: /forge/#origin
  var start = (location.hash || "").replace("#", "");
  openRoom(rooms[start] ? start : "hall");
})();
