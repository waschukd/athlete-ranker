import { createHash } from 'crypto';
const { default: db } = await import('./src/lib/db.js');

const email = 'dan@competitivethread.com';
const newPassword = 'Temp1234!';
const pwHash = createHash('sha256').update(newPassword).digest('hex');

const au = await db`SELECT id FROM auth_users WHERE email = ${email}`;
if (!au.length) { console.log('auth_users row missing!'); process.exit(1); }

const result = await db`
  UPDATE auth_accounts SET password = ${pwHash}
  WHERE "userId" = ${au[0].id} AND provider = 'credentials'
  RETURNING id
`;
console.log('Updated rows:', result.length);
console.log('Login with:', email, '/', newPassword);
process.exit(0);
