"""Iteration 5: roll animation frames + Skia fallback when WebGL disabled + 360x640 run HUD."""
import asyncio, os
from playwright.async_api import async_playwright

URL = os.environ["RR_URL"]
OUT = "/tmp/t5"
errors = []


async def renderer(page):
    return await page.evaluate("({three: !!document.querySelector('[data-testid=run-3d-view]'), skia: !!document.querySelector('[data-testid=run-2d-canvas]')})")


async def main():
    async with async_playwright() as p:
        # A) roll frames
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, storage_state=f"{OUT}/state2.json")
        page = await ctx.new_page()
        page.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", e)))
        tid = page.get_by_test_id
        await page.goto(URL)
        await tid("main-menu").wait_for(timeout=120000)
        await tid("play-button").click()
        await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=40000)
        await page.evaluate("window.__RR_DEBUG__.setGodMode(true)")
        await page.wait_for_timeout(2000)
        await page.evaluate("(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown'})); window.__RR_DEBUG__.freeze(true);})()")
        for i in range(6):
            await page.screenshot(path=f"{OUT}/roll_{i}.png", clip={"x": 95, "y": 450, "width": 200, "height": 394})
            await page.wait_for_timeout(60)
        print("sliding while frozen:", (await page.evaluate("window.__RR_DEBUG__.state"))["sliding"])
        await b.close()
        # B) WebGL disabled -> Skia fallback
        b = await p.chromium.launch(args=["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"])
        ctx = await b.new_context(viewport={"width": 360, "height": 640}, storage_state=f"{OUT}/state2.json")
        page = await ctx.new_page()
        page.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", e)))
        page.on("console", lambda m: print("CONSOLE", m.text[:200]) if "3D" in m.text or m.type == "error" else None)
        tid = page.get_by_test_id
        await page.goto(URL)
        await tid("main-menu").wait_for(timeout=120000)
        await tid("play-button").click()
        await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=40000)
        print("fallback t0:", await renderer(page))
        await page.wait_for_timeout(8000)
        print("fallback t8s:", await renderer(page), (await page.evaluate("window.__RR_DEBUG__.state"))["phase"])
        await page.screenshot(path=f"{OUT}/fallback_360.png")
        print("pageerrors:", errors)
        await b.close()

asyncio.run(main())
