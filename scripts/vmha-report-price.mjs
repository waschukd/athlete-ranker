// Set VMHA's development report price to $19.99.
//
//   node scripts/vmha-report-price.mjs            (preview)
//   node scripts/vmha-report-price.mjs --commit
//
// A custom price is only honoured when the association has been granted price
// control (resolveReportPrice ignores custom_report_price_cents otherwise), so
// this sets both. Side effect worth knowing: once granted, VMHA can change
// their own price from their dashboard without asking.
//
// The split is unchanged by this -- splitReportSale gives the SP a flat
// $34.99 cut and the association whatever is left. At $19.99 there is nothing
// left, so VMHA earns $0 per report either way; the whole $15 difference comes
// out of Competitive Thread's own cut.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const COMMIT = process.argv.includes("--commit");
const ORG = 70, PRICE_CENTS = 1999;

// Mirrors src/lib/reportProvider.js -- kept here only to show the split in the
// preview; nothing in the app reads these copies.
const SP_FLAT_FEE_CENTS = 3499, ASSOCIATION_TX_FEE_CENTS = 70, DEFAULT_PRICE_CENTS = 3499;
const split = (p) => {
  const spFee = Math.min(SP_FLAT_FEE_CENTS, p);
  const rem = p - spFee;
  const assocFee = rem > 0 ? Math.min(ASSOCIATION_TX_FEE_CENTS, rem) : 0;
  return { spFee, assocFee, assoc: Math.max(0, rem - assocFee) };
};
const money = (c) => `$${(c / 100).toFixed(2)}`;

const [org] = await sql`SELECT id, name, report_purchasing_enabled, report_control_granted, custom_report_price_cents FROM organizations WHERE id = ${ORG}`;
const sold = await sql`SELECT COUNT(*)::int n, COALESCE(SUM(amount_cents), 0)::int gross FROM report_purchases WHERE age_category_id IN (SELECT id FROM age_categories WHERE organization_id = ${ORG}) AND status = 'completed'`;

const now = org.report_control_granted && org.custom_report_price_cents ? org.custom_report_price_cents : DEFAULT_PRICE_CENTS;
const before = split(now), after = split(PRICE_CENTS);

console.log(`${org.name} -- development report price\n`);
console.log(`  purchasing enabled: ${org.report_purchasing_enabled ? "yes" : "NO -- parents cannot buy at any price"}`);
console.log(`  price control:      ${org.report_control_granted ? "already granted" : "not granted -> granting (VMHA can then change it themselves)"}`);
console.log(`  price:              ${money(now)}${org.custom_report_price_cents ? "" : " (platform default)"}  ->  ${money(PRICE_CENTS)}`);
console.log(`\n  per report:`);
console.log(`     now    parent ${money(now)}  ->  CT ${money(before.spFee)}, VMHA ${money(before.assoc)}`);
console.log(`     after  parent ${money(PRICE_CENTS)}  ->  CT ${money(after.spFee)}, VMHA ${money(after.assoc)}`);
console.log(`\n  CT earns ${money(before.spFee - after.spFee)} less per report. VMHA's share is ${money(after.assoc)} either way --`);
console.log(`  the price sits below the SP cut, so the whole reduction is CT's.`);
console.log(`\n  reports sold so far: ${sold[0].n} (${money(sold[0].gross)} gross) -- unaffected, this only applies to new purchases.`);

if (!COMMIT) { console.log("\nPREVIEW ONLY -- nothing written. Re-run with --commit to apply."); process.exit(0); }

await sql`UPDATE organizations SET report_control_granted = true, custom_report_price_cents = ${PRICE_CENTS} WHERE id = ${ORG}`;
const [after2] = await sql`SELECT report_purchasing_enabled, report_control_granted, custom_report_price_cents FROM organizations WHERE id = ${ORG}`;
console.log(`\ndone. price ${money(after2.custom_report_price_cents)}, control granted: ${after2.report_control_granted}, purchasing enabled: ${after2.report_purchasing_enabled}`);
process.exit(0);
