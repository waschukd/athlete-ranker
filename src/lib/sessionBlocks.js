// Detect a "back-to-back" block of sessions around one the user just chose, so
// signup can offer "there are N in a row here — take them all?".
//
// A block = sessions at the SAME association + SAME rink + SAME day where each
// starts within `gapMin` minutes of the previous one ending. Pass the full
// available list (which already contains only sessions the user can sign up for);
// the returned run is the maximal contiguous chain that includes `clicked`.

const mins = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(":");
  return parseInt(h) * 60 + parseInt(m || "0");
};
const day = (d) => String(d || "").split("T")[0];

export function contiguousBlock(clicked, available, gapMin = 30) {
  if (!clicked) return [];
  // org_id when present, else org_name — tester sessions carry the name only.
  const key = (s) => `${s.org_id ?? s.org_name ?? ""}|${day(s.scheduled_date)}|${(s.location || "").trim().toLowerCase()}`;
  const k = key(clicked);

  // Same rink/assoc/day, each with a usable start; sorted by start time. Dedup by
  // schedule_id so the clicked row isn't counted twice if it's in the list.
  const seen = new Set();
  const sameSlot = available
    .filter(s => key(s) === k && mins(s.start_time) != null)
    .filter(s => (seen.has(s.schedule_id) ? false : seen.add(s.schedule_id)))
    .sort((a, b) => mins(a.start_time) - mins(b.start_time));

  if (!sameSlot.some(s => s.schedule_id === clicked.schedule_id)) sameSlot.push(clicked); // ensure present
  sameSlot.sort((a, b) => mins(a.start_time) - mins(b.start_time));

  const idx = sameSlot.findIndex(s => s.schedule_id === clicked.schedule_id);
  if (idx < 0) return [clicked];

  // Expand outward while each neighbour is within gapMin of the adjacent end.
  let lo = idx, hi = idx;
  while (lo > 0) {
    const gap = mins(sameSlot[lo].start_time) - (mins(sameSlot[lo - 1].end_time) ?? mins(sameSlot[lo - 1].start_time));
    if (gap <= gapMin) lo--; else break;
  }
  while (hi < sameSlot.length - 1) {
    const gap = mins(sameSlot[hi + 1].start_time) - (mins(sameSlot[hi].end_time) ?? mins(sameSlot[hi].start_time));
    if (gap <= gapMin) hi++; else break;
  }
  return sameSlot.slice(lo, hi + 1);
}
