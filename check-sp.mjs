const { default: db } = await import('./src/lib/db.js');
const rows = await db`
  SELECT au.email, u.role
  FROM auth_users au
  LEFT JOIN users u ON u.email = au.email
  ORDER BY u.role, au.email
`;
console.table(rows);
process.exit(0);
