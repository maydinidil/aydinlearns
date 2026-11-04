// tests/grader/error-ids-8a.test.ts: sprint 8 Task A1 (S8-08 and S8-C06, ERRATA E-209; GRADER_VERSION 8a.1). Level 6's eight new error
// IDs are diagnosed by a planted match: a fixture item whose key plants the mistake, graded through the real runner on a small fixture
// schema, is diagnosed as that ID, with its name and its refutation feedback. Every table, row and query here is invented for the test;
// each learner's query is written differently from the plant, so the match is on the result, not the text. Each key also plants another
// ID first that the learner's result does not match, so the grader has to pick the right one.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import { GRADER_VERSION, grade } from '../../server/grader/grade.ts';
import { DEFAULT_RULES, type ColumnRule, type SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

/** One table in a visible schema and its edge schema, from VALUES rows. */
const table = (schema: string, name: string, columns: string, rows: string): string =>
  `CREATE TABLE ${schema}.${name} AS SELECT * FROM (VALUES ${rows}) v(${columns})`;
const EVENTS = 'user_id, event_name, event_ts';
const ts = (s: string) => `TIMESTAMP '2025-03-${s}'`;
const d = (s: string) => `DATE '2025-${s}'`;

const runner = await startRunner(await makeFixtureDb([
  ...[44, 45, 46, 47, 48, 49, 50, 51].flatMap((n) => [`CREATE SCHEMA f${n}`, `CREATE SCHEMA f${n}_edge`]),
  // ERR-LOG-44: user 3 buys twice with no view; on the edge, user 4 buys before viewing.
  table('f44', 'events', EVENTS, `(1, 'view', ${ts('01 10:00')}), (1, 'purchase', ${ts('01 10:20')}), (2, 'view', ${ts('02 09:00')}),
    (3, 'purchase', ${ts('03 12:00')}), (3, 'purchase', ${ts('04 12:00')})`),
  table('f44_edge', 'events', EVENTS, `(1, 'view', ${ts('01 10:00')}), (1, 'purchase', ${ts('01 10:20')}), (2, 'view', ${ts('02 09:00')}),
    (4, 'purchase', ${ts('05 08:00')}), (4, 'view', ${ts('05 09:00')})`),
  // ERR-LOG-45: the feedback's own funnel, 2,000 viewers, 300 carts and 120 buyers.
  table('f45', 'steps', 'step_no, step_name, users', "(1, 'view', 2000), (2, 'cart', 300), (3, 'purchase', 120)"),
  table('f45_edge', 'steps', 'step_no, step_name, users', "(1, 'view', 1000), (2, 'cart', 250), (3, 'purchase', 50)"),
  // ERR-LOG-46: February to March is 28 days; customer 1 is active twice in February. On the edge, January to March is 59 days.
  table('f46', 'activity', 'customer_id, cohort_month, active_month', `(1, ${d('01-01')}, ${d('01-01')}), (1, ${d('01-01')}, ${d('02-01')}),
    (1, ${d('01-01')}, ${d('02-01')}), (2, ${d('02-01')}, ${d('02-01')}), (2, ${d('02-01')}, ${d('03-01')})`),
  table('f46_edge', 'activity', 'customer_id, cohort_month, active_month', `(3, ${d('01-01')}, ${d('01-01')}), (3, ${d('01-01')}, ${d('03-01')})`),
  // ERR-LOG-47: account 1 churns in March and comes back in April; account 2 starts in February. One row per account and month.
  table('f47', 'account_months', 'account_id, month_start, mrr', `(1, ${d('01-01')}, 100), (1, ${d('02-01')}, 100), (1, ${d('03-01')}, 0),
    (1, ${d('04-01')}, 100), (2, ${d('01-01')}, 0), (2, ${d('02-01')}, 50), (2, ${d('03-01')}, 50), (2, ${d('04-01')}, 50)`),
  table('f47_edge', 'account_months', 'account_id, month_start, mrr', `(3, ${d('01-01')}, 0), (3, ${d('02-01')}, 0), (3, ${d('03-01')}, 80),
    (4, ${d('01-01')}, 60), (4, ${d('02-01')}, 0), (4, ${d('03-01')}, 0), (4, ${d('04-01')}, 60)`),
  // ERR-LOG-48: the data ends on 5 March, so March is partial; on the edge it ends on 2 April.
  table('f48', 'daily_sales', 'sale_date, revenue', `(${d('01-05')}, 100), (${d('01-20')}, 100), (${d('02-05')}, 120), (${d('02-20')}, 120), (${d('03-05')}, 50)`),
  table('f48_edge', 'daily_sales', 'sale_date, revenue', `(${d('02-10')}, 100), (${d('03-10')}, 110), (${d('04-02')}, 30)`),
  // ERR-LOG-49: 100, then 120 (+20%), then 90 (-25%).
  table('f49', 'monthly', 'month_start, revenue', `(${d('01-01')}, 100), (${d('02-01')}, 120), (${d('03-01')}, 90)`),
  table('f49_edge', 'monthly', 'month_start, revenue', `(${d('01-01')}, 200), (${d('02-01')}, 150), (${d('03-01')}, 300)`),
  // ERR-LOG-50: customer 2 signs up in January and first orders in March; customer 3 orders twice. On the edge, customer 6 never orders.
  table('f50', 'signups', 'customer_id, signup_date', `(1, ${d('01-10')}), (2, ${d('01-20')}), (3, ${d('02-05')})`),
  table('f50', 'orders', 'customer_id, order_date', `(1, ${d('01-15')}), (2, ${d('03-02')}), (3, ${d('02-10')}), (3, ${d('02-20')})`),
  table('f50_edge', 'signups', 'customer_id, signup_date', `(4, ${d('03-28')}), (5, ${d('04-02')}), (6, ${d('04-10')})`),
  table('f50_edge', 'orders', 'customer_id, order_date', `(4, ${d('04-01')}), (5, ${d('04-03')})`),
  // ERR-LOG-51: a monthly plan and two annual ones.
  table('f51', 'subscriptions', 'account_id, billing_period, price_eur', "(1, 'monthly', 100), (2, 'annual', 1000), (3, 'annual', 600)"),
  table('f51_edge', 'subscriptions', 'account_id, billing_period, price_eur', "(4, 'annual', 2400), (5, 'monthly', 30)"),
]));
after(() => runner.close());

const read = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;
type Fb = { assumed: string; why: string; model: string };
const feedback = await read<Record<string, Fb>>('content/sql/error-feedback.json');
const names = new Map((await read<{ errors: { id: string; name: string }[] }>('content/sql/errors.json')).errors.map((e) => [e.id, e.name]));
const deps = { runner, edge: null, feedback };

const count = (name: string): ColumnRule => ({ name, type_class: 'numeric', precision: 'count' });
const ratio = (name: string): ColumnRule => ({ name, type_class: 'numeric', precision: 'ratio' });
const money = (name: string): ColumnRule => ({ name, type_class: 'numeric', precision: 'money' });
const textCol = (name: string): ColumnRule => ({ name, type_class: 'text', precision: 'exact' });
const dateCol = (name: string): ColumnRule => ({ name, type_class: 'temporal', precision: 'exact' });

/**
 * One ID's fixture item: the reference that avoids the mistake, a decoy plant of another ID, the plants of this ID (keyed M2, M3, ...
 * in order), and learner queries that make the mistake in other words, each with the plant it must match.
 */
interface Plant {
  id: string; name: string; schema: string; columns: ColumnRule[]; reference: string;
  decoy: SqlKey['planted_wrong'][number]; planted: string[]; learners: [sql: string, plant: string][];
}

const PLANTS: Record<string, Plant> = {
  'ERR-LOG-44': {
    id: 'EX-TEST-44', name: 'A funnel step counted without the step before it', schema: 'f44', columns: [count('viewers'), count('buyers')],
    reference: `WITH firsts AS (SELECT user_id, MIN(CASE WHEN event_name = 'view' THEN event_ts END) AS viewed_at,
      MIN(CASE WHEN event_name = 'purchase' THEN event_ts END) AS bought_at FROM events GROUP BY user_id)
      SELECT COUNT(viewed_at) AS viewers, COUNT(CASE WHEN bought_at >= viewed_at THEN 1 END) AS buyers FROM firsts`,
    // Counting events, not users (ERR-LOG-04): 2 and 3 here, which the learner's 2 and 2 does not match.
    decoy: { id: 'M1', error_id: 'ERR-LOG-04', sql: "SELECT COUNT(CASE WHEN event_name = 'view' THEN 1 END) AS viewers, COUNT(CASE WHEN event_name = 'purchase' THEN 1 END) AS buyers FROM events" },
    planted: ["SELECT COUNT(DISTINCT CASE WHEN event_name = 'view' THEN user_id END) AS viewers, COUNT(DISTINCT CASE WHEN event_name = 'purchase' THEN user_id END) AS buyers FROM events"],
    learners: [["select count(distinct user_id) filter (where event_name = 'view') as viewers, count(distinct user_id) filter (where event_name = 'purchase') as buyers from events", 'M2']],
  },
  'ERR-LOG-45': {
    id: 'EX-TEST-45', name: 'A funnel rate divided by the wrong step', schema: 'f45', columns: [textCol('step_name'), ratio('step_rate')],
    reference: 'SELECT step_name, 1.0 * users / LAG(users) OVER (ORDER BY step_no) AS step_rate FROM steps',
    // A percentage where the question asks for a share (ERR-LOG-21).
    decoy: { id: 'M1', error_id: 'ERR-LOG-21', sql: 'SELECT step_name, 100.0 * users / LAG(users) OVER (ORDER BY step_no) AS step_rate FROM steps' },
    planted: ['SELECT step_name, 1.0 * users / FIRST_VALUE(users) OVER (ORDER BY step_no) AS step_rate FROM steps'],
    learners: [['SELECT s.step_name, s.users * 1.0 / t.users AS step_rate FROM steps s CROSS JOIN (SELECT users FROM steps WHERE step_no = 1) t', 'M2']],
  },
  'ERR-LOG-46': {
    id: 'EX-TEST-46', name: 'Cohort months worked out from days divided by 30', schema: 'f46',
    columns: [dateCol('cohort_month'), count('month_offset'), count('customers')],
    reference: "SELECT cohort_month, date_diff('month', cohort_month, active_month) AS month_offset, COUNT(DISTINCT customer_id) AS customers FROM activity GROUP BY 1, 2",
    // Counting rows, not customers (ERR-LOG-04): customer 1 is active twice in February.
    decoy: { id: 'M1', error_id: 'ERR-LOG-04', sql: "SELECT cohort_month, date_diff('month', cohort_month, active_month) AS month_offset, COUNT(*) AS customers FROM activity GROUP BY 1, 2" },
    planted: ["SELECT cohort_month, CAST(FLOOR(date_diff('day', cohort_month, active_month) / 30) AS BIGINT) AS month_offset, COUNT(DISTINCT customer_id) AS customers FROM activity GROUP BY 1, 2"],
    learners: [['SELECT cohort_month, floor((active_month - cohort_month) / 30) AS month_offset, count(DISTINCT customer_id) AS customers FROM activity GROUP BY cohort_month, floor((active_month - cohort_month) / 30)', 'M2']],
  },
  'ERR-LOG-47': {
    id: 'EX-TEST-47', name: 'A returning account booked as new', schema: 'f47', columns: [count('account_id'), dateCol('month_start'), textCol('movement')],
    reference: `WITH m AS (SELECT account_id, month_start, mrr, LAG(mrr) OVER (PARTITION BY account_id ORDER BY month_start) AS prev_mrr,
      MAX(mrr) OVER (PARTITION BY account_id ORDER BY month_start ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS mrr_before FROM account_months)
      SELECT account_id, month_start, CASE WHEN COALESCE(mrr_before, 0) = 0 THEN 'new' ELSE 'reactivation' END AS movement
      FROM m WHERE COALESCE(prev_mrr, 0) = 0 AND mrr > 0`,
    // The same rule over every account at once, with no PARTITION BY (ERR-LOG-37): account 2's start reads account 1's history.
    decoy: { id: 'M1', error_id: 'ERR-LOG-37', sql: `WITH m AS (SELECT account_id, month_start, mrr, LAG(mrr) OVER (ORDER BY account_id, month_start) AS prev_mrr,
      MAX(mrr) OVER (ORDER BY account_id, month_start ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS mrr_before FROM account_months)
      SELECT account_id, month_start, CASE WHEN COALESCE(mrr_before, 0) = 0 THEN 'new' ELSE 'reactivation' END AS movement
      FROM m WHERE COALESCE(prev_mrr, 0) = 0 AND mrr > 0` },
    planted: [`WITH m AS (SELECT account_id, month_start, mrr, LAG(mrr) OVER (PARTITION BY account_id ORDER BY month_start) AS prev_mrr FROM account_months)
      SELECT account_id, month_start, 'new' AS movement FROM m WHERE COALESCE(prev_mrr, 0) = 0 AND mrr > 0`],
    learners: [[`SELECT account_id, month_start, CASE WHEN prev_mrr = 0 OR prev_mrr IS NULL THEN 'new' END AS movement
      FROM (SELECT account_id, month_start, mrr, lag(mrr) OVER (PARTITION BY account_id ORDER BY month_start) AS prev_mrr FROM account_months) t
      WHERE mrr > 0 AND (prev_mrr = 0 OR prev_mrr IS NULL)`, 'M2']],
  },
  // S8-C06: the four IDs the controller added where no existing ID fit.
  'ERR-LOG-48': {
    id: 'EX-TEST-48', name: 'A partial period compared with a full one', schema: 'f48',
    columns: [dateCol('month_start'), money('revenue'), ratio('growth')],
    // The prompt: the last month in the data is not complete, so leave it out.
    reference: `WITH m AS (SELECT date_trunc('month', sale_date) AS month_start, SUM(revenue) AS revenue FROM daily_sales
      WHERE sale_date < date_trunc('month', (SELECT MAX(sale_date) FROM daily_sales)) GROUP BY 1)
      SELECT month_start, revenue, revenue / LAG(revenue) OVER (ORDER BY month_start) - 1 AS growth FROM m`,
    // A percentage where the question asks for a share (ERR-LOG-21), on whole months: two rows, where the learner has three.
    decoy: { id: 'M1', error_id: 'ERR-LOG-21', sql: `WITH m AS (SELECT date_trunc('month', sale_date) AS month_start, SUM(revenue) AS revenue FROM daily_sales
      WHERE sale_date < date_trunc('month', (SELECT MAX(sale_date) FROM daily_sales)) GROUP BY 1)
      SELECT month_start, revenue, 100.0 * (revenue / LAG(revenue) OVER (ORDER BY month_start) - 1) AS growth FROM m` },
    planted: [`WITH m AS (SELECT date_trunc('month', sale_date) AS month_start, SUM(revenue) AS revenue FROM daily_sales GROUP BY 1)
      SELECT month_start, revenue, revenue / LAG(revenue) OVER (ORDER BY month_start) - 1 AS growth FROM m`],
    learners: [[`SELECT month_start, revenue, revenue / lag(revenue) OVER (ORDER BY month_start) - 1 AS growth
      FROM (SELECT date_trunc('month', sale_date) AS month_start, sum(revenue) AS revenue FROM daily_sales GROUP BY date_trunc('month', sale_date)) t`, 'M2']],
  },
  'ERR-LOG-49': {
    id: 'EX-TEST-49', name: 'A change worked out the wrong way round', schema: 'f49', columns: [dateCol('month_start'), ratio('growth')],
    reference: 'SELECT month_start, revenue / LAG(revenue) OVER (ORDER BY month_start) - 1 AS growth FROM monthly',
    decoy: { id: 'M1', error_id: 'ERR-LOG-21', sql: 'SELECT month_start, 100.0 * (revenue / LAG(revenue) OVER (ORDER BY month_start) - 1) AS growth FROM monthly' },
    // Old minus new (M2: -0.2 and 0.25), and the change divided by the new value (M3: 0.167 and -0.333).
    planted: [
      'SELECT month_start, (LAG(revenue) OVER (ORDER BY month_start) - revenue) / LAG(revenue) OVER (ORDER BY month_start) AS growth FROM monthly',
      'SELECT month_start, (revenue - LAG(revenue) OVER (ORDER BY month_start)) / revenue AS growth FROM monthly',
    ],
    learners: [
      ['SELECT month_start, (prev - revenue) * 1.0 / prev AS growth FROM (SELECT month_start, revenue, lag(revenue) OVER (ORDER BY month_start) AS prev FROM monthly) t', 'M2'],
      ['SELECT month_start, 1 - prev * 1.0 / revenue AS growth FROM (SELECT month_start, revenue, lag(revenue) OVER (ORDER BY month_start) AS prev FROM monthly) t', 'M3'],
    ],
  },
  'ERR-LOG-50': {
    id: 'EX-TEST-50', name: 'A cohort dated by the wrong event', schema: 'f50', columns: [dateCol('cohort_month'), count('customers')],
    // The prompt: cohorts by signup month.
    reference: "SELECT date_trunc('month', signup_date) AS cohort_month, COUNT(*) AS customers FROM signups GROUP BY 1",
    // Counting orders by order month, not customers (ERR-LOG-04).
    decoy: { id: 'M1', error_id: 'ERR-LOG-04', sql: "SELECT date_trunc('month', order_date) AS cohort_month, COUNT(*) AS customers FROM orders GROUP BY 1" },
    planted: [`SELECT cohort_month, COUNT(*) AS customers FROM (SELECT customer_id, date_trunc('month', MIN(order_date)) AS cohort_month
      FROM orders GROUP BY customer_id) t GROUP BY cohort_month`],
    learners: [[`WITH firsts AS (SELECT customer_id, min(order_date) AS first_order FROM orders GROUP BY customer_id)
      SELECT date_trunc('month', first_order) AS cohort_month, count(customer_id) AS customers FROM firsts GROUP BY 1`, 'M2']],
  },
  'ERR-LOG-51': {
    id: 'EX-TEST-51', name: 'An annual plan\'s price counted as one month\'s MRR', schema: 'f51', columns: [count('account_id'), money('mrr_eur')],
    reference: "SELECT account_id, CASE WHEN billing_period = 'annual' THEN price_eur / 12.0 ELSE price_eur END AS mrr_eur FROM subscriptions",
    // Integer division (ERR-LOG-05): 1,000 // 12 is 83, not 83.33.
    decoy: { id: 'M1', error_id: 'ERR-LOG-05', sql: "SELECT account_id, CASE WHEN billing_period = 'annual' THEN price_eur // 12 ELSE price_eur END AS mrr_eur FROM subscriptions" },
    planted: ['SELECT account_id, price_eur AS mrr_eur FROM subscriptions'],
    learners: [['SELECT s.account_id, s.price_eur * 1.0 AS mrr_eur FROM subscriptions s ORDER BY s.account_id', 'M2']],
  },
};

const itemOf = (p: Plant): SqlItem => ({
  id: p.id, version: 1, schema: p.schema, edge_schema: `${p.schema}_edge`, why_this_works: 'Fixture.',
  rules: { ...DEFAULT_RULES, columns: p.columns },
} as unknown as SqlItem);
const plantId = (i: number): string => `M${i + 2}`;
const keyOf = (p: Plant, errorId: string): SqlKey => ({
  item_id: p.id, item_version: 1, reference_sql: p.reference, alternatives: [], other_way: null, hint3_partial: '', solver: null,
  planted_wrong: [p.decoy, ...p.planted.map((sql, i) => ({ id: plantId(i), error_id: errorId, sql }))],
});

// Sprint 9 (Task A1) moved the version to 9a.1 by adding level 7's diagnoses and notes; 8a.1's level 6 diagnoses below grade as before.
test('the grader version is 9a.1, which grades the level 6 diagnoses of 8a.1 (S8-08, S8-C06) and the PIVOT note (S8-09) as before', () => {
  assert.equal(GRADER_VERSION, '9a.1');
});

for (const [errorId, p] of Object.entries(PLANTS)) {
  test(`S8-08: a planted ${errorId} on a fixture is diagnosed ${errorId}, with its name and refutation feedback`, async () => {
    const item = itemOf(p);
    const key = keyOf(p, errorId);
    assert.equal((await grade({ item, key, sql: p.reference }, deps)).outcome, 'pass', 'the reference passes');
    const cases: [sql: string, plant: string, what: string][] = [
      ...p.planted.map((sql, i): [string, string, string] => [sql, plantId(i), `plant ${plantId(i)}`]),
      ...p.learners.map(([sql, plant], i): [string, string, string] => [sql, plant, `learner query ${i + 1}`]),
    ];
    for (const [sql, plant, what] of cases) {
      const r = await grade({ item, key, sql }, deps);
      assert.equal(r.outcome, 'fail', what);
      assert.equal(r.diagnosis?.errorId, errorId, what);
      assert.equal(r.diagnosis?.source, 'mutant', what);
      assert.equal(r.matchedMutantId, plant, `${what}: the plant of this ID it repeats, not the decoy`);
      assert.deepEqual(r.diagnosis?.feedback, feedback[errorId], `${what}: the refutation text of ${errorId}`);
      assert.equal(names.get(r.diagnosis!.errorId), p.name, `${what}: errors.json names it as the ruling does`);
    }
  });
}

test('S8-08: with no plant for the mistake, the same learner query still fails but is not given the ID: the plant is what names it', async () => {
  for (const [errorId, p] of Object.entries(PLANTS)) {
    const key = { ...keyOf(p, errorId), planted_wrong: [p.decoy] };
    for (const [sql] of p.learners) {
      const r = await grade({ item: itemOf(p), key, sql }, deps);
      assert.equal(r.outcome, 'fail', errorId);
      assert.notEqual(r.diagnosis?.errorId, errorId, `${errorId}: only a plant gives this ID`);
    }
  }
});
