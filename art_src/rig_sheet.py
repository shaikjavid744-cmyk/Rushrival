import asyncio, sys
from playwright.async_api import async_playwright
URL = "https://0d6ac45e-bc9e-4fc3-8316-2ec3885e7d56.expo.preview.emergentagent.com"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/shots/rig-sheet.png"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        page = await b.new_page(viewport={"width": 1600, "height": 1000})
        page.on("pageerror", lambda e: print("PAGEERROR", e))
        await page.goto(URL + "/dev-rig")
        await page.get_by_test_id("dev-rig-sheet").wait_for(timeout=60000)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=OUT, full_page=True)
        print("saved", OUT)
        await b.close()
asyncio.run(main())
