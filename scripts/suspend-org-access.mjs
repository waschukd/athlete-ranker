// Suspend every director / association-admin access path for one or more
// associations, keeping a named exception list.
//
//   node scripts/suspend-org-access.mjs --orgs 47,42 --keep seeraadmin@shaw.ca,kerribishop@shaw.ca
//   node scripts/suspend-org-access.mjs --orgs 47,42 --keep ... --commit
//   node scripts/suspend-org-access.mjs --orgs 47,42 --keep ... --restore --commit   (undo)
//
// Millwoods (47) and SEERA U15 (42), 2026-09-29: both associations asked for
// all director and admin access to be cut except Kerri Bishop (she holds a
// separate account per org).
//
// There are FOUR ways into an association's data, and cutting three of them
// leaves the door open:
//
//   user_organization_roles  -- the association_admin grant
//   director_assignments     -- per-category director access (status='revoked')
//   organizations.contact_email -- authorize.js treats the contact address as
//                              the owner, so SEERA's contact (an admin being
//                              removed) would have kept full access with no
//                              role row at all. Moved to the kept admin.
//   users.is_suspended       -- blocks login outright. Only applied to people
//                              whose ONLY tie is these orgs, so nobody loses
//                              access to an unrelated association or the SP
//                              evaluator pool.
//
// The SP link (Competitive Thread) is deliberately untouched: it staffs and
// runs these evaluations, and cutting it would stop the tryouts themselves.
//
// Every change is written to audit_log with its old value, and --restore
// reverses the whole thing from the arguments alone.
import { connect } from "./_db.mjs";

