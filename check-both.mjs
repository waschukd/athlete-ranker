const { default: db } = await import('./src/lib/db.js');

const emails = ['waschukd@gmail.com', 'dan@competitivethread.com'];
for (const email of emails) {
  const au = await db`SELECT id FROM auth_users WHERE email = ${email}`;
  const u = await db`SELECT role FROM users WHERE email = ${email}`;
  const aa = au.length ? await db`SELECT provider, LEFT(password,20) as pw FROM auth_accounts WHERE "userId" = ${au[0].id}` : [];
  console.log(`\n${email}`);
  console.log('  auth_users:', au.length ? 'EXISTS' : 'MISSING');
  console.log('  users/role:', u[0]?.role || 'MISSING');
  console.log('  auth_accounts:', aa.length ? JSON.stringify(aa[0]) : 'MISSING');
}
process.exit(0);
