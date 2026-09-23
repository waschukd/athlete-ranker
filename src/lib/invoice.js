import sql from "@/lib/db";

// Evaluator/tester invoice building — shared by the dashboard's
// /api/evaluator/invoice route and one-off scripts (sample sends), so the
// sample a provider sees is byte-identical to what their people send.
//
// The invoice is a PDF the person DOWNLOADS and emails to their provider
// themselves — the platform never sends it on their behalf. A contractor
// issuing their own invoice is the paper trail the CRA expects; a platform
// mailing it for them muddies exactly that.
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

// The downloadable invoice PDF, as a Buffer. Plain black-on-white Helvetica —
// this is a tax document the person attaches to their own email, not branding.
export async function renderInvoicePdf(inv, invoiceNo, today = new Date()) {
  const { default: PDFDocument } = await import("pdfkit");
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 54, bottom: 54, left: 54, right: 54 } });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width - 108; // printable width
  // Date | Session | Type | Hours | Rate | Amount
  const col = [78, W - 78 - 62 - 44 - 56 - 66, 62, 44, 56, 66];
  const colX = col.map((_, i) => 54 + col.slice(0, i).reduce((a, b) => a + b, 0));
  const bottom = () => doc.page.height - 66;

  const header = () => {
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#666");
    const labels = ["DATE", "SESSION", "TYPE", "HOURS", "RATE", "AMOUNT"];
    labels.forEach((l, i) => doc.text(l, colX[i], doc.y, { width: col[i] - 6, align: i >= 3 ? "right" : "left", lineBreak: false }));
    doc.moveDown(0.4);
    doc.moveTo(54, doc.y).lineTo(54 + W, doc.y).lineWidth(0.75).strokeColor("#000").stroke();
    doc.y += 5;
  };

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#000").text("INVOICE", 54, 54);
  doc.font("Helvetica").fontSize(10).fillColor("#333");
  doc.text(`Invoice number: ${invoiceNo}`, 54, doc.y + 4);
  doc.text(`Date: ${today.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" })}`);
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").text("From:", { continued: true }).font("Helvetica").text(`  ${inv.em.user_name}${inv.em.user_email ? ` <${inv.em.user_email}>` : ""}`);
  doc.font("Helvetica-Bold").text("To:", { continued: true }).font("Helvetica").text(`  ${inv.em.org_name}`);
  doc.moveDown(1.2);
  header();

  doc.fontSize(9);
  for (const i of inv.items) {
    const label = i.label + (i.location ? ` (${i.location})` : "");
    const h = Math.max(doc.heightOfString(label, { width: col[1] - 6 }), 11) + 4;
    if (doc.y + h > bottom()) { doc.addPage(); header(); doc.fontSize(9); }
    const y = doc.y;
    const cells = [fmtDate(i.date), label, i.kind, `${i.hours}h`, i.rate != null ? money(i.rate) : "—", i.amount != null ? money(i.amount) : "—"];
    doc.font("Helvetica").fillColor("#000");
    cells.forEach((c, ci) => doc.text(c, colX[ci], y, { width: col[ci] - 6, align: ci >= 3 ? "right" : "left" }));
    doc.y = y + h;
  }

  if (doc.y + 40 > bottom()) doc.addPage();
  doc.moveTo(54, doc.y).lineTo(54 + W, doc.y).lineWidth(1.25).strokeColor("#000").stroke();
  doc.y += 8;
  const yT = doc.y;
  doc.font("Helvetica-Bold").fontSize(11);
  doc.text("Total due", colX[3] - 60, yT, { width: 100, align: "right" });
  doc.text(money(inv.total), colX[5], yT, { width: col[5] - 6, align: "right" });
  doc.y = yT + 24;

  doc.font("Helvetica").fontSize(8).fillColor("#555");
  if (inv.pendingHours > 0) doc.text(`${inv.pendingHours}h of additional hours are still awaiting approval and are not included on this invoice.`, 54, doc.y, { width: W });
  if (inv.unpriced > 0) doc.text(`${inv.unpriced} line(s) have no rate set and are shown without an amount.`, 54, doc.y, { width: W });
  doc.text("Generated from approved hours on Sideline Star (sidelinestar.com).", 54, doc.y, { width: W });

  doc.end();
  return done;
}
