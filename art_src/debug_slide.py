import asyncio
from playwright.async_api import async_playwright
URL = "https://0d6ac45e-bc9e-4fc3-8316-2ec3885e7d56.expo.preview.emergentagent.com"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        page = await b.new_page(viewport={"width": 390, "height": 844})
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
        await tid("tutorial-skip-button").click(timeout=30000)
        await tid("get-started-button").click(timeout=10000)
        await tid("play-button").click(timeout=10000)
        await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=30000)
        await page.evaluate("window.__RR_DEBUG__.setGodMode(true)")
        await page.wait_for_timeout(1500)
        await page.keyboard.press("ArrowDown")
        for i in range(12):
            st = await page.evaluate("JSON.stringify(window.__RR_DEBUG__.state)")
            print(st)
            await page.wait_for_timeout(80)
        await page.screenshot(path="/tmp/shots/slide-dbg.png")
        await b.close()
asyncio.run(main())
