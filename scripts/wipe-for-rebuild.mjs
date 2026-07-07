// DESTRUCTIVE — clean-slate wipe before rebuilding associations from scratch.
//
// KEEPS exactly three accounts/orgs:
//   • Dan Waschuk / God          waschukd@gmail.com
//   • Competitive Thread (SP)    org 16 + admin dan@competitivethread.com  (evaluators dropped)
//   • Above The Crease (Goalie)  org 26 + admin jamie@atcgoaltending.com
//
// Deletes every other organization (associations + Trista Goaltending) and ALL their
// data via ON DELETE CASCADE (age_categories→athletes→scores/testing/teams/schedules/
// notes, memberships, sp_association_links, join codes, director assignments, …), then
// every other user + auth login.
//
// Usage:
//   node scripts/wipe-for-rebuild.mjs            # dry run — shows what would be deleted
//   node scripts/wipe-for-rebuild.mjs --commit   # perform the wipe (irreversible)
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");

const KEEP_ORGS = [16, 26];
const KEEP_EMAILS = ["waschukd@gmail.com", "dan@competitivethread.com", "jamie@atcgoaltending.com"];

const orgsToDelete = await sql`SELECT id, name, type FROM organizations WHERE id <> ALL(${KEEP_ORGS}) ORDER BY id`;
const delOrgIds = orgsToDelete.map(o => o.id);
const usersToDelete = await sql`SELECT id, email, name, role FROM users WHERE lower(email) <> ALL(${KEEP_EMAILS}) ORDER BY id`;
const authToDelete = await sql`SELECT id, email, name FROM auth_users WHERE lower(email) <> ALL(${KEEP_EMAILS}) ORDER BY id`;

// What cascades with the orgs (informational counts)
const [{ cats }] = await sql`SELECT COUNT(*)::int cats FROM age_categories WHERE organization_id = ANY(${delOrgIds})`;
const [{ ath }] = await sql`SELECT COUNT(*)::int ath FROM athletes WHERE organization_id = ANY(${delOrgIds})`;

console.log("WILL KEEP:");
console.log("  orgs:", (await sql`SELECT id, name, type FROM organizations WHERE id = ANY(${KEEP_ORGS}) ORDER BY id`).map(o => `${o.id}:${o.name}`).join(", "));
console.log("  users:", (await sql`SELECT email FROM users WHERE lower(email) = ANY(${KEEP_EMAILS}) ORDER BY id`).map(u => u.email).join(", "));
console.log("\nWILL DELETE:");
console.log(`  ${orgsToDelete.length} orgs:`, orgsToDelete.map(o => `${o.id}:${o.name}`).join(", "));
console.log(`  cascades → ${cats} age categories, ${ath} athletes (+ all their scores/testing/teams/schedules/notes)`);
console.log(`  ${usersToDelete.length} app users:`, usersToDelete.map(u => `${u.email}`).join(", "));
console.log(`  ${authToDelete.length} auth logins:`, authToDelete.map(u => u.email).join(", "));

if (!COMMIT) { console.log("\nDRY RUN — nothing deleted. Re-run with --commit to apply."); process.exit(0); }

console.log("\nCommitting wipe…");
await sql.transaction([
  // 1) drop all non-kept organizations — cascades remove their entire data tree
  sql`DELETE FROM organizations WHERE id = ANY(${delOrgIds})`,
  // 2) audit_log.reversed_by is NO ACTION — null it for users we're about to remove
  sql`UPDATE audit_log SET reversed_by = NULL WHERE reversed_by IN (SELECT id FROM users WHERE lower(email) <> ALL(${KEEP_EMAILS}))`,
  // 3) remove all non-kept app users (their org-scoped rows are already gone)
  sql`DELETE FROM users WHERE lower(email) <> ALL(${KEEP_EMAILS})`,
  // 4) remove all non-kept auth logins (auth_accounts + auth_sessions cascade)
  sql`DELETE FROM auth_users WHERE lower(email) <> ALL(${KEEP_EMAILS})`,
]);

const orgsLeft = await sql`SELECT id, name, type FROM organizations ORDER BY id`;
const usersLeft = await sql`SELECT id, email, role FROM users ORDER BY id`;
const authLeft = await sql`SELECT id, email FROM auth_users ORDER BY id`;
console.log("\nDONE. Remaining state:");
console.log("  orgs:", orgsLeft.map(o => `${o.id}:${o.name}`).join(", "));
console.log("  users:", usersLeft.map(u => `${u.email} (${u.role})`).join(", "));
console.log("  auth logins:", authLeft.map(u => u.email).join(", "));
