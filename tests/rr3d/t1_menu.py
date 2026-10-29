"""Iteration 5: onboarding -> skip tutorial -> menu; menu layout checks (390x844 + 360x640). Saves storage state."""
import asyncio, os, sys
from playwright.async_api import async_playwright

URL = os.environ["RR_URL"]
OUT = "/tmp/t5"
os.makedirs(OUT, exist_ok=True)
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]


async def onboard(page):
    tid = page.get_by_test_id
    await tid("onboarding-screen").wait_for(timeout=120000)
    await tid("onboarding-next-welcome").click()
    await tid("onboarding-age-over13").click()
    await tid("onboarding-accept-terms").click()
    await tid("onboarding-name-input").fill("Ace")
    await tid("onboarding-next-name").click()
    await page.wait_for_timeout(500)
    if await tid("onboarding-next-how").count():
        await tid("onboarding-next-how").click()
    await tid("onboarding-claim-gift").click()
    try:
        await tid("tutorial-skip-button").wait_for(timeout=20000)
        await tid("tutorial-skip-button").click()
        await tid("get-started-button").wait_for(timeout=10000)
        await tid("get-started-button").click()
    except Exception as e:
        print("tutorial skip path issue:", e)
    await tid("main-menu").wait_for(timeout=20000)


async def label_info(page):
    return await page.evaluate("""() => {
      const b = document.querySelector('[data-testid=menu-leaderboard-button]');
      if (!b) return 'missing';
      const out = [];
      b.querySelectorAll('div').forEach(d => { if (d.childElementCount===0 && d.textContent.trim()) {
        const r = d.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(d).lineHeight)||parseFloat(getComputedStyle(d).fontSize)*1.2;
        out.push({t:d.textContent, h:r.height, w:r.width, lines: Math.round(r.height/lh), fs:getComputedStyle(d).fontSize}); }});
      const r = b.getBoundingClientRect();
      return {btn:{w:r.width,h:r.height}, texts: out};
    }""")


async def overlaps(page):
    return await page.evaluate("""() => {
      const els = [...document.querySelectorAll('[data-testid^=menu-], [data-testid=play-button]')].filter(e=>e.offsetParent!==null);
      const rs = els.map(e=>({id:e.dataset.testid, r:e.getBoundingClientRect()})).filter(x=>x.r.width>0&&x.r.height>0);
      const res=[]; const vw=innerWidth, vh=innerHeight;
      for (const a of rs){ if (a.r.right>vw+1||a.r.bottom>vh+1||a.r.left<-1) res.push('offscreen '+a.id+' '+JSON.stringify(a.r));
        for (const b of rs){ if (a.id>=b.id) continue; const el1=document.querySelector(`[data-testid="${a.id}"]`), el2=document.querySelector(`[data-testid="${b.id}"]`);
          if (el1.contains(el2)||el2.contains(el1)) continue;
          const ix=Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left), iy=Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top);
          if (ix>2&&iy>2) res.push('overlap '+a.id+' & '+b.id+` ${ix.toFixed(0)}x${iy.toFixed(0)}`);}}
      return {count: rs.length, ids: rs.map(x=>x.id+':'+Math.round(x.r.width)+'x'+Math.round(x.r.height)), issues: res};
    }""")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print("PAGEERROR", e))
        await page.goto(URL)
        await onboard(page)
        print("PASS reached main-menu")
        await page.wait_for_timeout(4000)
        await page.screenshot(path=f"{OUT}/menu_390.png")
        print("leaderboard 390:", await label_info(page))
        print("overlaps 390:", await overlaps(page))
        await page.set_viewport_size({"width": 360, "height": 640})
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/menu_360.png")
        print("leaderboard 360:", await label_info(page))
        print("overlaps 360:", await overlaps(page))
        await ctx.storage_state(path=f"{OUT}/state.json")
        await b.close()

asyncio.run(main())
