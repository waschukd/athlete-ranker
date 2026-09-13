import { connect } from "./_db.mjs";
const sql = connect(import.meta.url);
const [u] = await sql`SELECT id, email, created_at::text c FROM users WHERE name='Sydney Dutertre'`;
console.log(`Sydney user ${u.id} <${u.email}> created ${u.c.slice(0,10)}`);
const inv = await sql`SELECT organization_id, role, status, created_at::text c, accepted_at::text a FROM evaluator_invitations WHERE LOWER(email)=LOWER(${u.email}) ORDER BY created_at`;
console.log("invitations:"); for (const i of inv) console.log(`  org ${i.organization_id} role=${i.role} ${i.status} created ${i.c.slice(0,16)} accepted ${i.a ? i.a.slice(0,16) : "-"}`);
const mem = await sql`SELECT id, organization_id, role, status, is_evaluator, is_tester, created_at::text c, joined_via FROM evaluator_memberships WHERE user_id=${u.id}`;
console.log("memberships:"); for (const m of mem) console.log(`  ${m.id} org ${m.organization_id} role=${m.role} ${m.status} eval=${m.is_evaluator} tester=${m.is_tester} created ${m.c.slice(0,16)} via=${m.joined_via}`);
const al = await sql`SELECT action, entity_type, entity_id, old_value, new_value, created_at::text c FROM audit_log
  WHERE (entity_type IN ('user','evaluator','membership') AND entity_id=${u.id}) OR new_value ILIKE '%dutertre%' OR old_value ILIKE '%dutertre%' ORDER BY created_at DESC LIMIT 15`;
console.log("audit_log mentioning her:"); for (const a of al) console.log(`  ${a.c.slice(0,16)} ${a.action} ${a.entity_type}:${a.entity_id} ${a.old_value||""} -> ${a.new_value||""}`);
if (!al.length) console.log("  none");
