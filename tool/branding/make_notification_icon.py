"""Monochrome notification icons derived from the brand mark.

Reads (never writes) `assets/branding/otaku-square-mark.png` and produces the
white-on-transparent silhouette of its six squares:

  android/app/src/main/res/drawable-<density>/ic_stat_otaku.png  (24dp)
  admin/public/otaku-notification-badge.png                      (96 px)

Android draws a notification small icon — and Chrome a web-push badge — from
the image's ALPHA only. The full-colour mark has an opaque ground, so used as
is it renders as a plain white square. The squares are separated from the
ground by colour: a pixel belongs to the art when it is nearer to one of the
six brand colours (`lib/core/design_system/tokens/app_colors.dart`) than to
the ground.

Run from the repo root:  python3 -I tool/branding/make_notification_icon.py
Deterministic: the same mark always yields byte-identical PNGs.
"""

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
MARK = ROOT / "assets/branding/otaku-square-mark.png"

BRAND = [  # magenta, violet, blue, indigo, purple, gold
    (0xF0, 0x45, 0x9B), (0x8B, 0x5C, 0xF6), (0x4F, 0xA3, 0xF0),
    (0x3B, 0x2F, 0xA8), (0x6D, 0x3B, 0xC0), (0xF6, 0xC1, 0x44),
]

# 24dp canvas, 20dp live area (Material small-icon keyline: 2dp padding).
DENSITIES = {"mdpi": 24, "hdpi": 36, "xhdpi": 48, "xxhdpi": 72, "xxxhdpi": 96}
BADGE_PX = 96


def _dist2(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b))


def silhouette() -> Image.Image:
    """Binary art mask (L, 0/255) at the mark's own resolution."""
    mark = Image.open(MARK).convert("RGB")
    w, h = mark.size
    # The ground is a radial gradient: sample it per pixel from a heavy blur of
    # the corners' tone would be overkill — its brightest point stays far
    # darker than every brand colour, so a fixed reference works.
    grounds = [(0x0B, 0x07, 0x18), (0x16, 0x10, 0x2E), (0x24, 0x1A, 0x54)]
    px = mark.load()
    mask = Image.new("L", (w, h), 0)
    out = mask.load()
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            brand = min(_dist2(c, b) for b in BRAND)
            ground = min(_dist2(c, g) for g in grounds)
            out[x, y] = 255 if brand < ground else 0
    # Drop isolated speckles from anti-aliased ground pixels.
    return mask.filter(ImageFilter.MedianFilter(5))


def render(mask: Image.Image, size: int, live: float) -> Image.Image:
    """White glyph, alpha = mask, art fitted (aspect kept) inside `live`·size."""
    box = mask.getbbox()
    art = mask.crop(box)
    target = live * size
    scale = target / max(art.size)
    # Supersample: scale at 8x, then down with a box filter for clean edges.
    ss = 8
    big = art.resize(
        (max(1, round(art.width * scale * ss)), max(1, round(art.height * scale * ss))),
        Image.LANCZOS,
    )
    canvas = Image.new("L", (size * ss, size * ss), 0)
    canvas.paste(big, ((size * ss - big.width) // 2, (size * ss - big.height) // 2))
    alpha = canvas.resize((size, size), Image.BOX)
    icon = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    icon.putalpha(alpha)
    return icon


def main() -> None:
    mask = silhouette()
    for density, size in DENSITIES.items():
        out = ROOT / f"android/app/src/main/res/drawable-{density}/ic_stat_otaku.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        render(mask, size, live=20 / 24).save(out, optimize=True)
        print(out.relative_to(ROOT))
    badge = ROOT / "admin/public/otaku-notification-badge.png"
    render(mask, BADGE_PX, live=0.8).save(badge, optimize=True)
    print(badge.relative_to(ROOT))


if __name__ == "__main__":
    main()
