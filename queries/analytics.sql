-- ─────────────────────────────────────────────────────────────────────────
-- Sideline Star — analytics starter pack
-- ─────────────────────────────────────────────────────────────────────────
-- Each query is standalone — paste a single block into the Neon SQL editor.
-- Most have a date window at the top (`WHERE ts > NOW() - INTERVAL '30 days'`)
-- — change it to '7 days', '90 days', or remove it for all-time.
-- Joins to organizations / users / age_categories are best-effort: analytics
-- rows survive deletes, so a missing match is normal and fine.
--
-- Quick sanity check before any of this is useful:
--
--   SELECT event, COUNT(*) AS n, MAX(ts) AS most_recent
--   FROM analytics_events
--   GROUP BY event ORDER BY n DESC;


-- ─── Q1. How long does it take to set up an age category? ────────────────
-- Headline metric. Returns median, p25, p75, and sample size — the spread
-- matters as much as the median. Group by org to spot which clients struggle.
SELECT
  o.name AS org,
  COUNT(*)                                                          AS n_setups,
  ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ae.duration_ms) / 60000.0, 1) AS median_minutes,
  ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ae.duration_ms) / 60000.0, 1) AS p25_minutes,
  ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ae.duration_ms) / 60000.0, 1) AS p75_minutes
FROM analytics_events ae
LEFT JOIN organizations o ON o.id = ae.org_id
WHERE ae.event = 'category.setup_completed'
  AND ae.duration_ms IS NOT NULL
  AND ae.ts > NOW() - INTERVAL '90 days'
GROUP BY o.name
ORDER BY n_setups DESC;


-- ─── Q2. Active time on the app by role (who is the heaviest user?) ──────
-- Sum of dashboard / page-view duration_ms by role. Tells you whether
-- admins or directors or evaluators are the ones spending the most time
-- in the product — feeds the 'we noticed admins spend X hours/week sorting
-- data' presentation line.
SELECT
  ae.role,
  COUNT(*)                                AS sessions,
  COUNT(DISTINCT ae.user_id)              AS distinct_users,
  ROUND(SUM(ae.duration_ms) / 60000.0, 0) AS total_minutes,
  ROUND(AVG(ae.duration_ms) / 1000.0, 1)  AS avg_seconds_per_view
FROM analytics_events ae
WHERE ae.event LIKE 'dashboard.%.viewed' OR ae.event = 'category.viewed'
  AND ae.ts > NOW() - INTERVAL '30 days'
GROUP BY ae.role
ORDER BY total_minutes DESC;


-- ─── Q3. Who's fixing data after setup? ──────────────────────────────────
-- Count of category.edited_after_complete events. A spike per category =
-- the setup wizard is missing something. Per role = which folks are doing
-- the fixing (admins triage / directors retune?).
SELECT
  o.name                       AS org,
  ac.name                      AS category,
  ae.role,
  COUNT(*)                     AS edits_after_complete,
  MAX(ae.ts)                   AS most_recent_edit
FROM analytics_events ae
LEFT JOIN organizations o   ON o.id = ae.org_id
LEFT JOIN age_categories ac ON ac.id = (ae.metadata->>'catId')::INT
WHERE ae.event = 'category.edited_after_complete'
  AND ae.ts > NOW() - INTERVAL '90 days'
GROUP BY o.name, ac.name, ae.role
ORDER BY edits_after_complete DESC
LIMIT 50;


-- ─── Q4. Service-provider admin engagement ───────────────────────────────
-- Per-user login count + total minutes spent in the SP dashboard. The 'who
-- is logging in and how much time' answer for the SP side. last_seen lets
-- you spot dormant admins.
SELECT
  u.email,
  u.name,
  COUNT(*)                                AS visits,
  ROUND(SUM(ae.duration_ms) / 60000.0, 1) AS total_minutes,
  ROUND(AVG(ae.duration_ms) / 1000.0, 1)  AS avg_seconds_per_visit,
  MAX(ae.ts)                              AS last_seen
FROM analytics_events ae
LEFT JOIN users u ON u.id = ae.user_id
WHERE ae.event = 'dashboard.service-provider.viewed'
  AND ae.ts > NOW() - INTERVAL '30 days'
GROUP BY u.email, u.name
ORDER BY total_minutes DESC NULLS LAST;


-- ─── Q5. View mode adoption (Buttons / Numpad / Grid) ────────────────────
-- Toggles tell you which views evaluators actually choose. If Grid is 1%
-- of toggles it's deadweight; if it's 40% it's important.
SELECT
  ae.metadata->>'to' AS chosen_view,
  COUNT(*)           AS toggles,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM analytics_events ae
WHERE ae.event = 'viewmode.toggled'
  AND ae.ts > NOW() - INTERVAL '60 days'
GROUP BY ae.metadata->>'to'
ORDER BY toggles DESC;