const sql = connect(import.meta.url);
const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const COMMIT = process.argv.includes("--commit");
const RESTORE = process.argv.includes("--restore");
const ORGS = (arg("--orgs") || "").split(",").map(Number).filter(Boolean);
const KEEP = (arg("--keep") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
if (!ORGS.length) { console.error("Usage: --orgs 47,42 --keep a@b.ca,c@d.ca [--restore] [--commit]"); process.exit(1); }

const orgs = await sql`SELECT id, name, contact_email FROM organizations WHERE id = ANY(${ORGS})`;
const keepUsers = KEEP.length ? await sql`SELECT id, name, email FROM users WHERE lower(email) = ANY(${KEEP})` : [];
const keepIds = new Set(keepUsers.map(u => u.id));
console.log(`${RESTORE ? "RESTORE" : "SUSPEND"} access for: ${orgs.map(o => `${o.name} (${o.id})`).join(", ")}`);
console.log(`keeping: ${keepUsers.map(u => `${u.name} <${u.email}>`).join(", ") || "nobody"}\n`);
for (const e of KEEP) if (!keepUsers.some(u => u.email.toLowerCase() === e)) console.log(`  WARNING: --keep ${e} matches no user account`);

const [actor] = await sql`SELECT id FROM users WHERE email = 'dan@competitivethread.com'`;
const note = (extra) => JSON.stringify({ orgs: ORGS, kept: keepUsers.map(u => u.email), reason: "association request: suspend all director/admin access except Kerri Bishop", ...extra });

// ── 1. association_admin grants
const roleRows = await sql`
  SELECT uor.id, uor.user_id, uor.organization_id, uor.role, u.name, u.email, o.name AS org
  FROM user_organization_roles uor JOIN users u ON u.id = uor.user_id JOIN organizations o ON o.id = uor.organization_id
  WHERE uor.organization_id = ANY(${ORGS}) ORDER BY o.name, u.name`;
const dropRoles = roleRows.filter(r => !keepIds.has(r.user_id));

// ── 2. director assignments
const dirRows = await sql`
  SELECT da.id, da.user_id, da.status, u.name, u.email, o.name AS org, c.name AS cat
  FROM director_assignments da JOIN users u ON u.id = da.user_id
  JOIN age_categories c ON c.id = da.age_category_id JOIN organizations o ON o.id = c.organization_id
  WHERE c.organization_id = ANY(${ORGS}) AND da.status = ${RESTORE ? "revoked" : "active"} ORDER BY u.name, c.name`;
const dropDirs = dirRows.filter(r => !keepIds.has(r.user_id));

// ── 3. contact_email held by someone being removed
const badContacts = orgs.filter(o => o.contact_email && !keepUsers.some(u => u.email.toLowerCase() === o.contact_email.toLowerCase()));
const newContact = keepUsers[0]?.email || null;

// ── 4. login suspension, only for people with no tie outside these orgs
const affectedIds = [...new Set([...dropRoles.map(r => r.user_id), ...dropDirs.map(r => r.user_id)])];
const outside = affectedIds.length ? await sql`
  SELECT u.id, u.name, u.email, u.is_suspended,
    (SELECT COUNT(*)::int FROM user_organization_roles x WHERE x.user_id = u.id AND NOT (x.organization_id = ANY(${ORGS}))) other_roles,
    (SELECT COUNT(*)::int FROM evaluator_memberships em WHERE em.user_id = u.id AND em.status = 'active') memberships,
    (SELECT COUNT(*)::int FROM director_assignments da JOIN age_categories c ON c.id = da.age_category_id
      WHERE da.user_id = u.id AND da.status = 'active' AND NOT (c.organization_id = ANY(${ORGS}))) other_dirs,
    (SELECT COUNT(*)::int FROM organizations o WHERE lower(o.contact_email) = lower(u.email) AND NOT (o.id = ANY(${ORGS}))) other_contact
  FROM users u WHERE u.id = ANY(${affectedIds})` : [];
const lockable = outside.filter(u => !u.other_roles && !u.memberships && !u.other_dirs && !u.other_contact);
const notLockable = outside.filter(u => u.other_roles || u.memberships || u.other_dirs || u.other_contact);

console.log(`association_admin grants to ${RESTORE ? "restore" : "remove"}: ${dropRoles.length}`);
for (const r of dropRoles) console.log(`   ${r.org.padEnd(18)} ${r.name} <${r.email}>`);
console.log(`\ndirector assignments to ${RESTORE ? "reactivate" : "revoke"}: ${dropDirs.length}`);
for (const r of dropDirs) console.log(`   ${r.org.padEnd(18)} ${r.name.padEnd(20)} ${r.cat}`);
console.log(`\ncontact_email to move: ${badContacts.length}`);
for (const o of badContacts) console.log(`   ${o.name}: ${o.contact_email} -> ${RESTORE ? "(left as is on restore)" : newContact}`);
console.log(`\nlogin ${RESTORE ? "restore" : "suspend"} (no tie outside these orgs): ${lockable.length}`);
for (const u of lockable) console.log(`   ${u.name} <${u.email}>`);
if (notLockable.length) {
  console.log(`\nleft able to log in (they hold access elsewhere -- org access still removed above): ${notLockable.length}`);
  for (const u of notLockable) console.log(`   ${u.name} <${u.email}>  roles:${u.other_roles} memberships:${u.memberships} dirs:${u.other_dirs} contact:${u.other_contact}`);
}
console.log(`\nSP link (Competitive Thread) left active -- it runs these evaluations.`);

if (!COMMIT) { console.log("\nPREVIEW ONLY -- nothing written. Re-run with --commit to apply."); process.exit(0); }
if (!RESTORE && !newContact && badContacts.length) { console.error("Refusing: no kept account to hand contact_email to."); process.exit(1); }

if (RESTORE) {
  // Roles are restored from the audit trail, since the rows were deleted.
  const logged = await sql`
    SELECT notes FROM audit_log WHERE action = 'org_access_suspended' AND entity_type = 'organization' AND field_changed = 'association_admin'
      AND entity_id = ANY(${ORGS}) ORDER BY created_at`;
  for (const row of logged) {
    const d = typeof row.notes === "string" ? JSON.parse(row.notes) : row.notes;
    if (!d?.user_id || !d?.organization_id) continue;
    await sql`INSERT INTO user_organization_roles (user_id, organization_id, role, age_category_id)
      VALUES (${d.user_id}, ${d.organization_id}, ${d.role}, ${d.age_category_id ?? null})
      ON CONFLICT DO NOTHING`;
    console.log(`restored admin: ${d.email} -> org ${d.organization_id}`);
  }
  for (const r of dropDirs) {
    await sql`UPDATE director_assignments SET status = 'active' WHERE id = ${r.id}`;
    console.log(`restored director: ${r.name} ${r.cat}`);
  }
  for (const u of outside.filter(x => x.is_suspended)) {
    await sql`UPDATE users SET is_suspended = false, suspension_message = NULL WHERE id = ${u.id}`;
    console.log(`unsuspended: ${u.email}`);
  }
  await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, notes, organization_id)
    VALUES (${actor.id}, 'org_access_restored', 'organization', ${ORGS[0]}, 'access', 'suspended', 'restored', ${note({})}, ${ORGS[0]})`;
  console.log("\nrestored.");
  process.exit(0);
}

const MSG = "Access to this association's evaluation data has been suspended at the association's request. Contact your association for access.";
for (const r of dropRoles) {
  await sql`DELETE FROM user_organization_roles WHERE id = ${r.id}`;
  await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, notes, organization_id)
    VALUES (${actor.id}, 'org_access_suspended', 'organization', ${r.organization_id}, 'association_admin', ${r.email}, 'removed',
      ${note({ user_id: r.user_id, email: r.email, organization_id: r.organization_id, role: r.role })}, ${r.organization_id})`;
  console.log(`removed admin: ${r.email} (${r.org})`);
}
for (const r of dropDirs) {
  await sql`UPDATE director_assignments SET status = 'revoked' WHERE id = ${r.id}`;
  await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, notes, organization_id)
    VALUES (${actor.id}, 'org_access_suspended', 'organization', ${ORGS[0]}, 'director', ${r.email}, 'revoked',
      ${note({ user_id: r.user_id, email: r.email, director_assignment_id: r.id, category: r.cat })}, ${ORGS[0]})`;
  console.log(`revoked director: ${r.email} (${r.cat})`);
}
for (const o of badContacts) {
  await sql`UPDATE organizations SET contact_email = ${newContact} WHERE id = ${o.id}`;
  await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, notes, organization_id)
    VALUES (${actor.id}, 'org_access_suspended', 'organization', ${o.id}, 'contact_email', ${o.contact_email}, ${newContact}, ${note({})}, ${o.id})`;
  console.log(`contact_email: ${o.name} ${o.contact_email} -> ${newContact}`);
}
for (const u of lockable) {
  await sql`UPDATE users SET is_suspended = true, suspension_message = ${MSG} WHERE id = ${u.id}`;
  await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, notes, organization_id)
    VALUES (${actor.id}, 'org_access_suspended', 'user', ${u.id}, 'is_suspended', 'false', 'true', ${note({ email: u.email })}, ${ORGS[0]})`;
  console.log(`suspended login: ${u.email}`);
}
console.log(`\ndone. ${dropRoles.length} admin grants removed, ${dropDirs.length} director assignments revoked, ${badContacts.length} contact addresses moved, ${lockable.length} logins suspended.`);
console.log("Access is re-validated on every request, so anyone signed in loses it on their next page load.");
process.exit(0);
