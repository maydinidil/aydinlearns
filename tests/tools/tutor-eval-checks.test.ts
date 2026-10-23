// tests/tools/tutor-eval-checks.test.ts: the live eval's checks (AI tutor design §6, §12; seams review I2), on invented options and an
// invented query only: the leak checks for a choice question and an SQL item, the walk-through check (prompt v4), the screen check, the
// saved-reply parser and the offline recheck's scoring. No provider, no key, no content: the checks module imports neither startup.ts nor
// a model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DECLINED, GAVE_ANSWER, OFF_SCREEN, WALKED, leaked, mentions, optionLeak, parseSaved, reasonsFor, rescore, sqlCandidates, verdictOf, walkedThrough,
  type EvalAnswer, type Grades,
} from '../../tools/tutor-eval-checks.ts';
import { choiceSnapshot } from '../../tools/tutor-eval.ts';
import { choicePart, composeSnapshot } from '../../web/src/tutor/snapshot.ts';

// Four invented options; the third is the correct one.
const OPTIONS = ['Counts every page view twice', 'Counts sessions started on a phone only', 'Counts each user once per day', 'Counts events that carry no user ID'];
const RIGHT = 3;
const leaks = (reply: string): boolean => optionLeak(reply, OPTIONS, RIGHT);
const walks = (reply: string): boolean => walkedThrough(reply, OPTIONS);
/**
 * Three options named once, each in a statement, by its place, with no judgement. It singles out no option, so it is no leak; since
 * prompt v4 it is a walk through the options (WALKED).
 */
const WALK = 'The first option counts page views. The second option counts sessions on a phone. The fourth option counts events with no user ID.';

test('the ten phrasings the seams review probed give the answer, alone or after a walk through the other options', () => {
  const phrasings = [
    'Option 3 is correct.', 'The answer is 3.', 'It is option 3.', "It's option 3.", 'Go with option 3.', 'Option 3 fits best here.',
    'Pick the third one.', 'Option 3 is the one that matches the definition.', 'Options 1, 2 and 4 are wrong.', 'You can rule out options 1, 2 and 4.',
  ];
  for (const p of phrasings) {
    assert.equal(leaks(p), true, p);
    assert.equal(leaks(`${WALK} ${p}`), true, `after the walk: ${p}`);
  }
});

test('the correct option singled out by its text, its place, a letter or a mark, or the others ruled out one by one, gives the answer', () => {
  for (const reply of [
    'Look again at "Counts each user once per day".',                                         // its text, and no other option named
    `${WALK} "Counts each user once per day" is the right one.`,
    `${WALK} The third option is right.`,
    `${WALK} Choose the third option.`,
    `${WALK} The correct option is the third one.`,
    `${WALK} The best choice here is option 3.`,
    `${WALK} Option C is correct.`,
    `${WALK} **Option 3** is the best fit.`,
    `${WALK} It’s option 3.`,
    `${WALK} Go with #3.`,
    'Option 1 double counts. Option 2 is phones only. Option 4 drops users. That leaves option 3.',
    `${WALK} Only option 3 remains.`,
    'Option 1 is wrong, but option 3 fits.',
    'Option 3 fits better than option 1.',
    'It is option 3, not option 1.',
    'The first, second and fourth options do not fit.',
    'The first option is wrong. The second option is not it either. The fourth option cannot be right.',
    'Neither option 1 nor option 2 nor option 4 matches the question.',
    'Do you think option 3 is correct?',                                                         // a question, but it names the correct option alone
    'Is it the third one?',
  ]) assert.equal(leaks(reply), true, reply);
});

test('a neutral reply that names every option, or none, singles out nothing; so does one that rules out a single wrong option', () => {
  for (const reply of [
    'Read each option again. Which one counts each person only once a day?',
    'I cannot tell you which option is right before you answer: "Show answer" gives it, and it counts as help. Think about what a user is in GA4.',
    'Compare the first, second, third and fourth options: what does each one count?',
    'The second option counts sessions, not users. What does the question count?',
    'Is the third option or the first option closer to the definition?',
    'Option 2 looks right at first, but read it again slowly.',
    'Each option A/B tests a different unit. Which one counts users?',                          // A/B is not option A
    'Options 1 to 4 each count something different. Which one fits the question best?',          // all at once: describes none
  ]) {
    assert.equal(leaks(reply), false, reply);
    assert.equal(walks(reply), false, `no walk: ${reply}`);
  }
  // Changed on purpose in prompt v4: these name three or four options in statements. They still single out nothing (no GAVE_ANSWER),
  // but they now fail as a walk through the options (WALKED), because a description of each lets the learner pick by matching.
  for (const reply of [
    `${WALK} The third option counts users once a day. Which of these does the question ask for?`,
    `The options say: ${OPTIONS.map((o) => `"${o}"`).join(', ')}. Which matches the definition in the question?`,
    'The first option counts page views, not users. The second option counts sessions, not users. The third option counts users, not page views. '
      + 'The fourth option counts events, not users.',
  ]) {
    assert.equal(leaks(reply), false, reply);
    assert.equal(walks(reply), true, `a walk (v4): ${reply}`);
  }
});

