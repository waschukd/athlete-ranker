import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import sql from "@/lib/db";
import { sendEmail, emailWrapper } from "@/lib/email";

// Manage per-category evaluator "kind" (standard | coach | goalie). An SP
// admin can manage this for any association their SP actively serves --
// authorizeCategoryAccess (below) still enforces that scoping per-category.
const MANAGE_ROLES = new Set(["super_admin", "association_admin", "director", "service_provider_admin", "goalie_service_provider_admin"]);
const KINDS = new Set(["standard", "coach", "goalie"]);

async function gate(catId) {
  const session = await getSession();
  if (!session) return { error: "Unauthorized", status: 401 };
  if (!MANAGE_ROLES.has(session.role)) return { error: "Forbidden", status: 403 };
  const auth = await authorizeCategoryAccess(session, catId);
  if (!auth.authorized) return { error: "Forbidden", status: 403 };
  return { session, orgId: auth.orgId };
}

export async function GET(request, { params }) {
  try {
    const { catId } = params;
    const g = await gate(catId);
    if (g.error) return NextResponse.json({ error: g.error }, { status: g.status });

    // Current non-standard designations (coach/goalie), with names where bound
    const designations = await sql`
      SELECT ce.id, ce.user_id, ce.email, ce.kind, u.name, u.email AS user_email
      FROM category_evaluators ce
      LEFT JOIN users u ON u.id = ce.user_id
      WHERE ce.age_category_id = ${catId} AND ce.kind <> 'standard'
      ORDER BY ce.kind, COALESCE(u.name, ce.email)
    `;

    // Evaluators already known for this category (signed up for its sessions) —
    // so the admin can promote an existing person without re-inviting.
    const candidates = await sql`
      SELECT DISTINCT u.id AS user_id, u.name, u.email
      FROM evaluator_session_signups ess
      JOIN evaluation_schedule es ON es.id = ess.schedule_id
      JOIN users u ON u.id = ess.user_id
      WHERE es.age_category_id = ${catId} AND ess.status = 'signed_up'
      ORDER BY u.name
    `;

    return NextResponse.json({ designations, candidates });
  } catch (e) {
    console.error("category-evaluators GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { catId } = params;
    const g = await gate(catId);
    if (g.error) return NextResponse.json({ error: g.error }, { status: g.status });

    const body = await request.json().catch(() => ({}));
    const kind = KINDS.has(body.kind) ? body.kind : null;
    if (!kind) return NextResponse.json({ error: "kind must be standard, coach, or goalie" }, { status: 400 });
    let userId = body.user_id || null;
    let email = (body.email || "").trim() || null;
    if (!userId && !email) return NextResponse.json({ error: "user_id or email required" }, { status: 400 });

    // Resolve email → existing user if possible
    if (!userId && email) {
      const u = await sql`SELECT id FROM users WHERE lower(email) = lower(${email})`;
      if (u.length) userId = u[0].id;
    }

    const catInfo = await sql`
      SELECT ac.name AS category_name, ac.evaluates_goalies, o.name AS org_name FROM age_categories ac
      JOIN organizations o ON o.id = ac.organization_id WHERE ac.id = ${catId}
    `;
    if (kind === "goalie" && !catInfo[0]?.evaluates_goalies) {
      return NextResponse.json({ error: "This category doesn't evaluate goalies — nothing for a goalie evaluator to score" }, { status: 400 });
    }
    const categoryName = catInfo[0]?.category_name || "the category";
    const orgName = catInfo[0]?.org_name || "";

    try {
      if (kind === "standard") {
        // Remove the designation (revert to a normal evaluator)
        if (userId) await sql`DELETE FROM category_evaluators WHERE age_category_id = ${catId} AND user_id = ${userId}`;
        else await sql`DELETE FROM category_evaluators WHERE age_category_id = ${catId} AND lower(email) = lower(${email})`;
        return NextResponse.json({ success: true, removed: true });
      }

      if (userId) {
        await sql`
          INSERT INTO category_evaluators (age_category_id, user_id, email, kind)
          VALUES (${catId}, ${userId}, ${email}, ${kind})
          ON CONFLICT (age_category_id, user_id) WHERE user_id IS NOT NULL
          DO UPDATE SET kind = ${kind}, email = COALESCE(${email}, category_evaluators.email)
        `;
        // Ensure they have membership so they can access the category
        if (g.orgId) {
          await sql`
            INSERT INTO evaluator_memberships (user_id, organization_id, status)
            VALUES (${userId}, ${g.orgId}, 'active')
            ON CONFLICT (user_id, organization_id) DO UPDATE SET status = 'active'
          `.catch(() => {});
        }
      } else {
        // Email-only invite — binds to the user on their first access
        await sql`
          INSERT INTO category_evaluators (age_category_id, user_id, email, kind)
          VALUES (${catId}, NULL, ${email}, ${kind})
          ON CONFLICT (age_category_id, lower(email)) WHERE user_id IS NULL
          DO UPDATE SET kind = ${kind}
        `;
      }
    } catch (dbErr) {
      console.error("category-evaluators upsert error:", dbErr);
      return NextResponse.json({ error: "Designations aren't available yet (pending migration)." }, { status: 503 });
    }

    // Notify the invitee. Someone with no account yet (email-only invite) has
    // nowhere to go with "open your dashboard" -- that page requires being
    // signed in already, and the one-line "sign up on your own" footnote gave
    // them no actual link or code. This previously left email-only invitees
    // (e.g. a coach evaluator invited by email) with no working way to get in.
    // A real evaluator_invitations row + a direct /evaluator/signup?invite=
    // link fixes that, mirroring how a normal SP evaluator invite works.
    const toEmail = email || (userId ? (await sql`SELECT email FROM users WHERE id = ${userId}`)[0]?.email : null);
    if (toEmail) {
      const kindLabel = kind === "coach" ? "Coach evaluator" : "Goalie evaluator";
      const base = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";
      const note = kind === "coach"
        ? "Your scores are tracked separately and won't affect the official results."
        : "You'll only see and score the goalies in your sessions.";

      let ctaUrl = `${base}/evaluator/dashboard`;
      let ctaLabel = "Open your dashboard →";
      let footnote = "";
      if (!userId && g.orgId) {
        try {
          const existing = await sql`
            SELECT invite_token FROM evaluator_invitations
            WHERE organization_id = ${g.orgId} AND lower(email) = lower(${toEmail}) AND status = 'pending'
              AND (expires_at IS NULL OR expires_at > NOW())
            LIMIT 1
          `;
          const token = existing[0]?.invite_token || randomUUID();
          if (!existing.length) {
            const inviterId = (await sql`SELECT id FROM users WHERE email = ${g.session.email}`)[0]?.id || null;
            await sql`
              INSERT INTO evaluator_invitations (organization_id, email, invited_by_user_id, invite_token, status, role, expires_at)
              VALUES (${g.orgId}, ${toEmail}, ${inviterId}, ${token}, 'pending', 'association_evaluator', NOW() + INTERVAL '30 days')
            `;
          }
          ctaUrl = `${base}/evaluator/signup?invite=${token}`;
          ctaLabel = "Create your account →";
        } catch (e) {
          console.error("category-evaluators invitation link error:", e?.message);
          footnote = "If you don't have an account yet, sign up with the same email and your role will be applied automatically.";
        }
      }

      const html = emailWrapper(`
        <h2 style="margin:0 0 6px;font-family:'Archivo','Hanken Grotesk',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#101113;">You're set up as a ${kindLabel}</h2>
        <p style="margin:0 0 16px;font-size:14px;color:#5b606b;line-height:1.6;">You've been added to evaluate <strong style="color:#101113;">${categoryName}</strong>${orgName ? ` at ${orgName}` : ""} as a <strong>${kindLabel}</strong>. ${note}</p>
        <div style="text-align:center;margin:8px 0 0;"><a href="${ctaUrl}" style="display:inline-block;font-family:'Archivo',sans-serif;padding:14px 30px;background:#0b5cd6;color:#fff;text-decoration:none;border-radius:99px;font-size:14px;font-weight:700;">${ctaLabel}</a></div>
        ${footnote ? `<p style="font-size:12px;color:#9aa0aa;margin:16px 0 0;">${footnote}</p>` : ""}
      `);
      await sendEmail(toEmail, `You're a ${kindLabel} — ${categoryName}`, html);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("category-evaluators POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { catId } = params;
    const g = await gate(catId);
    if (g.error) return NextResponse.json({ error: g.error }, { status: g.status });
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    try { await sql`DELETE FROM category_evaluators WHERE id = ${id} AND age_category_id = ${catId}`; } catch {}
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
