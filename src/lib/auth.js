import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import sql from "./db";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "fallback-secret-change-me");

export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session?.email) return null;
  const users = await sql`SELECT * FROM users WHERE email = ${session.email}`;
  return users[0] || null;
}

export async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") return null;
  return user;
}

// Helper to get the app users.id from session (not auth_users.id)
export async function getAppUserId(session) {
  if (!session?.email) return null;
  const users = await sql`SELECT id FROM users WHERE email = ${session.email}`;
  return users[0]?.id || null;
}
