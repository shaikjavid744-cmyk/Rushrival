"""Probe roll animation deterministically using Playwright fake clock (pause_at / run_for)."""
import asyncio, os, hashlib
from playwright.async_api import async_playwright
URL = os.environ["RR_URL"]; OUT = "/tmp/t5"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, storage_state=f"{OUT}/state2.json")
        page = await ctx.new_page()
        await page.clock.install()
        tid = page.get_by_test_id
        await page.goto(URL)
        await tid("main-menu").wait_for(timeout=120000)
        await tid("play-button").click()
        await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=60000)
        await page.evaluate("window.__RR_DEBUG__.setGodMode(true)")
        await page.wait_for_timeout(1500)
        await page.clock.pause_at(await page.evaluate("Date.now()") + 50)
        clip = {"x": 95, "y": 450, "width": 200, "height": 394}
        await page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown'}))")
        for i in range(10):
            await page.clock.run_for(100)
            await page.wait_for_timeout(150)
            buf = await page.screenshot(path=f"{OUT}/rollc_{i}.png", clip=clip)
            s = await page.evaluate("window.__RR_DEBUG__.state")
            print(i, "sliding", s["sliding"], "dist", round(s["distance"], 1), hashlib.md5(buf).hexdigest()[:6])
        await b.close()
asyncio.run(main())
