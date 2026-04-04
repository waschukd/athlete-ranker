const { default: db } = await import('./src/lib/db.js');
const cols = await db`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'age_categories'
  ORDER BY ordinal_position
`;
console.table(cols);
process.exit(0);
