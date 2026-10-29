"""Phase 7 final + store screenshots from the real game (web preview, 3D via SwiftShader). python3 /app/tests/rr3d/p7_final_shots.py"""
import asyncio
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(__file__))
from p3_common import ARGS, URL, onboard  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

OUT = "/app/docs/screenshots/final"
STORE = "/app/docs/store-assets/screenshots"
os.makedirs(OUT, exist_ok=True)
os.makedirs(STORE, exist_ok=True)
done = []


async def shot(page, name):
    # the FPS counter is __DEV__-only (absent in release builds) — hide it so captures match the shipped HUD
    await page.add_style_tag(content='[data-testid="fps-counter"]{display:none !important}')
    await page.wait_for_timeout(900)
    await page.screenshot(path=f"{OUT}/{name}.png")
    done.append(name)
    print("shot", name, flush=True)


async def back_to_menu(page):
    await page.goto(URL + "/menu")
    await page.get_by_test_id("main-menu").wait_for(timeout=60000)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2)
        page = await ctx.new_page()
        await page.goto(URL)
        await onboard(page, name="Ace")
        tid = page.get_by_test_id
        await page.wait_for_timeout(2500)
        await shot(page, "menu")
        for kind in ("characters", "boards", "worlds"):
            await page.goto(f"{URL}/collection/{kind}")
            await tid("collection-header").wait_for(timeout=60000)
            await shot(page, kind)
        for route, t in (("shop", "shop-screen"), ("missions", "missions-screen"), ("daily", "daily-screen"), ("settings", "settings-screen"), ("leaderboard", "leaderboard-screen")):
            await page.goto(f"{URL}/{route}")
            await tid(t).wait_for(timeout=60000)
            await page.wait_for_timeout(1500)
            await shot(page, route if route != "daily" else "daily-rewards")
        # ---- run
        await back_to_menu(page)
        await tid("play-button").click()
        await tid("hud-score").wait_for(timeout=60000)
        await page.wait_for_function("() => window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=60000)
        await page.evaluate("() => window.__RR_DEBUG__.setGodMode(true)")
        await page.wait_for_timeout(5000)
        await shot(page, "run-ground")
        # roof: ramp train ahead, run up it
        await page.evaluate("() => window.__RR_DEBUG__.placeTrainAhead()")
        for _ in range(40):
            y = await page.evaluate("() => window.__RR_DEBUG__.state.y")
            if y > 2.5:
                break
            await page.wait_for_timeout(150)
        await page.wait_for_timeout(500)
        await shot(page, "run-roof")
        # power-up active (real activation path in the engine)
        await page.evaluate("() => { const e = window.__RR_DEBUG__.engine; e.activatePowerUp('magnet'); e.activatePowerUp('x2'); window.__RR_DEBUG__.placeCoinsAhead(8); }")
        await page.wait_for_timeout(1200)
        await shot(page, "power-up-active")
        # lifecycle: background (visibility hidden) -> GL released; visible -> restored (REQ-249 / JRN-114)
        gl0 = await page.evaluate("() => window.__RR_DEBUG__.gl")
        await page.evaluate("() => { Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true}); document.dispatchEvent(new Event('visibilitychange')); }")
        await page.wait_for_timeout(1500)
        gl1 = await page.evaluate("() => window.__RR_DEBUG__.gl")
        ph1 = await page.evaluate("() => window.__RR_DEBUG__.state.phase")
        await page.evaluate("() => { Object.defineProperty(document, 'visibilityState', {value: 'visible', configurable: true}); document.dispatchEvent(new Event('visibilitychange')); }")
        await page.wait_for_function("() => window.__RR_DEBUG__.gl.live", timeout=30000)
        gl2 = await page.evaluate("() => window.__RR_DEBUG__.gl")
        print("LIFECYCLE before", gl0, "hidden", gl1, "phase", ph1, "resumed", gl2, flush=True)
        await page.wait_for_timeout(1500)
        await shot(page, "pause")  # backgrounding auto-paused the run; the 3D scene is rebuilt behind the pause menu
        # resume then crash -> revive -> game over
        if await page.get_by_text("Resume", exact=True).count():
            await page.get_by_text("Resume", exact=True).first.click()
        await page.wait_for_function("() => window.__RR_DEBUG__.state.phase === 'running'", timeout=30000)
        await page.evaluate("() => window.__RR_DEBUG__.setGodMode(false)")
        await page.evaluate("() => { const e = window.__RR_DEBUG__.engine; for (let i = 0; i < 3; i++) e.addObstacle('train', e.player.lane, e.distance + 10 + i * 30); }")
        await tid("revive-panel").wait_for(timeout=30000)
        await tid("revive-decline-button").click()
        await tid("game-over-panel").wait_for(timeout=30000)
        await shot(page, "game-over")
        await b.close()
    for src, dst in (("menu", "01-menu"), ("run-ground", "02-run"), ("run-roof", "03-train-roof"), ("power-up-active", "04-power-up"), ("characters", "05-characters"), ("game-over", "06-game-over"), ("worlds", "07-worlds"), ("shop", "08-shop")):
        if src in done:
            shutil.copy(f"{OUT}/{src}.png", f"{STORE}/{dst}.png")
    print("DONE", len(done), done)


asyncio.run(main())
