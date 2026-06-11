const { chromium } = require("playwright");
const path = require("path");
const HTML = "file:///" + path.resolve("C:/Users/DA Waschuk/athlete-ranker/design-prototypes/tests-premium.html").replace(/\\/g, "/");
const OUT = "C:/Users/DA Waschuk/athlete-ranker/design-prototypes/tests-premium.png";
async function launch() {
  for (const a of [() => chromium.launch(), () => chromium.launch({ channel: "chrome" }), () => chromium.launch({ channel: "msedge" })]) {
    try { return await a(); } catch (e) {}
  }
  throw new Error("no browser");
}
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 760, height: 1400 }, deviceScaleFactor: 2 });
  await p.goto(HTML, { waitUntil: "networkidle", timeout: 60000 });
  await p.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
  await p.waitForTimeout(500);
  // just the first two cards, to inspect the aesthetic closely
  const cards = await p.$$(".card");
  const box1 = await cards[0].boundingBox();
  await p.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 760, height: Math.ceil(box1.height * 2 + 70) } });
  await b.close();
  console.log("shot: " + OUT);
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
