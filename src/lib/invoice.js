import sql from "@/lib/db";
import { emailWrapper, esc } from "@/lib/email";

// Evaluator/tester invoice building — shared by the dashboard's
// /api/evaluator/invoice route and one-off scripts (sample sends), so the
// sample a provider sees is byte-identical to what their people send.
//
// An invoice covers APPROVED, unpaid hours only. Line pricing mirrors
// /api/evaluator/pay and the SP payroll route exactly: an hour is TESTING or
// EVALUATION by the session it was logged against, and pays at
// tester_hourly_rate or hourly_rate from the membership with THIS provider —
// never the org that happened to run the session.

export const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  const [y, m, day] = String(d).split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

export async function buildInvoice(userId, orgId) {
  const [em] = await sql`
    SELECT em.hourly_rate, em.tester_hourly_rate, o.name AS org_name, o.contact_email, u.name AS user_name, u.email AS user_email
    FROM evaluator_memberships em
    JOIN organizations o ON o.id = em.organization_id
    JOIN users u ON u.id = em.user_id
    WHERE em.user_id = ${userId} AND em.organization_id = ${orgId} AND em.status = 'active'`;
  if (!em) return null;

  const lines = await sql`
    SELECT es.scheduled_date, es.location, es.session_number, es.client_label, es.age_label,
           ac.name AS category, so.name AS session_org, h.hours_worked,
           (COALESCE(cs.session_type, '') = 'testing' OR es.service_provider_id IS NOT NULL) AS is_testing
    FROM evaluator_hours h
    JOIN evaluation_schedule es ON es.id = h.schedule_id
    LEFT JOIN age_categories ac ON ac.id = es.age_category_id
    LEFT JOIN organizations so ON so.id = ac.organization_id
    LEFT JOIN category_sessions cs ON cs.age_category_id = es.age_category_id AND cs.session_number = es.session_number
    WHERE h.evaluator_id = ${userId} AND h.status = 'approved'
      AND (
        es.service_provider_id = ${orgId}
        OR ac.organization_id = ${orgId}
        OR ac.organization_id IN (
          SELECT association_id FROM sp_association_links
          WHERE service_provider_id = ${orgId} AND status = 'active'
        )
      )
    ORDER BY es.scheduled_date, es.session_number`;

  const evalRate = em.hourly_rate != null ? parseFloat(em.hourly_rate) : null;
  const testRate = em.tester_hourly_rate != null ? parseFloat(em.tester_hourly_rate) : null;
  const items = lines.map(l => {
    const rate = l.is_testing ? testRate : evalRate;
    const hours = parseFloat(l.hours_worked) || 0;
    const label = l.client_label
      ? `${l.client_label}${l.age_label ? ` ${l.age_label}` : ""} (testing event)`
      : `${l.session_org || ""} ${l.category || ""} — Session ${l.session_number}`.trim();
    return { date: l.scheduled_date, label, location: l.location, kind: l.is_testing ? "Testing" : "Evaluation", hours, rate, amount: rate != null ? Math.round(hours * rate * 100) / 100 : null };
  });
  const total = Math.round(items.reduce((t, i) => t + (i.amount || 0), 0) * 100) / 100;
  const unpriced = items.filter(i => i.rate == null).length;
  const [{ n: pendingHours }] = await sql`
    SELECT COALESCE(SUM(h.hours_worked), 0) AS n FROM evaluator_hours h
    JOIN evaluation_schedule es ON es.id = h.schedule_id
    LEFT JOIN age_categories ac ON ac.id = es.age_category_id
    WHERE h.evaluator_id = ${userId} AND h.status = 'pending'
      AND (es.service_provider_id = ${orgId} OR ac.organization_id = ${orgId}
        OR ac.organization_id IN (SELECT association_id FROM sp_association_links WHERE service_provider_id = ${orgId} AND status = 'active'))`;

  return { em, items, total, unpriced, pendingHours: parseFloat(pendingHours) || 0 };
}

export function invoiceNumber(userId, date = new Date()) {
  return `INV-${userId}-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

// Full email: { subject, html }. The route sends this as-is; a sample send
// prefixes the subject and adds nothing else.
export function renderInvoiceEmail(inv, invoiceNo, today = new Date()) {
  const rowsHtml = inv.items.map(i => `
    <tr>
      <td style="padding:7px 8px;font-size:12px;color:#101113;white-space:nowrap;border-top:1px solid #f0ede6;">${esc(fmtDate(i.date))}</td>
      <td style="padding:7px 8px;font-size:12px;color:#101113;border-top:1px solid #f0ede6;">${esc(i.label)}${i.location ? `<div style="color:#8b8f99;">${esc(i.location)}</div>` : ""}</td>
      <td style="padding:7px 8px;font-size:12px;color:#5b606b;border-top:1px solid #f0ede6;">${i.kind}</td>
      <td style="padding:7px 8px;font-size:12px;color:#101113;text-align:right;border-top:1px solid #f0ede6;">${i.hours}h</td>
      <td style="padding:7px 8px;font-size:12px;color:#101113;text-align:right;border-top:1px solid #f0ede6;">${i.rate != null ? money(i.rate) : "—"}</td>
      <td style="padding:7px 8px;font-size:12px;font-weight:600;color:#101113;text-align:right;border-top:1px solid #f0ede6;">${i.amount != null ? money(i.amount) : "—"}</td>
    </tr>`).join("");

  const content = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#101113;">Invoice ${esc(invoiceNo)}</h1>
    <p style="margin:0 0 4px;font-size:13px;color:#5b606b;">From <strong style="color:#101113;">${esc(inv.em.user_name)}</strong> (${esc(inv.em.user_email || "")})</p>
    <p style="margin:0 0 18px;font-size:13px;color:#5b606b;">To ${esc(inv.em.org_name)} · ${esc(today.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }))}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr style="font-size:10px;color:#9a7616;text-transform:uppercase;letter-spacing:0.08em;">
        <td style="padding:4px 8px;">Date</td><td style="padding:4px 8px;">Session</td><td style="padding:4px 8px;">Type</td>
        <td style="padding:4px 8px;text-align:right;">Hours</td><td style="padding:4px 8px;text-align:right;">Rate</td><td style="padding:4px 8px;text-align:right;">Amount</td>
      </tr>
      ${rowsHtml}
      <tr>
        <td colspan="5" style="padding:12px 8px 0;font-size:13px;font-weight:700;color:#101113;text-align:right;border-top:2px solid #101113;">Total due</td>
        <td style="padding:12px 8px 0;font-size:16px;font-weight:800;color:#101113;text-align:right;border-top:2px solid #101113;">${money(inv.total)}</td>
      </tr>
    </table>
    ${inv.pendingHours > 0 ? `<p style="margin:16px 0 0;font-size:12px;color:#8b8f99;">${inv.pendingHours}h of additional hours are still awaiting approval and are not included on this invoice.</p>` : ""}
    ${inv.unpriced > 0 ? `<p style="margin:8px 0 0;font-size:12px;color:#8b8f99;">${inv.unpriced} line(s) have no rate set and are shown without an amount.</p>` : ""}
    <p style="margin:16px 0 0;font-size:12px;color:#8b8f99;">Generated from approved hours on Sideline Star. Marking these hours paid on the payroll page settles this invoice.</p>`;

  return {
    subject: `Invoice ${invoiceNo} — ${inv.em.user_name} — ${money(inv.total)}`,
    html: emailWrapper(content),
  };
}
