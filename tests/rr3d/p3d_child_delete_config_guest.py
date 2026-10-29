"""P3-D: child mode, register+delete account (typed DELETE), google redirect, remote config gates, guest offline regression + leaderboard error/Retry."""
import asyncio, sys, subprocess, uuid
sys.path.insert(0, "/app/tests/rr3d")
from playwright.async_api import async_playwright
from p3_common import URL, ARGS, OUT, onboard, shot

R = {}


def rep(k, ok, info=""):
    R[k] = ok
    print(("PASS " if ok else "FAIL ") + k, info)


def rc(setexpr):
    subprocess.run(["mongosh", "test_database", "--quiet", "--eval", f"db.remote_config.updateOne({{_id:'active'}},{{$set:{setexpr}}})"], check=True, capture_output=True)


async def vis(page, t):
    return await page.locator(f"[data-testid='{t}']:visible").count() > 0


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        # ---------- child mode
        ctx = await b.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        tid = lambda t: page.locator(f"[data-testid='{t}']:visible").first
        await page.goto(URL)
        await onboard(page, child=True, name="Kid")
        await page.goto(URL + "/account"); await tid("account-screen").wait_for(timeout=30000); await page.wait_for_timeout(800)
        rep("child_hides_register", not await vis(page, "account-tab-register"))
        rep("child_hides_google", not await vis(page, "account-google"))
        rep("child_note", await vis(page, "account-child-note"))
        await shot(page, "d_child_account")
        await ctx.close()
        # ---------- adult guest: register throwaway, delete
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, storage_state=f"{OUT}/state_player.json")
        await ctx.add_init_script("for (const k of Object.keys(localStorage)) if (k.startsWith('rr.online')) localStorage.removeItem(k);")
        page = await ctx.new_page()
        tid = lambda t: page.locator(f"[data-testid='{t}']:visible").first
        apis = []
        page.on("response", lambda r: apis.append(f"{r.status} {r.request.method} {r.url.split('/api/v1')[-1][:40]}") if "/api/v1" in r.url else None)
        await page.goto(URL + "/menu"); await tid("main-menu").wait_for(timeout=60000)
        await page.evaluate("for (const k of Object.keys(localStorage)) if (k.startsWith('rr.online')) localStorage.removeItem(k);")
        await page.goto(URL + "/account"); await tid("account-screen").wait_for(timeout=30000); await page.wait_for_timeout(800)
        rep("guest_state_signed_out", await vis(page, "account-email-input"))
        await tid("account-tab-register").click()
        email = f"test_del_{uuid.uuid4().hex[:6]}@rushrivals.test"
        await tid("account-email-input").fill(email); await tid("account-password-input").fill("short")
        await tid("account-submit").click(); await page.wait_for_timeout(2000)
        e1 = await tid("account-error").inner_text() if await vis(page, "account-error") else None
        rep("register_short_pw_msg", e1 is not None and "8" in e1, e1)
        await tid("account-email-input").fill("player@rushrivals.test"); await tid("account-password-input").fill("SomePass123!")
        await tid("account-submit").click(); await page.wait_for_timeout(2000)
        e2 = await tid("account-error").inner_text() if await vis(page, "account-error") else None
        rep("register_dup_email_msg", e2 is not None and "already" in e2.lower(), e2)
        await tid("account-email-input").fill(email); await tid("account-password-input").fill("DeleteMe123!")
        await tid("account-submit").click(); await page.wait_for_timeout(3500)
        if await vis(page, "link-conflict-dialog"):
            await tid("link-keep-device").click(); await page.wait_for_timeout(2000)
        rep("register_signed_in", await vis(page, "account-signed-in"), await tid("account-email").inner_text() if await vis(page, "account-email") else str(apis[-3:]))
        await tid("account-delete-toggle").click(); await page.wait_for_timeout(300)
        await tid("account-delete-input").fill("delete")
        d1 = await tid("account-delete-confirm").get_attribute("aria-disabled")
        await tid("account-delete-input").fill("DELETE")
        d2 = await tid("account-delete-confirm").get_attribute("aria-disabled")
        rep("delete_btn_disabled_until_DELETE", d1 == "true" and d2 != "true", f"{d1}/{d2}")
        await shot(page, "d_delete")
        await tid("account-delete-confirm").click(); await page.wait_for_timeout(3000)
        rep("delete_navigates_menu", await vis(page, "main-menu"), page.url)
        out = subprocess.run(["mongosh", "test_database", "--quiet", "--eval", f"printjson(db.users.findOne({{email:'{email}'}},{{_id:0,deleted:1,email:1}}))"], capture_output=True, text=True).stdout
        rep("delete_server_gone", "null" in out or "deleted: true" in out, out.strip()[:120])
        # google redirect
        await page.goto(URL + "/account"); await tid("account-screen").wait_for(timeout=30000)
        try:
            async with page.expect_request(lambda r: "auth.emergentagent.com" in r.url, timeout=15000) as rq:
                await tid("account-google").click()
            rep("google_redirect", True, (await rq.value).url[:140])
        except Exception as e:
            rep("google_redirect", False, str(e)[:100])
        # ---------- remote config gates
        page2 = await ctx.new_page()
        tid = lambda t: page2.locator(f"[data-testid='{t}']:visible").first
        try:
            rc("{maintenance:true}")
            await page2.goto(URL + "/menu"); await page2.wait_for_timeout(9000)
            rep("maintenance_screen", await vis(page2, "maintenance-screen"))
            body = await page2.inner_text("body")
            rep("maintenance_play_offline_option", "offline" in body.lower(), "JRN-55 expects 'Play offline'")
            await shot(page2, "d_maintenance")
            rc("{maintenance:false, min_supported_version:'9.0.0'}")
            await page2.reload(); await page2.wait_for_timeout(9000)
            rep("update_required_screen", await vis(page2, "update-required-screen") and await vis(page2, "update-required-button"))
            await shot(page2, "d_update_required")
            rc("{min_supported_version:'1.0.0', latest_version:'9.0.0'}")
            await page2.reload(); await page2.wait_for_timeout(9000)
            rep("update_available_banner", await vis(page2, "update-available-banner"))
            await shot(page2, "d_update_available")
            if await vis(page2, "update-available-dismiss"):
                await tid("update-available-dismiss").click(); await page2.wait_for_timeout(500)
                rep("update_banner_dismiss", not await vis(page2, "update-available-banner"))
        finally:
            rc("{maintenance:false, min_supported_version:'1.0.0', latest_version:'1.0.0'}")
            print("remote config reset")
        # ---------- guest offline regression
        await page2.goto(URL + "/menu"); await tid("main-menu").wait_for(timeout=60000); await page2.wait_for_timeout(1500)
        await ctx.set_offline(True)
        await tid("menu-leaderboard-button").click(); await tid("leaderboard-screen").wait_for(); await page2.wait_for_timeout(4000)
        rep("lb_offline_unavailable_retry", await vis(page2, "leaderboard-unavailable") and await vis(page2, "leaderboard-retry"))
        await shot(page2, "d_lb_offline")
        await ctx.set_offline(False)
        await tid("leaderboard-retry").click(); await page2.wait_for_timeout(4000)
        rep("lb_retry_recovers", not await vis(page2, "leaderboard-unavailable"))
        await page2.go_back(); await tid("main-menu").wait_for(timeout=10000)
        await ctx.set_offline(True)
        await tid("play-button").click()
        try:
            await page2.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=60000)
            await page2.wait_for_function("['crashed','revive','over'].includes(window.__RR_DEBUG__.state.phase)", timeout=180000, polling=100)
            await tid("revive-panel").wait_for(timeout=60000); await tid("revive-decline-button").click()
            await tid("game-over-panel").wait_for(timeout=10000)
            rep("guest_offline_run", True)
            rep("guest_no_sync_banner", not await vis(page2, "sync-failed-banner"))
        except Exception as e:
            rep("guest_offline_run", False, str(e)[:120])
        await ctx.set_offline(False)
        print("SUMMARY", R)
        await b.close()

asyncio.run(main())
