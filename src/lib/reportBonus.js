import sql from "@/lib/db";

// Per-Service-Provider flat bonus (in cents) paid per note that lands in a sold
// report. Defaults to 0 (feature off) until the SP sets a rate.
export async function getNoteBonusRate(orgId) {
  if (!orgId) return 0;
  try {
    const r = await sql`SELECT note_bonus_cents FROM report_bonus_config WHERE organization_id = ${orgId}`;
    return r.length ? r[0].note_bonus_cents : 0;
  } catch {
    return 0; // table not migrated yet
  }
}

export async function setNoteBonusRate(orgId, cents) {
  await sql`
    INSERT INTO report_bonus_config (organization_id, note_bonus_cents, updated_at)
    VALUES (${orgId}, ${cents}, NOW())
    ON CONFLICT (organization_id) DO UPDATE
      SET note_bonus_cents = EXCLUDED.note_bonus_cents, updated_at = NOW()
  `;
}

// Count of an evaluator's notes that landed in a SOLD (completed-purchase)
// report. One eligible note = one note on an athlete+category whose report was
// purchased. Safe if report_purchases is absent.
export async function eligibleNoteCount(evaluatorId) {
  if (!evaluatorId) return 0;
  try {
    const r = await sql`
      SELECT COUNT(*)::int AS c
      FROM player_notes pn
      WHERE pn.evaluator_id = ${evaluatorId}
        AND EXISTS (
          SELECT 1 FROM report_purchases rp
          WHERE rp.athlete_id = pn.athlete_id
            AND rp.age_category_id = pn.age_category_id
            AND rp.status = 'completed'
        )
    `;
    return r[0]?.c || 0;
  } catch {
    return 0;
  }
}

// { eligibleNotes, rateCents, bonusCents } for one evaluator under one SP org.
export async function bonusForEvaluator(evaluatorId, orgId) {
  const [eligibleNotes, rateCents] = await Promise.all([
    eligibleNoteCount(evaluatorId),
    getNoteBonusRate(orgId),
  ]);
  return { eligibleNotes, rateCents, bonusCents: eligibleNotes * rateCents };
}
