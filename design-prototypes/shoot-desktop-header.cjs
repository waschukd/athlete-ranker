const { chromium } = require("playwright");
const OUT = "C:\\Users\\DA Waschuk\\athlete-ranker\\design-prototypes\\landing-desktop-header.png";
async function launch() {
  for (const a of [() => chromium.launch(), () => chromium.launch({ channel: "chrome" }), () => chromium.launch({ channel: "msedge" })]) {
    try { return await a(); } catch (e) { lastErr = e; }
  }
  throw new Error("no browser");
}
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/landing", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.locator("header").screenshot({ path: OUT });
  await b.close();
  console.log("OK");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
