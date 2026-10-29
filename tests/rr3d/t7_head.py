"""Zoomed head/hair check of the 3D runner (DPR 3)."""
import asyncio, os
from playwright.async_api import async_playwright
URL = os.environ["RR_URL"]; OUT = "/tmp/t5"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, storage_state=f"{OUT}/state2.json")
        page = await ctx.new_page()
        tid = page.get_by_test_id
        await page.goto(URL)
        await tid("main-menu").wait_for(timeout=120000)
        await tid("play-button").click()
        await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=60000)
        await page.evaluate("window.__RR_DEBUG__.setGodMode(true)")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{OUT}/head_full.png", scale="css")
        print(await page.evaluate("window.__RR_DEBUG__.state"))
        await b.close()
asyncio.run(main())
