"""Iteration 5: dev-grant -> buy/equip Shadow -> 3D colours; Graphics Low run; slide frames; tutorial replay with 3D."""
import asyncio, os
from playwright.async_api import async_playwright

URL = os.environ["RR_URL"]
OUT = "/tmp/t5"
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
errors = []


async def st(page):
    return await page.evaluate("window.__RR_DEBUG__ && window.__RR_DEBUG__.state")


async def renderer(page):
    return await page.evaluate("({three: !!document.querySelector('[data-testid=run-3d-view]'), skia: !!document.querySelector('[data-testid=run-2d-canvas]')})")


async def wait_running(page, t=40000):
    await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=t)


async def to_menu_from_run(page):
    tid = page.get_by_test_id
    await tid("hud-pause-button").click()
    await tid("pause-home-button").click()
    await tid("home-dialog-confirm").click()
    await tid("main-menu").wait_for(timeout=15000)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, storage_state=f"{OUT}/state2.json")
        page = await ctx.new_page()
        page.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", e)))
        page.on("console", lambda m: print("CONSOLE", m.type, m.text[:200]) if m.type == "error" or "3D" in m.text else None)
        tid = page.get_by_test_id
        await page.goto(URL)
        await tid("main-menu").wait_for(timeout=120000)
        # Settings: dev grant + graphics low
        await tid("menu-settings-button").click()
        await tid("settings-screen").wait_for()
        await tid("dev-grant-coins").click()
        await tid("graphics-low").click()
        await page.wait_for_timeout(500)
        print("graphics-low checked:", await tid("graphics-low").get_attribute("aria-checked"))
        await tid("settings-header-back").click() if await tid("settings-header-back").count() else await page.go_back()
        await tid("main-menu").wait_for(timeout=10000)
        # Buy shadow
        await tid("menu-characters-button").click()
        await tid("collection-characters").wait_for()
        await tid("item-shadow").click()
        await tid("purchase-dialog").wait_for(timeout=5000)
        print("purchase dialog:", (await tid("purchase-dialog").text_content())[:150])
        btns = await page.evaluate("[...document.querySelectorAll('[data-testid^=purchase-dialog]')].map(e=>e.dataset.testid)")
        print("dialog ids", btns)
        conf = [x for x in btns if "confirm" in x][0]
        await tid(conf).click()
        await page.wait_for_timeout(1200)
        await page.screenshot(path=f"{OUT}/chars_shadow.png")
        await tid("collection-header-back").click()
        await tid("main-menu").wait_for()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/menu_shadow.png")
        # Low graphics run with shadow
        await tid("play-button").click()
        await wait_running(page)
        await page.wait_for_timeout(2500)
        print("low-gfx shadow renderer:", await renderer(page))
        await page.evaluate("window.__RR_DEBUG__.setGodMode(true)")
        await page.screenshot(path=f"{OUT}/run_low_shadow.png")
        # slide frames (no freeze)
        await page.keyboard.press("ArrowDown")
        for i in range(4):
            await page.wait_for_timeout(180)
            s = await st(page)
            await page.screenshot(path=f"{OUT}/slide_f{i}.png", clip={"x": 95, "y": 450, "width": 200, "height": 394})
            print("slide frame", i, s["sliding"], round(s["y"], 2))
        await to_menu_from_run(page)
        # tutorial replay
        await tid("menu-settings-button").click()
        await tid("settings-screen").wait_for()
        await tid("graphics-high").click()
        await tid("settings-replay-tutorial").click()
        await tid("tutorial-hint").wait_for(timeout=40000)
        await page.wait_for_timeout(1500)
        print("tutorial renderer:", await renderer(page))
        await page.screenshot(path=f"{OUT}/tutorial.png")
        keys = {"left": "ArrowLeft", "right": "ArrowRight", "jump": "ArrowUp", "slide": "ArrowDown", "coins": "ArrowRight", "avoid": "ArrowLeft", "powerup": "ArrowRight"}
        for _ in range(8):
            if await tid("tutorial-complete-panel").count():
                break
            try:
                await tid("tutorial-hint").wait_for(timeout=30000)
            except Exception:
                break
            act = await page.evaluate("(()=>{const e=document.querySelector('[data-testid^=tutorial-step-]');return e?e.dataset.testid.replace('tutorial-step-',''):null})()")
            print("tutorial step", act)
            await page.wait_for_timeout(300)
            await page.keyboard.press(keys.get(act, "ArrowLeft"))
            await page.wait_for_timeout(500)
            try:
                await page.wait_for_function("document.querySelector('[data-testid=tutorial-hint]') || document.querySelector('[data-testid=tutorial-complete-panel]')", timeout=40000)
            except Exception:
                pass
        try:
            await tid("tutorial-complete-panel").wait_for(timeout=30000)
            print("PASS tutorial complete; renderer:", await renderer(page))
        except Exception as e:
            print("FAIL tutorial complete", e)
            await page.screenshot(path=f"{OUT}/tutorial_fail.png")
        print("pageerrors:", errors)
        await b.close()

asyncio.run(main())
