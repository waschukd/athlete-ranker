-- Parent-report opening narrative paragraph, generated once per (athlete,
-- category) via Claude and cached here so repeat views of the same purchased
-- report never re-call the AI. See src/lib/parentNarrative.js. Deliberately
-- narrative-only, not a development plan -- DevelopmentReport.jsx already has
-- a deterministic, skill-gap-driven plan further down the report.
ALTER TABLE report_links ADD COLUMN IF NOT EXISTS narrative_summary TEXT;
ALTER TABLE report_links ADD COLUMN IF NOT EXISTS narrative_generated_at TIMESTAMP;
