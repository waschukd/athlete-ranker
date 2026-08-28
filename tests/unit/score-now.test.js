import { describe, it, expect } from "vitest";
import { pickScoreNow } from "@/lib/sessionTiming";

// The Score Now card must ADVANCE through a night of sessions: close session 1
// and session 2 moves to the top with session 3 beneath it. It used to take the
// first two of the day regardless of whether they were closed, so the first two
// stayed frozen there for the whole 4h grace window.

const TODAY = "2026-08-27";
const s = (id, time, { closed = false, day = TODAY, kind = "evaluation" } = {}) => ({
  signup_id: id, schedule_id: id, start_time: time, scheduled_date: `${day}T04:00:00.000Z`,
  closed, __kind: kind,
});

describe("pickScoreNow — advances as sessions are closed", () => {
  const night = [s(1, "17:00:00"), s(2, "18:15:00"), s(3, "19:30:00"), s(4, "20:45:00")];

  it("starts on sessions 1 and 2", () => {
    const { shown } = pickScoreNow(night, TODAY);
    expect(shown.map(x => x.schedule_id)).toEqual([1, 2]);
  });

  it("moves to 2 and 3 once session 1 is closed", () => {
    const after1 = [s(1, "17:00:00", { closed: true }), s(2, "18:15:00"), s(3, "19:30:00"), s(4, "20:45:00")];
    expect(pickScoreNow(after1, TODAY).shown.map(x => x.schedule_id)).toEqual([2, 3]);
  });

  it("moves to 3 and 4 once sessions 1 and 2 are closed", () => {
    const after2 = [
      s(1, "17:00:00", { closed: true }), s(2, "18:15:00", { closed: true }),
      s(3, "19:30:00"), s(4, "20:45:00"),
    ];
    expect(pickScoreNow(after2, TODAY).shown.map(x => x.schedule_id)).toEqual([3, 4]);
  });

  it("shows the last one alone when only session 4 remains", () => {
    const after3 = night.map(x => x.schedule_id === 4 ? x : { ...x, closed: true });
    expect(pickScoreNow(after3, TODAY).shown.map(x => x.schedule_id)).toEqual([4]);
  });

  it("reports progress so the card does not just silently shrink", () => {
    const after2 = [
      s(1, "17:00:00", { closed: true }), s(2, "18:15:00", { closed: true }),
      s(3, "19:30:00"), s(4, "20:45:00"),
    ];
    const r = pickScoreNow(after2, TODAY);
    expect(r.todayTotal).toBe(4);
    expect(r.todayDone).toBe(2);
    expect(r.isToday).toBe(true);
  });
});

describe("pickScoreNow — ordering", () => {
  it("sorts by start time, since evaluation and testing sessions are concatenated unsorted", () => {
    // Exactly the real shape: testing sessions appended after evaluation ones.
    const mixed = [
      s(10, "20:45:00"), s(11, "17:00:00"),
      s(20, "18:15:00", { kind: "testing" }), s(21, "19:30:00", { kind: "testing" }),
    ];
    expect(pickScoreNow(mixed, TODAY).shown.map(x => x.schedule_id)).toEqual([11, 20]);
  });

  it("does not care which list a session came from", () => {
    const mixed = [s(10, "21:00:00"), s(20, "06:00:00", { kind: "testing" })];
    expect(pickScoreNow(mixed, TODAY).shown[0].schedule_id).toBe(20);
  });
});

describe("pickScoreNow — falling forward", () => {
  it("looks ahead to the next day once everything today is closed", () => {
    const list = [
      s(1, "17:00:00", { closed: true }), s(2, "18:15:00", { closed: true }),
      s(5, "09:00:00", { day: "2026-08-28" }), s(6, "10:15:00", { day: "2026-08-29" }),
    ];
    const r = pickScoreNow(list, TODAY);
    expect(r.isToday).toBe(false);
    expect(r.shown.map(x => x.schedule_id)).toEqual([5]); // soonest day only
  });

  it("returns nothing when every remaining session is closed", () => {
    const list = [s(1, "17:00:00", { closed: true }), s(5, "09:00:00", { day: "2026-08-28", closed: true })];
    expect(pickScoreNow(list, TODAY).shown).toEqual([]);
  });

  it("prefers today even when a later day has an earlier clock time", () => {
    const list = [s(1, "22:00:00"), s(5, "06:00:00", { day: "2026-08-28" })];
    const r = pickScoreNow(list, TODAY);
    expect(r.isToday).toBe(true);
    expect(r.shown.map(x => x.schedule_id)).toEqual([1]);
  });
});

describe("pickScoreNow — robustness", () => {
  it("handles an empty or non-array input", () => {
    expect(pickScoreNow([], TODAY).shown).toEqual([]);
    expect(pickScoreNow(undefined, TODAY).shown).toEqual([]);
  });

  it("treats a session with no closed flag as open (testing sessions lack it)", () => {
    const noFlag = [{ schedule_id: 9, start_time: "17:00:00", scheduled_date: `${TODAY}T04:00:00.000Z` }];
    expect(pickScoreNow(noFlag, TODAY).shown.map(x => x.schedule_id)).toEqual([9]);
  });

  it("does not throw on a missing date or time", () => {
    const messy = [{ schedule_id: 1 }, s(2, "17:00:00")];
    expect(() => pickScoreNow(messy, TODAY)).not.toThrow();
    expect(pickScoreNow(messy, TODAY).shown.map(x => x.schedule_id)).toContain(2);
  });

  it("honours a custom limit", () => {
    const night = [s(1, "17:00:00"), s(2, "18:15:00"), s(3, "19:30:00")];
    expect(pickScoreNow(night, TODAY, 3).shown).toHaveLength(3);
    expect(pickScoreNow(night, TODAY, 1).shown).toHaveLength(1);
  });
});