-- ─── Q6. Voice mode adoption rate ────────────────────────────────────────
-- Count of voice.toggled (state=on) split by platform (web vs Capacitor
-- native). The marketing line is 'X% of evaluators use voice' — that's
-- distinct_users_used_voice / distinct_users_in_scoring.
WITH used_voice AS (
  SELECT DISTINCT user_id FROM analytics_events
  WHERE event = 'voice.toggled' AND metadata->>'state' = 'on'
    AND ts > NOW() - INTERVAL '60 days'
),
scored AS (
  SELECT DISTINCT user_id FROM analytics_events
  WHERE event = 'score.submitted'
    AND ts > NOW() - INTERVAL '60 days'
)
SELECT
  (SELECT COUNT(*) FROM scored)                                              AS evaluators_who_scored,
  (SELECT COUNT(*) FROM used_voice)                                          AS evaluators_who_used_voice,
  ROUND(100.0 * (SELECT COUNT(*) FROM used_voice) /
                NULLIF((SELECT COUNT(*) FROM scored), 0), 1)                 AS voice_adoption_pct;


-- ─── Q7. Network reliability per scoring session ─────────────────────────
-- How often does the green dot go red mid-session? Per-session count of
-- offline.entered events, summarized — the 'should we invest more in
-- offline UX?' signal.
WITH per_session AS (
  SELECT
    metadata->>'scheduleId' AS schedule_id,
    user_id,
    COUNT(*) AS drops
  FROM analytics_events
  WHERE event = 'offline.entered'
    AND ts > NOW() - INTERVAL '60 days'
  GROUP BY metadata->>'scheduleId', user_id
)
SELECT
  COUNT(*)                                              AS sessions_with_at_least_one_drop,
  ROUND(AVG(drops), 1)                                  AS avg_drops_per_affected_session,
  MAX(drops)                                            AS worst_session
FROM per_session;


-- ─── Q8. Consensus engagement — flag resolution rate ─────────────────────
-- Of consensus reviews opened, how often does the meeting actually mark
-- flags as Discussed? Low rate = nobody's engaging with the consensus
-- workflow. High rate = the discussion is happening.
WITH opened AS (
  SELECT COUNT(*) AS n FROM analytics_events
  WHERE event = 'consensus.opened' AND ts > NOW() - INTERVAL '60 days'
),
resolved AS (
  SELECT COUNT(*) AS n FROM analytics_events
  WHERE event = 'consensus.flag_resolved' AND ts > NOW() - INTERVAL '60 days'
)
SELECT
  (SELECT n FROM opened)   AS consensus_views,
  (SELECT n FROM resolved) AS flags_resolved,
  ROUND(1.0 * (SELECT n FROM resolved) /
        NULLIF((SELECT n FROM opened), 0), 2) AS resolved_per_opened;


-- ─── Bonus 1. Top evaluators by sessions worked ──────────────────────────
-- Engagement leaderboard. score.submitted is one event per submit request,
-- so 'distinct (scheduleId, day)' approximates 'sessions worked'.
SELECT
  u.email,
  u.name,
  COUNT(DISTINCT ae.metadata->>'scheduleId') AS sessions_scored,
  COUNT(*)                                   AS submit_requests,
  SUM((ae.metadata->>'scoresCount')::INT)    AS total_scores_written
FROM analytics_events ae
LEFT JOIN users u ON u.id = ae.user_id
WHERE ae.event = 'score.submitted'
  AND ae.ts > NOW() - INTERVAL '60 days'
GROUP BY u.email, u.name
ORDER BY sessions_scored DESC
LIMIT 25;


-- ─── Bonus 2. Daily activity snapshot ────────────────────────────────────
-- One row per day for the last 30 — your at-a-glance health chart.
SELECT
  DATE_TRUNC('day', ts)::DATE              AS day,
  COUNT(*)                                 AS events,
  COUNT(DISTINCT user_id)                  AS active_users,
  COUNT(*) FILTER (WHERE event = 'score.submitted')                     AS scores_submitted,
  COUNT(*) FILTER (WHERE event = 'category.created')                    AS categories_created,
  COUNT(*) FILTER (WHERE event = 'category.setup_completed')            AS setups_completed,
  COUNT(*) FILTER (WHERE event = 'consensus.opened')                    AS consensus_views,
  COUNT(*) FILTER (WHERE event = 'report.viewed')                       AS report_views
FROM analytics_events
WHERE ts > NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC;


-- ─── Bonus 3. Org onboarding speed (sales gold) ──────────────────────────
-- For each org's first-ever category, how long from creation to setup-
-- complete? This is your 'X minutes from signup to ready' marketing stat.
WITH first_setup AS (
  SELECT DISTINCT ON (org_id)
    org_id,
    ts             AS completed_at,
    duration_ms
  FROM analytics_events
  WHERE event = 'category.setup_completed'
    AND duration_ms IS NOT NULL
  ORDER BY org_id, ts ASC
)
SELECT
  o.name                                            AS org,
  fs.completed_at::DATE                             AS first_completed_on,
  ROUND(fs.duration_ms / 60000.0, 1)                AS minutes_to_first_setup
FROM first_setup fs
LEFT JOIN organizations o ON o.id = fs.org_id
ORDER BY fs.completed_at DESC;
