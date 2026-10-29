import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

OUT = "/app/mobile/assets/game/"


def finish(rgb, mask_bg, name, max_side):
    alpha = np.where(mask_bg, 0, 255).astype(np.uint8)
    a = Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    im = Image.fromarray(rgb.astype(np.uint8)).convert("RGBA")
    im.putalpha(a)
    bbox = im.getbbox()
    im = im.crop(bbox)
    w, h = im.size
    s = min(1.0, max_side / max(w, h))
    im = im.resize((int(w * s), int(h * s)), Image.LANCZOS)
    im.save(OUT + name + ".png", optimize=True)
    print(name, im.size)


def checker(name, out, max_side, levels):
    rgb = np.array(Image.open(name + ".jpg").convert("RGB")).astype(int)
    sat = rgb.max(2) - rgb.min(2)
    lum = rgb.mean(2)
    near = np.zeros(lum.shape, bool)
    lvl_masks = []
    for L in levels:
        m = np.abs(lum - L) <= 12
        lvl_masks.append(m)
        near |= m
    cand = (sat <= 12) & near
    lab, _ = ndimage.label(cand)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    border = border[border != 0]
    bg = np.isin(lab, border)
    # fill small holes enclosed by object that are checker (e.g. under arches) -> treat large low-sat enclosed areas with checker values as bg
    enclosed = cand & ~bg
    lab2, n2 = ndimage.label(enclosed)
    if n2:
        sizes = ndimage.sum(np.ones_like(lab2), lab2, range(1, n2 + 1))
        for i, sz in enumerate(sizes, 1):
            if sz > 4000:
                reg = lab2 == i
                fr = [ (m & reg).sum() / sz for m in lvl_masks ]
                if sum(1 for f in fr if f > 0.25) >= 2:
                    bg |= reg
    lowsat = sat <= 16
    for _ in range(3):
        bg = bg | (ndimage.binary_dilation(bg) & lowsat)
    fg = ndimage.binary_opening(~bg, iterations=3)
    labf, nf = ndimage.label(fg)
    if nf > 1:
        sizes = ndimage.sum(np.ones_like(labf), labf, range(1, nf + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * 0.03]
        bg = ~np.isin(labf, keep)
    finish(rgb, bg, out, max_side)


def green(name, out, max_side):
    rgb = np.array(Image.open(name + ".jpg").convert("RGB")).astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    bg = (g > 120) & (g - np.maximum(r, b) > 50)
    # despill
    spill = (g > np.maximum(r, b))
    rgb[..., 1] = np.where(spill, np.maximum(r, b), g)
    finish(rgb, bg, out, max_side)


def magenta(name, out, max_side):
    rgb = np.array(Image.open(name + ".jpg").convert("RGB")).astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    bg = (r > 150) & (b > 150) & (np.minimum(r, b) - g > 70)
    finish(rgb, bg, out, max_side)


magenta("coin_m", "coin", 256)
green("train_g", "train", 512)
checker("low_barrier", "low_barrier", 512, [64,96])
green("high_barrier_g", "high_barrier", 512)
checker("rush_run", "rush_run", 512, [255,222])
checker("velactra_logo", "velactra_logo", 512, [33,61,96])
green("logo_g", "logo", 900)
green("rush_jump", "rush_jump", 512)
green("rush_slide", "rush_slide", 512)

def _x(): pass
bg = Image.open("city_bg.jpg").convert("RGB")
bg.save(OUT + "city_bg.jpg", quality=88)
print("bg", bg.size)
