import asyncio, sys
from playwright.async_api import async_playwright
URL = "https://0d6ac45e-bc9e-4fc3-8316-2ec3885e7d56.expo.preview.emergentagent.com"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        page = await b.new_page(viewport={"width": 390, "height": 844})
        page.on("pageerror", lambda e: print("PAGEERROR", e))
        page.on("console", lambda m: print("CONSOLE", m.type, m.text[:200]) if m.type in ("error", "warning") else None)
        await page.goto(URL)
        tid = page.get_by_test_id
        await tid("onboarding-screen").wait_for(timeout=90000)
        await tid("onboarding-next-welcome").click()
        await tid("onboarding-age-over13").click()
        await tid("onboarding-accept-terms").click()
        await tid("onboarding-name-input").fill("Ace")
        await tid("onboarding-next-name").click()
        await tid("onboarding-next-how").click()
        await tid("onboarding-claim-gift").click()
        for i in range(8):
            await page.wait_for_timeout(2500)
            st = await page.evaluate("window.__RR_DEBUG__ && JSON.stringify(window.__RR_DEBUG__.state)")
            print(page.url, st)
        await page.screenshot(path="/tmp/shots/debug.png")
        await b.close()
asyncio.run(main())
