import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import sql from "./db";

if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET environment variable is required");
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);

export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(SECRET);
}

async function verifyToken(token) {
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

async function getCurrentUser() {
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

export async function resolveSpOrgId(session, orgParamId) {
  if (session?.role === "super_admin" && orgParamId) {
    const org = await sql`SELECT id FROM organizations WHERE id = ${orgParamId} AND type = 'service_provider' LIMIT 1`;
    return org[0]?.id || null;
  }
  const byContact = await sql`SELECT id FROM organizations WHERE contact_email = ${session.email} AND type = 'service_provider' LIMIT 1`;
  if (byContact.length) return byContact[0].id;
  // Additional admins added via "Invite Admin" get a user_organization_roles row
  // on the SP org (not contact_email / not an evaluator membership) — they must
  // resolve to the SP too, or they'd have no access to what the SP manages.
  const byRole = await sql`SELECT o.id FROM user_organization_roles uor JOIN organizations o ON o.id = uor.organization_id JOIN users u ON u.id = uor.user_id WHERE u.email = ${session.email} AND o.type = 'service_provider' LIMIT 1`;
  if (byRole.length) return byRole[0].id;
  const byMembership = await sql`SELECT em.organization_id as id FROM evaluator_memberships em JOIN organizations o ON o.id = em.organization_id JOIN users u ON u.id = em.user_id WHERE u.email = ${session.email} AND o.type = 'service_provider' LIMIT 1`;
  return byMembership[0]?.id || null;
}

// Same resolution as resolveSpOrgId but for a Goalie Service Provider org
// (type='goalie_service_provider') — a position-scoped SP that only manages goalies.
export async function resolveGoalieSpOrgId(session, orgParamId) {
  if (session?.role === "super_admin" && orgParamId) {
    const org = await sql`SELECT id FROM organizations WHERE id = ${orgParamId} AND type = 'goalie_service_provider' LIMIT 1`;
    return org[0]?.id || null;
  }
  const byContact = await sql`SELECT id FROM organizations WHERE contact_email = ${session.email} AND type = 'goalie_service_provider' LIMIT 1`;
  if (byContact.length) return byContact[0].id;
  const byRole = await sql`SELECT o.id FROM user_organization_roles uor JOIN organizations o ON o.id = uor.organization_id JOIN users u ON u.id = uor.user_id WHERE u.email = ${session.email} AND o.type = 'goalie_service_provider' LIMIT 1`;
  return byRole[0]?.id || null;
}
