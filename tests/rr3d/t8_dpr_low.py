"""Graphics Low at DPR 2 (web): check the 3D canvas fills the screen."""
import asyncio, os, json
from playwright.async_api import async_playwright
URL = os.environ["RR_URL"]; OUT = "/tmp/t5"
def fnv(s):
    h = 0x811c9dc5
    for ch in s.encode('utf-16-le')[::2]:
        h ^= ch; h = (h * 0x01000193) & 0xffffffff
    return format(h, '08x')
st = json.load(open(f"{OUT}/state2.json"))
for o in st["origins"]:
    for i in o["localStorage"]:
        if i["name"] == "rr_save_main":
            env = json.loads(json.loads(i["value"])); env["data"]["settings"]["graphics"] = "low"
            body = json.dumps(env["data"], separators=(",", ":"), ensure_ascii=False)
            env["sum"] = fnv(body); i["value"] = json.dumps(json.dumps({"v": env["v"], "sum": env["sum"], "data": env["data"]}, separators=(",", ":"), ensure_ascii=False))
json.dump(st, open(f"{OUT}/state_low.json", "w"))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, storage_state=f"{OUT}/state_low.json")
        page = await ctx.new_page()
        tid = page.get_by_test_id
        await page.goto(URL)
        await tid("main-menu").wait_for(timeout=120000)
        await tid("play-button").click()
        await page.wait_for_function("window.__RR_DEBUG__ && window.__RR_DEBUG__.state.phase === 'running'", timeout=60000)
        await page.wait_for_timeout(2500)
        print(await page.evaluate("(()=>{const c=document.querySelector('canvas');return {w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight,dpr:devicePixelRatio, gfx: JSON.parse(JSON.parse(localStorage.rr_save_main)).data.settings.graphics}})()"))
        await page.screenshot(path=f"{OUT}/low_dpr2.png", scale="css")
        await b.close()
asyncio.run(main())
