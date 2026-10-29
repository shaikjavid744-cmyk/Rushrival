"""P3-C: play-again path -> /runs/start + /runs/finish accepted; leaderboard own rank highlighted."""
import asyncio, sys
sys.path.insert(0, "/app/tests/rr3d")
from playwright.async_api import async_playwright
from p3_common import URL, ARGS, OUT, shot


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, storage_state=f"{OUT}/state_player2.json")
        page = await ctx.new_page()
        tid = lambda t: page.locator(f"[data-testid='{t}']:visible").first
        apis = []
        page.on("response", lambda r: apis.append(f"{r.status} {r.request.method} {r.url.split('/api/v1')[-1][:40]}") if "/api/v1" in r.url else None)
        await page.goto(URL + "/menu"); await tid("main-menu").wait_for(timeout=60000); await page.wait_for_timeout(2000)
        await tid("play-button").click()
        await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=120000)
        await page.wait_for_function("['crashed','revive','over'].includes(window.__RR_DEBUG__.state.phase)", timeout=180000, polling=100)
        await tid("revive-panel").wait_for(timeout=60000); await tid("revive-decline-button").click()
        await tid("game-over-panel").wait_for(timeout=10000); await page.wait_for_timeout(2000)
        print("run1 api:", [a for a in apis if "/runs" in a]); apis.clear()
        await tid("play-again-button").click()
        await page.wait_for_function("window.__RR_DEBUG__.state.phase === 'running'", timeout=60000)
        await page.evaluate("window.__RR_DEBUG__.setGodMode(true)")
        await page.wait_for_timeout(22000)
        await page.evaluate("window.__RR_DEBUG__.setGodMode(false)")
        await page.wait_for_function("['crashed','revive','over'].includes(window.__RR_DEBUG__.state.phase)", timeout=180000, polling=100)
        st = await page.evaluate("window.__RR_DEBUG__.state")
        print("run2 state:", {k: st.get(k) for k in ("distance", "coins", "score")})
        await tid("revive-panel").wait_for(timeout=60000); await tid("revive-decline-button").click()
        await tid("game-over-panel").wait_for(timeout=10000); await page.wait_for_timeout(4000)
        print("run2 api:", [a for a in apis if "/runs" in a])
        print("synced toast:", "Synced" in await page.inner_text("body"))
        await page.goto(URL + "/leaderboard"); await tid("leaderboard-screen").wait_for(timeout=30000); await page.wait_for_timeout(3000)
        print("rows:", await page.evaluate("[...document.querySelectorAll('[data-testid^=leaderboard-row-]')].map(e=>e.textContent+'|'+getComputedStyle(e).backgroundColor+'|'+getComputedStyle(e).borderColor)"))
        mr = page.locator("[data-testid=leaderboard-my-rank]:visible")
        print("my rank:", await mr.first.inner_text() if await mr.count() else None)
        await shot(page, "c_lb_after_online")
        await b.close()

asyncio.run(main())
