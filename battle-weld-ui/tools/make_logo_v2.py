"""Logo BATTLE WELD v2 — mocniejsze: wytloczenie 3D, chrom, roztopione WELD, plyta z nitami,
spoina z nalotem cieplnym, iskry. Litery jako ksztalty (bez zaleznosci od fontu)."""
import sys, math, random
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

FONTS = "/mnt/d/GorWeld/arc/fonts/"
OUT = sys.argv[1]
DISPLAY = "big-shoulders-display-latin.woff2"
MONO = "chivo-mono-latin.woff2"

def text_paths(font_file, text, size, x0, baseline, tracking=0.0):
    font = TTFont(FONTS + font_file); gs = font.getGlyphSet(); cmap = font.getBestCmap()
    s = size / font["head"].unitsPerEm; x = x0; paths = []
    for ch in text:
        if ch == " ":
            x += font["hmtx"]["space"][0] * s + tracking; continue
        name = cmap[ord(ch)]; pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (s, 0, 0, -s, x, baseline)))
        paths.append(pen.getCommands()); x += font["hmtx"][name][0] * s + tracking
    return paths, x - x0 - tracking

def measure(f, t, size, tr=0.0): return text_paths(f, t, size, 0, 0, tr)[1]

def cap_height(f, size):
    font = TTFont(FONTS + f); gs = font.getGlyphSet(); bp = BoundsPen(gs)
    gs[font.getBestCmap()[ord("H")]].draw(bp); return bp.bounds[3] * size / font["head"].unitsPerEm

