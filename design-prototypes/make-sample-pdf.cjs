const { chromium } = require("playwright");
const path = require("path");
const HTML = "file:///" + path.resolve("C:/Users/DA Waschuk/athlete-ranker/design-prototypes/sample-report.html").replace(/\\/g, "/");
const OUT = "C:\\Users\\DA Waschuk\\Desktop\\Sideline-Star-Sample-Report.pdf";

async function launch() {
  for (const a of [() => chromium.launch(), () => chromium.launch({ channel: "chrome" }), () => chromium.launch({ channel: "msedge" })]) {
    try { return await a(); } catch (e) {}
  }
  throw new Error("no browser");
}
(async () => {
  const b = await launch();
  const page = await b.newPage();
  await page.goto(HTML, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
  await page.waitForTimeout(600);
  // preferCSSPageSize uses the page's own @page (A4 + margins) and lets content
  // flow at the real printable width — no shrink-to-fit, so glyphs stay crisp.
  await page.pdf({ path: OUT, printBackground: true, preferCSSPageSize: true });
  await b.close();
  console.log("PDF saved: " + OUT);
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
