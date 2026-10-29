"""Remove baked checkerboard/white backgrounds from generated hero JPEGs by flood-filling from the
borders over bright, low-saturation pixels (characters have dark ink outlines that stop the fill)."""
import sys
from collections import deque

from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
w, h = im.size
px = im.load()


def bg(c):
    r, g, b = c
    return min(r, g, b) > 115 and max(r, g, b) - min(r, g, b) < 28


mask = Image.new("L", (w, h), 255)
m = mask.load()
q = deque()
for x in range(w):
    q.append((x, 0)); q.append((x, h - 1))
for y in range(h):
    q.append((0, y)); q.append((w - 1, y))
seen = bytearray(w * h)
while q:
    x, y = q.popleft()
    i = y * w + x
    if seen[i]:
        continue
    seen[i] = 1
    if not bg(px[x, y]):
        continue
    m[x, y] = 0
    if x > 0: q.append((x - 1, y))
    if x < w - 1: q.append((x + 1, y))
    if y > 0: q.append((x, y - 1))
    if y < h - 1: q.append((x, y + 1))
mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
out = im.convert("RGBA")
out.putalpha(mask)
out = out.crop(out.getbbox())
out.thumbnail((512, 768))
out.save(dst, optimize=True)
print(dst, out.size)
