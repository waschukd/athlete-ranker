const { default: db } = await import('./src/lib/db.js');
const tables = await db`
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name LIKE '%anchor%'
`;
console.table(tables);
process.exit(0);
