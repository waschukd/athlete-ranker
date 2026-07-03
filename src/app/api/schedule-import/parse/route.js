import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSession, resolveSpContext } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { checkAndRecord, clientIp } from "@/lib/rateLimit";
import { normalizeSchedule } from "@/lib/scheduleNormalize";

export const runtime = "nodejs";
export const maxDuration = 60;

// Parse an uploaded CSV/XLSX into a plain string grid (no formulas, no HTML).
// XLSX stores dates as serial numbers → cellDates converts them; but for CSV the
// dates are already TEXT, and cellDates would UTC-shift them by a day, so CSV is
// read raw (leave date/time strings exactly as written; the model normalizes them).
function fileToGrid(buf, name) {
  const isCsv = /\.csv$/i.test(name || "");
  const wb = isCsv
    ? XLSX.read(buf, { type: "buffer", raw: true, cellDates: false })
    : XLSX.read(buf, { type: "buffer", cellDates: true, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: isCsv, defval: "", blankrows: false });
  return grid.map(row => (Array.isArray(row) ? row.map(c => (c == null ? "" : String(c))) : []));
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await request.formData();
    const file = form.get("file");
    const catId = form.get("catId");
    if (!file || typeof file === "string") return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    // Authorize: category access (wizard) OR service-provider context (SP side).
    let authorized = false;
    if (catId) { const a = await authorizeCategoryAccess(session, catId); authorized = a.authorized; }
    if (!authorized) { const { orgId } = await resolveSpContext(session, form.get("org")); authorized = !!orgId; }
    if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI import isn't configured.", fallback: true }, { status: 503 });

    // Cost cap — a Claude call per import.
    const identifier = session.email || clientIp(request);
    const { allowed } = await checkAndRecord({ endpoint: "schedule_ai", identifier, max: 30, windowMins: 1440 });
    if (!allowed) return NextResponse.json({ error: "Daily import limit reached — try the template upload, or again tomorrow.", fallback: true }, { status: 429 });

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 4 MB)." }, { status: 413 });

    let grid;
    try { grid = fileToGrid(buf, file.name); }
    catch { return NextResponse.json({ error: "Couldn't read that file — is it a valid CSV or XLSX?" }, { status: 400 }); }
    if (!grid.length) return NextResponse.json({ error: "That file looks empty." }, { status: 400 });

    let result;
    try { result = await normalizeSchedule(grid, { apiKey: process.env.ANTHROPIC_API_KEY }); }
    catch (e) { console.error("Schedule normalize error:", e.message); return NextResponse.json({ error: "Couldn't read the schedule automatically — try the template upload.", fallback: true }, { status: 502 }); }

    return NextResponse.json({ rows: result.rows, count: result.rows.length });
  } catch (error) {
    console.error("Schedule import parse error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
