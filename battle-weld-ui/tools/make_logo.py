"""Generator logo BATTLE WELD (SVG, litery jako ksztalty — bez zaleznosci od fontu)."""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

FONTS = "/mnt/d/GorWeld/arc/fonts/"
OUT = sys.argv[1]

def text_paths(font_file, text, size, x0, baseline, tracking=0.0):
    """Zwraca (lista sciezek SVG po literze, szerokosc) dla tekstu w zadanym rozmiarze."""
    font = TTFont(FONTS + font_file)
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    s = size / upm
    x = x0
    paths = []
    for ch in text:
        if ch == " ":
            x += font["hmtx"]["space"][0] * s + tracking
            continue
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        tpen = TransformPen(pen, (s, 0, 0, -s, x, baseline))
        gs[name].draw(tpen)
        paths.append(pen.getCommands())
        x += font["hmtx"][name][0] * s + tracking
    return paths, x - x0 - tracking

def measure(font_file, text, size, tracking=0.0):
    return text_paths(font_file, text, size, 0, 0, tracking)[1]

def cap_height(font_file, size):
    font = TTFont(FONTS + font_file)
    gs = font.getGlyphSet()
    bp = BoundsPen(gs)
    gs[font.getBestCmap()[ord("H")]].draw(bp)
    return bp.bounds[3] * size / font["head"].unitsPerEm

def build(with_tagline=True):
    W = 1200
    DISPLAY = "big-shoulders-display-latin.woff2"
    MONO = "chivo-mono-latin.woff2"
    size = 230
    track = 6
    gap = 46
    w_battle = measure(DISPLAY, "BATTLE", size, track)
    w_weld = measure(DISPLAY, "WELD", size, track)
    total = w_battle + gap + w_weld
    x0 = (W - total) / 2
    cap = cap_height(DISPLAY, size)
    top_pad = 70
    baseline = top_pad + cap
    battle, _ = text_paths(DISPLAY, "BATTLE", size, x0, baseline, track)
    weld, _ = text_paths(DISPLAY, "WELD", size, x0 + w_battle + gap, baseline, track)
    # iskra nad srodkiem litery W
    w_font = TTFont(FONTS + DISPLAY)
    w_adv = w_font["hmtx"][w_font.getBestCmap()[ord("W")]][0] * size / w_font["head"].unitsPerEm
    spark_x = x0 + w_battle + gap + w_adv / 2
    spark_y = top_pad - 16
    H = int(baseline + 40 + (70 if with_tagline else 0))

    tag_svg = ""
    if with_tagline:
        tag = "SAME TASK · SAME RULES · ONE VERDICT"
        tsize = 30
        ttrack = 7
        tw = measure(MONO, tag, tsize, ttrack)
        tpaths, _ = text_paths(MONO, tag, tsize, (W - tw) / 2, baseline + 82, ttrack)
        tag_svg = '<g fill="#a7aeb3">' + "".join(f'<path d="{d}"/>' for d in tpaths) + "</g>"
        # cienkie spoiny po bokach hasla
        ly = baseline + 71
        tag_svg += (f'<path d="M{(W - tw) / 2 - 104:.1f} {ly}h80M{(W + tw) / 2 + 24:.1f} {ly}h80" '
                    'stroke="#e8b44a" stroke-width="3" stroke-linecap="round" opacity=".75"/>')

    # spoina (sciegi) nad literami — od poczatku BATTLE do konca WELD
    bead = []
    bx, bend, by = x0 + 8, x0 + total - 8, top_pad - 16
    i = 0
    while bx < bend:
        hot = abs(bx - spark_x) < 150
        fill = "url(#beadHot)" if hot else "url(#beadCold)"
        bead.append(f'<ellipse cx="{bx:.1f}" cy="{by}" rx="9" ry="6.5" fill="{fill}" stroke="#0e0f10" stroke-width="1.6"/>')
        bx += 11
        i += 1

    rays = []
    import math
    for k in range(12):
        a = math.radians(k * 30 + 15)
        r1, r2 = 16, 46 + (14 if k % 2 else 0)
        rays.append(f'<path d="M{spark_x + r1 * math.cos(a):.1f} {spark_y + r1 * math.sin(a):.1f}L{spark_x + r2 * math.cos(a):.1f} {spark_y + r2 * math.sin(a):.1f}"/>')

    def letters(paths, fill_id, rim):
        d = "".join(f'<path d="{p}"/>' for p in paths)
        return (f'<g class="out">{d}</g>'
                f'<g fill="url(#{fill_id})">{d}</g>'
                f'<g fill="url(#bevel)" style="mix-blend-mode:screen">{d}</g>'
                f'<g fill="none" stroke="{rim}" stroke-width="2.2" stroke-linejoin="round" opacity=".55">{d}</g>')

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="BATTLE WELD{' — Same task · Same rules · One verdict' if with_tagline else ''}">
<title>BATTLE WELD</title>
<defs>
<linearGradient id="steel" x1="0" y1="{top_pad}" x2="0" y2="{baseline}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#f3f5f6"/><stop offset=".42" stop-color="#c3c9ce"/><stop offset=".5" stop-color="#7b838a"/><stop offset="1" stop-color="#3d4246"/></linearGradient>
<linearGradient id="ember" x1="0" y1="{top_pad}" x2="0" y2="{baseline}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffe2a8"/><stop offset=".4" stop-color="#ffb347"/><stop offset=".55" stop-color="#ff6a10"/><stop offset="1" stop-color="#9c3206"/></linearGradient>
<linearGradient id="bevel" x1="0" y1="{top_pad}" x2="0" y2="{baseline}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".18" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="beadCold" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#e3e7ea"/><stop offset="1" stop-color="#5a6066"/></radialGradient>
<radialGradient id="beadHot" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff1cf"/><stop offset=".5" stop-color="#ffb347"/><stop offset="1" stop-color="#c2410c"/></radialGradient>
<radialGradient id="flash"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#ffe9b8"/><stop offset=".6" stop-color="#ff6a10" stop-opacity=".55"/><stop offset="1" stop-color="#ff6a10" stop-opacity="0"/></radialGradient>
<filter id="glow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<style>.out path{{fill:#0e0f10;stroke:#0e0f10;stroke-width:16;stroke-linejoin:round}}</style>
</defs>
<g>{letters(battle, "steel", "#7b838a")}</g>
<g filter="url(#glow)">{letters(weld, "ember", "#ffb347")}</g>
<g>{"".join(bead)}</g>
<circle cx="{spark_x:.1f}" cy="{spark_y}" r="64" fill="url(#flash)"/>
<g stroke="#ffd28a" stroke-width="3" stroke-linecap="round">{"".join(rays)}</g>
<circle cx="{spark_x:.1f}" cy="{spark_y}" r="9" fill="#fff"/>
{tag_svg}
</svg>
'''
    return svg

open(OUT + "/battle-weld-logo.svg", "w").write(build(True))
open(OUT + "/battle-weld-wordmark.svg", "w").write(build(False))
print("ok")
