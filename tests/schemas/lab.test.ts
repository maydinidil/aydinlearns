// Sprint 5b, Task B1: the GA4 lab schema (schemas/lab.ts; D67, D69, design §8). validateLab refuses each malformed shape the
// plan lists, with Ruling 1 on tolerances; validateLabKey checks a key against its lab. Every lab and key here is invented
// (tests/fixtures/labs/), and no message ever quotes a key's answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EM_DASH, validateLab, validateLabGuide, validateLabKey, type Lab } from '../../schemas/lab.ts';
import { fixtureKey, fixtureLab, LAB_IDS, type Json } from '../helpers/lab-fixture.ts';

/** The problems of a fixture lab after `edit`; the fixture itself is valid, so each problem comes from the edit. */
const problemsAfter = async (id: string, edit: (l: Json) => void): Promise<string[]> => {
  const lab = await fixtureLab(id);
  edit(lab);
  return validateLab(lab);
};
const refused = async (id: string, edit: (l: Json) => void, why: RegExp): Promise<void> => {
  const problems = await problemsAfter(id, edit);
  assert.ok(problems.some((p) => why.test(p)), `expected a problem like ${why}, got: ${JSON.stringify(problems)}`);
};
const part = (l: Json, partId: string): Json => l.parts.find((p: Json) => p.id === partId);

test('the fixture labs are valid: every answer kind, check, rule kind and date kind', async () => {
  for (const id of LAB_IDS) assert.deepEqual(validateLab(await fixtureLab(id)), [], id);
  for (const bad of [null, [], 'LAB-12', 12]) assert.ok(validateLab(bad).length > 0);
});

test('a consistency part that no rule names is refused, and so is a structural part that is not a choice or multi', async () => {
  await refused('LAB-12', (l) => { l.rules = []; }, /P3: a consistency part must be named by a rule/);
  await refused('LAB-12', (l) => { part(l, 'P4').answer = 'text'; delete part(l, 'P4').options; }, /P4: a structural part must be a choice or multi/);
  await refused('LAB-12', (l) => { const p = part(l, 'P4'); p.answer = 'number'; p.unit = 'count'; delete p.options; }, /P4: a structural part must be a choice or multi/);
});

test('an ID that is not LAB- and two digits is refused', async () => {
  for (const id of ['LAB-1', 'LAB-123', 'lab-12', 'LAB-AB', 12]) await refused('LAB-12', (l) => { l.id = id; }, /^id must be LAB- and two digits/);
});

test('parts must be P1 to Pn in order', async () => {
  await refused('LAB-12', (l) => { l.parts.reverse(); }, /parts\[0\]: id must be P1/);
  await refused('LAB-12', (l) => { l.parts.splice(1, 1); }, /parts\[1\]: id must be P2/);
  await refused('LAB-12', (l) => { l.parts = []; }, /parts must list at least one part/);
});

test('a choice or multi part needs 2 or more options, none repeated', async () => {
  await refused('LAB-12', (l) => { part(l, 'P4').options = ['Teal marker']; }, /P4: a choice part needs at least 2 options/);
  await refused('LAB-20', (l) => { delete part(l, 'P4').options; }, /P4: a multi part needs at least 2 options/);
  await refused('LAB-20', (l) => { part(l, 'P4').options = ['Circle marker', 'Oval marker', 'circle marker ']; }, /P4: an option is repeated/);
});

test('options belong to choice and multi parts only', async () => {
  await refused('LAB-12', (l) => { part(l, 'P1').options = ['1', '2']; }, /P1: a number part has no options/);
  await refused('LAB-20', (l) => { part(l, 'P5').options = ['Yes', 'No']; }, /P5: a text part has no options/);
});

test('a number part needs a unit, and only a number part has one', async () => {
  await refused('LAB-12', (l) => { delete part(l, 'P3').unit; }, /P3: a number part needs a unit: count, percent or eur/);
  await refused('LAB-12', (l) => { part(l, 'P3').unit = 'usd'; }, /P3: a number part needs a unit: count, percent or eur/);
  await refused('LAB-12', (l) => { part(l, 'P4').unit = 'count'; }, /P4: only a number part has a unit/);
});

