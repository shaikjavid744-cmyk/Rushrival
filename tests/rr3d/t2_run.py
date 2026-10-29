"""Iteration 5: 3D run flow - renderer check, lanes/jump/slide, roof, pause/resume, crash->revive->game over->play again, home->rerun."""
import asyncio, os, json
from playwright.async_api import async_playwright

URL = os.environ["RR_URL"]
OUT = "/tmp/t5"
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
errors = []


async def st(page):
    return await page.evaluate("window.__RR_DEBUG__ && window.__RR_DEBUG__.state")


async def renderer(page):
    return await page.evaluate("({three: !!document.querySelector('[data-testid=run-3d-view]'), skia: !!document.querySelector('[data-testid=run-2d-canvas]'), canvases: document.querySelectorAll('canvas').length})")


async def wait_running(page, t=40000):
    await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=t)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, storage_state=f"{OUT}/state.json")
        page = await ctx.new_page()
        page.on("pageerror", lambda e: (errors.append(str(e)), print("PAGEERROR", e)))
        page.on("console", lambda m: print("CONSOLE", m.type, m.text[:200]) if m.type in ("error", "warning") else None)
        tid = page.get_by_test_id
        await page.goto(URL)
        await tid("main-menu").wait_for(timeout=120000)
        coins0 = await tid("menu-coin-balance-value").text_content()
        print("menu coins", coins0)
        await tid("play-button").click()
        print("early renderer:", await renderer(page))
        await wait_running(page)
        await page.wait_for_timeout(2500)
        r = await renderer(page)
        print("renderer after running:", r, "PASS" if r["three"] and not r["skia"] else "FAIL")
        await page.evaluate("window.__RR_DEBUG__.setGodMode(true)")
        await page.screenshot(path=f"{OUT}/run_ground.png")
        s0 = await st(page)
        await page.keyboard.press("ArrowLeft")
        await page.wait_for_timeout(700)
        s1 = await st(page)
        await page.keyboard.press("ArrowRight")
        await page.wait_for_timeout(700)
        s2 = await st(page)
        print("lanes", s0["lane"], s1["lane"], s2["lane"])
        await page.keyboard.press("ArrowUp")
        maxy = 0
        for _ in range(30):
            await page.wait_for_timeout(40)
            s = await st(page)
            maxy = max(maxy, s["y"])
            if s["y"] > 1.0:
                break
        await page.evaluate("window.__RR_DEBUG__.freeze(true)")
        await page.wait_for_timeout(500)
        await page.screenshot(path=f"{OUT}/jump.png")
        print("jump y", maxy, (await st(page))["airborne"])
        await page.evaluate("window.__RR_DEBUG__.freeze(false)")
        for _ in range(60):
            await page.wait_for_timeout(100)
            if not (await st(page))["airborne"]:
                break
        await page.wait_for_timeout(300)
        await page.keyboard.press("ArrowDown")
        await page.wait_for_timeout(150)
        await page.evaluate("window.__RR_DEBUG__.freeze(true)")
        await page.wait_for_timeout(500)
        print("sliding", (await st(page))["sliding"])
        await page.screenshot(path=f"{OUT}/slide.png")
        await page.evaluate("window.__RR_DEBUG__.freeze(false)")
        await page.wait_for_timeout(1200)
        await page.evaluate("window.__RR_DEBUG__.placeTrainAhead()")
        roof = False
        for _ in range(60):
            await page.wait_for_timeout(150)
            s = await st(page)
            if s["y"] > 2.5:
                roof = True
                break
        await page.wait_for_timeout(600)
        print("roof reached", roof, (await st(page))["y"])
        await page.screenshot(path=f"{OUT}/roof.png")
        # pause/resume
        await tid("hud-pause-button").click()
        await tid("pause-menu-card").wait_for(timeout=5000)
        await page.screenshot(path=f"{OUT}/pause.png")
        print("paused phase", (await st(page))["phase"])
        await tid("pause-resume-button").click()
        await wait_running(page, 15000)
        print("PASS resume ->", (await st(page))["phase"], await renderer(page))
        # crash
        await page.evaluate("window.__RR_DEBUG__.setGodMode(false)")
        try:
            await page.wait_for_function("window.__RR_DEBUG__.state.phase === 'crashed'", timeout=180000, polling=50)
            await page.wait_for_timeout(250)
            await page.screenshot(path=f"{OUT}/crash1.png")
            await page.wait_for_timeout(500)
            await page.screenshot(path=f"{OUT}/crash2.png")
        except Exception as e:
            print("crash wait failed", e)
        await tid("revive-panel").wait_for(timeout=60000)
        await page.wait_for_timeout(600)
        print("revive text:", (await tid("revive-panel").text_content())[:300])
        await page.screenshot(path=f"{OUT}/revive.png")
        await tid("revive-decline-button").click()
        await tid("game-over-panel").wait_for(timeout=10000)
        await page.wait_for_timeout(1500)
        print("game over text:", (await tid("game-over-panel").text_content())[:300])
        await page.screenshot(path=f"{OUT}/gameover.png")
        ids = await page.evaluate("[...document.querySelectorAll('[data-testid^=game-over]')].map(e=>e.dataset.testid)")
        print("gameover ids", ids)
        if True:
            await tid("play-again-button").click()
            await wait_running(page)
            await page.wait_for_timeout(2500)
            print("play again renderer:", await renderer(page), (await st(page))["phase"])
            await page.screenshot(path=f"{OUT}/run_again.png")
        # pause -> home
        await tid("hud-pause-button").click()
        await tid("pause-menu-card").wait_for(timeout=5000)
        pids = await page.evaluate("[...document.querySelectorAll('[data-testid^=pause-]')].map(e=>e.dataset.testid)")
        print("pause ids", pids)
        home = [i for i in pids if "home" in i or "quit" in i]
        await tid(home[0]).click()
        await page.wait_for_timeout(1000)
        cdlg = await page.evaluate("[...document.querySelectorAll('[data-testid]')].map(e=>e.dataset.testid).filter(x=>/confirm|dialog/.test(x))")
        if cdlg:
            print("confirm dialog", cdlg)
            await tid("home-dialog-confirm").click()
        await tid("main-menu").wait_for(timeout=15000)
        coins1 = await tid("menu-coin-balance-value").text_content()
        print("menu coins after", coins0, "->", coins1)
        await tid("play-button").click()
        await wait_running(page)
        await page.wait_for_timeout(2500)
        print("rerun renderer:", await renderer(page))
        await page.screenshot(path=f"{OUT}/rerun.png")
        await ctx.storage_state(path=f"{OUT}/state2.json")
        print("pageerrors:", errors)
        await b.close()

asyncio.run(main())
