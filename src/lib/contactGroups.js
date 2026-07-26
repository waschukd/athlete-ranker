// Contact / non-contact group partitioning (U15+).
//
// Players may declare non-contact before evaluations start. They are still ranked
// in the single global list, but GROUP ASSIGNMENT is partitioned: contact players
// fill the contact groups (the lowest-numbered `contactBoundary` groups) by rank;
// non-contact players fill the rest by rank. A non-contact player never lands in a
// contact group regardless of score — only a manual move does that.

// Even sequential fill of `ids` across `n` buckets (bigger buckets first),
// returning [{ athlete_id, bucket }] with bucket in 0..n-1. Mirrors the route's
// distributeSequential for the no-cap case.
function fill(ids, n) {
  const out = [];
  if (n <= 0) return out;
  const base = Math.floor(ids.length / n);
  const rem = ids.length % n;
  let idx = 0;
  for (let b = 0; b < n && idx < ids.length; b++) {
    const size = base + (b < rem ? 1 : 0);
    for (let p = 0; p < size && idx < ids.length; p++) out.push({ athlete_id: ids[idx++], bucket: b });
  }
  return out;
}

// Returns whether the split is active for these groups + boundary: both sides need
// somewhere to go. `groups` is an ordered array of { group_number }.
export function splitIsActive(groups, contactBoundary) {
  const b = Number(contactBoundary) || 0;
  if (b <= 0) return false;
  const contact = groups.filter(g => Number(g.group_number) <= b).length;
  const nonContact = groups.length - contact;
  return contact > 0 && nonContact > 0;
}

// Partition ranked skaters into groups. `ranked` is in rank order, each a
// { id, non_contact }. `groups` is the ordered skater-group array of
// { group_number }. Returns [{ athlete_id, group_index }] indexing into `groups`,
// or null when the split isn't active (caller uses normal assignment).
export function partitionByContact(ranked, groups, contactBoundary) {
  const b = Number(contactBoundary) || 0;
  if (!splitIsActive(groups, contactBoundary)) return null;

  const contactIdxs = [], nonContactIdxs = [];
  groups.forEach((g, i) => {
    (Number(g.group_number) <= b ? contactIdxs : nonContactIdxs).push(i);
  });

  const contactIds = ranked.filter(a => !a.non_contact).map(a => a.id);
  const nonContactIds = ranked.filter(a => a.non_contact).map(a => a.id);

  const map = (ids, idxList) =>
    fill(ids, idxList.length).map(a => ({ athlete_id: a.athlete_id, group_index: idxList[a.bucket] }));

  return [...map(contactIds, contactIdxs), ...map(nonContactIds, nonContactIdxs)];
}
