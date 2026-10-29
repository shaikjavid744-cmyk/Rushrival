"""P3-E (iteration 8 retest): guest onboarding + menu layout 390, signed-out leaderboard, sign in player (keep cloud),
first run from menu Play -> /runs/start + /runs/finish + daily score, events claim disabled, sign-out wallet reset + nav stack,
register fresh B (no A coins), delete B -> wallet reset."""
import asyncio, sys, uuid, time
sys.path.insert(0, "/app/tests/rr3d")
import requests
from playwright.async_api import async_playwright
from p3_common import URL, ARGS, OUT, shot, onboard
from dotenv import dotenv_values
from pymongo import MongoClient

B = dotenv_values("/app/mobile/.env")["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api/v1"
BE = dotenv_values("/app/backend/.env")
DB = MongoClient(BE["MONGO_URL"])[BE["DB_NAME"]]
R = {}


def rep(k, ok, info=""):
    R[k] = ok
    print(("PASS " if ok else "FAIL ") + k, info, flush=True)


async def menu_wallet(page):
    g = lambda t: page.locator(f"[data-testid='{t}']:visible").first.inner_text()
    return (await g("menu-coin-balance-value")).replace(",", ""), (await g("menu-gem-balance-value")).replace(",", "")


async def wait_any(page, ids, t=30):
    for _ in range(t * 2):
        for i in ids:
            if await page.locator(f"[data-testid='{i}']:visible").count():
                return i
        await page.wait_for_timeout(500)
    return None


async def signin(page, email, pw, mode="signin"):
    tid = lambda t: page.locator(f"[data-testid='{t}']:visible").first
    if mode == "register":
        await tid("account-tab-register").click(); await page.wait_for_timeout(300)
    await tid("account-email-input").fill(email)
    await tid("account-password-input").fill(pw)
    await tid("account-submit").click()
    got = await wait_any(page, ["link-conflict-dialog", "account-signed-in", "account-error"], 40)
    if got == "account-error":
        print("account-error:", await tid("account-error").inner_text())
    return got


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        tid = lambda t: page.locator(f"[data-testid='{t}']:visible").first
        errs, apis = [], []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        page.on("response", lambda r: apis.append(f"{r.status} {r.request.method} {r.url.split('/api/v1')[-1][:50]}") if "/api/v1" in r.url else None)
        await page.goto(URL)
        await onboard(page)
        rep("onboarding_to_menu", True)
        await page.wait_for_timeout(1500)
        guest_w = await menu_wallet(page)
        print("guest wallet after onboarding:", guest_w)
        # --- menu bottom row layout
        boxes = {}
        for t in ["menu-leaderboard-button", "menu-events-button", "menu-settings-button", "menu-inbox-button", "menu-account-button"]:
            bb = await tid(t).bounding_box() if await page.locator(f"[data-testid='{t}']:visible").count() else None
            boxes[t] = bb and {k: round(v) for k, v in bb.items()}
        print("boxes", boxes)
        row = [boxes[t] for t in ["menu-leaderboard-button", "menu-events-button", "menu-settings-button", "menu-inbox-button"]]
        rep("menu_bottom_4_fit_390", all(r and r["x"] >= 0 and r["x"] + r["width"] <= 390 and r["height"] >= 44 for r in row), str(row))
        clip = await page.evaluate("""() => [...document.querySelectorAll('[data-testid=main-menu] [data-testid^=menu-]')].filter(e=>e.offsetParent).map(e=>{const t=[...e.querySelectorAll('div')].filter(d=>d.childElementCount===0&&d.textContent.trim()); return t.filter(d=>d.scrollWidth>d.clientWidth+1).map(d=>e.dataset.testid+':'+d.textContent)}).flat()""")
        rep("menu_no_clipped_labels", not clip, str(clip))
        acc = boxes["menu-account-button"]
        rep("account_button_top_bar", bool(acc) and acc["y"] < 200, str(acc))
        await shot(page, "e_menu_guest")
        # --- leaderboard signed out
        await tid("menu-leaderboard-button").click(); await tid("leaderboard-screen").wait_for(timeout=10000); await page.wait_for_timeout(2500)
        so = await page.locator("[data-testid=leaderboard-signed-out]:visible").count()
        bests = await page.locator("[data-testid^=leaderboard-best-]:visible").count()
        rows = await page.locator("[data-testid^=leaderboard-row-]:visible").count()
        rep("lb_signed_out_card", so > 0 and bests > 0 and rows == 0, f"signed_out={so} bests/empty={bests} global_rows={rows}")
        await shot(page, "e_lb_signed_out")
        await page.go_back(); await tid("main-menu").wait_for(timeout=10000)
        # --- sign in A (player) -> keep cloud
        await tid("menu-account-button").click(); await tid("account-screen").wait_for(timeout=10000)
        got = await signin(page, "player@rushrivals.test", "RushPlayer123!")
        print("signin result:", got)
        if got == "link-conflict-dialog":
            await shot(page, "e_conflict")
            await (tid("link-keep-cloud") if await page.locator("[data-testid=link-keep-cloud]:visible").count() else tid("link-conflict-cloud")).click()
            got = await wait_any(page, ["account-signed-in"], 20)
        rep("signin_player", got == "account-signed-in")
        await page.goto(URL + "/menu"); await tid("main-menu").wait_for(timeout=60000); await page.wait_for_timeout(2500)
        a_w = await menu_wallet(page)
        tokA = requests.post(f"{B}/auth/login", json={"email": "player@rushrivals.test", "password": "RushPlayer123!"}).json().get("access_token")
        sw = requests.get(f"{B}/me", headers={"Authorization": f"Bearer {tokA}"}).json()["user"]
        rep("menu_shows_cloud_wallet", a_w == (str(sw["wallet"]["coins"]), str(sw["wallet"]["gems"])), f"ui={a_w} server={sw['wallet']}")
        uidA = sw["user_id"]
        # --- first run from menu Play
        apis.clear()
        await tid("play-button").click()
        await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=120000)
        await page.evaluate("window.__RR_DEBUG__.setGodMode(true)")
        await page.wait_for_timeout(21000)
        await page.evaluate("window.__RR_DEBUG__.setGodMode(false)")
        try:
            await page.evaluate("window.__RR_DEBUG__.placeTrainAhead && window.__RR_DEBUG__.placeTrainAhead()")
        except Exception:
            pass
        await page.wait_for_function("['crashed','revive','over'].includes(window.__RR_DEBUG__.state.phase)", timeout=180000, polling=100)
        st = await page.evaluate("window.__RR_DEBUG__.state")
        print("run:", {k: st.get(k) for k in ("distance", "coins", "score", "runId")})
        await tid("revive-panel").wait_for(timeout=60000)
        await tid("revive-decline-button").click()
        await tid("game-over-panel").wait_for(timeout=10000)
        synced = False
        for _ in range(20):
            if "Synced" in await page.inner_text("body"):
                synced = True; break
            await page.wait_for_timeout(500)
        await page.wait_for_timeout(1500)
        runs = [a for a in apis if "/runs" in a]
        print("run apis:", runs)
        rep("first_run_start_finish", any("/runs/start" in a and a.startswith("200") for a in runs) and any("/runs/finish" in a and a.startswith("200") for a in runs) and not any("/runs/offline" in a for a in runs), str(runs))
        rep("synced_toast", synced)
        sc = DB.scores.find_one({"user_id": uidA}, sort=[("_id", -1)])
        lb = requests.get(f"{B}/leaderboard", params={"period": "daily", "limit": 50}, headers={"Authorization": f"Bearer {tokA}"}).json()
        rep("score_on_daily_lb", bool(sc) and sc.get("score") == st["score"] and lb.get("me") is not None, f"db={sc and {k: sc.get(k) for k in ('score','day','run_id')}} me={lb.get('me')} run_score={st['score']}")
        await shot(page, "e_gameover_online")
        await page.goto(URL + "/menu"); await tid("main-menu").wait_for(timeout=30000); await page.wait_for_timeout(2000)
        a_w = await menu_wallet(page)
        print("A wallet after run:", a_w)
        # --- events claim disabled
        await tid("menu-events-button").click(); await tid("events-screen").wait_for(timeout=10000); await page.wait_for_timeout(3000)
        if await page.locator("[data-testid=event-claim]:visible").count():
            c = tid("event-claim")
            txt = await c.inner_text()
            dis = await c.get_attribute("aria-disabled")
            prog = await tid("event-progress").inner_text() if await page.locator("[data-testid=event-progress]:visible").count() else ""
            rep("event_claim_disabled_until_target", ("Reach 50" in txt and dis == "true") or ("Claim reward" in txt), f"txt={txt!r} aria-disabled={dis} progress={prog!r}")
        else:
            rep("event_claim_disabled_until_target", await page.locator("[data-testid=event-claimed]:visible").count() > 0, "no claim btn (claimed?)")
        await shot(page, "e_events")
        await page.go_back(); await tid("main-menu").wait_for(timeout=10000)
        # --- sign out A
        await tid("menu-account-button").click(); await tid("account-screen").wait_for(timeout=10000)
        await tid("account-sign-out").click()
        await tid("main-menu").wait_for(timeout=15000); await page.wait_for_timeout(2000)
        so_w = await menu_wallet(page)
        save = await page.evaluate("(()=>{try{const s=JSON.parse(localStorage.getItem('rr_save_main'));const d=s.data||s;return JSON.stringify({c:d.coins,g:d.gems,h:d.hoverboards,o:d.owned,e:d.equipped})}catch(e){return String(e)}})()")
        rep("signout_wallet_reset", so_w == ("0", "0"), f"ui={so_w} save={save[:300]}")
        menus = await page.locator("[data-testid=main-menu]").count()
        await page.go_back(); await page.wait_for_timeout(1500)
        print("after back url:", page.url, "menus in DOM before back:", menus)
        await shot(page, "e_after_signout_back")
        on_menu_after_back = await page.locator("[data-testid=main-menu]:visible").count()
        rep("signout_stack_single_menu", menus == 1, f"menus_in_dom={menus} visible_after_back={on_menu_after_back} url={page.url}")
        await page.goto(URL + "/menu"); await tid("main-menu").wait_for(timeout=30000); await page.wait_for_timeout(1500)
        # --- register B
        emailB = f"test_b_{uuid.uuid4().hex[:6]}@rushrivals.test"
        await tid("menu-account-button").click(); await tid("account-screen").wait_for(timeout=10000)
        got = await signin(page, emailB, "TestPass123!", mode="register")
        print("register B:", got)
        await page.wait_for_timeout(2000)
        ub = DB.users.find_one({"email": emailB}, {"_id": 0, "wallet": 1, "inventory": 1, "user_id": 1})
        rep("B_no_A_currency", got == "account-signed-in" and ub and ub["wallet"].get("coins", 0) < 100 and ub["wallet"].get("gems", 0) < 5, f"B={ub}")
        await page.goto(URL + "/menu"); await tid("main-menu").wait_for(timeout=30000); await page.wait_for_timeout(2000)
        print("B ui wallet:", await menu_wallet(page))
        # give B some coins server-side, sync into UI, then delete -> wallet reset
        DB.users.update_one({"email": emailB}, {"$set": {"wallet.coins": 777, "wallet.gems": 7}})
        await tid("menu-account-button").click(); await tid("account-screen").wait_for(timeout=10000)
        await page.goto(URL + "/menu"); await tid("main-menu").wait_for(timeout=30000); await page.wait_for_timeout(3000)
        print("B ui wallet after server edit+reload:", await menu_wallet(page))
        await tid("menu-account-button").click(); await tid("account-screen").wait_for(timeout=10000)
        await tid("account-delete-toggle").click(); await page.wait_for_timeout(300)
        await tid("account-delete-input").fill("DELETE")
        await tid("account-delete-confirm").click()
        await tid("main-menu").wait_for(timeout=15000); await page.wait_for_timeout(2000)
        del_w = await menu_wallet(page)
        menus = await page.locator("[data-testid=main-menu]").count()
        rep("delete_wallet_reset", del_w == ("0", "0"), f"ui={del_w}")
        rep("delete_stack_single_menu", menus == 1, f"menus_in_dom={menus}")
        rep("B_deleted_in_db", DB.users.count_documents({"email": emailB}) == 0 or DB.users.find_one({"email": emailB}).get("deleted"), "")
        await shot(page, "e_after_delete")
        # --- guest run regression (offline, no account)
        apis.clear()
        await tid("play-button").click()
        await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=60000)
        await page.wait_for_function("['crashed','revive','over'].includes(window.__RR_DEBUG__.state.phase)", timeout=120000, polling=200)
        await tid("revive-panel").wait_for(timeout=30000); await tid("revive-decline-button").click()
        await tid("game-over-panel").wait_for(timeout=10000)
        rep("guest_run_no_server_calls", not any("/runs" in a for a in apis), str([a for a in apis if '/runs' in a]))
        print("page errors:", errs[:5])
        print("SUMMARY", R)
        await b.close()

asyncio.run(main())
