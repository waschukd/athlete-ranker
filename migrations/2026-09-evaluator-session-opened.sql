-- When an evaluator first loads a session's roster/check-in screen (not just
-- when they submit their first score). Lets "session start -> opened the app"
-- and "opened the app -> first score" be measured as two separate intervals,
-- instead of only the combined "start -> first score" gap. TIMESTAMPTZ (not
-- the older TIMESTAMP columns on this table) so it stores a real, unambiguous
-- instant regardless of the DB session's timezone setting -- see the fix in
-- service-provider/reports/route.js and consensus/route.js for the bug this
-- avoids by construction.
ALTER TABLE evaluator_session_signups ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;

-- The evaluator's own device timezone (IANA name, e.g. "America/Edmonton"),
-- captured alongside opened_at. Never used to compute lateness itself (that
-- must stay anchored to the server's real instant, immune to a client's
-- system clock/timezone being wrong or spoofed) -- purely informational, so a
-- lateness dispute can be checked against what timezone the evaluator's own
-- device reported at the time.
ALTER TABLE evaluator_session_signups ADD COLUMN IF NOT EXISTS evaluator_timezone TEXT;
