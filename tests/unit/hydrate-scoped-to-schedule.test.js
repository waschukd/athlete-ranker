import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// EFHA U15, session 2, game 2, mid-game: every evaluator's screen showed
// "30 scores couldn't save -- athlete not checked in for this session". 30 is
// exactly game 1's roster.
//
// Hydrate (the on-load pull of an evaluator's existing scores, so switching
// devices does not show a blank screen) was scoped by session_number. A
// session has several groups sharing one session_number, so opening game 2
// loaded the evaluator's scores for game 1's 30 kids. The client merged those
// into local state and wrote them to game 2's localStorage; the next reload
// marked everything in localStorage pending and posted all 30 against game 2,
// where none are checked in. Each was refused. Each was already saved during
// game 1. No data was lost -- but nobody on the ice knew that.
//
// It surfaced only because a Sep 10 change started showing 4xx saves as a
// banner instead of silently retrying them every 12s forever.

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTE = strip(read("src/app/api/evaluator/scores/route.js"));
const PAGE = strip(read("src/app/evaluator/score/[scheduleId]/page.jsx"));

const HYDRATE = ROUTE.slice(ROUTE.indexOf('searchParams.get("hydrate") === "1"'), ROUTE.indexOf("const scores = {};"));

describe("hydrate returns only this schedule's roster", () => {
  it("scores are restricted to athletes with a check-in row on this schedule", () => {
    const q = HYDRATE.slice(HYDRATE.indexOf("FROM category_scores"), HYDRATE.indexOf("`;", HYDRATE.indexOf("FROM category_scores")));
    expect(q).toMatch(/EXISTS \(SELECT 1 FROM player_checkins pc WHERE pc\.athlete_id = cs\.athlete_id AND pc\.schedule_id = \$\{scheduleId\}\)/);
  });

  it("notes are restricted the same way", () => {
    const q = HYDRATE.slice(HYDRATE.indexOf("FROM player_notes"), HYDRATE.indexOf("`;", HYDRATE.indexOf("FROM player_notes")));
    expect(q).toMatch(/EXISTS \(SELECT 1 FROM player_checkins pc WHERE pc\.athlete_id = pn\.athlete_id AND pc\.schedule_id = \$\{scheduleId\}\)/);
  });

  it("still filters by evaluator, category and session -- the roster scope is in addition", () => {
    expect(HYDRATE).toMatch(/cs\.evaluator_id = \$\{appUserId\}/);
    expect(HYDRATE).toMatch(/cs\.session_number = \$\{sessionNumber\}/);
  });
});

describe("the client never posts a score for someone not on its roster", () => {
  const SYNC = PAGE.slice(PAGE.indexOf("const syncToServer = useCallback"), PAGE.indexOf("const syncToServer = useCallback") + 1500);

  it("drops an athlete absent from the loaded roster instead of posting", () => {
    // Belt and braces: a localStorage written before the server fix still
    // holds the other group's kids, and must not produce 30 refusals.
    expect(SYNC).toMatch(/if \(athletesRef\.current\.length && !athlete\) \{/);
    expect(SYNC).toMatch(/return \{ ok: false, permanent: false, skipped: true \}/);
  });

  it("removes it from pending so the 12s loop stops carrying it -- but only when there is no check-in row for this schedule at all", () => {
    const guard = SYNC.slice(SYNC.indexOf("athletesRef.current.length && !athlete"), SYNC.indexOf("skipped: true"));
    expect(guard).toMatch(/setPending\(/);
    expect(guard).toMatch(/delete n\[athleteId\]/);
    // A kid with a check-in row who is momentarily checked_in=false (door
    // un-checked and re-checked them mid-session; the roster poll caught the
    // gap) stays pending so the retry loop posts them once the roster catches
    // up. Fuzion U13 S5: three late check-ins vanished from the queue with no
    // pending count and no banner.
    expect(guard).toMatch(/const anyRow = \(sessionData\?\.athletes \|\| \[\]\)\.some\(a => a\.id === athleteId\)/);
    expect(guard).toMatch(/if \(!anyRow\) \{[\s\S]*setPending/);
  });

  it("does not treat it as a permanent failure -- it is not a failed save", () => {
    const guard = SYNC.slice(SYNC.indexOf("athletesRef.current.length && !athlete"), SYNC.indexOf("skipped: true"));
    expect(guard).not.toMatch(/setBlocked/);
  });

  it("only applies once the roster has actually loaded", () => {
    // An empty roster during initial load must not drop legitimate pending scores.
    expect(SYNC).toMatch(/athletesRef\.current\.length && !athlete/);
  });
});
