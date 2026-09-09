#!/usr/bin/env python3
"""
Generate every Vistora launcher and splash asset from one square source logo.

    python3 scripts/generate-android-icons.py assets/vistora-logo.png

The source is expected to be the full lock-up -- the V mark above the "VISTORA"
wordmark above the tagline -- on a flat dark backdrop, at 1024px square or larger.

What gets written
-----------------
android/app/src/main/res/
  mipmap-{mdpi..xxxhdpi}/ic_launcher.png             legacy square icon (below API 26)
  mipmap-{mdpi..xxxhdpi}/ic_launcher_round.png       legacy round icon
  mipmap-{mdpi..xxxhdpi}/ic_launcher_foreground.png  adaptive foreground, API 26+
  mipmap-{mdpi..xxxhdpi}/ic_launcher_monochrome.png  themed-icon silhouette, API 33+
  drawable-{mdpi..xxxhdpi}/splash_icon.png           cold-start splash, both phases
  drawable-xhdpi/banner.png                          Android TV banner, 320x180
  drawable-xxhdpi/banner.png                         the same at 480x270
  values/ic_launcher_background.xml                  sampled backdrop colour

Two design decisions worth knowing
----------------------------------
1. The launcher icon and the splash carry the V mark ALONE. At 48dp the wordmark is
   a smudge, and the API 31+ splash slot is a circle that would clip it. Only the TV
   banner, which is 16:9 and viewed from across a room, gets the full lock-up.

2. The source's flat backdrop is knocked out to transparency rather than kept. An
   adaptive icon's foreground layer must be transparent -- the launcher masks it into
   a circle or squircle and composites it over the background layer -- and the splash
   icon has to sit on the app's own background colour without showing a seam.
   Alpha ramps from the backdrop over a narrow distance band, which preserves the
   artwork's anti-aliased edges instead of hard-clipping them.

The mark is located automatically: the backdrop colour is sampled from the source's
corners, the non-backdrop pixels are projected onto the vertical axis, and the
topmost contiguous band of rows is taken as the mark. In this lock-up that band is
the V, cleanly separated from the wordmark by a gap. Overrides:

  --mark full          put the whole lock-up on the launcher icon too
  --crop L,T,R,B       set the mark box by hand, as fractions of the image
  --debug              also write a montage of what was detected, for eyeballing
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import xml.dom.minidom

from PIL import Image, ImageChops, ImageDraw

# Android density buckets: dp -> px multiplier.
DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}

LEGACY_DP = 48    # legacy ic_launcher canvas
ADAPTIVE_DP = 108  # adaptive icon canvas

# Share of the 108dp adaptive canvas the mark may occupy. The system reserves
# everything outside the centre 66/108 (0.611) for masking and parallax, so stay
# just inside that.
ADAPTIVE_MARK_SCALE = 0.58
# Legacy icons are drawn unmasked, so the mark can sit closer to the edge.
LEGACY_MARK_SCALE = 0.78
# The legacy *round* icon is its own bitmap rather than the square one behind a
# circular mask: a circle inscribed in the square clips the V's outer arms, so the
# mark is composited smaller to begin with.
LEGACY_ROUND_MARK_SCALE = 0.62
# Share of the 320x180 TV banner the lock-up may fill.
BANNER_LOGO_SCALE = 0.82
# Splash icon geometry, dictated by the Android 12+ platform splash screen and NOT
# free to choose. From API 31 the system draws its own splash from
# windowSplashScreenAnimatedIcon before the app gets control, rendering that
# drawable on a 288dp canvas and expecting the artwork to stay inside the inner
# 192dp circle (192/288 = 0.667) so its reveal animation and any OEM mask have
# room. We generate at exactly that geometry and then reuse the SAME drawable for
# the pre-API-31 window background, so every phase of startup draws identical
# pixels in an identical place. That is the whole anti-flicker strategy: not
# careful timing, but leaving nothing that could differ.
SPLASH_ICON_DP = 288
SPLASH_ICON_SCALE = 0.64
# The platform's branding slot, which is where the name and the motto go on API 31+.
# 200x80dp is the documented size and, like the icon slot, is not ours to choose --
# the platform pins this image to the bottom of its own splash. The wordmark plus
# tagline is a wide, short block, so it fits the width and lands well under 80dp.
SPLASH_BRANDING_DP = (200, 80)
# The full lock-up, for the pre-API-31 window background where we own the whole
# screen and can show mark, name and motto together at a comfortable size.
SPLASH_LOCKUP_DP = 280

RES = Path("android/app/src/main/res")

# Channel distance from the backdrop at which a pixel is fully opaque artwork.
# Below KNOCKOUT_LO it is fully transparent; between the two, alpha ramps, which is
# what keeps anti-aliased edges smooth.
KNOCKOUT_LO = 10
KNOCKOUT_HI = 44


def sample_background(img: Image.Image) -> tuple[int, int, int, int]:
    """Backdrop colour, as the per-channel median of the four corner pixels."""
    w, h = img.size
    inset = max(1, min(w, h) // 100)
    corners = [
        img.getpixel((inset, inset)),
        img.getpixel((w - 1 - inset, inset)),
        img.getpixel((inset, h - 1 - inset)),
        img.getpixel((w - 1 - inset, h - 1 - inset)),
    ]
    out = []
    for ch in range(4):
        vals = sorted(c[ch] for c in corners)
        out.append((vals[1] + vals[2]) // 2)  # median of four = mean of the middle two
    return tuple(out)  # type: ignore[return-value]


def backdrop_distance(img: Image.Image, bg: tuple[int, int, int, int]) -> Image.Image:
    """Greyscale map of how far each pixel is from the backdrop colour.

    The distance is the largest per-channel difference, computed with whole-band
    operations so this stays fast on large sources without numpy.
    """
    dist = None
    for channel, level in zip(img.split()[:3], bg[:3]):
        flat = Image.new("L", img.size, level)
        d = ImageChops.difference(channel, flat)
        dist = d if dist is None else ImageChops.lighter(dist, d)
    assert dist is not None
    return dist


def knockout(img: Image.Image, bg: tuple[int, int, int, int]) -> Image.Image:
    """Replace the flat backdrop with transparency, keeping soft edges soft."""
    if bg[3] < 128:
        return img  # already transparent -- nothing to knock out

    span = max(1, KNOCKOUT_HI - KNOCKOUT_LO)
    ramp = backdrop_distance(img, bg).point(
        lambda d: 0 if d <= KNOCKOUT_LO else min(255, round((d - KNOCKOUT_LO) * 255 / span))
    )
    out = img.copy()
    out.putalpha(ImageChops.multiply(img.getchannel("A"), ramp))
    return out


def row_fill(art: Image.Image) -> list[float]:
    """Fraction of each row that is opaque, from 0.0 to 1.0."""
    column = art.getchannel("A").resize((1, art.height), Image.BOX)
    return [v / 255 for v in column.getdata()]


def row_bands(art: Image.Image) -> list[tuple[int, int]]:
    """Contiguous (top, bottom) row ranges holding a distinct element.

    Two thresholds rather than one. A band may only *start* on a row that is at
    least `core` opaque, which stops a faint glow or a stray anti-aliased pixel from
    registering as an element of its own; once started it *extends* over any row
    with more than `edge` opacity, which keeps thin tapers -- the point of the V --
    attached to the shape they belong to. One threshold cannot do both: set it low
    and glow bridges the mark into the wordmark, set it high and the taper is
    clipped off.
    """
    core, edge = 0.012, 0.0008
    fills = row_fill(art)
    h = len(fills)

    bands: list[tuple[int, int]] = []
    y = 0
    while y < h:
        if fills[y] <= core:
            y += 1
            continue
        top = y
        while top > 0 and fills[top - 1] > edge:
            top -= 1
        bottom = y
        while bottom + 1 < h and fills[bottom + 1] > edge:
            bottom += 1
        if bands and top <= bands[-1][1]:
            bands[-1] = (bands[-1][0], max(bands[-1][1], bottom))
        else:
            bands.append((top, bottom))
        y = bottom + 1

    min_band = max(4, int(h * 0.02))  # discard slivers
    return [b for b in bands if b[1] - b[0] + 1 >= min_band]


def locate(art: Image.Image, mode: str, manual):
    """Return (mark_box, brand_box, full_box).

    mark_box  the V alone, for the launcher icon and the platform splash slot
    brand_box the name and motto together, for the platform's branding slot
    full_box  the whole lock-up, for the TV banner and the pre-31 splash
    """
    full = art.getbbox()
    if full is None:
        sys.exit("The source looks blank -- no artwork found against its backdrop. "
                 "Check that the artwork actually contrasts with its backdrop.")

    def band_box(top, bottom):
        """Tight box around the content between two rows."""
        sub = art.crop((0, top, art.width, bottom + 1)).getbbox()
        return (sub[0], top + sub[1], sub[2], top + sub[3])

    if manual:
        w, h = art.size
        l, t, r, b = manual
        return (round(l * w), round(t * h), round(r * w), round(b * h)), None, full

    if mode == "full":
        return full, None, full

    bands = row_bands(art)
    if len(bands) < 2:
        print("  ! only one element detected -- putting the whole lock-up on the icon")
        return full, None, full

    mark = band_box(*bands[0])
    # Everything below the mark is the name and the motto: one block, kept together
    # so the branding image reads as the designed lock-up rather than two crops.
    brand = band_box(bands[1][0], bands[-1][1])
    print(f"  {len(bands)} elements detected")
    print(f"    mark  = {mark}")
    print(f"    brand = {brand}  (name + motto, {len(bands) - 1} element(s))")
    return mark, brand, full


def fit(art: Image.Image, box_w: float, box_h: float) -> Image.Image:
    """Scale art down (or up) to sit inside box_w x box_h, preserving aspect."""
    ratio = min(box_w / art.width, box_h / art.height)
    size = (max(1, round(art.width * ratio)), max(1, round(art.height * ratio)))
    return art.resize(size, Image.LANCZOS)


def centred(canvas: Image.Image, art: Image.Image, scale: float) -> None:
    """Composite art at `scale` of the canvas's shorter side, dead centre."""
    limit = min(canvas.size) * scale
    art = fit(art, limit, limit)
    canvas.alpha_composite(art, ((canvas.width - art.width) // 2,
                                 (canvas.height - art.height) // 2))


def round_mask(size: int) -> Image.Image:
    """Anti-aliased circular alpha mask, drawn 4x and downsampled."""
    ss = size * 4
    m = Image.new("L", (ss, ss), 0)
    ImageDraw.Draw(m).ellipse((0, 0, ss - 1, ss - 1), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def write_xml(text: str, path: Path) -> None:
    """Write a generated resource file, refusing to emit XML aapt2 would reject.

    The specific trap: XML forbids the string "--" inside a comment body, and aapt2
    enforces it at mergeDebugResources. A prose double-dash in a generated comment
    is easy to write and produces a build failure a long way from its cause, so the
    output is parsed here before it is allowed to land.
    """
    xml.dom.minidom.parseString(text)  # raises if the comment or markup is invalid
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def write(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print(f"  {path}  {img.width}x{img.height}")


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="square source logo (PNG/JPG), 1024px or larger")
    ap.add_argument("--mark", choices=["auto", "full"], default="auto",
                    help="auto (default): only the topmost element, the V, on the "
                         "launcher icon; full: the whole lock-up")
    ap.add_argument("--crop", metavar="L,T,R,B",
                    help="override the mark box, as fractions of the image")
    ap.add_argument("--bg", metavar="#RRGGBB",
                    help="adaptive icon backdrop (default: sampled from the source)")
    ap.add_argument("--splash-bg", metavar="#RRGGBB", default="#0B0D14",
                    help="colour the splash lock-up is composited onto; must match "
                         "colors.background in src/theme/colors.ts (default #0B0D14)")
    ap.add_argument("--debug", action="store_true",
                    help="also write a montage of the detected boxes to /tmp")
    ap.add_argument("--res", default=str(RES), help="Android res/ directory")
    args = ap.parse_args()

    src_path = Path(args.source).expanduser()
    if not src_path.is_file():
        print(f"No such file: {src_path}")
        return 1

    res = Path(args.res)
    if not res.is_dir():
        print(f"Not a res directory: {res} -- run this from the repo root")
        return 1

    img = Image.open(src_path).convert("RGBA")
    print(f"source {src_path}  {img.width}x{img.height}")

    manual = None
    if args.crop:
        parts = [float(v) for v in args.crop.split(",")]
        if len(parts) != 4:
            print("--crop needs four comma-separated fractions: L,T,R,B")
            return 1
        manual = tuple(parts)

    sampled = sample_background(img)
    print("backdrop sampled as #{:02X}{:02X}{:02X}".format(*sampled[:3]))
    art = knockout(img, sampled)

    mark_box, brand_box, full_box = locate(art, args.mark, manual)
    mark, full = art.crop(mark_box), art.crop(full_box)
    brand = art.crop(brand_box) if brand_box else None

    def parse_hex(s, fallback):
        if not s:
            return fallback
        h = s.lstrip("#")
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)

    icon_bg = parse_hex(args.bg, (sampled[0], sampled[1], sampled[2], 255))
    splash_bg = parse_hex(args.splash_bg, (0x0B, 0x0D, 0x14, 255))
    icon_bg_hex = "{:02X}{:02X}{:02X}".format(*icon_bg[:3])

    if args.debug:
        dbg = img.convert("RGB")
        d = ImageDraw.Draw(dbg)
        d.rectangle(full_box, outline=(0, 255, 0), width=max(2, img.width // 300))
        d.rectangle(mark_box, outline=(255, 0, 0), width=max(2, img.width // 300))
        out = Path("/tmp/vistora-icon-detection.png")
        dbg.save(out)
        print(f"  debug montage: {out}  (red = mark, green = full lock-up)")

    print("\nlauncher icons")
    for bucket, mult in DENSITIES.items():
        fg_px = round(ADAPTIVE_DP * mult)

        # Adaptive foreground: transparent canvas, mark inside the safe zone.
        fg = Image.new("RGBA", (fg_px, fg_px), (0, 0, 0, 0))
        centred(fg, mark, ADAPTIVE_MARK_SCALE)
        write(fg, res / f"mipmap-{bucket}" / "ic_launcher_foreground.png")

        # Themed icon (API 33+): the mark's silhouette. The launcher recolours it,
        # so only the alpha channel carries information.
        silhouette = Image.new("RGBA", mark.size, (255, 255, 255, 255))
        silhouette.putalpha(mark.getchannel("A"))
        mono = Image.new("RGBA", (fg_px, fg_px), (0, 0, 0, 0))
        centred(mono, silhouette, ADAPTIVE_MARK_SCALE)
        write(mono, res / f"mipmap-{bucket}" / "ic_launcher_monochrome.png")

        # Legacy square + round icons, for launchers below API 26.
        legacy_px = round(LEGACY_DP * mult)
        legacy = Image.new("RGBA", (legacy_px, legacy_px), icon_bg)
        centred(legacy, mark, LEGACY_MARK_SCALE)
        write(legacy, res / f"mipmap-{bucket}" / "ic_launcher.png")

        rnd = Image.new("RGBA", (legacy_px, legacy_px), icon_bg)
        centred(rnd, mark, LEGACY_ROUND_MARK_SCALE)
        rnd.putalpha(round_mask(legacy_px))
        write(rnd, res / f"mipmap-{bucket}" / "ic_launcher_round.png")

    # Splash icon. Transparent, so whichever layer draws it supplies the colour and
    # the two can never disagree on the backdrop. The mark, not the lock-up: the
    # platform slot is a circle, which would clip a wordmark.
    print("\nsplash icon (API 31+ platform slot)")
    for bucket, mult in DENSITIES.items():
        px = round(SPLASH_ICON_DP * mult)
        canvas = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        centred(canvas, mark, SPLASH_ICON_SCALE)
        write(canvas, res / f"drawable-{bucket}" / "splash_icon.png")

    if brand is not None:
        print("\nsplash branding: name + motto (API 31+ platform slot)")
        bw, bh = SPLASH_BRANDING_DP
        for bucket, mult in DENSITIES.items():
            art_b = fit(brand, bw * mult, bh * mult)
            write(art_b, res / f"drawable-{bucket}" / "splash_branding.png")

    print("\nsplash lock-up (pre-API-31 window background)")
    for bucket, mult in DENSITIES.items():
        w = round(SPLASH_LOCKUP_DP * mult)
        write(fit(full, w, w), res / f"drawable-{bucket}" / "splash_lockup.png")

    print("\nandroid tv banner")
    for bucket, (bw, bh) in {"xhdpi": (320, 180), "xxhdpi": (480, 270)}.items():
        banner = Image.new("RGBA", (bw, bh), icon_bg)
        art_b = fit(full, bw * BANNER_LOGO_SCALE, bh * BANNER_LOGO_SCALE)
        banner.alpha_composite(art_b, ((bw - art_b.width) // 2, (bh - art_b.height) // 2))
        write(banner, res / f"drawable-{bucket}" / "banner.png")

    bgxml = res / "values" / "ic_launcher_background.xml"
    write_xml(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        "    <!--\n"
        "      Backdrop for the adaptive launcher icon: the deep navy the Vistora\n"
        "      logo sits on. Generated by scripts/generate-android-icons.py, which\n"
        "      samples it from the source artwork, so edit the logo, not this value.\n"
        "    -->\n"
        f'    <color name="ic_launcher_background">#FF{icon_bg_hex}</color>\n'
        "</resources>\n",
        bgxml,
    )
    print(f"\n  {bgxml}  #{icon_bg_hex}")
    print(f"  splash composites onto #{'{:02X}{:02X}{:02X}'.format(*splash_bg[:3])} "
          "(from @color/background)")
    print("\nDone. Rebuild with: npm run android")
    return 0


if __name__ == "__main__":
    sys.exit(main())
