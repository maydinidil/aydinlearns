-- tools/journey-views.sql: the starter views `npm run journey` creates over the study journey (D77). Each is plain DuckDB SQL over
-- one table, events: one row per event, ordered by ts and seq within a visit (session_id). Read them, copy them, change them: the
-- database is rebuilt from journey/*.jsonl on every run. Times show in Amsterdam time (SET TimeZone in tools/journey.ts).

-- One row per visit: when it started, how long it lasted, what happened, and the last screen shown.
CREATE OR REPLACE VIEW sessions AS
SELECT session_id,
       min(ts) AS started_at,
       round(epoch(max(ts) - min(ts)) / 60, 1) AS minutes,
       count(*) FILTER (WHERE event = 'screen_viewed') AS screens,
       count(*) FILTER (WHERE event = 'exercise_submitted') AS answers,
       count(*) FILTER (WHERE event = 'exercise_passed') AS passed,
       count(*) FILTER (WHERE event IN ('hint_opened', 'answer_shown')) AS help_used,
       arg_max(screen, seq) FILTER (WHERE event = 'screen_viewed') AS last_screen
FROM events
GROUP BY session_id
ORDER BY started_at;

-- The visit funnel: how many visits reached each step, and the share of the first step.
CREATE OR REPLACE VIEW funnel AS
WITH per_visit AS (
  SELECT session_id,
         bool_or(event = 'screen_viewed') AS opened,
         bool_or(event IN ('lesson_started', 'item_viewed', 'run_started', 'case_opened', 'lab_opened')) AS started,
         bool_or(event = 'exercise_submitted') AS answered,
         bool_or(event = 'exercise_passed') AS passed
  FROM events
  GROUP BY session_id
), steps AS (
  SELECT 1 AS step_no, 'opened a screen' AS step, count(*) FILTER (WHERE opened) AS visits FROM per_visit
  UNION ALL SELECT 2, 'started studying', count(*) FILTER (WHERE started) FROM per_visit
  UNION ALL SELECT 3, 'answered an exercise', count(*) FILTER (WHERE answered) FROM per_visit
  UNION ALL SELECT 4, 'passed one', count(*) FILTER (WHERE passed) FROM per_visit
)
SELECT step_no, step, visits,
       round(100.0 * visits / nullif(first_value(visits) OVER (ORDER BY step_no), 0), 1) AS pct_of_first
FROM steps
ORDER BY step_no;

-- Screen to screen: how often each move happened inside a visit.
CREATE OR REPLACE VIEW paths AS
SELECT from_screen, screen AS to_screen, count(*) AS times
FROM events
WHERE event = 'screen_viewed' AND from_screen IS NOT NULL
GROUP BY ALL
ORDER BY times DESC, from_screen, to_screen;

-- Where visits end: the last screen shown in each.
CREATE OR REPLACE VIEW exits AS
SELECT last_screen, count(*) AS visits
FROM (SELECT session_id, arg_max(screen, seq) AS last_screen FROM events WHERE event = 'screen_viewed' GROUP BY session_id)
GROUP BY ALL
ORDER BY visits DESC, last_screen;

-- Time on each screen: until the next screen in the visit, or the visit's last event for its last screen.
CREATE OR REPLACE VIEW screen_time AS
WITH views AS (
  SELECT session_id, screen, ts, lead(ts) OVER (PARTITION BY session_id ORDER BY seq) AS next_view
  FROM events
  WHERE event = 'screen_viewed'
), last_event AS (
  SELECT session_id, max(ts) AS last_ts FROM events GROUP BY session_id
)
SELECT screen,
       count(*) AS views,
       round(median(epoch(coalesce(next_view, last_ts) - ts))) AS median_seconds,
       round(sum(epoch(coalesce(next_view, last_ts) - ts)) / 60, 1) AS total_minutes
FROM views JOIN last_event USING (session_id)
GROUP BY screen
ORDER BY total_minutes DESC;

-- Each exercise: the visits it was opened in, then answers, passes, times left without an answer, help used and minutes spent on
-- answers. A screen may fetch an exercise twice as it opens, and a drill sends every question at its start, so the first count is
-- of visits, not fetches: a drill's questions count as opened in its visit, reached or not. An answer's time_spent_s runs from
-- opening the exercise, so a later try counts only the time since the try before (own_s), and each exercise's time counts once.
CREATE OR REPLACE VIEW items AS
WITH timed AS (
  SELECT *, CASE WHEN event = 'exercise_submitted' THEN greatest(0, time_spent_s - CASE WHEN try_number > 1
              THEN coalesce(lag(time_spent_s) OVER (PARTITION BY item_id, event ORDER BY ts, seq), 0) ELSE 0 END) END AS own_s
  FROM events
)
SELECT item_id,
       any_value(topic) AS topic,
       count(DISTINCT session_id) FILTER (WHERE event = 'item_viewed') AS visits_opened,
       count(*) FILTER (WHERE event = 'exercise_submitted') AS answers,
       count(*) FILTER (WHERE event = 'exercise_passed') AS passes,
       count(*) FILTER (WHERE event = 'item_closed' AND reason = 'left' AND graded_attempts = 0) AS left_unanswered,
       count(*) FILTER (WHERE event = 'hint_opened') AS hints,
       count(*) FILTER (WHERE event = 'answer_shown') AS answers_shown,
       round(sum(own_s) / 60, 1) AS answer_minutes
FROM timed
WHERE item_id IS NOT NULL
GROUP BY item_id
ORDER BY visits_opened DESC, item_id;

-- Help against results: the pass rate of graded answers by hints used and whether the answer was shown first.
CREATE OR REPLACE VIEW help_and_results AS
SELECT coalesce(CAST(hints_used AS INTEGER), 0) AS hints_used,
       coalesce(answer_shown, false) AS answer_shown,
       count(*) AS answers,
       round(100.0 * count(*) FILTER (WHERE outcome = 'passed') / count(*), 1) AS pass_pct
FROM events
WHERE event = 'exercise_submitted' AND outcome IN ('passed', 'failed')
GROUP BY ALL
ORDER BY ALL;

-- Calibration: the pass rate of graded answers by the confidence given before the result (1 to 4).
CREATE OR REPLACE VIEW confidence AS
SELECT CAST(confidence AS INTEGER) AS confidence,
       count(*) AS answers,
       round(100.0 * count(*) FILTER (WHERE outcome = 'passed') / count(*), 1) AS pass_pct
FROM events
WHERE event = 'exercise_submitted' AND outcome IN ('passed', 'failed')
GROUP BY ALL
ORDER BY confidence NULLS LAST;

-- The hour of day (Amsterdam time): answers given and their pass rate.
CREATE OR REPLACE VIEW time_of_day AS
SELECT hour(ts) AS hour,
       count(*) FILTER (WHERE event = 'exercise_submitted') AS answers,
       round(100.0 * count(*) FILTER (WHERE event = 'exercise_passed')
             / nullif(count(*) FILTER (WHERE event IN ('exercise_passed', 'exercise_failed')), 0), 1) AS pass_pct
FROM events
GROUP BY ALL
HAVING count(*) FILTER (WHERE event = 'exercise_submitted') > 0
ORDER BY hour;

-- Each day: visits, answers, passes and the minutes spent on answers, each exercise's time counted once (as in items).
CREATE OR REPLACE VIEW days AS
WITH timed AS (
  SELECT *, CASE WHEN event = 'exercise_submitted' THEN greatest(0, time_spent_s - CASE WHEN try_number > 1
              THEN coalesce(lag(time_spent_s) OVER (PARTITION BY item_id, event ORDER BY ts, seq), 0) ELSE 0 END) END AS own_s
  FROM events
)
SELECT CAST(ts AS DATE) AS day,
       count(DISTINCT session_id) AS visits,
       count(*) FILTER (WHERE event = 'exercise_submitted') AS answers,
       count(*) FILTER (WHERE event = 'exercise_passed') AS passed,
       round(sum(own_s) / 60, 1) AS answer_minutes
FROM timed
GROUP BY ALL
ORDER BY day;

-- Concept states as they changed: new, learning, practised, mastered, retained.
CREATE OR REPLACE VIEW mastery AS
SELECT ts, concept_id, topic, state_from, state_to
FROM events
WHERE event = 'concept_state_changed'
ORDER BY ts;

-- Timed runs (GA4 drills and mocks, SQL drills): one row per run, with its first finish (a results page reloaded finishes twice).
CREATE OR REPLACE VIEW runs AS
WITH started AS (
  SELECT block_id, section, run_kind, ts AS started_at FROM events WHERE event = 'run_started'
), finished AS (
  SELECT block_id, min(ts) AS finished_at, arg_min(score_pct, ts) AS score_pct, arg_min(run_passed, ts) AS run_passed
  FROM events WHERE event = 'run_finished' GROUP BY block_id
)
SELECT section, run_kind, started_at, finished_at,
       round(epoch(finished_at - started_at) / 60, 1) AS minutes,
       score_pct, run_passed, block_id
FROM started LEFT JOIN finished USING (block_id)
ORDER BY started_at;
