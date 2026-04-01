import { createHash } from 'crypto';
const { default: db } = await import('./src/lib/db.js');

const email = 'dan@competitivethread.com';
const tempPassword = 'Temp1234!';
const pwHash = createHash('sha256').update(tempPassword).digest('hex');

const [au] = await db`
  INSERT INTO auth_users (email, name)
  VALUES (${email}, 'Dan Competitive Thread')
  ON CONFLICT (email) DO UPDATE SET email = ${email}
  RETURNING id
`;

await db`
  INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
  VALUES (${au.id}, 'credentials', 'credentials', ${email}, ${pwHash})
  ON CONFLICT DO NOTHING
`;

await db`
  INSERT INTO users (email, name, role)
  VALUES (${email}, 'Dan Competitive Thread', 'service_provider_admin')
  ON CONFLICT (email) DO UPDATE SET role = 'service_provider_admin'
`;

console.log('Done. Login with:', email, '/', tempPassword);
process.exit(0);
