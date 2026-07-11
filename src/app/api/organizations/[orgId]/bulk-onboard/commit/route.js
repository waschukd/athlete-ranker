import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";

const ADMIN_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin", "goalie_service_provider_admin"]);

// Standard defaults — same shape the setup wizard seeds.
const SKATER_CATS = ["Skating", "Puck Skills", "Effort / Compete", "Hockey IQ"];
const GOALIE_CATS = ["Skating / Balance / Agility", "Positioning / Angles / Net Coverage", "Feet / Hands / Stick / Rebounds", "Anticipation / Reading the Play"];
const GOALIE_SKILLS_CATS = ["Mobility", "Rebound Control", "Positioning & Awareness", "Battle & Compete"];
const GOALIE_CONFIG = {
  scale: 10, increment: 0.5,
  sessions: [
    { session_number: 1, name: "Goalie Session 1", session_type: "goalie_skills", weight_percentage: 40 },
    { session_number: 2, name: "Goalie Session 2", session_type: "scrimmage", weight_percentage: 20 },
    { session_number: 3, name: "Goalie Session 3", session_type: "scrimmage", weight_percentage: 20 },
    { session_number: 4, name: "Goalie Session 4", session_type: "scrimmage", weight_percentage: 20 },
  ],
};
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const isTesting = (t) => t === "testing" || t === "goalie_skills";