def build(with_tagline=True, seed=7):
    rnd = random.Random(seed)
    W = 1200
    size, track, gap = 236, 4, 40
    wb, ww = measure(DISPLAY, "BATTLE", size, track), measure(DISPLAY, "WELD", size, track)
    total = wb + gap + ww
    x0 = (W - total) / 2 + 6
    cap = cap_height(DISPLAY, size)
    top = 92
    base = top + cap
    battle, _ = text_paths(DISPLAY, "BATTLE", size, x0, base, track)
    weld, _ = text_paths(DISPLAY, "WELD", size, x0 + wb + gap, base, track)
    f = TTFont(FONTS + DISPLAY)
    w_adv = f["hmtx"][f.getBestCmap()[ord("W")]][0] * size / f["head"].unitsPerEm
    sx, sy = x0 + wb + gap + w_adv / 2 - 6, top - 26
    plate_y1, plate_y2 = top - 40, base + 34
    H = int(plate_y2 + (96 if with_tagline else 24))
    skew = -7  # stopnie — lekkie pochylenie w prawo
    cx = W / 2

    def group(paths): return "".join(f'<path d="{p}"/>' for p in paths)
    B, Wd = group(battle), group(weld)

    # wytloczenie 3D: warstwy przesuniete w dol-prawo
    depth = ""
    for i in range(7, 0, -1):
        shade = 16 + i * 3
        depth += f'<g transform="translate({i * 1.5:.1f},{i * 2.1:.1f})" fill="rgb({shade},{shade + 2},{shade + 4})">{B}</g>'
        hot = (70 + i * 10, 24 + i * 3, 8)
        depth += f'<g transform="translate({i * 1.5:.1f},{i * 2.1:.1f})" fill="rgb{hot}">{Wd}</g>'

    # plyta pod napisem (sciete narozniki) + nity
    px1, px2 = x0 - 46, x0 + total + 46
    n = 22
    plate = (f'M{px1 + n} {plate_y1}H{px2 - n}L{px2} {plate_y1 + n}V{plate_y2 - n}L{px2 - n} {plate_y2}'
             f'H{px1 + n}L{px1} {plate_y2 - n}V{plate_y1 + n}Z')
    rivets = ""
    for rx in (px1 + 26, px2 - 26):
        for ry in (plate_y1 + 22, plate_y2 - 22):
            rivets += f'<circle cx="{rx}" cy="{ry}" r="7" fill="url(#rivet)" stroke="#08090a" stroke-width="1.5"/>'

    # spoina na gornej krawedzi plyty z nalotem cieplnym (od srodka: zar -> slomka -> braz -> granat -> stal)
    bead = ""
    bx = px1 + 40
    while bx < px2 - 40:
        d = abs(bx - sx)
        if d < 40: c = "url(#bHot)"
        elif d < 120: c = "url(#bStraw)"
        elif d < 220: c = "url(#bBronze)"
        elif d < 330: c = "url(#bBlue)"
        else: c = "url(#bSteel)"
        bead += f'<ellipse cx="{bx:.1f}" cy="{plate_y1}" rx="10" ry="7" fill="{c}" stroke="#08090a" stroke-width="1.4"/>'
        bx += 11.5

    # iskry: krotkie kreski rozlatujace sie od luku
    sparks = ""
    for _ in range(46):
        a = rnd.uniform(-math.pi * 0.95, -math.pi * 0.05) if rnd.random() < .75 else rnd.uniform(0, math.pi)
        r1 = rnd.uniform(20, 70); r2 = r1 + rnd.uniform(10, 46)
        w = rnd.uniform(1.2, 3.2)
        col = rnd.choice(["#fff4d6", "#ffd27a", "#ffb347", "#ff8a1f"])
        sparks += (f'<path d="M{sx + r1 * math.cos(a):.1f} {sy + r1 * math.sin(a):.1f}L{sx + r2 * math.cos(a):.1f} '
                   f'{sy + r2 * math.sin(a):.1f}" stroke="{col}" stroke-width="{w:.1f}" stroke-linecap="round" opacity="{rnd.uniform(.55, 1):.2f}"/>')

    tag = ""
    if with_tagline:
        t = "SAME TASK · SAME RULES · ONE VERDICT"
        tsize, ttr = 28, 8
        tw = measure(MONO, t, tsize, ttr)
        ty = plate_y2 + 58
        sx1, sx2 = (W - tw) / 2 - 36, (W + tw) / 2 + 36
        tag = (f'<path d="M{sx1 + 14} {ty - 36}H{sx2 - 14}L{sx2} {ty - 22}V{ty + 6}L{sx2 - 14} {ty + 20}H{sx1 + 14}L{sx1} {ty + 6}V{ty - 22}Z" '
               f'fill="url(#strip)" stroke="#3d4246" stroke-width="1.5"/>')
        tp, _ = text_paths(MONO, t, tsize, (W - tw) / 2, ty, ttr)
        tag += f'<g fill="#e8b44a">{"".join(f"<path d=\"{p}\"/>" for p in tp)}</g>'

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="BATTLE WELD{' — Same task · Same rules · One verdict' if with_tagline else ''}">
<title>BATTLE WELD</title>
<defs>
<linearGradient id="plate" x1="0" y1="{plate_y1}" x2="0" y2="{plate_y2}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2c3034"/><stop offset=".5" stop-color="#191b1d"/><stop offset="1" stop-color="#0e0f10"/></linearGradient>
<linearGradient id="strip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22262a"/><stop offset="1" stop-color="#0e0f10"/></linearGradient>
<linearGradient id="chrome" x1="0" y1="{top}" x2="0" y2="{base}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#dfe4e8"/><stop offset=".47" stop-color="#8a9299"/><stop offset=".5" stop-color="#5b6268"/><stop offset=".53" stop-color="#e9edf0"/><stop offset=".8" stop-color="#9aa2a9"/><stop offset="1" stop-color="#4a5056"/></linearGradient>
<linearGradient id="molten" x1="0" y1="{top}" x2="0" y2="{base}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fffbe8"/><stop offset=".28" stop-color="#ffd27a"/><stop offset=".48" stop-color="#ff9a2a"/><stop offset=".52" stop-color="#ff6a10"/><stop offset=".8" stop-color="#d4470a"/><stop offset="1" stop-color="#7a2304"/></linearGradient>
<linearGradient id="gloss" x1="0" y1="{top}" x2="0" y2="{base}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".12" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="rivet" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e3e7ea"/><stop offset=".6" stop-color="#6b7278"/><stop offset="1" stop-color="#2c3034"/></radialGradient>
<radialGradient id="bSteel" cx=".4" cy=".3" r=".75"><stop offset="0" stop-color="#e6eaed"/><stop offset="1" stop-color="#596067"/></radialGradient>
<radialGradient id="bBlue" cx=".4" cy=".3" r=".75"><stop offset="0" stop-color="#b9c8ff"/><stop offset="1" stop-color="#2b3f8f"/></radialGradient>
<radialGradient id="bBronze" cx=".4" cy=".3" r=".75"><stop offset="0" stop-color="#f1c27d"/><stop offset="1" stop-color="#7a4a1c"/></radialGradient>
<radialGradient id="bStraw" cx=".4" cy=".3" r=".75"><stop offset="0" stop-color="#fff0b8"/><stop offset="1" stop-color="#b8892e"/></radialGradient>
<radialGradient id="bHot" cx=".4" cy=".3" r=".75"><stop offset="0" stop-color="#fffbe8"/><stop offset=".5" stop-color="#ffb347"/><stop offset="1" stop-color="#d4470a"/></radialGradient>
<radialGradient id="flash"><stop offset="0" stop-color="#fff"/><stop offset=".2" stop-color="#fff4d6"/><stop offset=".5" stop-color="#ff8a1f" stop-opacity=".6"/><stop offset="1" stop-color="#ff6a10" stop-opacity="0"/></radialGradient>
<radialGradient id="heat" cx="{(sx - px1) / (px2 - px1):.3f}" cy="0" r=".42"><stop offset="0" stop-color="#ff6a10" stop-opacity=".38"/><stop offset="1" stop-color="#ff6a10" stop-opacity="0"/></radialGradient>
<filter id="scratch" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency="0.9 0.04" numOctaves="2" seed="4" result="n"/>
<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.2 1.25" result="lines"/>
<feComposite in="lines" in2="SourceGraphic" operator="in"/></filter>
<filter id="glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="drop" x="-5%" y="-10%" width="110%" height="130%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000" flood-opacity=".7"/></filter>
</defs>
<path d="{plate}" fill="url(#plate)" stroke="#3d4246" stroke-width="2" filter="url(#drop)"/>
<path d="{plate}" fill="url(#heat)"/>
<path d="{plate}" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="1" transform="translate(0,3)"/>
{rivets}
{bead}
<g transform="translate({cx},{(top + base) / 2}) skewX({skew}) translate({-cx},{-(top + base) / 2})">
{depth}
<g fill="none" stroke="#08090a" stroke-width="11" stroke-linejoin="round">{B}{Wd}</g>
<g fill="url(#chrome)">{B}</g>
<g fill="url(#chrome)" filter="url(#scratch)" opacity=".35">{B}</g>
<g filter="url(#glow)"><g fill="url(#molten)">{Wd}</g></g>
<g fill="url(#gloss)">{B}{Wd}</g>
<g fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="1.6" stroke-linejoin="round">{B}</g>
<g fill="none" stroke="#fff1c4" stroke-opacity=".45" stroke-width="1.6" stroke-linejoin="round">{Wd}</g>
</g>
<circle cx="{sx:.1f}" cy="{sy}" r="80" fill="url(#flash)"/>
<g>{sparks}</g>
<circle cx="{sx:.1f}" cy="{sy}" r="11" fill="#fff"/>
{tag}
</svg>
'''

open(OUT + "/battle-weld-logo-v2.svg", "w").write(build(True))
open(OUT + "/battle-weld-wordmark-v2.svg", "w").write(build(False))
print("ok")