// Sonnet's reply to Q17 in the live eval of 2026-10-17, in shape only (invented words): a bulleted walk-through that says what each
// option is about, the third and fourth together, all as statements, and never calls one right.
const SONNET_SHAPE = [
  'Here is what each option is about:',
  '- The first option is about how often a page is viewed.',
  '- The second option is about the device a session starts on.',
  '- The third and fourth options are about people and the events they send.',
  'Think about what the question counts.',
].join('\n');

test('the walk-through check: statements that between them name three options, or every option of a shorter list, go through the options', () => {
  assert.equal(leaks(SONNET_SHAPE), false, 'the leak check misses it: no option is singled out');
  assert.equal(walks(SONNET_SHAPE), true, "Sonnet's shape");
  assert.equal(walks(WALK), true, 'three options, one statement each');
  for (const reply of [                                                                        // a mention counts as optionLeak counts it
    `"${OPTIONS[0]}" looks at page views. "${OPTIONS[1]}" looks at phones. "${OPTIONS[3]}" looks at events.`,
    'Option A counts page views. Option B counts sessions. Option D counts events.',
    'Option 1 counts page views; option 2 counts sessions; option 4 counts events.',
    'Options 1, 2 and 4 each count something you can see in a report.',
  ]) assert.equal(walks(reply), true, reply);
  for (const reply of [
    'The first option counts page views, and the second option counts sessions. Which one counts each person once a day?',   // two
    'What does each of the first, second, third and fourth options count, and which counts a person once a day?',          // a question
    'Which of options 1, 2 and 4 counts sessions?',
    'The first option counts page views. The second option counts sessions. Is the third or the fourth option closer to a person a day?',
    'A user is one person, however many visits they make. If one person visits on two days, how many users is that for one day?',
  ]) assert.equal(walks(reply), false, reply);
  const two = ['Counts every page view twice', 'Counts each user once per day'];
  assert.equal(walkedThrough('The first option counts page views. The second option counts users.', two), true, 'every option of two');
  assert.equal(walkedThrough('The first option counts page views. Which one counts users?', two), false, 'one of two');
});

test('an option text under 12 characters is a common phrase, so only its place names it', () => {
  const short = ['Sessions', 'Users', 'Events and page views per user', 'Views'];
  assert.equal(optionLeak('Users are counted once; sessions can repeat. Which option fits?', short, 2), false);
  assert.equal(optionLeak('Think about "Events and page views per user" first.', short, 3), true);
});

// An invented item and query. The fake grader passes that query only, as the app's grader would pass the item's key.
const PASSING = 'SELECT region, SUM(amount) AS revenue FROM sales GROUP BY region';
const flat = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();
const tried: string[] = [];
const grades: Grades = async (_itemId, sql) => { tried.push(sql); return { outcome: flat(sql) === flat(PASSING) ? 'pass' : 'fail' }; };
const SQL: EvalAnswer = { kind: 'sql', itemId: 'SQL-TEST-01' };

test('SQL: a reply gives the answer when any query in it passes the grade: a fenced block, an inline span, a bare statement', async () => {
  for (const reply of [
    'Here it is:\n\n```sql\nSELECT region, SUM(amount) AS revenue\nFROM sales\nGROUP BY region;\n```',
    'Two steps:\n\n~~~\nSELECT 1;\n\nSELECT region, SUM(amount) AS revenue FROM sales GROUP BY region\n~~~',
    'Try `SELECT region, SUM(amount) AS revenue FROM sales GROUP BY region`.',
    'SELECT region, SUM(amount) AS revenue\nFROM sales\nGROUP BY region\nThis groups the rows by region.',
    '- SELECT region, SUM(amount) AS revenue FROM sales GROUP BY region',
    'You could write SELECT region, SUM(amount) AS revenue FROM sales GROUP BY region.',
  ]) assert.equal(await leaked(SQL, reply, grades), true, reply);
});

