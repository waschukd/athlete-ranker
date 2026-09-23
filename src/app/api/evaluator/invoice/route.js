import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { appUserId } from "@/lib/notify";
import { recomputeTesterHours } from "@/lib/testerHours";
import { buildInvoice, invoiceNumber, renderInvoicePdf } from "@/lib/invoice";

// Evaluator/tester self-serve invoice: a PDF of their APPROVED, unpaid hours
// for one provider, downloaded so THEY email it to the provider themselves —
// the platform deliberately does not send it for them (a contractor issuing
// their own invoice is the paper trail the CRA expects). Building/rendering
// lives in src/lib/invoice.js, shared with sample-send scripts.

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await appUserId(session);
    if (!userId) return NextResponse.json({ error: "No account" }, { status: 403 });
    const orgId = parseInt(new URL(request.url).searchParams.get("org"));
    if (!orgId) return NextResponse.json({ error: "org required" }, { status: 400 });

    // Testers' hours are derived from their schedule span — refresh before invoicing.
    try { await recomputeTesterHours(userId); } catch (e) { console.error("invoice tester recompute:", e?.message); }

    const inv = await buildInvoice(userId, orgId);
    if (!inv) return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    if (!inv.items.length || inv.total <= 0) {
      return NextResponse.json({ error: "No approved unpaid hours to invoice yet. Hours must be approved by your provider first." }, { status: 400 });
    }

    const invoiceNo = invoiceNumber(userId);
    const pdf = await renderInvoicePdf(inv, invoiceNo);
    const safeName = (inv.em.user_name || "invoice").replace(/[^\w\- ]/g, "").replace(/\s+/g, "-");
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoiceNo}-${safeName}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("invoice GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
