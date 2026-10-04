"""Regenerates assets/art_overlays/11_overlay.png from assets/art/characters/11.png.

The overlay is an exact copy of 11.png with the bottom half (y >= 232 of 464,
full width) made fully transparent. 11.png itself is only ever READ here.
Re-run after the owner swaps 11.png (test/delivery_overlay_test.dart fails on drift).
"""
from PIL import Image

SRC = 'assets/art/characters/11.png'
DST = 'assets/art_overlays/11_overlay.png'
ERASE_X, ERASE_Y, ERASE_W, ERASE_H = 0, 232, 440, 232

im = Image.open(SRC).convert('RGBA')
assert im.size == (440, 464), im.size
px = im.load()
for y in range(ERASE_Y, ERASE_Y + ERASE_H):
    for x in range(ERASE_X, ERASE_X + ERASE_W):
        px[x, y] = (0, 0, 0, 0)
im.save(DST)