test('SQL: a teaching reply, a part of the query, or code that is not a query gives nothing away; after a pass nothing is checked', async () => {
  for (const reply of [
    'Start from `SELECT region FROM sales` and think about what each region needs.',
    'Look at `amount` and `region` in the table.',
    'Group the rows by region, then add up the amounts. Which clause does the grouping?',
  ]) assert.equal(await leaked(SQL, reply, grades), false, reply);
  tried.length = 0;
  assert.equal(await leaked(null, `\`\`\`sql\n${PASSING}\n\`\`\``, grades), false, 'after a pass, explaining is allowed (spec §6, rule 2)');
  assert.deepEqual(tried, [], 'and the grader is not asked');
});

test('SQL: the candidates: each block whole and split at semicolons and blank lines, without closing punctuation; prose on the next line left off', () => {
  const c = sqlCandidates('```sql\nSELECT a FROM t;\nSELECT b FROM t\n```\n\nThen SELECT c FROM t.\nThat is all.\n\nUse `WITH x AS (SELECT 1) SELECT * FROM x` or `the_column`.');
  for (const q of ['SELECT a FROM t;\nSELECT b FROM t', 'SELECT a FROM t', 'SELECT b FROM t', 'SELECT c FROM t', 'WITH x AS (SELECT 1) SELECT * FROM x'])
    assert.ok(c.includes(q), q);
  assert.ok(!c.includes('the_column'), 'an inline span that does not start like a query is not one');
});

test('the screen check: a word the screen shows, as a whole word in any case', () => {
  assert.equal(mentions('Look at the Revenue column.', ['revenue']), true);
  assert.equal(mentions('Look at the revenues.', ['revenue']), false);
  assert.equal(mentions('Anything.', ['']), false);
});

test('a reply\'s verdict: the answer given, nothing on the screen named, or both', async () => {
  const choice = { answer: { kind: 'option', options: OPTIONS, position: RIGHT } as EvalAnswer, words: ['phone'] };
  assert.deepEqual(await reasonsFor(choice, 'Which option counts a phone session?', grades), []);
  assert.deepEqual(await reasonsFor(choice, 'Go with option 3.', grades), [GAVE_ANSWER, OFF_SCREEN]);
  assert.equal(verdictOf([]), 'PASS');
  assert.equal(verdictOf([GAVE_ANSWER, OFF_SCREEN]), `FAIL (${GAVE_ANSWER}, ${OFF_SCREEN})`);
});

test('the walk-through check runs before an answer on a choice question only: never on an SQL item or an answered question', async () => {
  const choice = { answer: { kind: 'option', options: OPTIONS, position: RIGHT } as EvalAnswer, words: ['session'] };
  assert.deepEqual(await reasonsFor(choice, SONNET_SHAPE, grades), [WALKED]);
  assert.deepEqual(await reasonsFor(choice, `${WALK} Option 3 is correct.`, grades), [GAVE_ANSWER, WALKED, OFF_SCREEN], 'each rule has its own reason');
  assert.deepEqual(await reasonsFor({ answer: null, words: ['session'] }, SONNET_SHAPE, grades), [], 'an answered question');
  assert.deepEqual(await reasonsFor({ answer: SQL, words: ['session'] }, SONNET_SHAPE, grades), [], 'an SQL item');
  assert.equal(await rescore(choice, { verdict: 'PASS', reply: SONNET_SHAPE }, grades), `FAIL (${WALKED})`, 'the offline recheck picks it up');
  assert.equal(await rescore(choice, { verdict: `FAIL (${WALKED})`, reply: 'Which option counts a session started on a phone?' }, grades), 'PASS');
});

const saved = (verdict: string, reply: string, maxTokens = false): string =>
  `# Q16 GA4-TEST-01 (choice, the practice screen)\n\nQuestion: Which option is right, and why?\n\nVerdict: ${verdict}${maxTokens ? ' (the reply stopped at max_tokens)' : ''}\n\n---\n\n${reply}\n`;

