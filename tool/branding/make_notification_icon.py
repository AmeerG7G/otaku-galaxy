"""Monochrome notification icon: a simplified glyph inspired by the brand mark.

Produces a white-on-transparent glyph of three rounded squares:

  android/app/src/main/res/drawable-<density>/ic_stat_otaku.png  (24dp)
  admin/public/otaku-notification-badge.png                      (96 px)

Android draws a notification small icon — and Chrome a web-push badge — from
the image's ALPHA only, so the full-colour mark (opaque ground) cannot be used
as is. A silhouette of the mark's six squares was tried and rejected: at 24 px
the squares merge, or the two smallest shrink to 2–3 px and stop reading.

This glyph keeps the mark's idea — a large tilted rounded square leading a
trail that bends down to the right — with three squares sized and spaced for a
24 px canvas (owner-approved "concept B", 2026-11-15). Geometry is defined on a
24-unit grid (1 unit = 1 px at mdpi), inside the 20-unit live area (2..22):
every square is at least 4.5 units and every pair is at least 2 units apart, so
all three stay separate shapes at every density.

The brand mark (`assets/branding/otaku-square-mark.png`) and the launcher
icons are not read or touched; only the corner radius (22% of the side) and the
arc follow the mark.

Run from the repo root:  python3 -I tool/branding/make_notification_icon.py
Deterministic: pure geometry, byte-identical PNGs on every run.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]

# (centre x, centre y, side, rotation in degrees) on the 24-unit grid.
SQUARES = [
    (8.0, 8.0, 9.0, 20),  # lead square, tilted like the mark's largest
    (18.0, 9.0, 5.5, 0),
    (17.0, 18.0, 4.5, 25),
]
CORNER = 0.22  # corner radius as a fraction of the side, as in the mark
GRID = 24.0
SUPERSAMPLE = 32

DENSITIES = {"mdpi": 24, "hdpi": 36, "xhdpi": 48, "xxhdpi": 72, "xxxhdpi": 96}
BADGE_PX = 96


def _rounded_square(cx, cy, side, rot_deg, arc_steps=10):
    half, r = side / 2, side * CORNER
    pts = []
    for sx, sy, start in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = sx * (half - r), sy * (half - r)
        for i in range(arc_steps + 1):
            a = math.radians(start + 90 * i / arc_steps)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    t = math.radians(rot_deg)
    cos_t, sin_t = math.cos(t), math.sin(t)
    return [(cx + x * cos_t - y * sin_t, cy + x * sin_t + y * cos_t) for x, y in pts]


def render(size: int) -> Image.Image:
    """White glyph at `size` px: drawn at 32x, box-filtered down."""
    big = size * SUPERSAMPLE
    alpha = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(alpha)
    k = big / GRID
    for square in SQUARES:
        draw.polygon([(x * k, y * k) for x, y in _rounded_square(*square)], fill=255)
    icon = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    icon.putalpha(alpha.resize((size, size), Image.BOX))
    return icon


def main() -> None:
    for density, size in DENSITIES.items():
        out = ROOT / f"android/app/src/main/res/drawable-{density}/ic_stat_otaku.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        render(size).save(out, optimize=True)
        print(out.relative_to(ROOT))
    badge = ROOT / "admin/public/otaku-notification-badge.png"
    render(BADGE_PX).save(badge, optimize=True)
    print(badge.relative_to(ROOT))


if __name__ == "__main__":
    main()
