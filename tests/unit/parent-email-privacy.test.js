// Parents must never be told their child's group number.
//
// Groups are an internal artifact of how ice is split. Parents read "Group 1" as
// a skill tier and start comparing families mid-process. The session's date/time/
// rink is already group-specific, so the number adds nothing they can act on.
//
// It leaked in three places at once — the email headline, a "Group" column in the
// schedule table, and (worst) the .ics attachment, which put "S1 G2" straight
// into the parent's calendar. These pin all three.

import { describe, it, expect } from "vitest";
import { groupAssignmentHtml, parentScheduleHtml, parentSessionUpdateHtml } from "@/lib/email";
import { generateICS, googleCalendarUrl } from "@/lib/calendar";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const GROUPY = /\bgroup\s*\d|\bG\d\b|\bgroup\s+(one|two|three)\b/i;

const ICE_TIME = {
  playerName: "Ella Boyd",
  categoryName: "U11 House",
  orgName: "Demo Soci",
  sessionLabel: "Session 1 · Testing",
  date: "Sunday, September 6",
  time: "9:00 AM – 10:00 AM",
  location: "Community Rink",
};

// Checking known functions one by one is how scheduleNotify.js kept its "Group"
// row through two passes of this exact fix — it builds its own HTML inline
// instead of going through lib/email.js. Sweep every sender instead.
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".js") || p.endsWith(".jsx")) out.push(p);
  }
  return out;
}

