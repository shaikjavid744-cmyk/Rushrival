"""P3-B: signed-in run -> /runs/start + /runs/finish -> Synced toast + wallet reconcile; offline run -> queue -> back online flush; sync-failed banner; leaderboard own-rank + report."""
import asyncio, re, sys, json
sys.path.insert(0, "/app/tests/rr3d")
import requests
from playwright.async_api import async_playwright
from p3_common import URL, ARGS, OUT, shot
from dotenv import dotenv_values

B = dotenv_values("/app/mobile/.env")["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api/v1"
R = {}


def rep(k, ok, info=""):
    R[k] = ok
    print(("PASS " if ok else "FAIL ") + k, info)


def server_wallet():
    d = requests.post(f"{B}/auth/login", json={"email": "player@rushrivals.test", "password": "RushPlayer123!"}, headers={"X-Forwarded-For": "10.4.4.4"}).json()
    return requests.get(f"{B}/me", headers={"Authorization": f"Bearer {d['access_token']}"}).json()["user"]["wallet"]


async def play_and_finish(page, secs=22, offline_ctx=None):
    tid = lambda t: page.locator(f"[data-testid='{t}']:visible").first
    await tid("play-button").click()
    await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=120000)
    await page.evaluate("window.__RR_DEBUG__.setGodMode(true)")
    await page.wait_for_timeout(secs * 1000)
    if offline_ctx:
        await offline_ctx.set_offline(True)
        print("-> offline")
    await page.evaluate("window.__RR_DEBUG__.setGodMode(false)")
    try:
        await page.evaluate("window.__RR_DEBUG__.placeTrainAhead && window.__RR_DEBUG__.placeTrainAhead()")
    except Exception:
        pass
    await page.wait_for_function("['crashed','revive','over'].includes(window.__RR_DEBUG__.state.phase)", timeout=180000, polling=100)
    st = await page.evaluate("window.__RR_DEBUG__.state")
    print("run state at crash:", {k: st.get(k) for k in ("distance", "coins", "score", "runId")})
    await tid("revive-panel").wait_for(timeout=60000)
    await tid("revive-decline-button").click()
    await tid("game-over-panel").wait_for(timeout=10000)
    return st


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, storage_state=f"{OUT}/state_player.json")
        page = await ctx.new_page()
        tid = lambda t: page.locator(f"[data-testid='{t}']:visible").first
        apis, toasts, errs = [], [], []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        page.on("response", lambda r: apis.append(f"{r.status} {r.request.method} {r.url.split('/api/v1')[-1][:40]}") if "/api/v1" in r.url else None)
        page.on("requestfailed", lambda r: apis.append(f"FAILED {r.method} {r.url.split('/api/v1')[-1][:40]}") if "/api/v1" in r.url else None)
        await page.goto(URL + "/menu")
        await tid("main-menu").wait_for(timeout=60000)
        await page.wait_for_timeout(2500)
        w0 = server_wallet()
        print("server wallet before:", w0, "ui:", await tid("menu-coin-balance-value").inner_text())
        # --- online run
        apis.clear()
        st = await play_and_finish(page)
        synced = False
        for _ in range(20):
            body = await page.inner_text("body")
            if "Synced" in body:
                synced = True; break
            await page.wait_for_timeout(500)
        await shot(page, "b_gameover_online")
        rep("synced_toast_online_run", synced)
        print("api:", [a for a in apis if "/runs" in a or "/me" in a])
        rep("runs_start_and_finish_called", any("/runs/start" in a and a.startswith("200") for a in apis) and any("/runs/finish" in a and a.startswith("200") for a in apis), "")
        w1 = server_wallet()
        rep("server_wallet_increased_by_run_coins", w1["coins"] - w0["coins"] == st["coins"], f"{w0['coins']} -> {w1['coins']} run coins {st['coins']}")
        await tid("game-over-home-button").click() if await page.locator("[data-testid='game-over-home-button']:visible").count() else await page.goto(URL + "/menu")
        await tid("main-menu").wait_for(timeout=20000); await page.wait_for_timeout(1500)
        ui = (await tid("menu-coin-balance-value").inner_text()).replace(",", "")
        rep("ui_wallet_reconciled", int(ui) == w1["coins"], f"ui={ui} server={w1['coins']}")
        # --- leaderboard own rank + report
        await tid("menu-leaderboard-button").click(); await tid("leaderboard-screen").wait_for(); await page.wait_for_timeout(3000)
        rows = page.locator("[data-testid^=leaderboard-row-]")
        rep("lb_rows_and_my_rank", await rows.count() > 0 and await page.locator("[data-testid=leaderboard-my-rank]:visible").count() > 0,
            f"rows={await rows.count()} myrank={await page.locator('[data-testid=leaderboard-my-rank]:visible').first.inner_text() if await page.locator('[data-testid=leaderboard-my-rank]:visible').count() else None}")
        me_bg = await page.evaluate("[...document.querySelectorAll('[data-testid^=leaderboard-row-]')].map(e=>e.textContent+'|'+getComputedStyle(e).backgroundColor+'|'+getComputedStyle(e).borderColor)")
        print("rows:", me_bg)
        await shot(page, "b_lb")
        rp = page.locator("[data-testid^=leaderboard-report-]:visible")
        if await rp.count():
            await rp.first.click(); await page.wait_for_timeout(2500)
            body = await page.inner_text("body")
            rep("lb_report", "Reported" in body, (re.findall(r"Reported[^\n]*|Couldn[^\n]*", body) or [""])[0])
        else:
            rep("lb_report", False, "no report button")
        await page.go_back(); await tid("main-menu").wait_for(timeout=10000)
        # --- offline run
        apis.clear()
        st2 = await play_and_finish(page, secs=15, offline_ctx=ctx)
        await page.wait_for_timeout(3000)
        await shot(page, "b_gameover_offline")
        banner = await page.locator("[data-testid=sync-failed-banner]:visible").count()
        rep("sync_failed_banner_while_offline", banner > 0)
        q = await page.evaluate("localStorage.getItem('rr.online.queue') || Object.keys(localStorage).filter(k=>k.includes('queue')).map(k=>k+':'+localStorage.getItem(k).slice(0,300)).join(';')")
        print("queue in storage:", str(q)[:400])
        print("offline api:", apis[-6:])
        apis.clear()
        await ctx.set_offline(False)
        print("-> online")
        synced = False
        for _ in range(30):
            if "Synced" in await page.inner_text("body"):
                synced = True; break
            await page.wait_for_timeout(500)
        rep("queue_flush_on_reconnect_synced_toast", synced, str(apis[-6:]))
        await page.wait_for_timeout(1500)
        w2 = server_wallet()
        print("server wallet after offline flush:", w2, "run coins", st2["coins"], "delta", w2["coins"] - w1["coins"])
        rep("sync_banner_gone_after_flush", await page.locator("[data-testid=sync-failed-banner]:visible").count() == 0)
        print("page errors:", errs[:5])
        print("SUMMARY", R)
        await ctx.storage_state(path=f"{OUT}/state_player2.json")
        await b.close()

asyncio.run(main())
