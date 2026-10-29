"""Iteration 6: WebGL disabled -> run-no-graphics message, HUD hidden, sim frozen, Back to menu works, no crash."""
import asyncio, os
from playwright.async_api import async_playwright
URL = os.environ["RR_URL"]; OUT = "/tmp/t6"
os.makedirs(OUT, exist_ok=True)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, storage_state="/tmp/t5/state2.json")
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: (errs.append(str(e)[:200]), print("PAGEERROR", str(e)[:200])))
        tid = page.get_by_test_id
        try:
            await page.goto(URL)
            await tid("main-menu").wait_for(timeout=120000)
            print("webgl check:", await page.evaluate("(()=>{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'))})()"))
            await tid("play-button").click()
            await tid("run-no-graphics").wait_for(timeout=20000)
            print("PASS run-no-graphics shown")
            ids = await page.evaluate("[...document.querySelectorAll('[data-testid]')].filter(e=>e.offsetParent!==null||e.getClientRects().length).map(e=>e.dataset.testid)")
            print("visible ids", ids)
            print("error-fallback present:", "error-fallback" in ids)
            hud = [i for i in ids if i.startswith("hud-")]
            print("HUD ids visible:", hud, "PASS" if not hud else "FAIL")
            print("message:", await tid("run-no-graphics").text_content())
            s1 = await page.evaluate("window.__RR_DEBUG__ && JSON.stringify({p:window.__RR_DEBUG__.state.phase,d:window.__RR_DEBUG__.state.distance,sc:window.__RR_DEBUG__.state.score})")
            await page.wait_for_timeout(4000)
            s2 = await page.evaluate("window.__RR_DEBUG__ && JSON.stringify({p:window.__RR_DEBUG__.state.phase,d:window.__RR_DEBUG__.state.distance,sc:window.__RR_DEBUG__.state.score})")
            print("sim state t0", s1, "t+4s", s2, "PASS frozen" if s1 == s2 else "CHECK (changed)")
            btn = await tid("run-no-graphics-home").bounding_box()
            print("home btn box", btn)
            await page.screenshot(path=f"{OUT}/nogl_run.png", scale="css")
            await tid("run-no-graphics-home").click()
            await tid("main-menu").wait_for(timeout=15000)
            print("PASS back to main-menu")
            await page.screenshot(path=f"{OUT}/nogl_back.png", scale="css")
            # second attempt to make sure repeated entry works
            await tid("play-button").click()
            await tid("run-no-graphics").wait_for(timeout=20000)
            await tid("run-no-graphics-home").click()
            await tid("main-menu").wait_for(timeout=15000)
            print("PASS repeat entry/exit")
        except Exception as e:
            print("ERROR", e)
            await page.screenshot(path=f"{OUT}/nogl_err.png", scale="css")
        print("pageerrors", errs)
        await b.close()
asyncio.run(main())
