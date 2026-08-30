// Set a temporary password for one user, hashed exactly as the app does.
//
//   node scripts/set-temp-password.mjs someone@example.com
//   node scripts/set-temp-password.mjs someone@example.com --commit
//
// Updates the existing credentials row in place -- never inserts a second one.
// A duplicate credentials row for the same user is what locked a director out
// before (login reads whichever row comes back first), so this refuses to touch
// an account that already has more than one.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);

const EMAIL = process.argv[2];
const COMMIT = process.argv.includes("--commit");
if (!EMAIL || EMAIL.startsWith("--")) { console.error("Usage: node scripts/set-temp-password.mjs <email> [--commit]"); process.exit(1); }

// Readable when typed off a phone screen at a rink: no O/0, l/1, ambiguous pairs.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const pick = (n) => Array.from(randomBytes(n)).map(b => ALPHABET[b % ALPHABET.length]).join("");
const TEMP = `${pick(4)}-${pick(4)}-${pick(4)}`;

const [au] = await sql`SELECT id, email, name FROM auth_users WHERE lower(email) = lower(${EMAIL})`;
if (!au) { console.error(`No auth account for ${EMAIL}`); process.exit(1); }

const accounts = await sql`SELECT id, provider, (password IS NOT NULL) AS has_password FROM auth_accounts WHERE "userId" = ${au.id} AND provider = 'credentials'`;
console.log(`user           ${au.name} <${au.email}> (auth id ${au.id})`);
console.log(`credentials    ${accounts.length} row(s)${accounts.length ? `, has_password=${accounts[0].has_password}` : ""}`);

if (accounts.length > 1) {
  console.error(`\nRefusing: ${accounts.length} credentials rows. Duplicates are what caused a previous lockout — clean them up first.`);
  process.exit(1);
}

const [u] = await sql`SELECT id, role, is_suspended FROM users WHERE lower(email) = lower(${EMAIL})`;
console.log(`app user       ${u ? `id ${u.id}, role ${u.role}, suspended=${u.is_suspended}` : "(none)"}`);

if (!COMMIT) {
  console.log(`\nWould set a temporary password. Re-run with --commit to apply.`);
  process.exit(0);
}

const hash = await bcrypt.hash(TEMP, 12);
if (accounts.length === 1) {
  await sql`UPDATE auth_accounts SET password = ${hash} WHERE id = ${accounts[0].id}`;
} else {
  await sql`
    INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
    VALUES (${au.id}, 'credentials', 'credentials', ${au.email}, ${hash})`;
}
// emailVerified must be set or sign-in can refuse the account.
await sql`UPDATE auth_users SET "emailVerified" = COALESCE("emailVerified", NOW()) WHERE id = ${au.id}`;
try { await sql`UPDATE users SET password_changed_at = NOW() WHERE lower(email) = lower(${EMAIL})`; } catch { /* column optional */ }

// Prove it: verify the way the login route does.
const [check] = await sql`SELECT password FROM auth_accounts WHERE "userId" = ${au.id} AND provider = 'credentials'`;
const verified = await bcrypt.compare(TEMP, check.password);

console.log(`\n  email     ${au.email}`);
console.log(`  password  ${TEMP}`);
console.log(`\nverify check: ${verified ? "PASSES — he can sign in with this now" : "*** FAILED — do not hand this out ***"}`);
console.log(`\nSign in at https://www.sidelinestar.com/account/signin then change it under account settings.`);
