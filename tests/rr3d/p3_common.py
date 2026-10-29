"""Phase 3 E2E helpers (T1 iteration 7)."""
import os

URL = os.environ.get("RR_URL")
if not URL:
    URL = [l.split("=", 1)[1].strip() for l in open("/app/mobile/.env") if l.startswith("EXPO_PACKAGER_PROXY_URL=")][0]
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
OUT = "/tmp/p3"
os.makedirs(OUT, exist_ok=True)

ORDER = ["onboarding-next-welcome", "onboarding-next-language", "AGE", "onboarding-terms-checkbox", "onboarding-accept-terms",
         "onboarding-next-permissions", "onboarding-intro-skip", "NAME", "onboarding-next-name", "onboarding-claim-gift"]


async def onboard(page, child=False, name="Ace"):
    tid = page.get_by_test_id
    await tid("onboarding-screen").wait_for(timeout=120000)
    steps = []
    for _ in range(40):
        if await tid("main-menu").count() or await tid("tutorial-skip-button").count():
            break
        clicked = False
        for t in ORDER:
            if t == "AGE":
                t = "onboarding-age-under13" if child else "onboarding-age-over13"
            if t == "NAME":
                if await tid("onboarding-name-input").count() and await tid("onboarding-name-input").is_visible():
                    v = await tid("onboarding-name-input").input_value()
                    if v != name:
                        await tid("onboarding-name-input").fill(name)
                continue
            loc = tid(t)
            if await loc.count() and await loc.first.is_visible():
                if t == "onboarding-terms-checkbox" and "terms" in steps:
                    continue
                try:
                    await loc.first.click(timeout=2000)
                    steps.append("terms" if t == "onboarding-terms-checkbox" else t)
                    clicked = True
                    await page.wait_for_timeout(400)
                    break
                except Exception:
                    pass
        if not clicked:
            await page.wait_for_timeout(600)
    print("onboarding steps:", steps)
    try:
        await tid("tutorial-skip-button").wait_for(timeout=20000)
        await tid("tutorial-skip-button").click()
        await tid("get-started-button").wait_for(timeout=10000)
        await tid("get-started-button").click()
    except Exception as e:
        print("tutorial skip path issue:", str(e)[:150])
    await tid("main-menu").wait_for(timeout=20000)


async def shot(page, n):
    await page.screenshot(path=f"{OUT}/{n}.png")
