"""Iteration 6: 3D scene must fill the whole screen for every graphics tier at DPR 1/2/3."""
import asyncio, os, json, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageStat

URL = os.environ["RR_URL"]; OUT = "/tmp/t6"
os.makedirs(OUT, exist_ok=True)
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]


def fnv(s):
    h = 0x811c9dc5
    for ch in s.encode('utf-16-le')[::2]:
        h ^= ch; h = (h * 0x01000193) & 0xffffffff
    return format(h, '08x')


def make_state(gfx):
    st = json.load(open("/tmp/t5/state2.json"))
    for o in st["origins"]:
        for i in o["localStorage"]:
            if i["name"] == "rr_save_main":
                env = json.loads(json.loads(i["value"])); env["data"]["settings"]["graphics"] = gfx
                body = json.dumps(env["data"], separators=(",", ":"), ensure_ascii=False)
                env["sum"] = fnv(body)
                i["value"] = json.dumps(json.dumps({"v": env["v"], "sum": env["sum"], "data": env["data"]}, separators=(",", ":"), ensure_ascii=False))
    p = f"{OUT}/state_{gfx}.json"; json.dump(st, open(p, "w")); return p


def grid_stats(path):
    im = Image.open(path).convert("RGB"); W, H = im.size
    res = []
    for gy in range(3):
        row = []
        for gx in range(3):
            c = im.crop((gx * W // 3, gy * H // 3, (gx + 1) * W // 3, (gy + 1) * H // 3))
            s = ImageStat.Stat(c)
            row.append(round(sum(s.stddev) / 3, 1))
        res.append(row)
    return res


async def one(p, gfx, dpr):
    b = await p.chromium.launch(args=ARGS)
    ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=dpr, storage_state=make_state(gfx))
    page = await ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    tid = page.get_by_test_id
    try:
        await page.goto(URL)
        await tid("main-menu").wait_for(timeout=120000)
        await tid("play-button").click()
        await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=60000)
        await page.evaluate("window.__RR_DEBUG__.setGodMode(true)")
        await page.wait_for_timeout(3000)
        info = await page.evaluate("(()=>{const c=document.querySelector('[data-testid=run-3d-view] canvas')||document.querySelector('canvas');const g=c.getContext('webgl2');return {w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight,dbw:g&&g.drawingBufferWidth,dbh:g&&g.drawingBufferHeight,vp:g&&Array.from(g.getParameter(g.VIEWPORT)),dpr:devicePixelRatio,gfx:JSON.parse(JSON.parse(localStorage.rr_save_main)).data.settings.graphics, three:!!document.querySelector('[data-testid=run-3d-view]'), skia:!!document.querySelector('[data-testid=run-2d-canvas]')}})()")
        path = f"{OUT}/{gfx}_dpr{dpr}.png"
        await page.screenshot(path=path, scale="css")
        g = grid_stats(path)
        flat = [v for r in g for v in r]
        print(f"[{gfx} DPR{dpr}] info={info} grid_std={g} min_cell_std={min(flat)} errs={errs}")
        ok = info["three"] and not info["skia"] and info["vp"] and info["vp"][2] == info["w"] and info["vp"][3] == info["h"]
        print(f"[{gfx} DPR{dpr}] viewport-matches-canvas: {'PASS' if ok else 'FAIL/UNKNOWN'}")
    except Exception as e:
        print(f"[{gfx} DPR{dpr}] ERROR {e}")
    await b.close()


async def main():
    combos = [tuple(x.split(":")) for x in sys.argv[1:]] or [("low", "2"), ("medium", "2"), ("high", "3"), ("low", "3"), ("high", "1")]
    async with async_playwright() as p:
        for gfx, dpr in combos:
            await one(p, gfx, int(dpr))

asyncio.run(main())
