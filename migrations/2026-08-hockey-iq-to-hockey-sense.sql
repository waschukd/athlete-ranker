-- Audio recognition for "Hockey IQ" has always been weaker than "Hockey Sense"
-- ("I.Q." gets mangled by speech-to-text far more than "sense" does). Renaming
-- the category everywhere -- category_scores links by scoring_category_id, not
-- name, so this relabels every past/present score under the new name with zero
-- data loss, and new categories created via the setup wizard / bulk-onboard now
-- seed "Hockey Sense" by default.
UPDATE scoring_categories SET name = 'Hockey Sense' WHERE name = 'Hockey IQ';
