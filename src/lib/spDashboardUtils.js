// Pure formatting/display helpers shared across the Service Provider dashboard.
// Slice 1 of the SP dashboard breakup -- no behavior change, just relocated.

// CSV field-quoting: wrap in quotes only when it contains something that
// would otherwise break the format (comma, quote, newline); double up any
// internal quotes. Plain values pass through untouched.
export function csvField(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadContactsCsv(rows, filename) {
  const header = ["Name", "Email", "Phone", "Status"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.name, r.email, r.phone || "", r.status || r.membership_status || ""].map(csvField).join(","));
  }
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.toString().split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

// Today in the viewer's LOCAL timezone (UTC toISOString rolls over mid-evening).
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDate(d) {
  if (!d) return "";
  const str = d.toString().split("T")[0];
  const [year, month, day] = str.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// Relevant staffing for a session: testing sessions are staffed by TESTERS, not
// evaluators — so a testing session with 0 evaluators required must not read as
// "Staffed" just because it needs no evaluators.
export function sessionStaffing(s) {
  const isTesting = s.session_type === "testing" && !s.is_goalie_sp;
  if (isTesting) {
    // The server only puts tester_spots_open on its byDate; the flat `schedule`
    // the dashboard uses carries the raw counts, so compute the gap here.
    const req = parseInt(s.testers_required) || 0;
    const signed = parseInt(s.testers_signed_up) || 0;
    return { isTesting: true, open: Math.max(0, req - signed), req, noun: "tester" };
  }
  return { isTesting: false, open: parseInt(s.spots_open) || 0, req: null, noun: "evaluator" };
}
