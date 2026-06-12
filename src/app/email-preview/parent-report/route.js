import { parentReportEmailHtml } from "@/lib/email";

// Renders a SAMPLE parent report-delivery email so it can be eyeballed in a
// browser without sending anything. Sample data only — no real info.
export async function GET() {
  const html = parentReportEmailHtml({
    playerName: "Timmy Calder",
    orgName: "Riverside Minor Hockey",
    spName: "Competitive Thread",
    reportUrl: "https://sidelinestar.com/report/SAMPLE-TOKEN",
    priceStr: "$24.99",
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
