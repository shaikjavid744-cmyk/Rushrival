"""Probe: does the 3D view keep animating while frozen / while sliding."""
import asyncio, os, hashlib
from playwright.async_api import async_playwright

URL = os.environ["RR_URL"]
OUT = "/tmp/t5"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, storage_state=f"{OUT}/state2.json")
        page = await ctx.new_page()
        tid = page.get_by_test_id
        await page.goto(URL)
        await tid("main-menu").wait_for(timeout=120000)
        await tid("play-button").click()
        await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=40000)
        await page.evaluate("window.__RR_DEBUG__.setGodMode(true)")
        await page.wait_for_timeout(1500)
        clip = {"x": 95, "y": 450, "width": 200, "height": 394}
        await page.evaluate("window.__RR_DEBUG__.freeze(true)")
        hs = []
        for i in range(4):
            await page.wait_for_timeout(400)
            hs.append(hashlib.md5(await page.screenshot(clip=clip)).hexdigest()[:6])
        print("frozen jog hashes", hs)
        await page.evaluate("window.__RR_DEBUG__.freeze(false)")
        await page.wait_for_timeout(500)
        # slide unfrozen, sample quickly
        await page.keyboard.press("ArrowDown")
        for i in range(5):
            buf = await page.screenshot(path=f"{OUT}/rollu_{i}.png", clip=clip)
            st = await page.evaluate("window.__RR_DEBUG__.state")
            print("unfrozen slide", i, st["sliding"], hashlib.md5(buf).hexdigest()[:6])
        # count rendered frames per sec via rAF
        fps = await page.evaluate("new Promise(r=>{let n=0;const t0=performance.now();const f=()=>{n++; if(performance.now()-t0<2000) requestAnimationFrame(f); else r(n/2)}; requestAnimationFrame(f)})")
        print("rAF/s", fps)
        await b.close()

asyncio.run(main())