test('Ruling 1: a tolerance is required on a number re-check part and refused on every other part', async () => {
  await refused('LAB-12', (l) => { delete part(l, 'P1').tolerance; }, /P1: a number re-check part needs a tolerance/);
  await refused('LAB-20', (l) => { delete part(l, 'P2').tolerance; }, /P2: a number re-check part needs a tolerance/);
  await refused('LAB-12', (l) => { part(l, 'P3').tolerance = { points: 0.5 }; }, /P3: only a number re-check part has a tolerance/);
  await refused('LAB-20', (l) => { part(l, 'P1').tolerance = { exact: true }; }, /P1: only a number re-check part has a tolerance/);
  // A choice, multi or text re-check part compares exactly, with no tolerance: the fixtures' LAB-07 P1 and LAB-20 P1 are valid.
  assert.equal(part(await fixtureLab('LAB-07'), 'P1').tolerance, undefined);
  for (const t of [{ relative_pct: 0 }, { points: -1 }, { exact: false }, { relative_pct: 2, points: 1 }, {}, 'exact']) {
    await refused('LAB-12', (l) => { part(l, 'P1').tolerance = t; }, /P1: tolerance must be/);
  }
  for (const t of [{ relative_pct: 1 }, { points: 0.5 }, { exact: true }]) assert.deepEqual(await problemsAfter('LAB-12', (l) => { part(l, 'P1').tolerance = t; }), []);
});

test('a self_rubric part needs a rubric, and no other part has one', async () => {
  await refused('LAB-20', (l) => { delete part(l, 'P5').rubric; }, /P5: a self_rubric part needs a rubric/);
  await refused('LAB-20', (l) => { part(l, 'P5').rubric = '  '; }, /P5: a self_rubric part needs a rubric/);
  await refused('LAB-12', (l) => { part(l, 'P4').rubric = 'The screen shows a marker.'; }, /P4: only a self_rubric part has a rubric/);
});

test('a rule naming a missing part is refused', async () => {
  await refused('LAB-12', (l) => { l.rules[0].den = 'P9'; }, /rules\[0\] names P9, which is not a part of this lab/);
  await refused('LAB-20', (l) => { l.rules[0].of = 'P6'; }, /rules\[0\] names P6, which is not a part of this lab/);
  await refused('LAB-07', (l) => { l.rules[0].flag = 'P4'; }, /rules\[0\] names P4, which is not a part of this lab/);
  await refused('LAB-12', (l) => { l.rules[0].kind = 'between'; }, /rules\[0\]: kind must be at_most, rate or member/);
});

test('at_most and rate compare number parts only', async () => {
  await refused('LAB-20', (l) => { l.rules[0].of = 'P1'; }, /rules\[0\]: at_most compares number parts; P1 is not one/);
  await refused('LAB-12', (l) => { l.rules[0].pct = 'P4'; }, /rules\[0\]: rate compares number parts; P4 is not one/);
  await refused('LAB-12', (l) => { l.rules[0].points = 0; }, /rules\[0\]: rate needs points above 0/);
});

