"""P3-G: signed-in Synced toast already covered; sign-out then Android back (Escape) -> exit dialog on single menu."""
import asyncio, sys
sys.path.insert(0, "/app/tests/rr3d")
from playwright.async_api import async_playwright
from p3_common import URL, ARGS, shot, onboard


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        vis = lambda t: page.locator(f"[data-testid='{t}']:visible")
        tid = lambda t: vis(t).first
        await page.goto(URL); await onboard(page)
        await tid("menu-account-button").click(); await tid("account-screen").wait_for(timeout=10000)
        await tid("account-email-input").fill("player@rushrivals.test"); await tid("account-password-input").fill("RushPlayer123!")
        await tid("account-submit").click()
        for _ in range(60):
            if await vis("link-conflict-dialog").count():
                await tid("link-keep-cloud").click() if await vis("link-keep-cloud").count() else await tid("link-conflict-cloud").click()
            if await vis("account-signed-in").count():
                break
            await page.wait_for_timeout(500)
        print("signed in:", await vis("account-signed-in").count() > 0)
        await tid("account-sign-out").click(); await tid("main-menu").wait_for(timeout=15000); await page.wait_for_timeout(1200)
        print("dom menus:", await page.locator("[data-testid=main-menu]").count(), "account screens in dom:", await page.locator("[data-testid=account-screen]").count())
        await page.keyboard.press("Escape"); await page.wait_for_timeout(1000)
        ex = await vis("exit-dialog").count()
        print(("PASS" if ex else "FAIL"), "signout_back_shows_exit_dialog", "menu_visible=", await vis("main-menu").count(), page.url)
        await shot(page, "g_signout_escape")
        await b.close()

asyncio.run(main())
