import { NextResponse } from "next/server";
import crypto from "node:crypto";
import sql from "@/lib/db";

// Resend delivery webhook. Updates group_email_log status by resend message id
// so the Groups page can show delivered / bounced / complained per parent.
// Configure in Resend → Webhooks pointing at /api/webhooks/resend; set the
// signing secret as RESEND_WEBHOOK_SECRET (whsec_...) for verification.

const EVENT_STATUS = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivery_delayed": "delayed",
  "email.sent": "sent",
};

// Svix signature verification (Resend uses Svix). Returns true if valid OR if no
// secret is configured (best-effort in that case).
function verify(rawBody, headers) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true; // not configured — accept (set the secret to enforce)
  try {
    const id = headers.get("svix-id");
    const ts = headers.get("svix-timestamp");
    const sigHeader = headers.get("svix-signature");
    if (!id || !ts || !sigHeader) return false;
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const signed = `${id}.${ts}.${rawBody}`;
    const expected = crypto.createHmac("sha256", secretBytes).update(signed).digest("base64");
    // header is space-separated "v1,<sig>" entries
    return sigHeader.split(" ").some(part => {
      const sig = part.split(",")[1];
      return sig && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    });
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const raw = await request.text();
    if (!verify(raw, request.headers)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    const evt = JSON.parse(raw);
    const status = EVENT_STATUS[evt.type];
    const emailId = evt?.data?.email_id || evt?.data?.id;
    if (!status || !emailId) return NextResponse.json({ ok: true, ignored: true });

    const errText = evt.type === "email.bounced"
      ? (evt?.data?.bounce?.message || evt?.data?.reason || "Bounced")
      : null;

    // Don't let a late 'delivered' clobber a terminal bounce/complaint.
    await sql`
      UPDATE group_email_log
      SET status = ${status}, error = COALESCE(${errText}, error), updated_at = NOW()
      WHERE resend_id = ${emailId} AND status NOT IN ('bounced', 'complained')
    `;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Resend webhook error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