function code() { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

// Derive a session structure from a division's schedule rows: one testing session
// (if any testing rows) then one scrimmage session per distinct scrimmage date.
// Returns { sessions:[{session_number,type,weight}], sessionForRow(row)->number }.
function deriveSessions(rows) {
  const dated = rows.filter(r => r.date);
  const scrimDates = [...new Set(dated.filter(r => !isTesting(r.session_type)).map(r => r.date))].sort();
  const hasTesting = dated.some(r => isTesting(r.session_type));
  const sessions = [];
  let n = 1;
  const testingNum = hasTesting ? n++ : null;
  const scrimNums = new Map();
  for (const d of scrimDates) scrimNums.set(d, n++);
  const scrimCount = scrimDates.length;
  const testingWeight = hasTesting && scrimCount ? 10 : (hasTesting ? 100 : 0);
  const scrimWeight = scrimCount ? Math.round((100 - testingWeight) / scrimCount) : 0;
  if (hasTesting) sessions.push({ session_number: testingNum, type: "testing", weight: testingWeight });
  scrimDates.forEach((d, i) => sessions.push({ session_number: scrimNums.get(d), type: "scrimmage", weight: i === scrimCount - 1 ? (100 - testingWeight - scrimWeight * (scrimCount - 1)) : scrimWeight }));
  // Fallback: no dated rows at all → the standard 4-session default.
  if (!sessions.length) return { sessions: [
    { session_number: 1, type: "testing", weight: 10 }, { session_number: 2, type: "scrimmage", weight: 30 },
    { session_number: 3, type: "scrimmage", weight: 30 }, { session_number: 4, type: "scrimmage", weight: 30 },
  ], sessionForRow: (r) => (isTesting(r.session_type) ? 1 : 2) };
  const sessionForRow = (r) => isTesting(r.session_type) ? (testingNum || 1) : (scrimNums.get(r.date) || sessions.find(s => s.type === "scrimmage")?.session_number || 1);
  return { sessions, sessionForRow };
}

async function seedConfig(catId, sessions) {
  for (const s of sessions) {
    await sql`INSERT INTO category_sessions (age_category_id, session_number, name, session_type, weight_percentage, status)
      VALUES (${catId}, ${s.session_number}, ${"Session " + s.session_number}, ${s.type}, ${s.weight}, 'scheduled')`;
  }
  let disp = 1;
  for (const c of SKATER_CATS) await sql`INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to) VALUES (${catId}, ${c}, ${disp++}, 'all')`;
  for (const c of GOALIE_CATS) await sql`INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to) VALUES (${catId}, ${c}, ${disp++}, 'goalies')`;
  for (const c of GOALIE_SKILLS_CATS) await sql`INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to) VALUES (${catId}, ${c}, ${disp++}, 'goalie_skills')`;
  await sql`UPDATE age_categories SET goalie_config = ${JSON.stringify(GOALIE_CONFIG)}, setup_complete = true, status = 'active' WHERE id = ${catId}`;
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ADMIN_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const auth = await authorizeOrgAccess(session, params.orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const orgId = params.orgId;

    const body = await request.json();
    const decisions = Array.isArray(body.decisions) ? body.decisions : [];
    const scheduleRows = Array.isArray(body.scheduleRows) ? body.scheduleRows : [];
    const athletes = Array.isArray(body.athletes) ? body.athletes : [];

    const summary = { categoriesCreated: 0, categoriesReused: 0, athletesImported: 0, scheduleImported: 0, skipped: 0 };

    for (const dec of decisions) {
      if (!dec || dec.action === "skip" || !dec.key) { summary.skipped++; continue; }
      const keyRows = scheduleRows.filter(r => r.divisionKey === dec.key);
      const keyAthletes = athletes.filter(a => a.divisionKey === dec.key);

      // Per-division evaluation format from the template's Format column (any
      // Tournament row ⇒ round_robin). Only applied when the file declared it.
      const declaredTournament = keyRows.some(r => r.eval_format === "round_robin");
      const declaredFormat = keyRows.some(r => r.eval_format) ? (declaredTournament ? "round_robin" : "standard") : null;

      // Resolve the target category.
      let catId;
      if (dec.action === "existing" && dec.categoryId) {
        const owned = await sql`SELECT id FROM age_categories WHERE id = ${dec.categoryId} AND organization_id = ${orgId}`;
        if (!owned.length) { summary.skipped++; continue; }
        catId = owned[0].id;
        summary.categoriesReused++;
      } else {
        const name = String(dec.name || dec.key).slice(0, 60);
        const [cat] = await sql`INSERT INTO age_categories (organization_id, name, scoring_scale, scoring_increment, status, setup_complete) VALUES (${orgId}, ${name}, 10, 0.5, 'active', false) RETURNING id`;
        catId = cat.id;
        const { sessions } = deriveSessions(keyRows);
        await seedConfig(catId, sessions);
        summary.categoriesCreated++;
      }
      if (declaredFormat) { try { await sql`UPDATE age_categories SET eval_format = ${declaredFormat} WHERE id = ${catId}`; } catch { /* column not migrated */ } }

      // Session mapping for this category's schedule.
      const { sessionForRow } = deriveSessions(keyRows);

      // Athletes (upsert by external_id; else insert).
      for (const a of keyAthletes) {
        if (!a.first_name || !a.last_name) continue;
        if (a.external_id) {
          await sql`INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, external_id, position, birth_year, parent_email, parent_email_2, is_active)
            VALUES (${orgId}, ${catId}, ${a.first_name}, ${a.last_name}, ${a.external_id}, ${a.position || null}, ${a.birth_year || null}, ${a.parent_email || null}, ${a.parent_email_2 || null}, true)
            ON CONFLICT (age_category_id, external_id) WHERE external_id IS NOT NULL
            DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, position = COALESCE(EXCLUDED.position, athletes.position), is_active = true`;
        } else {
          await sql`INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, position, birth_year, parent_email, parent_email_2, is_active)
            VALUES (${orgId}, ${catId}, ${a.first_name}, ${a.last_name}, ${a.position || null}, ${a.birth_year || null}, ${a.parent_email || null}, ${a.parent_email_2 || null}, true)`;
        }
        summary.athletesImported++;
      }

      // Schedule slots → session (by date/type) with unique-per-session group numbers.
      const groupCounter = {}; // session_number → next group
      const sorted = keyRows.filter(r => r.date).slice().sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.start_time || "").localeCompare(b.start_time || ""));
      for (const r of sorted) {
        // Honor explicit Session #/Group # from the template; else derive.
        const sNum = (r.session_number != null && r.session_number !== "") ? (parseInt(r.session_number) || sessionForRow(r)) : sessionForRow(r);
        let grpNum;
        if (r.group_number != null && r.group_number !== "") { grpNum = parseInt(r.group_number) || 1; }
        else { groupCounter[sNum] = (groupCounter[sNum] || 0) + 1; grpNum = groupCounter[sNum]; }
        let dow = null; try { dow = DOW[new Date(`${r.date}T00:00:00`).getDay()]; } catch { dow = null; }
        // Respect per-row evaluator counts from the template; else sensible defaults.
        const pe = r.player_evaluators != null && r.player_evaluators !== "" ? (parseInt(r.player_evaluators) || 0) : (isTesting(r.session_type) ? 0 : 4);
        const ge = r.goalie_evaluators != null && r.goalie_evaluators !== "" ? (parseInt(r.goalie_evaluators) || 0) : 0;
        const evalReq = isTesting(r.session_type) ? 0 : pe;
        // Tournament matchup label is stored, not resolved — teams are assigned
        // later in the dashboard Teams tab (no teams exist at bulk load).
        await sql`INSERT INTO evaluation_schedule (age_category_id, session_number, group_number, scheduled_date, day_of_week, start_time, end_time, location, checkin_code, evaluators_required, goalie_evaluators_required, matchup, status)
          VALUES (${catId}, ${sNum}, ${grpNum}, ${r.date}, ${dow}, ${r.start_time || null}, ${r.end_time || null}, ${r.location || null}, ${code()}, ${evalReq}, ${ge}, ${r.matchup || null}, 'scheduled')`;
        summary.scheduleImported++;
      }
    }

    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error("Bulk onboard commit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
