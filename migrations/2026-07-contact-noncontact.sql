-- Contact / non-contact groups (U15+).
--
-- Players may declare non-contact before evaluations start. They are still
-- ranked in the single global list, but GROUP ASSIGNMENT is partitioned: contact
-- players fill the contact groups (1..contact_groups) by rank; non-contact
-- players fill the non-contact groups (the rest) by rank. A non-contact player
-- never auto-moves into a contact group regardless of score — only a manual move
-- by a director/association/SP does that (if they change their mind).
--
-- Apply:
--   node scripts/migrate-contact.mjs            # dry run
--   node scripts/migrate-contact.mjs --commit   # apply
-- Idempotent.

-- Per-athlete declaration. Default false = contact (the norm).
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS non_contact BOOLEAN NOT NULL DEFAULT false;

-- Per-category split, set in setup for U15+. contact_groups = the count of the
-- lowest-numbered groups that are contact; groups above that are non-contact.
-- NULL = feature off (no split — current behaviour). non_contact_groups is stored
-- for display; the boundary is contact_groups.
ALTER TABLE age_categories ADD COLUMN IF NOT EXISTS contact_groups INTEGER;
ALTER TABLE age_categories ADD COLUMN IF NOT EXISTS non_contact_groups INTEGER;