test('a member rule needs a multi set, a Yes or No choice flag, and a value that is one of the set\'s options', async () => {
  await refused('LAB-07', (l) => { l.rules[0].set = 'P3'; }, /rules\[0\]: member's set must be a multi part; P3 is not one/);
  await refused('LAB-07', (l) => { l.rules[0].flag = 'P3'; }, /rules\[0\]: member's flag must be a choice part with the options Yes and No; P3 is not one/);
  await refused('LAB-07', (l) => { part(l, 'P2').options = ['Yes', 'No', 'Maybe']; }, /member's flag must be a choice part with the options Yes and No/);
  await refused('LAB-07', (l) => { l.rules[0].value = 'refund'; }, /rules\[0\]: member's value must be one of P1's options/);
});

test('a recheck_range part belongs only in a lab dated last_28_days; recheck_fixed is allowed in any lab', async () => {
  await refused('LAB-20', (l) => { l.date = 'fixed_month'; }, /P1: a recheck_range part needs a lab dated last_28_days/);
  await refused('LAB-12', (l) => { part(l, 'P1').check = 'recheck_range'; }, /P1: a recheck_range part needs a lab dated last_28_days/);
  for (const date of ['fixed_month', 'last_28_days', 'none']) assert.deepEqual(await problemsAfter('LAB-07', (l) => { l.date = date; }), [], date);
  assert.deepEqual(await problemsAfter('LAB-20', (l) => { part(l, 'P1').check = 'recheck_fixed'; part(l, 'P2').check = 'recheck_fixed'; }), []);
});

test('an em dash anywhere is refused, named by where it is', async () => {
  const dash = String.fromCharCode(0x2014);
  await refused('LAB-12', (l) => { l.title = `An invented lab ${dash} with a dash`; }, /^title holds an em dash/);
  await refused('LAB-12', (l) => { l.steps[1] = `Set the range ${dash} the month.`; }, /^steps\[1\] holds an em dash/);
  await refused('LAB-12', (l) => { part(l, 'P4').options[2] = `Plum ${dash} marker`; }, /^parts\[3\]\.options\[2\] holds an em dash/);
  await refused('LAB-20', (l) => { part(l, 'P5').rubric = `It shows ${dash} the name.`; }, /^parts\[4\]\.rubric holds an em dash/);
  // The character itself, U+2014, and nothing else: a hyphen, an en dash or the digits 2014 are fine.
  assert.deepEqual([EM_DASH.length, EM_DASH.codePointAt(0)], [1, 0x2014]);
  for (const ok of ['An invented lab from 2014', 'An invented lab - with a hyphen', `An invented lab ${String.fromCharCode(0x2013)} with an en dash`]) {
    assert.deepEqual(await problemsAfter('LAB-12', (l) => { l.title = ok; }), [], ok);
  }
});

test('the other fields are checked too', async () => {
  const cases: [(l: Json) => void, RegExp][] = [
    [(l) => { l.version = 0; }, /^version must be a positive integer/],
    [(l) => { l.title = ''; }, /^title is missing/],
    [(l) => { l.concept_id = 'METRICS-01'; }, /^concept_id must be a GA4 concept ID/],
    [(l) => { l.topic_id = 'T-GA4-2'; }, /^topic_id must be a GA4 topic such as T-GA4-02/],
    [(l) => { l.property = 'GA'; }, /^property must be MS or FI/],
    [(l) => { l.path = ''; }, /^path is missing/],
    [(l) => { l.path_verified = 'no'; }, /^path_verified must be true or false/],
    [(l) => { l.date = 'yesterday'; }, /^date must be fixed_month, last_28_days or none/],
    [(l) => { l.steps = []; }, /^steps must list at least one step/],
    [(l) => { l.rules = null; }, /^rules must be a list/],
    [(l) => { l.interview_relevant = 1; }, /^interview_relevant must be true or false/],
    [(l) => { l.source_ids = 'test'; }, /^source_ids must be a list of source IDs/],
    [(l) => { l.as_of = '9 Oct 2026'; }, /^as_of must be YYYY-MM-DD/],
    [(l) => { part(l, 'P4').question = ''; }, /^P4: question is missing/],
    [(l) => { part(l, 'P4').answer = 'pick'; }, /^P4: answer must be choice, multi, number or text/],
    [(l) => { part(l, 'P4').check = 'guess'; }, /^P4: check must be structural, consistency, recheck_fixed, recheck_range or self_rubric/],
    [(l) => { l.parts[1] = 'P2'; }, /^parts\[1\] must be an object/],
  ];
  for (const [edit, why] of cases) await refused('LAB-12', edit, why);
  // Empty source_ids are left to C45, which names the lab; the schema only needs a list.
  assert.deepEqual(await problemsAfter('LAB-12', (l) => { l.source_ids = []; }), []);
});

test('validateLabKey: the fixture keys fit their labs', async () => {
  for (const id of LAB_IDS) assert.deepEqual(validateLabKey(await fixtureKey(id), (await fixtureLab(id)) as Lab), [], id);
  const lab = (await fixtureLab('LAB-12')) as Lab;
  assert.deepEqual(validateLabKey({ ...(await fixtureKey('LAB-12')), solver: null }, lab), [], 'solver may be null before the blind solve');
  for (const bad of [null, [], 'key']) assert.deepEqual(validateLabKey(bad, lab), ['a lab key must be an object']);
});

/** The problems of a fixture key after `edit`, against its fixture lab. None may quote the key's answers. */
const keyProblems = async (id: string, edit: (k: Json) => void): Promise<string[]> => {
  const key = await fixtureKey(id);
  const answers = JSON.stringify(Object.values(key.structural));
  edit(key);
  const problems = validateLabKey(key, (await fixtureLab(id)) as Lab);
  for (const p of problems) for (const secret of ['Teal marker', 'Invented B', 'Circle marker', 'Oval marker']) assert.ok(!p.includes(secret), `a message quotes key text: ${answers}`);
  return problems;
};
const keyRefused = async (id: string, edit: (k: Json) => void, why: RegExp): Promise<void> => {
  const problems = await keyProblems(id, edit);
  assert.ok(problems.some((p) => why.test(p)), `expected a problem like ${why}, got: ${JSON.stringify(problems)}`);
};

test('validateLabKey: every structural part has a key, and no other part has one', async () => {
  await keyRefused('LAB-12', (k) => { delete k.structural.P4; }, /^P4 is a structural part with no key/);
  await keyRefused('LAB-12', (k) => { k.structural.P1 = '1000'; }, /^P1 is not a structural part of LAB-12, so it has no key/);
  await keyRefused('LAB-12', (k) => { k.structural.P9 = 'x'; }, /^P9 is not a structural part of LAB-12, so it has no key/);
  await keyRefused('LAB-12', (k) => { k.structural = ['Teal marker']; }, /^structural must map part IDs to answers/);
});

test('validateLabKey: a choice key is one of its options, a multi key some of its options, each once', async () => {
  await keyRefused('LAB-12', (k) => { k.structural.P4 = 'Mint marker'; }, /^P4's key must be one of its options/);
  await keyRefused('LAB-12', (k) => { k.structural.P4 = ['Teal marker']; }, /^P4's key must be one of its options/);
  await keyRefused('LAB-20', (k) => { k.structural.P4 = ['Circle marker', 'Hexagon marker']; }, /^P4's key must list some of its options, each once/);
  await keyRefused('LAB-20', (k) => { k.structural.P4 = ['Circle marker', 'Circle marker']; }, /^P4's key must list some of its options, each once/);
  await keyRefused('LAB-20', (k) => { k.structural.P4 = []; }, /^P4's key must list some of its options, each once/);
  await keyRefused('LAB-20', (k) => { k.structural.P4 = 'Circle marker'; }, /^P4's key must list some of its options, each once/);
});

test('validateLabKey: the key names its lab, a version, and solver records for structural parts only', async () => {
  await keyRefused('LAB-12', (k) => { k.lab_id = 'LAB-07'; }, /^lab_id must be LAB-12, the lab it keys/);
  await keyRefused('LAB-12', (k) => { k.lab_version = 0; }, /^lab_version must be a positive integer/);
  await keyRefused('LAB-12', (k) => { delete k.solver; }, /^solver must be null or map structural part IDs to records/);
  await keyRefused('LAB-12', (k) => { k.solver.P1 = { answer: '1000', pass: true, lab_version: 1, at: '2026-10-09T10:00:00.000Z' }; }, /^solver names P1, which is not a structural part of LAB-12/);
  await keyRefused('LAB-12', (k) => { k.solver.P4.pass = 'yes'; }, /^solver P4 needs answer, pass, at/);
  await keyRefused('LAB-12', (k) => { k.solver.P4.at = 'today'; }, /^solver P4 needs answer, pass, at/);
  await keyRefused('LAB-12', (k) => { k.solver.P4.answer = 4; }, /^solver P4 needs answer, pass, at/);
  await keyRefused('LAB-12', (k) => { delete k.solver.P4.lab_version; }, /^solver P4 needs answer, pass, at \(an ISO time\) and lab_version \(a positive integer\)/);
  await keyRefused('LAB-12', (k) => { k.solver.P4.lab_version = 0; }, /^solver P4 needs answer, pass, at/);
  await keyRefused('LAB-12', (k) => { k.solver.P4.lab_version = '1'; }, /^solver P4 needs answer, pass, at/);
  await keyRefused('LAB-12', (k) => { k.solver.P4.lab_version = 1.5; }, /^solver P4 needs answer, pass, at/);
  // A stale lab_version is valid shape: C44 names it.
  assert.deepEqual(await keyProblems('LAB-12', (k) => { k.lab_version = 3; }), []);
});

test('validateLabGuide: a title, a body, source IDs and a date', async () => {
  const guide = { title: 'Getting in', body_md: 'Open the account.', source_ids: ['07:S1'], as_of: '2026-10-09' };
  assert.deepEqual(validateLabGuide(guide), []);
  assert.deepEqual(validateLabGuide(null), ['the guide must be an object']);
  assert.ok(validateLabGuide({ ...guide, title: '' }).some((p) => /^title is missing/.test(p)));
  assert.ok(validateLabGuide({ ...guide, body_md: 3 }).some((p) => /^body_md is missing/.test(p)));
  assert.ok(validateLabGuide({ ...guide, source_ids: 'x' }).some((p) => /^source_ids must be a list of source IDs/.test(p)));
  assert.ok(validateLabGuide({ ...guide, as_of: 'soon' }).some((p) => /^as_of must be YYYY-MM-DD/.test(p)));
});

test('a part label is optional, short, and free of em dashes', async () => {
  assert.deepEqual(await problemsAfter('LAB-12', (l) => { part(l, 'P1').label = 'a'.repeat(40); }), []);
  assert.deepEqual(await problemsAfter('LAB-12', (l) => { delete part(l, 'P1').label; }), []);
  await refused('LAB-12', (l) => { part(l, 'P1').label = ''; }, /^P1: label must be 1 to 40 characters of text/);
  await refused('LAB-12', (l) => { part(l, 'P1').label = '   '; }, /^P1: label must be 1 to 40 characters of text/);
  await refused('LAB-12', (l) => { part(l, 'P1').label = 7; }, /^P1: label must be 1 to 40 characters of text/);
  await refused('LAB-12', (l) => { part(l, 'P1').label = 'a'.repeat(41); }, /^P1: label must be 1 to 40 characters of text/);
  await refused('LAB-12', (l) => { part(l, 'P1').label = `Sessions ${String.fromCharCode(0x2014)} all`; }, /^parts\[0\]\.label holds an em dash/);
});
