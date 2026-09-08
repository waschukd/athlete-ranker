import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// group_email_log began as the parent group-assignment flow's private table.
// lib/emailLog.js later made it the shared log for EVERY outbound email --
// evaluator spot-fills, staff messages, invites, strikes -- distinguished only
// by email_type. This route never got the filter, which produced two faults:
//
//   READ: the "Group assignment emails" panel listed every email type for the
//   session. An evaluator spot-fill blast to 47 people rendered as though the
//   parents' email had gone to the entire evaluator pool -- athlete_name even
//   held the evaluator's own name. That is how it was reported, and it cost a
//   real scare before the log proved no parent email had been sent since Aug 24.
//
//   DELETE: sending a parent batch cleared the log for the session with no type
//   filter, destroying the delivery history of every other flow.
//
// The recipient list itself was never at risk: sends are built from
// player_group_assignments -> parentEmails(), never from this table.

const SRC = readFileSync(resolve(process.cwd(), "src/app/api/categories/[catId]/group-emails/route.js"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the group-email panel only reads its own emails", () => {
  it("filters the status query by email_type", () => {
    const read = CODE.slice(CODE.indexOf("SELECT group_number, athlete_id"));
    const stmt = read.slice(0, read.indexOf("`;"));
    expect(stmt).toMatch(/email_type = 'session'/);
  });

  it("every read of the log is scoped", () => {
    // Any SELECT from this table in this route must carry the filter.
    const selects = CODE.split("FROM group_email_log").slice(1);
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) {
      const stmt = s.slice(0, s.indexOf("`"));
      expect(stmt).toMatch(/email_type = 'session'/);
    }
  });
});

describe("sending a parent batch does not wipe other flows' history", () => {
  it("every DELETE is scoped to email_type", () => {
    const deletes = CODE.split("DELETE FROM group_email_log").slice(1);
    expect(deletes.length).toBe(2); // whole-session batch, and single-family resend
    for (const d of deletes) {
      const stmt = d.slice(0, d.indexOf("`"));
      expect(stmt).toMatch(/email_type = 'session'/);
    }
  });
});

describe("recipients never come from the log", () => {
  it("builds the send list from group assignments and parent emails", () => {
    // This is why the scare was only ever a display bug: even with foreign rows
    // on screen, "Re-send all" could not have mailed an evaluator.
    expect(CODE).toMatch(/const emails = parentEmails\(m\)/);
    expect(CODE).toMatch(/plan\.assigns\.filter\(a => a\.session_group_id === g\.id\)/);
  });

  it("does not select recipient_email out of the log to send to", () => {
    const sendLoop = CODE.slice(CODE.indexOf("for (const g of plan.groups)"));
    expect(sendLoop).not.toMatch(/FROM group_email_log/);
  });

  it("writes its own rows tagged as 'session'", () => {
    const inserts = CODE.split("INSERT INTO group_email_log").slice(1);
    expect(inserts.length).toBe(2); // no-email skip, and the real send
    for (const i of inserts) expect(i).toMatch(/'session'/);
  });
});
