import { parentReportEmailHtml } from "@/lib/email";
import { getSession } from "@/lib/auth";

const ADMIN_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin", "goalie_service_provider_admin"]);

// Renders a SAMPLE parent report-delivery email so it can be eyeballed in a
// browser without sending anything. Sample data only — no real info.
export async function GET() {
  const session = await getSession();
  if (!session || !ADMIN_ROLES.has(session.role)) {
    return new Response("Forbidden", { status: 403 });
  }
  const html = parentReportEmailHtml({
    playerName: "Timmy Calder",
    orgName: "Riverside Minor Hockey",
    spName: "Competitive Thread",
    reportUrl: "https://sidelinestar.com/report/SAMPLE-TOKEN",
    priceStr: "$34.99",
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