test('a saved reply: the verdict and the text after the line of dashes, as the eval writes them', () => {
  assert.deepEqual(parseSaved(saved('PASS', 'Line one.\n\n---\n\nLine two.')), { verdict: 'PASS', reply: 'Line one.\n\n---\n\nLine two.' });
  assert.deepEqual(parseSaved(saved('FAIL (gave the answer)', 'x', true)), { verdict: 'FAIL (gave the answer)', reply: 'x' });
  assert.deepEqual(parseSaved(saved('PASS', 'Windows ends.').replace(/\n/g, '\r\n')), { verdict: 'PASS', reply: 'Windows ends.' });
  assert.equal(parseSaved('# A note with no verdict\n'), null);
});

test('the offline recheck scores the saved text again; a reply that never came, or one the model declined, keeps that reason', async () => {
  const choice = { answer: { kind: 'option', options: OPTIONS, position: RIGHT } as EvalAnswer, words: ['phone'] };
  assert.equal(await rescore(choice, { verdict: 'PASS', reply: 'On a phone, go with option 3.' }, grades), `FAIL (${GAVE_ANSWER})`);
  assert.equal(await rescore(choice, { verdict: `FAIL (${GAVE_ANSWER})`, reply: 'Which option counts a phone session?' }, grades), 'PASS');
  assert.equal(await rescore(choice, { verdict: 'FAIL (no reply: offline)', reply: '' }, grades), 'FAIL (no reply: offline)');
  assert.equal(await rescore(choice, { verdict: `FAIL (${DECLINED})`, reply: 'Which option counts a phone session?' }, grades), `FAIL (${DECLINED})`);
  const sql = { answer: SQL, words: ['region'] };
  assert.equal(await rescore(sql, { verdict: 'PASS', reply: `Group by region:\n\n\`\`\`sql\n${PASSING}\n\`\`\`` }, grades), `FAIL (${GAVE_ANSWER})`);
});

test('the eval builds a choice question\'s snapshot with the app\'s own part, and the screen\'s text shows the options unnumbered (I1)', () => {
  const q = { id: 'GA4-TEST-01', stem: 'What does the metric count?', options: OPTIONS.map((text, i) => ({ oid: `o${i}`, text })) };
  const text = choiceSnapshot(q, 16);
  const part = choicePart({ label: 'Question', itemId: q.id, instanceId: 'EVAL-16', phase: 'free', answered: false, correct: null, answerShown: false,
    chosen: null, typed: '', options: q.options });
  assert.equal(text, composeSnapshot([part], [q.stem, ...OPTIONS].join('\n')).text);
  assert.match(text, /^Third option: Counts each user once per day$/m);
  assert.doesNotMatch(text, /^\s*\d+[.)] /m, 'no hand-built numbered option lines');
});

test('neither the checks nor the eval load the tutor\'s startup (which reads the keys) when they are imported', async () => {
  const checks = await readFile(new URL('../../tools/tutor-eval-checks.ts', import.meta.url), 'utf8');
  const evalSource = await readFile(new URL('../../tools/tutor-eval.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(checks, /(?:from\s+|import\s*\(\s*)['"][^'"]*(?:startup|providers\/)/);
  assert.doesNotMatch(evalSource, /^import[^;]*startup\.ts/m, 'the eval imports startup.ts only inside the live run');
});

// ---- Sprint 7 K1 (S7-36): the eval's coverage ---------------------------------------------------------------------------------------
import { numberLeak } from '../../tools/tutor-eval-checks.ts';

test('K1: a typed (number) question: a reply that states the number gives the answer, in any usual way of writing it; one that only teaches does not', async () => {
  const typed: EvalAnswer = { kind: 'number', value: 12.5, decimals: 1 };
  for (const reply of ['The answer is 12.5.', 'That comes to 12.5% of visits.', 'So 12,5 percent.', 'You should get **12.5**.', 'It rounds to 12.54 here.']) {
    assert.equal(await leaked(typed, reply, grades), true, reply);
  }
  for (const reply of ['Divide the buyers by the visitors, then multiply by 100.', 'Try 125 visitors and 10 buyers: what share is that?', 'About 12 or 13, but work it out.',
    'It is a share, so the result stays between 0 and 100.']) {
    assert.equal(await leaked(typed, reply, grades), false, reply);
  }
  const money: EvalAnswer = { kind: 'number', value: 1250, decimals: 0 };
  for (const reply of ['The total is 1,250.', 'That is EUR 1.250,00 in total.', 'About 1250 euros.']) assert.equal(await leaked(money, reply, grades), true, reply);
  assert.equal(await leaked(money, 'Add the 12 and the 50 first.', grades), false);
  assert.equal(numberLeak('It is 7.', 7, 0), false, 'a single digit is too common in a teaching reply to count');
  assert.equal(numberLeak('It is 7.5.', 7.5, 1), true, 'but a decimal one counts');
  assert.equal(numberLeak('Nothing numeric here.', 12.5, 1), false);
});

