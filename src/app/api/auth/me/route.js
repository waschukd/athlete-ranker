import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

// Lightweight "who am I" for the global session bar. Returns null when not logged
// in. Name is read from the live DB (not the token) so a self-edit shows up right
// away without needing to re-login.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  let name = session.name || null;
  try {
    const [row] = await sql`SELECT name FROM users WHERE email = ${session.email}`;
    if (row?.name) name = row.name;
  } catch { /* fall back to token name */ }
  return NextResponse.json({ user: { name, email: session.email || null, role: session.role || null } });
}

// Let any signed-in user fix their own display name (e.g. a bad autofill). Writes
// both the app users row and the auth_users row so every surface — rosters,
// emails, reports — reflects it. A user can only ever change their own record.
export async function PATCH(request) {
  const session = await getSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const name = (body.name || "").toString().trim();
  if (!name) return NextResponse.json({ error: "Name can't be empty" }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "Name is too long" }, { status: 400 });
  try {
    await sql`UPDATE users SET name = ${name} WHERE email = ${session.email}`;
    await sql`UPDATE auth_users SET name = ${name} WHERE email = ${session.email}`;
  } catch (e) {
    console.error("auth/me PATCH error:", e);
    return NextResponse.json({ error: "Couldn't save your name" }, { status: 500 });
  }
  return NextResponse.json({ success: true, name });
}
