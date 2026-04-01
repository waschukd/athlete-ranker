const fs = require('fs');
const path = 'src/app/api/organizations/[orgId]/route.js';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
  `    const orgs = await sql\`SELECT * FROM organizations WHERE id = \${params.orgId}\`;
    if (!orgs.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ organization: orgs[0] });`,
  `    const orgs = await sql\`SELECT * FROM organizations WHERE id = \${params.orgId}\`;
    if (!orgs.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const spLink = await sql\`
      SELECT o.id as sp_id, o.name as sp_name
      FROM sp_association_links sal
      JOIN organizations o ON o.id = sal.service_provider_id
      WHERE sal.association_id = \${params.orgId} AND sal.status = 'active'
      LIMIT 1
    \`;
    return NextResponse.json({ organization: orgs[0], service_provider: spLink[0] || null });`
);

fs.writeFileSync(path, c);
console.log('done');
