// Sprint 6 Task K6 (block K, the backlog's content rows): the solver ambiguity notes, loose trap labels, SQL-CLEAN-01 wording,
// level 4 case wording, Methodology wording (E-182) and the Business Care Year price. Failure messages name IDs only
// (non-negotiable 2): no key text, no value and no correct option.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const read = async (p: string): Promise<Json> => JSON.parse(await readFile(p, 'utf8'));
const sqlItem = (id: string) => read(`content/sql/items/${id}.json`);
const sqlKey = (id: string) => read(`content/keys/sql/${id}.json`);
const caseOf = async (id: string): Promise<Json> =>
  read(id.startsWith('CASE-VOLT-') ? `content/sql/openers/${id}.json` : `content/sql/cases/${id}.json`);
const cp = (c: Json, id: string): Json => c.checkpoints.find((x: { id: string }) => x.id === id);

/** A changed SQL item carries a raised version, and its key the same item_version. */
async function raised(id: string, atLeast: number): Promise<void> {
  const [i, k] = [await sqlItem(id), await sqlKey(id)];
  assert.ok(i.version >= atLeast, `${id} version`);
  assert.equal(k.item_version, i.version, `${id} key item_version`);
}

// ---- SQL solver notes --------------------------------------------------------------------------------------------------------------

test('CASE-DAILY-L3-02 CP4 says what kind of value order_ts is before the Amsterdam conversion', async () => {
  const p = cp(await caseOf('CASE-DAILY-L3-02'), 'CP4').prompt;
  assert.match(p, /TIMESTAMP with no time zone/, 'CASE-DAILY-L3-02 CP4');
  assert.match(p, /UTC/, 'CASE-DAILY-L3-02 CP4');
  assert.match(p, /turn order_ts into Amsterdam time first/, 'CASE-DAILY-L3-02 CP4');
});

test('CASE-PRICE-01 CP2 and CP4 name the units column, and CP4 names the category by its category_name', async () => {
  const c = await caseOf('CASE-PRICE-01');
  for (const id of ['CP2', 'CP4']) assert.match(cp(c, id).prompt, /\bquantity\b/, `CASE-PRICE-01 ${id}`);
  assert.match(cp(c, 'CP4').prompt, /category_name is 'Headphones'/, 'CASE-PRICE-01 CP4');
});

