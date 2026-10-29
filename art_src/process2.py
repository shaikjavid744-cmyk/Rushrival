import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

OUT = "/app/mobile/assets/game/"


def key(name, out, max_side):
    rgb = np.array(Image.open(name + ".jpg").convert("RGB")).astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    green = (g > 120) & (g - np.maximum(r, b) > 50)
    mag = (r > 150) & (b > 150) & (np.minimum(r, b) - g > 70)
    sat = rgb.max(2) - rgb.min(2)
    light = (sat < 22) & (rgb.mean(2) > 150)
    lab, _ = ndimage.label(light)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    border = border[border != 0]
    bg = green | mag | np.isin(lab, border)
    for _ in range(2):
        bg = bg | (ndimage.binary_dilation(bg) & light)
    fg = ndimage.binary_opening(~bg, iterations=2)
    labf, nf = ndimage.label(fg)
    if nf > 1:
        sizes = ndimage.sum(np.ones_like(labf), labf, range(1, nf + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * 0.04]
        fg = np.isin(labf, keep)
    spill = (g > np.maximum(r, b) + 10)
    rgb[..., 1] = np.where(spill, np.maximum(r, b), g)
    a = Image.fromarray(np.where(fg, 255, 0).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    im = Image.fromarray(rgb.astype(np.uint8)).convert("RGBA")
    im.putalpha(a)
    im = im.crop(im.getbbox())
    s = min(1.0, max_side / max(im.size))
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    im.save(OUT + out + ".png", optimize=True)
    print(out, im.size)


for c in ["zoe", "kai", "shadow", "nova", "leo"]:
    key("char_" + c, "char_" + c, 512)
for p in ["magnet", "shield", "speed", "x2"]:
    key("pu_" + p, "pu_" + p, 256)
for bd in ["default", "flame", "neon", "dragon", "ice", "galaxy"]:
    key("board_" + bd, "board_" + bd, 512)
for w in ["beach", "snow", "night", "temple", "lava"]:
    try:
        Image.open("world_" + w + ".jpg").convert("RGB").save(OUT + "world_" + w + ".jpg", quality=86)
    except FileNotFoundError:
        print("missing", w)
