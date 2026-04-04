const { default: db } = await import('./src/lib/db.js');

// Create anchor_players table
await db`
  CREATE TABLE IF NOT EXISTS anchor_players (
    id SERIAL PRIMARY KEY,
    age_category_id INTEGER NOT NULL REFERENCES age_categories(id) ON DELETE CASCADE,
    athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    session_number INTEGER NOT NULL,
    flagged_by INTEGER REFERENCES users(id),
    flagged_at TIMESTAMP DEFAULT NOW(),
    correction_factor NUMERIC(6,4),
    correction_approved BOOLEAN DEFAULT FALSE,
    correction_approved_by INTEGER REFERENCES users(id),
    correction_approved_at TIMESTAMP,
    raw_scores JSONB,
    UNIQUE(age_category_id, athlete_id, session_number)
  )
`;
console.log('anchor_players table created');
process.exit(0);
