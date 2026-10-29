"""P3-F (iteration 8): Hindi labels, sign-out/delete back-press (Escape) -> exit dialog, inbox gems then delete -> reset,
personal bests after guest run, maintenance Play offline + Retry, update banner Update now/Later."""
import asyncio, sys, uuid
sys.path.insert(0, "/app/tests/rr3d")
from playwright.async_api import async_playwright
from p3_common import URL, ARGS, OUT, shot, onboard
from dotenv import dotenv_values
from pymongo import MongoClient

BE = dotenv_values("/app/backend/.env")
DB = MongoClient(BE["MONGO_URL"])[BE["DB_NAME"]]
R = {}


def rep(k, ok, info=""):
    R[k] = ok
    print(("PASS " if ok else "FAIL ") + k, info, flush=True)


def cfg(**kw):
    DB.remote_config.update_one({"_id": "active"}, {"$set": kw})


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        vis = lambda t: page.locator(f"[data-testid='{t}']:visible")
        tid = lambda t: vis(t).first
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        try:
            await page.goto(URL)
            await onboard(page)
            await page.wait_for_timeout(1000)
            # --- guest run -> personal bests on signed-out leaderboard
            await tid("play-button").click()
            await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=60000)
            await page.wait_for_function("['crashed','revive','over'].includes(window.__RR_DEBUG__.state.phase)", timeout=120000, polling=200)
            await tid("revive-panel").wait_for(timeout=30000); await tid("revive-decline-button").click()
            await tid("game-over-panel").wait_for(timeout=10000)
            await tid("game-over-home-button").click(); await tid("main-menu").wait_for(timeout=15000)
            await tid("menu-leaderboard-button").click(); await tid("leaderboard-screen").wait_for(timeout=10000); await page.wait_for_timeout(2000)
            n = await page.locator("[data-testid^=leaderboard-best-]:visible").count()
            rep("lb_personal_bests_after_run", n > 0 and await vis("leaderboard-signed-out").count() > 0, f"best rows={n} txt={[await page.locator('[data-testid^=leaderboard-best-]:visible').nth(i).inner_text() for i in range(min(n,3))]}")
            await shot(page, "f_lb_bests")
            await page.go_back(); await tid("main-menu").wait_for(timeout=10000)
            # --- Hindi labels
            await tid("menu-settings-button").click(); await page.wait_for_timeout(800)
            await tid("language-row").click(); await page.wait_for_timeout(500)
            await tid("language-hi").click(); await page.wait_for_timeout(800)
            if await vis("main-menu").count() == 0:
                await page.go_back()
            await tid("main-menu").wait_for(timeout=10000); await page.wait_for_timeout(800)
            ev = await tid("menu-events-button").inner_text()
            al = await tid("menu-account-button").get_attribute("aria-label")
            lbl = await tid("menu-leaderboard-button").inner_text()
            rep("hindi_labels", "इवेंट" in ev and al == "खाता" and "लीडरबोर्ड" in lbl, f"events={ev!r} account_aria={al!r} lb={lbl!r}")
            clip = await page.evaluate("""() => [...document.querySelectorAll('[data-testid^=menu-]')].filter(e=>e.offsetParent).map(e=>[...e.querySelectorAll('div')].filter(d=>d.childElementCount===0&&d.textContent.trim()&&d.scrollWidth>d.clientWidth+1).map(d=>e.dataset.testid+':'+d.textContent)).flat()""")
            rep("hindi_no_clip", not clip, str(clip))
            await shot(page, "f_menu_hindi")
            # back to English
            await tid("menu-settings-button").click(); await page.wait_for_timeout(800)
            await tid("language-row").click(); await page.wait_for_timeout(500)
            await tid("language-en").click(); await page.wait_for_timeout(800)
            if await vis("main-menu").count() == 0:
                await page.go_back()
            await tid("main-menu").wait_for(timeout=10000)
            # --- register C, claim inbox gems, delete -> reset + Escape shows exit dialog
            email = f"test_c_{uuid.uuid4().hex[:6]}@rushrivals.test"
            await tid("menu-account-button").click(); await tid("account-screen").wait_for(timeout=10000)
            await tid("account-tab-register").click(); await page.wait_for_timeout(300)
            await tid("account-email-input").fill(email); await tid("account-password-input").fill("TestPass123!")
            await tid("account-submit").click()
            for _ in range(60):
                if await vis("account-signed-in").count() or await vis("link-conflict-dialog").count() or await vis("account-error").count():
                    break
                await page.wait_for_timeout(500)
            rep("register_C", await vis("account-signed-in").count() > 0, await tid("account-error").inner_text() if await vis("account-error").count() else "")
            await page.go_back(); await tid("main-menu").wait_for(timeout=10000); await page.wait_for_timeout(1000)
            w_before = await tid("menu-gem-balance-value").inner_text()
            await tid("menu-inbox-button").click(); await tid("inbox-screen").wait_for(timeout=10000); await page.wait_for_timeout(2500)
            cl = page.locator("[data-testid^=inbox-claim-]:visible")
            if await cl.count() == 0 and await page.locator("[data-testid^=inbox-open-]:visible").count():
                await page.locator("[data-testid^=inbox-open-]:visible").first.click(); await page.wait_for_timeout(800)
            if await cl.count():
                await cl.first.click(); await page.wait_for_timeout(2500)
            await shot(page, "f_inbox")
            await page.goto(URL + "/menu"); await tid("main-menu").wait_for(timeout=30000); await page.wait_for_timeout(1500)
            w_after = await tid("menu-gem-balance-value").inner_text()
            print("C gems before/after inbox:", w_before, w_after)
            await tid("menu-account-button").click(); await tid("account-screen").wait_for(timeout=10000)
            await tid("account-delete-toggle").click(); await page.wait_for_timeout(300)
            await tid("account-delete-input").fill("DELETE"); await tid("account-delete-confirm").click()
            await tid("main-menu").wait_for(timeout=15000); await page.wait_for_timeout(1500)
            g = await tid("menu-gem-balance-value").inner_text(); c = await tid("menu-coin-balance-value").inner_text()
            rep("delete_resets_wallet", w_after != w_before and g == "0" and c == "0", f"gems {w_before}->{w_after} after delete gems={g} coins={c}")
            await page.keyboard.press("Escape"); await page.wait_for_timeout(1000)
            ex = await vis("exit-dialog").count()
            menus_vis = await vis("main-menu").count()
            rep("delete_back_shows_exit_dialog", ex > 0, f"exit_dialog={ex} menu_visible={menus_vis} url={page.url}")
            await shot(page, "f_after_delete_escape")
            # --- maintenance
            cfg(maintenance=True)
            await page.goto(URL + "/menu"); await page.wait_for_timeout(9000)
            ms = await vis("maintenance-screen").count()
            po = await vis("maintenance-play-offline").count(); rt = await vis("maintenance-retry").count()
            rep("maintenance_screen_buttons", ms > 0 and po > 0 and rt > 0, f"screen={ms} play_offline={po} retry={rt}")
            await shot(page, "f_maintenance")
            if rt:
                await tid("maintenance-retry").click(); await page.wait_for_timeout(2500)
                rep("maintenance_retry_stays", await vis("maintenance-screen").count() > 0)
            if po:
                await tid("maintenance-play-offline").click(); await page.wait_for_timeout(1500)
                await tid("main-menu").wait_for(timeout=10000)
                await tid("play-button").click()
                await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=60000)
                rep("maintenance_play_offline_playable", await vis("maintenance-screen").count() == 0)
                await page.wait_for_function("['crashed','revive','over'].includes(window.__RR_DEBUG__.state.phase)", timeout=120000, polling=200)
                await tid("revive-panel").wait_for(timeout=30000); await tid("revive-decline-button").click()
                await tid("game-over-panel").wait_for(timeout=10000)
                rep("maintenance_offline_run_completes", True)
            cfg(maintenance=False)
            # --- update available banner
            cfg(latest_version="1.1.0")
            await page.goto(URL + "/menu"); await tid("main-menu").wait_for(timeout=60000); await page.wait_for_timeout(3000)
            ban = await vis("update-available-banner").count()
            txt = await tid("update-available-banner").inner_text() if ban else ""
            rep("update_banner_now_later", ban > 0 and "Update now" in txt and "Later" in txt, repr(txt))
            await shot(page, "f_update_banner")
            if ban:
                await tid("update-available-dismiss").click(); await page.wait_for_timeout(800)
                rep("update_banner_later_dismisses", await vis("update-available-banner").count() == 0)
        except Exception as e:
            print("EXC", str(e)[:400]); await shot(page, "f_exc")
        finally:
            cfg(maintenance=False, min_supported_version="1.0.0", latest_version="1.0.0")
            print("config reset:", DB.remote_config.find_one({"_id": "active"}))
        print("page errors:", errs[:5])
        print("SUMMARY", R)
        await b.close()

asyncio.run(main())
