import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { appUserId } from "@/lib/notify";
import { sendEmail } from "@/lib/email";
import { spAdminRecipients } from "@/lib/spAdmins";
import { recomputeTesterHours } from "@/lib/testerHours";
import { buildInvoice, invoiceNumber, renderInvoiceEmail } from "@/lib/invoice";

// Evaluator/tester self-serve invoice: builds an itemized invoice of their
// APPROVED, unpaid hours for one provider and emails it to that provider's
// admins (copy to themselves). Pending hours are listed as excluded — an
// invoice for unapproved hours just starts an argument; paid hours are done.
// All building/rendering lives in src/lib/invoice.js (shared with scripts).

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await appUserId(session);
    if (!userId) return NextResponse.json({ error: "No account" }, { status: 403 });
    const { org_id } = await request.json();
    const orgId = parseInt(org_id);
    if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

    // Testers' hours are derived from their schedule span — refresh before invoicing.
    try { await recomputeTesterHours(userId); } catch (e) { console.error("invoice tester recompute:", e?.message); }

    const inv = await buildInvoice(userId, orgId);
    if (!inv) return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    if (!inv.items.length || inv.total <= 0) {
      return NextResponse.json({ error: "No approved unpaid hours to invoice yet. Hours must be approved by your provider first." }, { status: 400 });
    }

    const admins = await spAdminRecipients([orgId]);
    const toSet = new Set(admins.map(a => a.email).filter(Boolean));
    if (!toSet.size && inv.em.contact_email) toSet.add(inv.em.contact_email);
    if (!toSet.size) return NextResponse.json({ error: "Your provider has no admin email on file." }, { status: 400 });
    const to = [...toSet];
    if (inv.em.user_email) to.push(inv.em.user_email); // sender's own copy

    const invoiceNo = invoiceNumber(userId);
    const { subject, html } = renderInvoiceEmail(inv, invoiceNo);
    const res = await sendEmail(to, subject, html);
    if (!res.ok) return NextResponse.json({ error: res.error || "Send failed" }, { status: 502 });
    return NextResponse.json({ success: true, invoice: invoiceNo, total: inv.total, sent_to: [...toSet].length });
  } catch (e) {
    console.error("invoice POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
