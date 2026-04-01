const fs = require('fs');
const path = 'src/app/api/service-provider/evaluators/route.js';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
  `    const spMembership = await sql\`
      SELECT em.organization_id as sp_id, u.id as admin_id
      FROM evaluator_memberships em
      JOIN organizations o ON o.id = em.organization_id
      JOIN users u ON u.email = \${session.email}
      WHERE u.email = \${session.email} AND em.status = 'active' AND o.type = 'service_provider' LIMIT 1
    \`;
    if (!spMembership.length) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const { sp_id, admin_id } = spMembership[0];`,
  `    const { searchParams } = new URL(request.url);
    const sp_id = await resolveSpOrgId(session, searchParams.get("org"));
    if (!sp_id) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const adminRes = await sql\`SELECT id FROM users WHERE email = \${session.email} LIMIT 1\`;
    const admin_id = adminRes[0]?.id;`
);

fs.writeFileSync(path, c);
console.log('done');