test('CASE-PRICE-02 CP2 and CP4 say which date counts and which column holds the competitor price', async () => {
  const c = await caseOf('CASE-PRICE-02');
  for (const id of ['CP2', 'CP4']) {
    const p = cp(c, id).prompt;
    assert.match(p, /avg_competitor_price_eur in competitor_price_weekly/, `CASE-PRICE-02 ${id}`);
    assert.match(p, /UTC order date from Monday 2025-03-10 to Sunday 2025-03-16, both days included/, `CASE-PRICE-02 ${id}`);
    assert.doesNotMatch(p, /with days in UTC/, `CASE-PRICE-02 ${id}`);
  }
  // K6 fix round: CP4 says quantity, as CASE-PRICE-01's checkpoints do.
  assert.match(cp(c, 'CP4').prompt, /quantity times the product's average competitor price/, 'CASE-PRICE-02 CP4');
  assert.doesNotMatch(cp(c, 'CP4').prompt, /\bunits times\b/, 'CASE-PRICE-02 CP4');
});

test('CASE-VOLT-L3 CP1 says which lines carry a promotion and what a correct row needs, and the one-query plan says what it adds up', async () => {
  const one = cp(await caseOf('CASE-VOLT-L3'), 'CP1');
  assert.match(one.prompt, /promo_id/, 'CASE-VOLT-L3 CP1');
  assert.match(one.prompt, /each order line counted once/, 'CASE-VOLT-L3 CP1');
  const oneQuery = one.options.find((o: { oid: string }) => o.oid === 'o26c39f6');
  assert.match(oneQuery.text, /in one query/, 'CASE-VOLT-L3 CP1 o26c39f6');
  assert.match(oneQuery.text, /add up the joined rows/, 'CASE-VOLT-L3 CP1 o26c39f6');
});

test('EX-SQL-JOIN-03-E3-04 says the conversions count whether they came before or after the assignments', async () => {
  const i = await sqlItem('EX-SQL-JOIN-03-E3-04');
  assert.doesNotMatch(i.prompt, /at any time/, i.id);
  assert.match(i.prompt, /whether it came before or after the customer's assignments/, i.id);
  await raised(i.id, 3);
});

// ---- Loose trap labels -------------------------------------------------------------------------------------------------------------

test('EX-SQL-STR-01-E3-22: no ERR-LOG-32 plant tests the spaces check with TRIM, and its ERR-LOG-22 plant is a LIKE pattern missing a wildcard', async () => {
  const k = await sqlKey('EX-SQL-STR-01-E3-22');
  // Key SQL is tested with assert.ok, so a failure prints the ID only, never the query (non-negotiable 2).
  for (const p of k.planted_wrong) if (p.error_id === 'ERR-LOG-32') assert.ok(!/sku <> TRIM\(sku\)/.test(p.sql), `${k.item_id} ${p.id}`);
  const like = k.planted_wrong.filter((p: { error_id: string }) => p.error_id === 'ERR-LOG-22');
  assert.equal(like.length, 1, k.item_id);
  assert.ok(/sku LIKE '% '/.test(like[0].sql), `${k.item_id} ${like[0].id}`);
});

test('EX-SQL-SUBQ-01-E3-02 and E3-21: each ERR-LOG-11 plant is a LEFT JOIN where an inner join was needed', async () => {
  for (const id of ['EX-SQL-SUBQ-01-E3-02', 'EX-SQL-SUBQ-01-E3-21']) {
    const k = await sqlKey(id);
    const wrongJoin = k.planted_wrong.filter((p: { error_id: string }) => p.error_id === 'ERR-LOG-11');
    assert.equal(wrongJoin.length, 1, id);
    assert.ok(/\bLEFT JOIN\b/.test(wrongJoin[0].sql), `${id} ${wrongJoin[0].id}`);
    assert.ok(!/\bEXISTS\b/.test(wrongJoin[0].sql), `${id} ${wrongJoin[0].id}`);
  }
});

// ---- SQL-CLEAN-01 wording ----------------------------------------------------------------------------------------------------------

test('EX-SQL-CLEAN-01-E2-05 names the lines whose prices are divided by 100', async () => {
  const i = await sqlItem('EX-SQL-CLEAN-01-E2-05');
  assert.doesNotMatch(i.prompt, /each of those lines/, i.id);
  assert.match(i.prompt, /every BE-07 order line of June 2024/, i.id);
  await raised(i.id, 2);
});

test('EX-SQL-CLEAN-01-E2-04 says an open window never ends, and its key treats an open earlier window as E1-06 and E2-22 do', async () => {
  const i = await sqlItem('EX-SQL-CLEAN-01-E2-04');
  assert.match(i.prompt, /an open window never ends/, i.id);
  assert.match(i.prompt, /shared_days is missing when both windows are still open/, i.id);
  await raised(i.id, 2);
  const k = await sqlKey(i.id);
  const open = /a\.valid_to IS NULL OR b\.valid_from <=? a\.valid_to/;
  for (const [what, sql] of [['reference', k.reference_sql], ...k.alternatives.map((a: string, n: number) => [`alternative ${n + 1}`, a]),
    ['other way', k.other_way.sql], ['hint 3', k.hint3_partial], ...k.planted_wrong.map((p: { id: string; sql: string }) => [p.id, p.sql])]) {
    assert.ok(open.test(sql), `${i.id} ${what}`);
  }
});

// ---- Level 4 case wording ----------------------------------------------------------------------------------------------------------

test('CASE-PRICE-03 and -04 CP5: the correct option is not the longest', async () => {
  for (const id of ['CASE-PRICE-03', 'CASE-PRICE-04']) {
    const five = cp(await caseOf(id), 'CP5');
    const right = (await read(`content/keys/cases/${id}.json`)).choices.CP5.correct_oid;
    const wrong = five.options.filter((o: { oid: string }) => o.oid !== right);
    const rightLength = five.options.find((o: { oid: string }) => o.oid === right).text.length;
    assert.ok(wrong.some((o: { text: string }) => o.text.length > rightLength), `${id} CP5 length`);
  }
  // CASE-PRICE-04 also keeps a wrong option that does not say Yes.
  const four = cp(await caseOf('CASE-PRICE-04'), 'CP5');
  const right4 = (await read('content/keys/cases/CASE-PRICE-04.json')).choices.CP5.correct_oid;
  assert.ok(four.options.some((o: { oid: string; text: string }) => o.oid !== right4 && !/^Yes\b/.test(o.text)), 'CASE-PRICE-04 CP5 stance');
});

// K6 fix round, controller: position 2 keeps its "No" stance (any dip after the promotion read as failure), so the wrong
// options do not all open with "Yes" and the one "Not yet" option is not singled out by its stance.
test('CASE-PRICE-03 CP5: the option in position 2 is a "No" over the weeks after the promotion, so not every wrong option says Yes', async () => {
  const five = cp(await caseOf('CASE-PRICE-03'), 'CP5');
  const second = five.options[1];
  assert.equal(second.oid, 'of4bb525', 'CASE-PRICE-03 CP5 position 2');
  assert.match(second.text, /^No\b/, 'CASE-PRICE-03 CP5 of4bb525');
  assert.match(second.text, /weeks after/, 'CASE-PRICE-03 CP5 of4bb525');
  assert.ok(five.options.filter((o: { text: string }) => /^Yes\b/.test(o.text)).length < 3, 'CASE-PRICE-03 CP5 stances');
});

test('CASE-DQ-05 CP4 names the pairs-first step, as its CP3 item does, so the natural query stays small (K8 fix)', async () => {
  const p = cp(await caseOf('CASE-DQ-05'), 'CP4').prompt;
  assert.match(p, /Work in two steps/, 'CASE-DQ-05 CP4');
  assert.match(p, /first find each pair of overlapping windows and the days they share/, 'CASE-DQ-05 CP4');
  assert.match(p, /the window that starts first holds the old price/, 'CASE-DQ-05 CP4');
});

// A real dataset's money is in its own currency (P42 to P45); every other case reads euros (E-086: Mailvora's clean spend is EUR).
const CURRENCY_OF_SCHEMA: Readonly<Record<string, string>> = { online_retail_ii: 'pounds sterling', breakfast_at_the_frat: 'US dollars' };

test('every case money answer names its unit in words: euros, or a real dataset\'s own currency', async () => {
  for (const dir of ['content/sql/cases', 'content/sql/openers']) {
    for (const f of await readdir(dir)) {
      const c = await read(`${dir}/${f}`);
      const unit = CURRENCY_OF_SCHEMA[c.schema ?? 'voltmarkt'] ?? 'euros';
      for (const x of c.checkpoints) if (x.typed?.precision === 'money') assert.equal(x.typed.unit_label, unit, `${c.case_id} ${x.id}`);
    }
  }
});

test('CASE-PRICE-05: neither the brief nor CP5 restates CP1\'s subject', async () => {
  const c = await caseOf('CASE-PRICE-05');
  assert.doesNotMatch(c.brief.decision, /one quarter only/, c.case_id);
  assert.doesNotMatch(cp(c, 'CP5').prompt, /one quarter only/, `${c.case_id} CP5`);
});

test('CASE-RETAIL-03 CP4 example shows no sign of its own', async () => {
  const p = cp(await caseOf('CASE-RETAIL-03'), 'CP4').prompt;
  assert.match(p, /for example \d+\.\d or -\d+\.\d\.$/, 'CASE-RETAIL-03 CP4');
});

// ---- Methodology wording -----------------------------------------------------------------------------------------------------------

const PERCENT_ITEMS = ['Q-ECON-PRICE-02-01', 'Q-ECON-PRICE-02-03', 'Q-ECON-PRICE-04-02', 'Q-ECON-PRICE-05-01'];

test('E-182: the ECON-PRICE-02, -04 and -05 typed stems ask for percent, not "as a percentage"', async () => {
  for (const id of PERCENT_ITEMS) {
    const i = await read(`content/methodology/items/${id}.json`);
    assert.doesNotMatch(i.stem, /as a percentage/, id);
    assert.match(i.stem, /\bin percent\b/, id);
    assert.ok(i.version >= 2, `${id} version`);
    assert.equal((await read(`content/keys/methodology/${id}.json`)).item_version, i.version, `${id} key item_version`);
  }
});

/** Ruling P30: Business Care Year costs €420 a year everywhere, as the MET-SAAS-01 and -03 readings give it. */
const PRICED_YEAR_PLAN: Record<string, number> = {
  // item ID -> the version that first carries the €420 price (K6 and its fix round)
  'Q-MET-SAAS-01-01': 3, 'Q-MET-SAAS-01-06': 3, 'Q-MET-SAAS-03-02': 1, 'Q-MET-SAAS-03-06': 1, 'Q-MET-SAAS-09-02': 2,
};
const yearlyFees = (text: string): string[] =>
  [...text.matchAll(/Business Care Year[^.]*?€([\d,]+) (?:a year|in [A-Z][a-z]+ for the whole year)|€([\d,]+) a year[^.]*?Business Care Year|paid €([\d,]+) [^.]*?for the whole year/g)]
    .map((m) => m[1] ?? m[2] ?? m[3]!);

test('P30: every Methodology item and reading that prices Business Care Year gives €420 a year', async () => {
  const seen = new Set<string>();
  for (const dir of ['content/methodology/items', 'content/methodology/readings']) {
    for (const f of await readdir(dir)) {
      const j = await read(`${dir}/${f}`);
      const text = JSON.stringify(j);
      if (!/Business Care Year/.test(text)) continue;
      const fees = yearlyFees(text);
      for (const fee of fees) assert.equal(fee, '420', `${f} prices Business Care Year`);
      if (fees.length > 0 && dir.endsWith('items')) seen.add(j.id);
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(PRICED_YEAR_PLAN).sort(), 'the items that price Business Care Year');
  for (const [id, atLeast] of Object.entries(PRICED_YEAR_PLAN)) {
    const i = await read(`content/methodology/items/${id}.json`);
    assert.ok(i.version >= atLeast, `${id} version`);
    const k = await read(`content/keys/methodology/${id}.json`);
    assert.equal(k.item_version, i.version, `${id} key item_version`);
    // The old price showed up as a twelfth of €480; other 480s (40 × 12 in Q-MET-SAAS-03-02) are not a plan price.
    assert.ok(!/480 \/ 12/.test(k.explanation), `${id} explanation`);
  }
});
