// Load .env.local into process.env BEFORE any test file imports @/lib/db
// (which reads DATABASE_URL at module-init time). Runs as a vitest setupFile.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
try {
  const env = readFileSync(path.join(root, ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* .env.local optional in CI */ }
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "integration-test-secret";
