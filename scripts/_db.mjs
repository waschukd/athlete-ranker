// Shared connection + date formatting for standalone scripts.
//
// Scripts call neon() directly instead of going through src/lib/db.js, and that
// one difference changes what a DATE column returns:
//
//   src/lib/db.js  ->  types.setTypeParser(1082, v => v)  ->  "2026-09-07"
//   raw neon()     ->  driver default                     ->  Date @ LOCAL midnight
//
// So a formatter that is correct in the app is wrong in a script, silently:
//
//   d.toString().split("T")[0]        -> "Mon Sep 07 2026 00:00:00 GM"
//   String(d).slice(0,10)             -> "Mon Sep 07"  -> Invalid Date
//
// Both of those shipped. The second one nearly went out in a termination email
// with eight "Invalid Date" lines in it.
//
// The subtler one bites even when the format looks fine. A Date at local
// midnight rendered with `timeZone: "UTC"` reads back as the right day only west
// of UTC. Run the same script from anywhere east of it -- or from a CI box on
// UTC -- and every date is a day early. A reinstatement email that already went
// to evaluators was correct only because it happened to run from Toronto.
//
// fmtDay below takes the calendar day apart and rebuilds it locally, so it is
// correct for a Date OR a string, in any timezone, under either parser.

import { neon, types } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

// Match the app exactly: a calendar day has no time and no zone, so keep it a
// plain "YYYY-MM-DD" string rather than a Date that drifts.
types.setTypeParser(1082, (v) => v);

export function loadEnv(importMetaUrl, file = "../.env.production.local") {
  const env = readFileSync(new URL(file, importMetaUrl), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export function connect(importMetaUrl, file) {
  loadEnv(importMetaUrl, file);
  return neon(process.env.DATABASE_URL);
}

const pad = (n) => String(n).padStart(2, "0");

// The calendar day, whatever form the value arrived in. A Date from the default
// parser is at LOCAL midnight, so its LOCAL parts are the real day -- reading
// UTC parts off it is what shifts the date.
export function isoDay(d) {
  if (d == null || d === "") return null;
  if (d instanceof Date) {
    if (!isFinite(d.getTime())) return null;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const s = String(d);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

const DEFAULT_OPTS = { weekday: "short", month: "short", day: "numeric", year: "numeric" };

// Rebuilt from parts as a LOCAL date, so no timeZone option is needed and none
// should be passed -- that is the thing that goes wrong.
export function fmtDay(d, opts = DEFAULT_OPTS, locale = "en-CA") {
  const iso = isoDay(d);
  if (!iso) return "TBD";
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(locale, opts);
}

export function fmtTime(t) {
  return t ? String(t).slice(0, 5) : "";
}