// Must be function-level, not file-level: scheduleNotify.js holds BOTH
// notifyParentsIfImminent (parents — no group) and notifySessionChange
// (evaluators/admins — group required, they need to know what moved). A
// file-level check can't tell them apart and would strip the staff one.
function parentFacingFunctions() {
  const out = [];
  for (const file of walk("src")) {
    if (/lib[\\/]email\.js$/.test(file)) continue; // the builders themselves are covered above
    const src = readFileSync(file, "utf8");
    if (!/parentEmails\s*\(/.test(src)) continue;
    // Split on top-level function boundaries and keep the chunks that send to parents.
    const chunks = src.split(/(?=^(?:export\s+)?(?:async\s+)?function\s+\w+)/m);
    for (const chunk of chunks) {
      if (!/parentEmails\s*\(/.test(chunk)) continue;
      const name = chunk.match(/function\s+(\w+)/)?.[1] || "(module scope)";
      out.push([`${file} → ${name}()`, chunk]);
    }
  }
  return out;
}

describe("no parent-facing sender renders a group", () => {
  const senders = parentFacingFunctions();

  it("finds the parent-facing senders", () => {
    expect(senders.length).toBeGreaterThan(0);
  });

  it.each(senders)("%s renders no group into copy", (_label, chunk) => {
    // Interpolating a group INTO prose/markup — e.g. `Group ${r.group_number}`.
    // Passing group_number as a SQL value or object key is fine; that's internal
    // bookkeeping and never reaches a parent.
    const rendered = chunk.match(/Group\s*\$\{[^}]+\}/g) || [];
    expect(
      rendered,
      `interpolates a group number into parent-facing copy: ${rendered.join(", ")}. ` +
      `Parents read a group as a skill tier; the date/time is already group-specific.`,
    ).toEqual([]);
  });
});

describe("parent emails never name the group", () => {
  it("ice-time email carries date/time/rink but no group", () => {
    const html = groupAssignmentHtml(ICE_TIME);
    expect(html).toContain("Sunday, September 6");
    expect(html).toContain("9:00 AM – 10:00 AM");
    expect(html).toContain("Community Rink");
    expect(html).not.toMatch(GROUPY);
  });

  it("ice-time email ignores a groupNumber even if a caller still passes one", () => {
    // Defence in depth: the arg was removed from the signature, but a stale
    // caller shouldn't be able to put the group back on the page.
    const html = groupAssignmentHtml({ ...ICE_TIME, groupNumber: 2 });
    expect(html).not.toMatch(GROUPY);
  });

  it("schedule email has no Group column", () => {
    const html = parentScheduleHtml({
      playerName: "Ella Boyd", categoryName: "U11 House", orgName: "Demo Soci",
      sessions: [
        { session_number: 1, group_number: 2, date: "Sun, Sep 6", time: "9:00 AM", location: "Community Rink" },
        { session_number: 2, group_number: 3, date: "Sun, Sep 13", time: "10:15 AM", location: "Community Rink" },
      ],
    });
    expect(html).toContain("Community Rink");
    expect(html).toContain("Sun, Sep 6");
    expect(html).not.toMatch(GROUPY);
    expect(html).not.toMatch(/<th[^>]*>\s*Group\s*<\/th>/i);
  });

  it("session-update email names no group", () => {
    const html = parentSessionUpdateHtml({
      playerName: "Ella Boyd", orgName: "Demo Soci", completedLabel: "Registration",
      next: { label: "Session 1 · Testing", dateText: "Sunday, September 6", time: "9:00 AM – 10:00 AM", location: "Community Rink" },
    });
    expect(html).not.toMatch(GROUPY);
  });
});

describe("the ice-time email's subject line", () => {
  // The subject shows in the inbox list without the mail being opened, so a
  // group here would defeat every other precaution. It shipped that way
  // ("Ella Boyd — Group 1 · U11 House") until this was caught.
  const route = readFileSync("src/app/api/categories/[catId]/group-emails/route.js", "utf8");

  it("names no group", () => {
    const subjects = [...route.matchAll(/sendEmail\(\s*to\s*,\s*`([^`]*)`/g)].map(m => m[1]);
    expect(subjects.length).toBeGreaterThan(0);
    for (const s of subjects) expect(s, `subject: ${s}`).not.toMatch(/group/i);
  });

  it("sends no .ics attachment — Gmail would render its own card above our email", () => {
    expect(route).not.toMatch(/session\.ics/);
    expect(route).not.toMatch(/generateICS/);
  });
});

describe("add-to-calendar link", () => {
  it("builds a zoned Google Calendar URL", () => {
    const url = googleCalendarUrl({
      scheduled_date: "2026-09-06", start_time: "09:00", end_time: "10:00",
      title: "U11 House Evaluation", location: "Community Rink", details: "Demo Soci",
    });
    expect(url).toContain("calendar.google.com");
    expect(url).toContain("action=TEMPLATE");
    // Zone must be explicit — our date/time columns carry none, so without ctz
    // the event lands at the wrong hour for anyone outside Alberta.
    expect(url).toContain("ctz=America%2FEdmonton");
    expect(url).toMatch(/dates=20260906T090000%2F20260906T100000/);
    expect(url).not.toMatch(GROUPY);
  });

  it("returns null without a date/time rather than a broken link", () => {
    expect(googleCalendarUrl({ scheduled_date: null, start_time: "09:00" })).toBeNull();
    expect(googleCalendarUrl({ scheduled_date: "2026-09-06", start_time: null })).toBeNull();
  });

  it("renders under the session card when supplied, and is omitted when not", () => {
    const url = "https://calendar.google.com/calendar/render?action=TEMPLATE";
    const withLink = groupAssignmentHtml({ ...ICE_TIME, calendarUrl: url });
    expect(withLink).toContain("Add to calendar");
    expect(withLink).toContain(url);
    // The link follows the details card, not precedes it.
    expect(withLink.indexOf("Add to calendar")).toBeGreaterThan(withLink.indexOf("Community Rink"));

    const without = groupAssignmentHtml(ICE_TIME);
    expect(without).not.toContain("Add to calendar");
  });

  it("no longer promises an attachment that isn't there", () => {
    expect(groupAssignmentHtml({ ...ICE_TIME, calendarUrl: "https://x" })).not.toMatch(/attached/i);
  });
});

describe("arrive-early window", () => {
  // 30 minutes, set by the owner. Lives in three places (email body, schedule
  // email, calendar event details) — they must not drift apart.
  it("the ice-time email says 30 minutes", () => {
    const html = groupAssignmentHtml(ICE_TIME);
    expect(html).toMatch(/at least 30 minutes early/);
    expect(html).not.toMatch(/15 minutes/);
  });

  it("the schedule email says 30 minutes", () => {
    const html = parentScheduleHtml({
      playerName: "Ella Boyd", categoryName: "U11 House", orgName: "Demo Soci",
      sessions: [{ session_number: 1, date: "Sun, Sep 6", time: "9:00 AM", location: "Community Rink" }],
    });
    expect(html).toMatch(/at least 30 minutes early/);
    expect(html).not.toMatch(/15 minutes/);
  });

  it("the calendar event details say 30 minutes", () => {
    const route = readFileSync("src/app/api/categories/[catId]/group-emails/route.js", "utf8");
    expect(route).toMatch(/at least 30 minutes early/);
    expect(route).not.toMatch(/15 minutes early/);
  });
});

describe("calendar invites", () => {
  const base = {
    scheduled_date: "2026-09-06", start_time: "09:00", end_time: "10:00",
    location: "Community Rink", session_number: 1,
    category_name: "U11 House", org_name: "Demo Soci", session_type: "testing",
  };

  it("omits the group when the caller doesn't pass one (parent-facing)", () => {
    const ics = generateICS({ ...base });
    expect(ics).toContain("U11 House");
    expect(ics).toContain("Community Rink");
    expect(ics).not.toMatch(GROUPY);
  });

  it("still includes the group when a caller does pass one (staff-facing)", () => {
    // Evaluators need to know which group they're covering — this must keep working.
    const ics = generateICS({ ...base, group_number: 2 });
    expect(ics).toMatch(/G2|Group 2/);
  });
});
