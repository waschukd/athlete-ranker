// Endpoint that the client calls to record an event. The body carries the
// event name + optional duration + optional metadata; the server fills in
// user_id / role / org_id from the session so the client can never lie
// about whose event it is.
//
// Auth: regular session cookie. We don't accept events from anonymous
// users (yet) — if that comes up, add an explicit /public/event endpoint
// rather than making this one open.

import { NextResponse } from "next/server";
import { getSession, getAppUserId } from "@/lib/auth";
import { logEvent } from "@/lib/analytics";

const MAX_METADATA_KEYS = 20;
const MAX_METADATA_BYTES = 4096;

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { event, durationMs, orgId, metadata } = body || {};

    if (!event || typeof event !== "string" || event.length > 100) {
      return NextResponse.json({ error: "event required" }, { status: 400 });
    }

    // Defensive metadata bounds — clients are dumb sometimes
    let safeMeta = null;
    if (metadata && typeof metadata === "object") {
      const keys = Object.keys(metadata);
      if (keys.length > MAX_METADATA_KEYS) {
        return NextResponse.json({ error: "metadata too wide" }, { status: 400 });
      }
      const json = JSON.stringify(metadata);
      if (json.length > MAX_METADATA_BYTES) {
        return NextResponse.json({ error: "metadata too big" }, { status: 400 });
      }
      safeMeta = metadata;
    }

    const userId = await getAppUserId(session);
    logEvent({
      userId,
      role: session.role || "anonymous",
      event,
      orgId: typeof orgId === "number" ? orgId : null,
      durationMs: typeof durationMs === "number" && durationMs >= 0 ? Math.round(durationMs) : null,
      metadata: safeMeta,
    });

    // 202 because we don't await the write — the event is accepted, not
    // necessarily persisted yet.
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch {
    // Analytics must never fail the user. Always 202.
    return NextResponse.json({ ok: true }, { status: 202 });
  }
}
