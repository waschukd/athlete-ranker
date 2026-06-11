const { chromium } = require("playwright");
const path = require("path");
const HTML = "file:///" + path.resolve("C:/Users/DA Waschuk/athlete-ranker/design-prototypes/sample-report.html").replace(/\\/g, "/");
const OUT = "C:/Users/DA Waschuk/athlete-ranker/design-prototypes/sample-report.png";
async function launch() {
  for (const a of [() => chromium.launch(), () => chromium.launch({ channel: "chrome" }), () => chromium.launch({ channel: "msedge" })]) {
    try { return await a(); } catch (e) {}
  }
  throw new Error("no browser");
}
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 800, height: 1200 }, deviceScaleFactor: 2 });
  await p.goto(HTML, { waitUntil: "networkidle", timeout: 60000 });
  await p.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
  await p.waitForTimeout(600);
  await p.screenshot({ path: OUT, fullPage: true });
  await b.close();
  console.log("shot: " + OUT);
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
