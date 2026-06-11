// Screenshot the landing page at a phone viewport against the running dev server.
const { chromium } = require("playwright");

const VIEWPORT = { width: 390, height: 844 }; // iPhone 12/13/14 logical px
const URL = "http://localhost:3000/landing";
const OUT_HERO = "C:\\Users\\DA Waschuk\\athlete-ranker\\design-prototypes\\landing-mobile-hero.png";
const OUT_FULL = "C:\\Users\\DA Waschuk\\athlete-ranker\\design-prototypes\\landing-mobile-full.png";

async function launch() {
  const attempts = [
    () => chromium.launch(),
    () => chromium.launch({ channel: "chrome" }),
    () => chromium.launch({ channel: "msedge" }),
  ];
  let lastErr;
  for (const a of attempts) {
    try { return await a(); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

(async () => {
  const browser = await launch();
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1800); // let fonts + reveal animations settle
  await page.screenshot({ path: OUT_HERO }); // above-the-fold (viewport)
  await page.screenshot({ path: OUT_FULL, fullPage: true });
  await browser.close();
  console.log("OK");
})().catch((e) => { console.error("SHOOT_FAIL:", e.message); process.exit(1); });
