"""WebGL disabled: does Skia fallback kick in or does the ErrorBoundary show?"""
import asyncio, os
from playwright.async_api import async_playwright
URL = os.environ["RR_URL"]; OUT = "/tmp/t5"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, storage_state=f"{OUT}/state2.json")
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print("PAGEERROR", str(e)[:200]))
        page.on("console", lambda m: print("CONSOLE", m.text[:300]) if ("Boundary" in m.text or "3D" in m.text or "WebGL" in m.text) else None)
        tid = page.get_by_test_id
        await page.goto(URL)
        await tid("main-menu").wait_for(timeout=120000)
        await page.screenshot(path=f"{OUT}/nogl_menu.png", scale="css")
        await tid("play-button").click()
        await page.wait_for_timeout(8000)
        ids = await page.evaluate("[...document.querySelectorAll('[data-testid]')].map(e=>e.dataset.testid).slice(0,25)")
        print("ids", ids)
        await page.screenshot(path=f"{OUT}/nogl_run.png", scale="css")
        await b.close()
asyncio.run(main())
