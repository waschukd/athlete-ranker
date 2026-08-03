-- In-house goalie evaluation: an association can create goalie-ONLY age categories
-- (holding only goalies) and run the same goalie tools a goalie SP would. This flag
-- marks such a category so the player dashboard can exclude it and the goalie
-- surface can list it.
ALTER TABLE age_categories ADD COLUMN IF NOT EXISTS goalie_only boolean DEFAULT false;
