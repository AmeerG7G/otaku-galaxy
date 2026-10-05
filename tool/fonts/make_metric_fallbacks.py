#!/usr/bin/env python3
"""Builds the metric-matched Kurdish fallback fonts in fonts/.

Why: Cairo and Tajawal have no ە ێ ڕ ۆ ڵ (Tajawal also lacks ک), so every
Kurdish line falls back to Noto Sans Arabic for those glyphs. Noto's vertical
metrics (ascent 1374 / descent 738 per 1000 em) are taller than Cairo's
(1303 / 571) and far taller than Tajawal's (643 / 357 + 200 line gap), and a
line's box takes the tallest font on it — so a Kurdish line was taller than the
same Arabic line (14px Tajawal: 17px vs 30px; with an explicit `height`, still
~1px per line), and every container holding Kurdish text grew.

What: for each primary family, a copy of Noto Sans Arabic whose line metrics
(hhea, OS/2 typo + win, USE_TYPO_METRICS bit) are copied from that primary
family. Glyph outlines, advances, shaping tables — everything else — are
untouched, and the families are renamed so they can never be mistaken for the
original. The original NotoSansArabic-*.ttf files are inputs only and are never
modified.

Usage (from the repo root, with fontTools installed):
    python3 tool/fonts/make_metric_fallbacks.py

License: Noto Sans Arabic is under the SIL Open Font License 1.1, which permits
modified copies; Noto declares no Reserved Font Name. See
fonts/NotoSansArabic-OFL.txt.
"""

from pathlib import Path

from fontTools.ttLib import TTFont

FONTS = Path(__file__).resolve().parents[2] / "fonts"

# (primary family file that donates the metrics, new family name, file prefix)
TARGETS = [
    ("Cairo-Regular.ttf", "Noto Sans Arabic Cairo Metrics", "NotoSansArabicCairoMetrics"),
    ("Tajawal-Regular.ttf", "Noto Sans Arabic Tajawal Metrics", "NotoSansArabicTajawalMetrics"),
]
WEIGHTS = ["Regular", "Bold"]
USE_TYPO_METRICS = 1 << 7


def rename(font: TTFont, family: str, weight: str, postscript: str) -> None:
    full = f"{family} {weight}" if weight != "Regular" else family
    values = {
        1: family,
        2: weight,
        3: f"{postscript}-{weight};derived-from-NotoSansArabic-2.005",
        4: full,
        6: f"{postscript}-{weight}",
        16: family,
        17: weight,
    }
    name = font["name"]
    for record in list(name.names):
        if record.nameID in values:
            name.setName(values[record.nameID], record.nameID, record.platformID,
                         record.platEncID, record.langID)
    # nameIDs 16/17 may be absent in the source; add them for Windows.
    for name_id in (16, 17):
        if name.getName(name_id, 3, 1, 0x409) is None:
            name.setName(values[name_id], name_id, 3, 1, 0x409)


def build(donor_file: str, family: str, prefix: str) -> None:
    donor = TTFont(FONTS / donor_file)
    for weight in WEIGHTS:
        font = TTFont(FONTS / f"NotoSansArabic-{weight}.ttf")
        for attr in ("ascent", "descent", "lineGap"):
            setattr(font["hhea"], attr, getattr(donor["hhea"], attr))
        os2, donor_os2 = font["OS/2"], donor["OS/2"]
        for attr in ("sTypoAscender", "sTypoDescender", "sTypoLineGap",
                     "usWinAscent", "usWinDescent"):
            setattr(os2, attr, getattr(donor_os2, attr))
        os2.fsSelection = (os2.fsSelection & ~USE_TYPO_METRICS) | (
            donor_os2.fsSelection & USE_TYPO_METRICS)
        rename(font, family, weight, prefix)
        out = FONTS / f"{prefix}-{weight}.ttf"
        font.save(out)
        print(f"wrote {out.relative_to(FONTS.parent)}")


if __name__ == "__main__":
    for donor_file, family, prefix in TARGETS:
        build(donor_file, family, prefix)
