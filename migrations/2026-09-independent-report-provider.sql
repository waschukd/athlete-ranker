-- EFHA agreed to let Development Reports go out, but only made clear this is
-- independent of them: no revenue to the association (already true by
-- default pricing -- see reportProvider.js), no team-decision communication
-- through them, all questions directed to Competitive Thread instead.
-- Reusable per-org flag (not EFHA-hardcoded) in case another association
-- negotiates the same arrangement later.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS independent_report_provider BOOLEAN NOT NULL DEFAULT false;
