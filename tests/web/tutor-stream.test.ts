// tests/web/tutor-stream.test.ts: the reply stream (T-08): the text before U+001E, and the JSON summary after it; and the ask call that
// reads it as it streams (spec §4, §10): the reply growing, a refusal with its line and code, and a stream that breaks before its summary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUMMARY_MARK, type TutorAskBody } from '../../schemas/tutor.ts';
import { ApiError } from '../../web/src/api.ts';
import { shownText, splitReply } from '../../web/src/tutor/stream.ts';
import { tutorAsk } from '../../web/src/tutor/tutor-api.ts';

const summary = { outcome: 'answered', message: null, cost_usd: 0.0002, spent_today_usd: 0.01, cap_usd: 1, counted: true };

test('a finished stream splits into the reply and its summary', () => {
  assert.deepEqual(splitReply(`Look at the WHERE clause.${SUMMARY_MARK}${JSON.stringify(summary)}`), { reply: 'Look at the WHERE clause.', summary });
});

test('no mark yet, or a summary that is not JSON: the reply alone', () => {
  assert.deepEqual(splitReply('Look at'), { reply: 'Look at', summary: null });
  assert.deepEqual(splitReply(`Look${SUMMARY_MARK}{not json`), { reply: 'Look', summary: null });
  assert.equal(shownText(`Look at${SUMMARY_MARK}{"outcome"`), 'Look at');
});

const body: TutorAskBody = { screen: 'item', subject_id: 'EX-1', snapshot: '## Exercise EX-1', item: { item_id: 'EX-1', item_instance_id: 'I-1', phase: 'free' }, thread: [], question: 'Why?' };
type Mock = { mock: { method: (o: object, name: string, impl: unknown) => unknown } };
/** A reply body that sends `chunks` one read at a time, then ends, or breaks when `fail` is set (after the chunks were read). */
function streamed(chunks: string[], fail = false): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const left = [...chunks];
  return new ReadableStream({
    pull(c) {
      const x = left.shift();
      if (x !== undefined) c.enqueue(enc.encode(x));
      else if (fail) c.error(new TypeError('network error'));
      else c.close();
    },
  }, { highWaterMark: 0 });
}

test('the ask call posts the question and gives the reply as it grows, the summary kept out of it', async (t: Mock) => {
  const sent: { path: string; init: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, init: RequestInit) => {
    sent.push({ path, init });
    return new Response(streamed(['Look at ', 'the WHERE clause.', `${SUMMARY_MARK}${JSON.stringify(summary)}`]), { status: 200 });
  });
  const shown: string[] = [];
  const r = await tutorAsk(body, (s) => shown.push(s), new AbortController().signal);
  assert.deepEqual(r, { reply: 'Look at the WHERE clause.', summary });
  assert.equal(sent[0]!.path, '/api/tutor/ask');
  assert.equal(sent[0]!.init.method, 'POST');
  assert.deepEqual(JSON.parse(String(sent[0]!.init.body)), body);
  assert.equal(shown.at(-1), 'Look at the WHERE clause.');
  assert.ok(shown.every((s) => !s.includes(SUMMARY_MARK)), 'the mark and the summary are never shown');
});

test('a refusal throws the server\'s line, its status and its code', async (t: Mock) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: "Today's tutor budget is used up.", code: 'capped' }), { status: 429, headers: { 'content-type': 'application/json' } }));
  await assert.rejects(tutorAsk(body, () => {}, new AbortController().signal),
    (e: unknown) => e instanceof ApiError && e.status === 429 && e.message === "Today's tutor budget is used up." && (e.body as { code?: string }).code === 'capped');
});

test('a stream that breaks before its summary gives the part that arrived and no summary (spec §10: the reply was cut off)', async (t: Mock) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(streamed(['Look at '], true), { status: 200 }));
  assert.deepEqual(await tutorAsk(body, () => {}, new AbortController().signal), { reply: 'Look at ', summary: null });
});

test('a question the panel stopped is not a failure to show: the abort comes back as it is', async (t: Mock) => {
  const ac = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => { ac.abort(); throw new DOMException('The operation was aborted.', 'AbortError'); });
  await assert.rejects(tutorAsk(body, () => {}, ac.signal), (e: unknown) => !(e instanceof ApiError) && (e as Error).name === 'AbortError');
});
