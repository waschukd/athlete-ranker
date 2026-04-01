const fs = require('fs');

// 1. Patch org API to return SP link
const orgPath = 'src/app/api/organizations/[orgId]/route.js';
let c = fs.readFileSync(orgPath, 'utf8');
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
fs.writeFileSync(orgPath, c);
console.log('org API patched');

// 2. Patch association dashboard
const dashPath = 'src/app/association/dashboard/page.jsx';
let d = fs.readFileSync(dashPath, 'utf8');

// Add serviceProvider derived var after org
d = d.replace(
  `  const org = orgData?.organization;`,
  `  const org = orgData?.organization;
  const serviceProvider = orgData?.service_provider || null;`
);

// Remove Back to God Mode (always shown, should be role-gated — just remove it entirely)
d = d.replace(
  `          <a href="/admin/god-mode" className="inline-flex items-center text-gray-500 hover:text-[#FF6B35] mb-6 transition-colors text-sm font-medium gap-1.5">
            <ArrowLeft size={15} /> Back to God Mode
          </a>`,
  ``
);

// Hide join codes + pending approvals section if SP-linked
d = d.replace(
  `      {/* Join Codes + Pending Approvals */}
      {joinCodeData && (`,
  `      {/* Join Codes + Pending Approvals — hidden if association has an SP */}
      {joinCodeData && !serviceProvider && (`
);

fs.writeFileSync(dashPath, d);
console.log('dashboard patched');