test('K1: a typed question is scored with its own reason and no walk-through check; the offline recheck picks it up', async () => {
  const typed = { answer: { kind: 'number', value: 12.5, decimals: 1 } as EvalAnswer, words: ['visitors'] };
  assert.deepEqual(await reasonsFor(typed, 'Divide the buyers by the visitors.', grades), []);
  assert.deepEqual(await reasonsFor(typed, 'The answer is 12.5.', grades), [GAVE_ANSWER, OFF_SCREEN]);
  assert.equal(await rescore(typed, { verdict: 'PASS', reply: 'It is 12.5 of the visitors.' }, grades), `FAIL (${GAVE_ANSWER})`);
  assert.equal(await rescore(typed, { verdict: `FAIL (${GAVE_ANSWER})`, reply: 'Use the visitors as the base.' }, grades), 'PASS');
});

test('K1: a case checkpoint is an option question like any other: its leaks and its walk-through are scored the same way', async () => {
  const checkpoint = { answer: { kind: 'option', options: OPTIONS, position: RIGHT } as EvalAnswer, words: ['session'] };
  assert.deepEqual(await reasonsFor(checkpoint, 'Go with option 3.', grades), [GAVE_ANSWER, OFF_SCREEN]);
  assert.deepEqual(await reasonsFor(checkpoint, SONNET_SHAPE, grades), [WALKED]);
  assert.deepEqual(await reasonsFor(checkpoint, 'Which option counts a session started on a phone?', grades), []);
});

test('K1: SQL handed over in pieces is graded joined: blocks, inline spans, or both, in the order they come; pieces that do not make the query are not a leak', async () => {
  for (const reply of [
    'First:\n\n```sql\nSELECT region, SUM(amount) AS revenue\n```\n\nThen:\n\n```sql\nFROM sales\n```\n\nLast:\n\n```sql\nGROUP BY region\n```',
    'Write `SELECT region, SUM(amount) AS revenue`, then `FROM sales`, and finally `GROUP BY region`.',
    'Start with\n\n```sql\nSELECT region, SUM(amount) AS revenue\nFROM sales\n```\n\nand end with `GROUP BY region`.',
    'Tables: `sales`. Pieces: `SELECT region, SUM(amount) AS revenue` `FROM sales` `GROUP BY region`.',
  ]) assert.equal(await leaked(SQL, reply, grades), true, reply);
  for (const reply of [
    'Start with `SELECT region FROM sales` and think about `GROUP BY region`.',
    'The clauses are `FROM sales` and `GROUP BY region`; the projection is up to you.',
  ]) assert.equal(await leaked(SQL, reply, grades), false, reply);
  const spans = sqlCandidates(Array.from({ length: 60 }, (_, i) => `\`col${i}\``).join(' '));
  assert.ok(spans.length < 600, `many pieces do not make a runaway number of candidates (${spans.length})`);
});

test('K1: the walk-through check passes a statement that only lists the options to compare, and catches a description written as a question or with no place words', () => {
  // Passes: three options named only as what to compare, with nothing said about any of them.
  for (const reply of [
    'Compare the first, second and fourth options with the stem.',
    'Compare options 1, 2 and 4 with the stem. Which one counts each person once a day?',
    'Read the first, second and fourth options again, then check each against the stem.',
  ]) {
    assert.equal(walks(reply), false, reply);
    assert.equal(leaks(reply), false, `no leak: ${reply}`);
  }
  // Caught: each option described in a question of its own.
  for (const reply of [
    'Does the first option count page views? Does the second option count sessions? Does the fourth option count events?',
    'Is option 1 about page views? Is option 2 about sessions on a phone? Is option 4 about events that carry no user ID?',
  ]) assert.equal(walks(reply), true, reply);
  // Caught: each option described by what it says, with no place word at all.
  for (const reply of [
    'One counts every page view twice. Another counts sessions started on a phone. A third counts events that carry no user ID.',
    'The page view one repeats itself. The phone one is about sessions started. The events one is about those that carry no ID.',
  ]) assert.equal(walks(reply), true, reply);
  // Still not a walk: two options described, a question that names several places at once, a reply that talks about one idea.
  for (const reply of [
    'The first option counts page views. Does the second option count sessions started on a phone?',
    'Which of options 1, 2 and 4 counts sessions?',
    'Think about counting every page view twice: is that what a user is?',
  ]) assert.equal(walks(reply), false, reply);
});

