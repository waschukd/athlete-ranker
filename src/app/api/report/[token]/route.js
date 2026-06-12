import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { logEvent } from "@/lib/analytics";
import { checkAndRecord, clientIp } from "@/lib/rateLimit";
import { buildAthleteReport } from "@/lib/reportData";

// Default lifetime for a parent-facing share link. Bounded so that a link leaked
// into search engines or a parents' group chat can't be replayed forever.
const TOKEN_TTL_DAYS = parseInt(process.env.REPORT_TOKEN_TTL_DAYS || "90", 10);
const PRICE_CENTS = parseInt(process.env.REPORT_PRICE_CENTS || "2499", 10);

export async function GET(request, { params }) {
  try {
    const { token } = params;

    // Per-IP throttle before any DB work — public, unauthenticated endpoint.
    const ip = clientIp(request);
    const rl = await checkAndRecord({ endpoint: "report_view", identifier: ip, max: 60, windowMins: 60 });
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

    const link = await sql`
      SELECT rl.*, o.name as org_name
      FROM report_links rl
      JOIN organizations o ON o.id = rl.organization_id
      WHERE rl.token = ${token} AND rl.is_active = true
    `;
    if (!link.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    logEvent({
      role: "report_viewer",
      event: "report.viewed",
      orgId: link[0].organization_id || null,
      metadata: { athleteId: link[0].athlete_id, catId: link[0].age_category_id },
    });

    if (link[0].created_at) {
      const ageMs = Date.now() - new Date(link[0].created_at).getTime();
      if (ageMs > TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: "Report link expired" }, { status: 410 });
      }
    }

    const { athlete_id, age_category_id } = link[0];

    const purchase = await sql`
      SELECT id FROM report_purchases
      WHERE athlete_id = ${athlete_id} AND age_category_id = ${age_category_id} AND status = 'completed'
      LIMIT 1
    `;
    const purchased = purchase.length > 0;

    const report = await buildAthleteReport(age_category_id, athlete_id);
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    // Safe, public athlete subset — never expose parent_email / internal columns.
    const athlete = {
      first_name: report.athlete?.first_name,
      last_name: report.athlete?.last_name,
      position: report.athlete?.position,
      external_id: report.athlete?.external_id,
    };

    const base = {
      athlete,
      category: report.category ? { name: report.category.name, scoring_scale: report.category.scoring_scale } : null,
      org_name: link[0].org_name,
      standing: report.standing,
      total_athletes: report.total_athletes,
      purchased,
      price: PRICE_CENTS,
    };

    if (purchased) {
      // Full report — what the dark DevelopmentReport component renders.
      return NextResponse.json({
        ...base,
        skillProfile: report.skillProfile,
        testingProfile: report.testingProfile,
        progress: report.progress,
        notes: report.notes,
        trainingProviders: report.trainingProviders,
      });
    }

    // Free preview: standing + a skill-profile teaser; the rest is paywalled.
    return NextResponse.json({
      ...base,
      skillProfile: report.skillProfile,
      locked: ["testing", "progress", "notes", "plan"],
    });
  } catch (error) {
    console.error("Public report error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
