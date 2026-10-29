"""P3-A: onboarding (adult) -> menu nav -> account (register tab, forgot UI, google redirect, conflict link, player sign-in) -> leaderboard -> events -> inbox -> missions -> support."""
import asyncio, re, sys
sys.path.insert(0, "/app/tests/rr3d")
from playwright.async_api import async_playwright
from p3_common import URL, ARGS, OUT, onboard, shot

CONF = open(f"{OUT}/conf_email").read().strip()
R = {}


def rep(k, ok, info=""):
    R[k] = ok
    print(("PASS " if ok else "FAIL ") + k, info)


async def txt(page, t):
    l = page.locator(f"[data-testid='{t}']:visible")
    return (await l.first.inner_text()) if await l.count() else None


async def coins(page):
    return await txt(page, "menu-coin-balance-value"), await txt(page, "menu-gem-balance-value")


async def back_menu(page):
    await page.goto(URL + "/menu")
    await page.locator("[data-testid=main-menu]:visible").first.wait_for(timeout=30000)
    await page.wait_for_timeout(800)


async def signin(page, email, pw):
    tid = lambda t: page.locator(f"[data-testid='{t}']:visible")
    await tid("account-email-input").fill(email)
    await tid("account-password-input").fill(pw)
    await tid("account-submit").click()
    await page.wait_for_timeout(1500)
    for _ in range(30):
        if await tid("link-conflict-dialog").count() or await tid("account-signed-in").count() or await tid("account-error").count():
            break
        await page.wait_for_timeout(500)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        tid = lambda t: page.locator(f"[data-testid='{t}']:visible").first
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        apis = []
        page.on("response", lambda r: apis.append(f"{r.status} {r.request.method} {r.url.split('/api/v1')[-1][:60]}") if "/api/v1" in r.url else None)
        await page.goto(URL)
        try:
            await onboard(page)
            rep("onboarding_to_menu", True)
        except Exception as e:
            rep("onboarding_to_menu", False, str(e)[:200]); await shot(page, "a_onb_fail"); await b.close(); return
        await page.wait_for_timeout(1500)
        print("device wallet:", await coins(page))
        await shot(page, "a_menu")
        for btn, scr in [("menu-leaderboard-button", "leaderboard-screen"), ("menu-events-button", "events-screen"), ("menu-account-button", "account-screen")]:
            try:
                await tid(btn).click(); await tid(scr).wait_for(timeout=10000); rep(f"nav_{btn}", True, page.url)
            except Exception as e:
                rep(f"nav_{btn}", False, str(e)[:120])
            if scr != "account-screen":
                await page.wait_for_timeout(2500)
                await shot(page, f"a_{scr}_guest")
                if scr == "leaderboard-screen":
                    rep("lb_guest_cta", await tid("leaderboard-signin-cta").count() > 0, f"rows={await page.locator('[data-testid^=leaderboard-row-]').count()} unavailable={await tid('leaderboard-unavailable').count()}")
                await page.go_back(); await page.locator("[data-testid=main-menu]:visible").first.wait_for(timeout=10000)
        # account screen (guest)
        rep("account_register_tab", await tid("account-tab-register").count() > 0)
        rep("account_google_btn", await tid("account-google").count() > 0)
        await shot(page, "a_account_guest")
        # forgot UI
        await tid("account-forgot").click(); await page.wait_for_timeout(300)
        await tid("account-email-input").fill("player@rushrivals.test")
        await tid("account-submit").click()
        try:
            await tid("account-code-input").wait_for(timeout=10000)
            rep("forgot_to_reset_mode", True, await txt(page, "account-info"))
        except Exception:
            rep("forgot_to_reset_mode", False, await txt(page, "account-error"))
        await tid("account-code-input").fill("000000"); await tid("account-password-input").fill("Whatever123!")
        await tid("account-submit").click(); await page.wait_for_timeout(2500)
        rep("reset_wrong_code_rejected", await tid("account-error").count() > 0, await txt(page, "account-error"))
        await tid("account-tab-signin").click(); await page.wait_for_timeout(300)
        # wrong password
        await signin(page, "player@rushrivals.test", "WrongPass999")
        rep("wrong_pw_msg", await tid("account-error").count() > 0, await txt(page, "account-error"))
        # conflict account
        await signin(page, CONF, "ConfPass123!")
        has_conf = await tid("link-conflict-dialog").count() > 0
        rep("conflict_dialog", has_conf, f"{await txt(page, 'link-conflict-cloud')} | {await txt(page, 'link-conflict-device')} err={await txt(page, 'account-error')}")
        await shot(page, "a_conflict")
        if has_conf:
            await tid("link-keep-cloud").click(); await page.wait_for_timeout(2500)
            rep("conflict_cloud_signed_in", await tid("account-signed-in").count() > 0, await txt(page, "account-email"))
            await back_menu(page)
            c = await coins(page)
            rep("wallet_cloud_applied", c[0] is not None and c[0].replace(",", "") == "5555" and c[1] == "33", str(c))
            await tid("menu-account-button").click(); await tid("account-screen").wait_for()
        if await tid("account-sign-out").count():
            await tid("account-sign-out").click(); await page.locator("[data-testid=main-menu]:visible").first.wait_for(timeout=10000)
            rep("sign_out", True, f"wallet after signout {await coins(page)}")
            await tid("menu-account-button").click(); await tid("account-screen").wait_for()
            rep("signed_out_form_back", await tid("account-email-input").count() > 0)
        # player sign in
        await signin(page, "player@rushrivals.test", "RushPlayer123!")
        if await tid("link-conflict-dialog").count():
            print("player conflict:", await txt(page, "link-conflict-cloud"), "|", await txt(page, "link-conflict-device"))
            await tid("link-keep-device").click(); await page.wait_for_timeout(2500)
        rep("player_signed_in", await tid("account-signed-in").count() > 0, f"{await txt(page, 'account-email')} / {await txt(page, 'account-sync-status')}")
        await shot(page, "a_player_signed_in")
        await back_menu(page)
        print("player wallet UI:", await coins(page))
        # leaderboard signed in
        await tid("menu-leaderboard-button").click(); await tid("leaderboard-screen").wait_for()
        await page.wait_for_timeout(3000)
        for t in ["daily", "weekly", "all"]:
            await tid(f"leaderboard-tab-{t}").click(); await page.wait_for_timeout(2000)
            n = await page.locator("[data-testid^=leaderboard-row-]").count()
            print(f"lb {t}: rows={n} myrank={await txt(page, 'leaderboard-my-rank')} empty={await tid('leaderboard-empty').count()}")
        await shot(page, "a_lb_signed")
        R["lb_rows_render"] = await page.locator("[data-testid^=leaderboard-row-]").count() > 0
        rep_btn = page.locator("[data-testid^=leaderboard-report-]")
        if await rep_btn.count():
            await rep_btn.first.click(); await page.wait_for_timeout(2000)
            body = await page.inner_text("body")
            rep("lb_report", "Reported" in body, re.findall(r"Reported[^\n]*|Couldn[^\n]*", body)[:1])
        else:
            rep("lb_report", False, "no report button")
        await page.go_back(); await page.locator("[data-testid=main-menu]:visible").first.wait_for()
        # events
        await tid("menu-events-button").click(); await tid("events-screen").wait_for(); await page.wait_for_timeout(3000)
        rep("event_card", await tid("event-card-evt_temple_rush").count() > 0, f"{await txt(page, 'event-time-left')} | {await txt(page, 'event-progress')} | claim={await tid('event-claim').count()}")
        await shot(page, "a_events")
        await page.go_back(); await page.locator("[data-testid=main-menu]:visible").first.wait_for()
        # inbox
        await tid("menu-inbox-button").click(); await tid("inbox-screen").wait_for(); await page.wait_for_timeout(3000)
        rep("inbox_server_msg", await tid("inbox-msg-msg_welcome_online").count() > 0, f"msgs={await page.locator('[data-testid^=inbox-msg-]').count()}")
        if await tid("inbox-open-msg_welcome_online").count():
            await tid("inbox-open-msg_welcome_online").click(); await page.wait_for_timeout(500)
            cl = tid("inbox-claim-msg_welcome_online")
            if await cl.count():
                await cl.click(); await page.wait_for_timeout(2500)
                await shot(page, "a_inbox_claimed")
                dis = await cl.get_attribute("aria-disabled") if await cl.count() else "gone"
                rep("inbox_claim_once_ui", dis in ("true", "gone"), f"aria-disabled after={dis}")
                if await cl.count():
                    await cl.click(force=True); await page.wait_for_timeout(1500)
            else:
                rep("inbox_claim_once_ui", False, "no claim button")
        await back_menu(page)
        print("wallet after inbox:", await coins(page))
        # missions
        await tid("menu-missions-button").click(); await tid("missions-screen").wait_for(); await page.wait_for_timeout(3000)
        rep("server_missions", await tid("server-missions").count() > 0, f"items={await page.locator('[data-testid^=server-mission-]').count()} unavailable={await tid('server-missions-unavailable').count()}")
        await shot(page, "a_missions_server")
        # support
        await page.goto(URL + "/support"); await tid("support-screen").wait_for(timeout=20000)
        if await tid("support-email").count():
            await tid("support-email").fill("test@rushrivals.test")
        await tid("support-message").fill("TEST_ T1 automated support ticket, game froze on menu")
        await tid("support-send").click(); await page.wait_for_timeout(3000)
        rep("support_ticket", await tid("support-ticket-created").count() > 0, await txt(page, "support-ticket-created") or await txt(page, "support-error"))
        await shot(page, "a_support")
        await ctx.storage_state(path=f"{OUT}/state_player.json")
        print("API calls:", [a for a in apis if not a.startswith("2")][:20])
        print("page errors:", errs[:5])
        print("SUMMARY", R)
        await b.close()

asyncio.run(main())
