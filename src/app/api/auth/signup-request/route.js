import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { checkAndRecord, clientIp } from "@/lib/rateLimit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PUBLIC. A prospective independent association submits a request for an
// account. Rate-limited per IP. We never reveal whether the email already
// exists — always return a generic success on valid input.
export async function POST(request) {
  try {
    const ip = clientIp(request);
    const rl = await checkAndRecord({ endpoint: "signup_request", identifier: ip, max: 5, windowMins: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const association_name = (body.association_name || "").trim();
    const email = (body.email || "").trim();
    const contact_name = (body.contact_name || "").trim() || null;
    const phone = (body.phone || "").trim() || null;
    const message = (body.message || "").trim() || null;

    if (!association_name) {
      return NextResponse.json({ error: "Association name is required" }, { status: 400 });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }

    await sql`
      INSERT INTO signup_requests (association_name, contact_name, email, phone, message)
      VALUES (${association_name}, ${contact_name}, ${email}, ${phone}, ${message})
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST signup-request error:", error);
    return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });
  }
}
