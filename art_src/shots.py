"""Local Playwright capture of Phase 2 screenshots (Expo web preview, dev build).
Usage: python3 shots.py <out_dir> [subset,comma,separated]
"""
import asyncio
import os
import sys

from playwright.async_api import async_playwright

URL = os.environ.get("RR_URL", "https://0d6ac45e-bc9e-4fc3-8316-2ec3885e7d56.expo.preview.emergentagent.com")
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/shots"
ONLY = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else None
os.makedirs(OUT, exist_ok=True)


def want(name):
    return ONLY is None or name in ONLY


async def shot(page, name):
    if want(name):
        await page.screenshot(path=f"{OUT}/{name}.png")
        print("saved", name)


async def state(page):
    return await page.evaluate("window.__RR_DEBUG__ && window.__RR_DEBUG__.state")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        page = await b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        page.on("pageerror", lambda e: print("PAGEERROR", e))
        await page.goto(URL)
        tid = page.get_by_test_id
        await tid("onboarding-screen").wait_for(timeout=90000)
        await tid("onboarding-next-welcome").click()
        await tid("onboarding-next-language").click()
        await tid("onboarding-age-over13").click()
        await tid("onboarding-terms-checkbox").click()
        await tid("onboarding-accept-terms").click()
        await tid("onboarding-next-permissions").click()
        await tid("onboarding-intro-skip").click()
        await tid("onboarding-name-input").fill("Ace")
        await tid("onboarding-next-name").click()
        if await tid("onboarding-next-how").count():
            await tid("onboarding-next-how").click()
        await tid("onboarding-claim-gift").click()
        # Tutorial (if present)
        try:
            await tid("tutorial-hint").wait_for(timeout=15000)
            await page.wait_for_timeout(700)
            await shot(page, "tutorial-step")
            keys = {"left": "ArrowLeft", "right": "ArrowRight", "jump": "ArrowUp", "slide": "ArrowDown", "coins": "ArrowRight", "avoid": "ArrowLeft", "powerup": "ArrowRight"}
            for _ in range(7):
                await tid("tutorial-hint").wait_for(timeout=20000)
                act = await page.evaluate("(document.querySelector('[data-testid^=tutorial-step-]')||{}).getAttribute && document.querySelector('[data-testid^=tutorial-step-]').getAttribute('data-testid').replace('tutorial-step-','')")
                print("tutorial step", act)
                await page.wait_for_timeout(300)
                await page.keyboard.press(keys.get(act, "ArrowLeft"))
                await page.wait_for_timeout(500)
                try:
                    await page.wait_for_function("document.querySelector('[data-testid=tutorial-hint]') || document.querySelector('[data-testid=tutorial-complete-panel]')", timeout=30000)
                except Exception:
                    pass
                if await tid("tutorial-complete-panel").count():
                    break
            await tid("tutorial-complete-panel").wait_for(timeout=20000)
            await page.wait_for_timeout(600)
            await shot(page, "tutorial-complete")
            await tid("tutorial-continue-button").click()
            await tid("get-started-screen").wait_for(timeout=10000)
            await page.wait_for_timeout(600)
            await shot(page, "get-started")
            await tid("get-started-button").click()
        except Exception as e:
            print("no tutorial:", e)
        await tid("main-menu").wait_for(timeout=20000)
        await page.wait_for_timeout(4500)
        await shot(page, "menu")
        await tid("menu-characters-button").click()
        await tid("collection-characters").wait_for()
        await page.wait_for_timeout(1500)
        await shot(page, "characters")
        await tid("collection-header-back").click()
        await tid("main-menu").wait_for()
        await tid("play-button").click()
        await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=30000)
        await page.evaluate("window.__RR_DEBUG__.setGodMode(true)")
        await page.wait_for_timeout(1500)
        await shot(page, "run-ground")
        if want("obstacles"):
            await page.evaluate("window.__RR_DEBUG__.placeShowcase()")
            await page.wait_for_timeout(500)
            await shot(page, "obstacles")
        if want("run-ground"):
            for i in range(8):
                await page.wait_for_timeout(60)
                await page.screenshot(path=f"/tmp/shots/cyc_{i}.png")
        await page.keyboard.press("ArrowUp")
        for _ in range(30):
            await page.wait_for_timeout(40)
            st = await state(page)
            if st and st["y"] > 1.0:
                break
        await page.evaluate("window.__RR_DEBUG__.freeze(true)")
        await page.wait_for_timeout(400)
        await shot(page, "jump")
        await page.evaluate("window.__RR_DEBUG__.freeze(false)")
        for _ in range(60):
            await page.wait_for_timeout(100)
            st = await state(page)
            if st and not st["airborne"]:
                break
        await page.wait_for_timeout(400)
        await page.keyboard.press("ArrowDown")
        await page.evaluate("window.__RR_DEBUG__.freeze(true)")
        await page.wait_for_timeout(400)
        await shot(page, "slide")
        await page.evaluate("window.__RR_DEBUG__.freeze(false)")
        await page.wait_for_timeout(900)
        await page.evaluate("window.__RR_DEBUG__.placeTrainAhead()")
        for _ in range(40):
            await page.wait_for_timeout(150)
            st = await state(page)
            if st and st["y"] > 2.5:
                break
        await page.wait_for_timeout(500)
        await shot(page, "run-roof")
        await tid("hud-pause-button").click()
        await tid("pause-menu-card").wait_for()
        await page.wait_for_timeout(500)
        await shot(page, "pause")
        await tid("pause-resume-button").click()
        await page.evaluate("window.__RR_DEBUG__.setGodMode(false)")
        try:
            await page.wait_for_function("window.__RR_DEBUG__.state.phase === 'crashed'", timeout=180000, polling=50)
            await page.wait_for_timeout(120)
            await shot(page, "crash")
        except Exception as e:  # noqa: BLE001
            print("crash shot failed", e)
        await tid("revive-panel").wait_for(timeout=180000)
        await page.wait_for_timeout(500)
        await shot(page, "revive")
        await tid("revive-decline-button").click(timeout=4000)
        await tid("game-over-panel").wait_for(timeout=10000)
        await page.wait_for_timeout(1200)
        await shot(page, "game-over")
        await b.close()


asyncio.run(main())
