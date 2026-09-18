-- Lets a director mark a player injured so they stop showing up to be placed
-- into session groups at all -- real ask from SEERA U15, general across every
-- association. Persistent per athlete (not per session): an injury doesn't
-- resolve itself session to session, so the flag carries forward until a
-- director explicitly clears it once the player is healthy again.
--
-- Apply:
--   node scripts/migrate-athlete-injured-flag.mjs            # dry run
--   node scripts/migrate-athlete-injured-flag.mjs --commit   # apply
-- Idempotent.

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS injured BOOLEAN NOT NULL DEFAULT false;
