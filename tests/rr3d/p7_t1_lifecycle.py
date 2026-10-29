"""T1 Phase 7: GL lifecycle (REQ-249/JRN-114) + screen regression + run to game over. python3 /app/tests/rr3d/p7_t1_lifecycle.py"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from p3_common import ARGS, URL, onboard  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

R = {}
OUT = "/tmp/p7t1"
os.makedirs(OUT, exist_ok=True)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        page = await (await b.new_context(viewport={"width": 375, "height": 667})).new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        tid = page.get_by_test_id
        await page.goto(URL)
        await onboard(page, name="Tee")
        R["menu"] = True
        for kind in ("characters", "boards", "worlds"):
            await page.goto(f"{URL}/collection/{kind}")
            try:
                await tid("collection-header").wait_for(timeout=60000); R[kind] = True
            except Exception as e:
                R[kind] = f"FAIL {str(e)[:80]}"
        for route, t in (("shop", "shop-screen"), ("missions", "missions-screen"), ("daily", "daily-screen"), ("settings", "settings-screen"), ("leaderboard", "leaderboard-screen")):
            await page.goto(f"{URL}/{route}")
            try:
                await tid(t).wait_for(timeout=60000); R[route] = True
            except Exception as e:
                R[route] = f"FAIL {str(e)[:80]}"
        await page.screenshot(path=f"{OUT}/leaderboard.jpg", quality=40)
        await page.goto(URL + "/menu")
        await tid("main-menu").wait_for(timeout=60000)
        await tid("play-button").click()
        await page.wait_for_function("() => window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=60000)
        await page.evaluate("() => window.__RR_DEBUG__.setGodMode(true)")
        await page.wait_for_timeout(3000)
        gl0 = await page.evaluate("() => window.__RR_DEBUG__.gl")
        await page.evaluate("() => { Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true}); document.dispatchEvent(new Event('visibilitychange')); }")
        await page.wait_for_timeout(1500)
        gl1 = await page.evaluate("() => window.__RR_DEBUG__.gl")
        ph1 = await page.evaluate("() => window.__RR_DEBUG__.state.phase")
        d1 = await page.evaluate("() => window.__RR_DEBUG__.state.distance")
        await page.wait_for_timeout(1500)
        d1b = await page.evaluate("() => window.__RR_DEBUG__.state.distance")
        await page.evaluate("() => { Object.defineProperty(document, 'visibilityState', {value: 'visible', configurable: true}); document.dispatchEvent(new Event('visibilitychange')); }")
        await page.wait_for_function("() => window.__RR_DEBUG__.gl.live", timeout=30000)
        await page.wait_for_timeout(1500)
        gl2 = await page.evaluate("() => window.__RR_DEBUG__.gl")
        ph2 = await page.evaluate("() => window.__RR_DEBUG__.state.phase")
        canvas = await page.locator("canvas").count()
        resume_visible = await page.get_by_text("Resume", exact=True).count()
        await page.screenshot(path=f"{OUT}/paused_after_resume.jpg", quality=40)
        print("LIFECYCLE before", gl0, "hidden", gl1, "phase", ph1, "dist frozen", d1 == d1b, "resumed", gl2, "phase", ph2, "canvas", canvas, "resume btn", resume_visible, flush=True)
        R["lifecycle"] = (gl0["live"] and not gl1["live"] and ph1 == "paused" and d1 == d1b and gl2["live"] and gl2["ready"] == gl0["ready"] + 1 and gl2["suspended"] == gl0["suspended"] + 1 and resume_visible > 0)
        await page.get_by_text("Resume", exact=True).first.click()
        await page.wait_for_function("() => window.__RR_DEBUG__.state.phase === 'running'", timeout=30000)
        dA = await page.evaluate("() => window.__RR_DEBUG__.state.distance")
        await page.wait_for_timeout(2000)
        dB = await page.evaluate("() => window.__RR_DEBUG__.state.distance")
        R["resume_runs"] = dB > dA
        await page.screenshot(path=f"{OUT}/running_after_resume.jpg", quality=40)
        # second cycle (robustness)
        await page.evaluate("() => { Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true}); document.dispatchEvent(new Event('visibilitychange')); }")
        await page.wait_for_timeout(800)
        await page.evaluate("() => { Object.defineProperty(document, 'visibilityState', {value: 'visible', configurable: true}); document.dispatchEvent(new Event('visibilitychange')); }")
        await page.wait_for_function("() => window.__RR_DEBUG__.gl.live", timeout=30000)
        gl3 = await page.evaluate("() => window.__RR_DEBUG__.gl")
        R["second_cycle"] = gl3["ready"] == gl2["ready"] + 1
        print("cycle2", gl3)
        await page.get_by_text("Resume", exact=True).first.click()
        await page.wait_for_function("() => window.__RR_DEBUG__.state.phase === 'running'", timeout=30000)
        await page.evaluate("() => window.__RR_DEBUG__.setGodMode(false)")
        await page.evaluate("() => { const e = window.__RR_DEBUG__.engine; for (let i = 0; i < 3; i++) e.addObstacle('train', e.player.lane, e.distance + 10 + i * 30); }")
        await tid("revive-panel").wait_for(timeout=30000)
        await tid("revive-decline-button").click()
        await tid("game-over-panel").wait_for(timeout=30000)
        R["game_over"] = True
        await page.screenshot(path=f"{OUT}/game_over.jpg", quality=40)
        R["page_errors"] = errs
        await b.close()
    print("RESULTS", R)


asyncio.run(main())
