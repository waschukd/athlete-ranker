const { default: db } = await import('./src/lib/db.js');
await db`INSERT INTO users (email, name, role) VALUES ('waschukd@gmail.com', 'Dan Waschuk', 'super_admin')`;
const check = await db`SELECT email, name, role FROM users WHERE email = 'waschukd@gmail.com'`;
console.table(check);
process.exit(0);
