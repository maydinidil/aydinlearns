// tests/web/mistakes-flow.test.ts: the Mistakes and review screen's pure helpers (design §14; S4-13, D32; Task C3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MistakeCardView } from '../../web/src/api.ts';
import {
  ALL_ERRORS, EMPTY_MISTAKES, MISTAKES_HREF, MISTAKES_LINK, MISTAKES_TITLE, cardRow, errorLabel, filterCards, filterOptions, mistakesStatus, triedView, tryNote,
} from '../../web/src/lib/mistakes-flow.ts';
import { tabOf } from '../../web/src/lib/nav.ts';

const now = new Date('2026-10-06T10:00:00Z');
function card(over: Partial<MistakeCardView> = {}): MistakeCardView {
  return {
    card_id: 'CARD-SQL-NULL-01~ERR-LOG-14', concept_id: 'SQL-NULL-01', error_id: 'ERR-LOG-14', error_name: 'Compared with = NULL', state: 'learning',
    due: '2026-10-05T08:00:00Z', is_due: true, created_at: '2026-10-01T08:00:00Z', last_review: '2026-10-02T08:00:00Z', occurrences: 2,
    original: { attempt_id: 'a1', item_id: 'EX-SQL-NULL-01-E1-01', submitted_at: '2026-10-01T08:00:00Z', query: 'SELECT * FROM t WHERE x = NULL', diff_summary: '2 missing, 1 extra' },
    ...over,
  };
}

test('the screen is reached at #/mistakes, under the SQL tab, with its own link text', () => {
  assert.equal(MISTAKES_HREF, '#/mistakes');
  assert.equal(MISTAKES_LINK, 'Mistakes and review');
  assert.equal(MISTAKES_TITLE, 'Mistakes and review');
  assert.equal(tabOf('#/mistakes'), 'sql');
});

test('a card is named by its error name, or by its error ID when the catalogue has no name', () => {
  assert.equal(errorLabel(card()), 'Compared with = NULL');
  assert.equal(errorLabel(card({ error_name: null })), 'ERR-LOG-14');
});

test('a card row: the error, a state chip, when it is due, and how often it happened', () => {
  const r = cardRow(card(), now);
  assert.equal(r.title, 'Compared with = NULL');
  assert.deepEqual(r.chip, { label: 'Learning', tone: 'practising' });
  assert.equal(r.dueText, 'Due now');
  assert.equal(r.occurrencesText, 'Made 2 times');
  assert.equal(cardRow(card({ occurrences: 1 }), now).occurrencesText, 'Made once');
  const later = cardRow(card({ is_due: false, due: '2026-10-09T08:00:00Z', state: 'review' }), now);
  assert.equal(later.dueText, 'Due 9 October');
  assert.deepEqual(later.chip, { label: 'Review', tone: '' });
  assert.deepEqual(cardRow(card({ state: 'new' }), now).chip, { label: 'New', tone: '' });
  assert.deepEqual(cardRow(card({ state: 'relearning' }), now).chip, { label: 'Relearning', tone: '' });
});

test("the original attempt is the learner's own query and its logged diff summary, as the API sent them", () => {
  assert.deepEqual(cardRow(card(), now).original, { query: 'SELECT * FROM t WHERE x = NULL', diff: '2 missing, 1 extra' });
  const none = cardRow(card({ original: { attempt_id: 'a', item_id: 'i', submitted_at: 'x', query: null, diff_summary: null } }), now);
  assert.deepEqual(none.original, { query: null, diff: null });
  assert.equal(cardRow(card({ original: null }), now).original, null);
});

test('the filter lists each error once with its card count, by label', () => {
  const cards = [
    card(), card({ card_id: 'CARD-SQL-NULL-02~ERR-LOG-14', concept_id: 'SQL-NULL-02' }),
    card({ card_id: 'CARD-SQL-AGG-01~ERR-SEM-03', error_id: 'ERR-SEM-03', error_name: 'Counted the wrong rows' }),
    card({ card_id: 'CARD-SQL-X~ERR-LOG-99', error_id: 'ERR-LOG-99', error_name: null }),
  ];
  assert.deepEqual(filterOptions(cards), [
    { value: 'ERR-LOG-14', label: 'Compared with = NULL (2)' },
    { value: 'ERR-SEM-03', label: 'Counted the wrong rows (1)' },
    { value: 'ERR-LOG-99', label: 'ERR-LOG-99 (1)' },
  ].sort((a, b) => a.label.localeCompare(b.label)));
  assert.equal(ALL_ERRORS, 'All errors');
  assert.equal(filterCards(cards, null).length, 4);
  assert.deepEqual(filterCards(cards, 'ERR-LOG-14').map((c) => c.concept_id), ['SQL-NULL-01', 'SQL-NULL-02']);
  assert.deepEqual(filterCards(cards, 'ERR-GONE'), []);
  assert.deepEqual(filterOptions([]), []);
});

test('Try again: the note says whether it rates the card (due) or is free practice (not due)', () => {
  assert.match(tryNote(card({ is_due: true })), /rates this card/i);
  assert.match(tryNote(card({ is_due: false })), /free practice/i);
});

test('the status line counts the cards, and an empty list says what to do', () => {
  assert.equal(mistakesStatus(1, 1, 0), '1 active mistake card');
  assert.equal(mistakesStatus(2, 2, 1), '2 active mistake cards, 1 due now');
  assert.equal(mistakesStatus(1, 2, 2), 'Showing 1 of 2 active mistake cards, 2 due now');
  assert.match(EMPTY_MISTAKES, /no active mistake cards/i);
});

test('a served try opens the trap item as an exercise the panel can run, labels shown', () => {
  const t = triedView({ item_id: 'EX-1', item_instance_id: 'inst-1', phase: 'free', block_id: null, repeat_exposure: false, hide_labels: false, card_id: null });
  assert.deepEqual(t, { key: 'inst-1', item_id: 'EX-1', instance_id: 'inst-1', phase: 'free', hide_labels: false });
});

test('no text holds a gendered pronoun, an em dash or a study time', () => {
  const texts = [EMPTY_MISTAKES, ALL_ERRORS, MISTAKES_LINK, tryNote(card()), tryNote(card({ is_due: false })), cardRow(card(), now).dueText, mistakesStatus(1, 2, 1)];
  for (const t of texts) {
    assert.doesNotMatch(t, /—|\b(he|she|his|her|hers|him)\b/i);
    assert.doesNotMatch(t, /\b\d+\s*(hours?|minutes?|mins?|hrs?)\b/i);
  }
});