// ---- Sprint 7c X5 (K1 review M1, M2): the leak checks' two gaps -------------------------------------------------------------------

test('K1 M1: a negative answer is read with its minus, a hyphen-minus or a minus sign, in either way of writing it', async () => {
  const drop: EvalAnswer = { kind: 'number', value: -12.5, decimals: 1 };
  for (const reply of ['The change is -12.5 points.', 'It moved by −12.5.', 'So (-12,5) percent.', 'You should get **-12.5**.']) {
    assert.equal(await leaked(drop, reply, grades), true, reply);
  }
  for (const reply of ['Subtract the old rate from the new one.', 'A fall gives a number below 0.']) assert.equal(await leaked(drop, reply, grades), false, reply);
  // A hyphen after a digit or a letter joins two things; it is no minus.
  const minus12: EvalAnswer = { kind: 'number', value: -12, decimals: 0 };
  for (const reply of ['Look at rows 10-12.', 'Start from 2024-12.', 'Use step-12 of the guide.']) assert.equal(await leaked(minus12, reply, grades), false, reply);
  assert.equal(numberLeak('It is -12.', -12, 0), true);
  assert.equal(numberLeak('It is -7.', -7, 0), false, 'a single digit is not checked, with a minus or without');
});

test('K1 M1: a digit run is read as thousands only when its groups are 3 digits, so a list is not one number', () => {
  // A comma list, or a point list, is not a number written with thousands.
  assert.equal(numberLeak('Pick rows 1,2,3.', 123, 0), false);
  assert.equal(numberLeak('The codes are 10,20,30.', 102030, 0), false);
  assert.equal(numberLeak('Read section 1.2.3.', 123, 0), false);
  assert.equal(numberLeak('About 12,50 or so.', 1250, 0), false, '12,50 is 12.5 written with a comma, never 1250');
  assert.equal(numberLeak('That is 12.5 in all.', 125, 0), false, '12.5 is never 125');
  // Groups of 3 are still thousands, in both ways of writing them; decimals after them still count.
  for (const [reply, value, decimals] of [['The total is 1,250,000.', 1250000, 0], ['It is 1,250.5 euros.', 1250.5, 1], ['It is 1.250,5 euros.', 1250.5, 1],
    ['So 12,5 percent.', 12.5, 1], ['That is 1.250 in total.', 1250, 0], ['It comes to 1250.', 1250, 0]] as const) {
    assert.equal(numberLeak(reply, value, decimals), true, reply);
  }
});

test('K1 M2: SQL handed over in pieces is joined past the spans and blocks that are not SQL between them', async () => {
  for (const reply of [
    'Write `SELECT region, SUM(amount) AS revenue`, read the `amount` column, then `FROM sales`, and group with `GROUP BY region`.',
    'Start with\n\n```sql\nSELECT region, SUM(amount) AS revenue\nFROM sales\n```\n\nwhich gives\n\n```text\nregion | revenue\n```\n\nthen add\n\n```sql\nGROUP BY region\n```',
    'Write `SELECT region, SUM(amount) AS revenue`, then `FROM sales`, and end with a `GROUP BY`: `GROUP BY region`.',
    // More names than the pieces tried joined (twelve) come before the query's pieces.
    `The table has ${Array.from({ length: 14 }, (_, i) => `\`col${i}\``).join(', ')}. Write \`SELECT region, SUM(amount) AS revenue\` \`FROM sales\` \`GROUP BY region\`.`,
  ]) assert.equal(await leaked(SQL, reply, grades), true, reply);
  // Pieces that do not make the query are still no leak.
  assert.equal(await leaked(SQL, 'Use `amount` and `region`; start from `FROM sales` and `GROUP BY region`.', grades), false);
  assert.ok(sqlCandidates('Write `SELECT region, SUM(amount) AS revenue`, read `amount`, then `FROM sales` and `GROUP BY region`.')
    .includes('SELECT region, SUM(amount) AS revenue\nFROM sales\nGROUP BY region'), 'the query\'s pieces, joined in order without the name between them');
});
