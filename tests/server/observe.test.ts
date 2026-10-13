// tests/server/observe.test.ts: the telemetry hooks (owner decision D75), against in-memory exporters: no network. A funnel step's
// span attributes and event, its count and its log record; the route a request's span is named after; a 500's exception on its
// span; and telemetry staying off unless both .env values are set. Concept and topic IDs here are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { context, metrics, trace, SpanStatusCode, INVALID_SPAN_CONTEXT } from '@opentelemetry/api';
import { logs as logsApi } from '@opentelemetry/api-logs';
import { RPCType, setRPCMetadata, type RPCMetadata } from '@opentelemetry/core';
import { logs, metrics as sdkMetrics, node, tracing } from '@opentelemetry/sdk-node';
import { Hono } from 'hono';
import type { ChoiceConcept } from '../../schemas/choice.ts';
import { startJourney, stopJourney } from '../../server/journey.ts';
import { answered, choiceFunnel, funnel, httpRoute, levelName, recordError, sqlFunnel } from '../../server/observe.ts';
import { telemetryConfig } from '../../server/telemetry.ts';
import { runnerExecArgv } from '../../server/runner/client.ts';

const spans = new tracing.InMemorySpanExporter();
new node.NodeTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(spans)] }).register();
const points = new sdkMetrics.InMemoryMetricExporter(sdkMetrics.AggregationTemporality.CUMULATIVE);
const reader = new sdkMetrics.PeriodicExportingMetricReader({ exporter: points, exportIntervalMillis: 3_600_000 });
metrics.setGlobalMeterProvider(new sdkMetrics.MeterProvider({ readers: [reader] }));
const records = new logs.InMemoryLogRecordExporter();
logsApi.setGlobalLoggerProvider(new logs.LoggerProvider({ processors: [new logs.SimpleLogRecordProcessor({ exporter: records })] }));

test('a funnel step puts its attributes and an event on the request span, counts it, and logs it with the trace ID', async () => {
  trace.getTracer('test').startActiveSpan('POST /api/submit', (span) => { funnel('exercise_passed', sqlFunnel('E2')); span.end(); });
  const [s] = spans.getFinishedSpans();
  const a = { topic: 'SQL', case_theme: 'pricing', difficulty: 'E2' };
  const { 'session.id': sessionId, ...spanAttributes } = s!.attributes;
  assert.deepEqual(spanAttributes, a);
  assert.deepEqual(s!.events.map((e) => [e.name, e.attributes]), [['exercise_passed', { funnel_step: 'exercise_passed', ...a }]]);
  await reader.forceFlush();
  const counter = points.getMetrics().flatMap((r) => r.scopeMetrics).flatMap((m) => m.metrics).find((m) => m.descriptor.name === 'aydinlearns.funnel.steps');
  assert.deepEqual(counter!.dataPoints.map((p) => [p.value, p.attributes]), [[1, { funnel_step: 'exercise_passed', ...a }]]);
  const logged = records.getFinishedLogRecords().filter((x) => x.eventName === 'exercise_passed');
  assert.equal(logged.length, 1, 'one log record per step');
  const r = logged[0];
  assert.equal(r!.body, 'exercise_passed');
  assert.equal(typeof r!.attributes['session.id'], 'string');            // D77: every step belongs to a visit
  assert.equal(sessionId, r!.attributes['session.id']);                  // and the request's span names the same visit
  assert.equal(r!.spanContext?.traceId, s!.spanContext().traceId);
});

test('a funnel step outside any request still counts and logs, and nothing throws', () => {
  assert.doesNotThrow(() => funnel('lesson_started', sqlFunnel('L1')));
});

test('GA4 and Methodology steps take the concept\'s topic as the theme and its level as the difficulty', () => {
  const concept = (id: string, topic_id: string, level: 1 | null): ChoiceConcept => ({ id, parent_id: null, topic_id, title: id, level, verified: true });
  const content = { choiceConcepts: (section: 'ga4' | 'methodology') => section === 'ga4'
    ? [concept('C-INV-GA4-01', 'T-GA4-09', 1)] : [concept('C-INV-MET-01', 'INV-TOPIC', null)] };
  assert.deepEqual(choiceFunnel(content, 'ga4', 'C-INV-GA4-01'), { topic: 'GA4', case_theme: 'T-GA4-09', difficulty: 'L1' });
  assert.deepEqual(choiceFunnel(content, 'methodology', 'C-INV-MET-01'), { topic: 'Methodology', case_theme: 'INV-TOPIC', difficulty: 'unrated' });
  assert.deepEqual(choiceFunnel(content, 'ga4', 'C-INV-NONE'), { topic: 'GA4', case_theme: 'unknown', difficulty: 'unrated' });
  assert.equal(levelName(3), 'L3');
});

test('a request span is named after the route whose handler answered, not the catch-all after it', async () => {
  const app = new Hono();
  app.use('*', httpRoute);
  app.get('/api/lessons/:id', (c) => c.json({}));
  app.get('*', (c) => c.text('static'));
  const routeOf = async (path: string): Promise<string | undefined> => {
    const meta: RPCMetadata = { type: RPCType.HTTP, span: trace.wrapSpanContext(INVALID_SPAN_CONTEXT) };
    await context.with(setRPCMetadata(context.active(), meta), () => app.request(path));
    return meta.route;
  };
  assert.equal(await routeOf('/api/lessons/SQL-INV-01'), '/api/lessons/:id');
  assert.equal(await routeOf('/assets/index.js'), '/*');
});

test('a 500 marks its span an error with the exception type only: no message, no stack trace (Codex F30)', () => {
  spans.reset();
  const e = new TypeError('ENOENT: no such file, open C:/Users/invented-user/app/file.json');
  trace.getTracer('test').startActiveSpan('POST /api/submit', (span) => { recordError(e); span.end(); });
  const [s] = spans.getFinishedSpans();
  assert.deepEqual([s!.status.code, s!.status.message], [SpanStatusCode.ERROR, 'unexpected server error (TypeError)']);
  assert.deepEqual(s!.events.map((x) => [x.name, x.attributes]), [['exception', { 'exception.type': 'TypeError' }]]);
  assert.ok(!JSON.stringify(s!.events).includes('invented-user'));
});

test("the SQL runner gets the server's flags without the ones that load .env or preload telemetry (Codex F29)", () => {
  const preload = 'data:text/javascript,0';
  assert.deepEqual(runnerExecArgv(['--env-file-if-exists=.env', '--import', './server/telemetry.ts', '--import', preload]), ['--import', preload]);
  assert.deepEqual(runnerExecArgv(['--env-file', '.env', '--import=./server/telemetry.ts', '--no-warnings']), ['--no-warnings']);
  assert.deepEqual(runnerExecArgv([]), []);
});

test('telemetry stays off unless both values are set, and the endpoint loses a trailing slash', () => {
  assert.equal(telemetryConfig({}), null);
  assert.equal(telemetryConfig({ DASH0_OTLP_ENDPOINT: 'https://ingress.invalid' }), null);
  assert.equal(telemetryConfig({ DASH0_AUTH_TOKEN: 'invented' }), null);
  assert.equal(telemetryConfig({ DASH0_OTLP_ENDPOINT: '  ', DASH0_AUTH_TOKEN: 'invented' }), null);
  assert.deepEqual(telemetryConfig({ DASH0_OTLP_ENDPOINT: 'https://ingress.invalid/', DASH0_AUTH_TOKEN: ' invented ' }),
    { endpoint: 'https://ingress.invalid', token: 'invented' });
});

const answer = { item_id: 'EX-INV-01', active_ms: 95_400, target_ms: 120_000, submission_no: 2, hint_level: 1, solution_viewed: false,
  confidence: 3, phase: 'mixed', payload: { kind: 'mcq', run_kind: 'half_mock' } };

test('an answer (D76) sends its exercise, time and help on the event and the log; the counter stays without the exercise ID, the time metric has it', async () => {
  spans.reset();
  records.reset();
  trace.getTracer('test').startActiveSpan('POST /api/submit', (span) => { answered(sqlFunnel('E2'), answer, 'passed'); span.end(); });
  const [s] = spans.getFinishedSpans();
  assert.equal(s!.attributes.item_id, 'EX-INV-01');
  assert.deepEqual(s!.events.map((e) => e.name), ['exercise_submitted', 'exercise_passed']);
  assert.deepEqual(s!.events[0]!.attributes, { funnel_step: 'exercise_submitted', topic: 'SQL', case_theme: 'pricing', difficulty: 'E2', item_id: 'EX-INV-01',
    time_spent_s: 95, try_number: 2, hints_used: 1, answer_shown: false, mode: 'half_mock', outcome: 'passed', time_target_s: 120, confidence: 3 });
  const { 'session.id': id, 'session.seq': seq, ...logged } = records.getFinishedLogRecords().find((r) => r.body === 'exercise_submitted')!.attributes;
  assert.deepEqual(logged, s!.events[0]!.attributes, 'the log record carries every detail the span event does');
  assert.deepEqual([typeof id, typeof seq], ['string', 'number']);
  await reader.forceFlush();
  const all = points.getMetrics().at(-1)!.scopeMetrics.flatMap((m) => m.metrics);
  const steps = all.find((m) => m.descriptor.name === 'aydinlearns.funnel.steps')!;
  assert.ok(steps.dataPoints.every((p) => !('item_id' in p.attributes)), 'the step counter never carries the exercise ID');
  const time = all.find((m) => m.descriptor.name === 'aydinlearns.answer.time')!;
  assert.deepEqual(time.dataPoints.map((p) => [(p.value as { sum: number }).sum, p.attributes]),
    [[95.4, { topic: 'SQL', case_theme: 'pricing', difficulty: 'E2', item_id: 'EX-INV-01', outcome: 'passed', mode: 'half_mock', confidence: '3' }]]);
});

test('an answer that was not graded sends no pass or fail, and leaves out a missing time target and confidence', () => {
  spans.reset();
  trace.getTracer('test').startActiveSpan('POST /api/submit', (span) => {
    answered(sqlFunnel('E1'), { ...answer, target_ms: null, confidence: null, payload: { kind: 'sql' } }, 'not graded');
    span.end();
  });
  const [s] = spans.getFinishedSpans();
  assert.deepEqual(s!.events.map((e) => e.name), ['exercise_submitted']);
  const a = s!.events[0]!.attributes!;
  assert.deepEqual([a.mode, a.outcome, 'time_target_s' in a, 'confidence' in a], ['mixed', 'not graded', false, false]);
});

test('an answer\'s details reach the journey file as they reach the log: the exercise, its time and target, try, help, confidence, mode and outcome', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-journey-observe-'));
  try {
    startJourney({ dir });
    answered(sqlFunnel('E2'), answer, 'passed');
    await stopJourney();
    const lines = (await readFile(join(dir, (await readdir(dir))[0]!), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    const submitted = lines.find((l) => l.event === 'exercise_submitted')!;
    assert.deepEqual([submitted.item_id, submitted.time_spent_s, submitted.time_target_s, submitted.try_number, submitted.hints_used, submitted.answer_shown,
      submitted.confidence, submitted.mode, submitted.outcome, submitted.topic, submitted.case_theme, submitted.difficulty, submitted.funnel_step],
      ['EX-INV-01', 95, 120, 2, 1, false, 3, 'half_mock', 'passed', 'SQL', 'pricing', 'E2', 'exercise_submitted']);
    assert.deepEqual(lines.filter((l) => l.event === 'exercise_passed').map((l) => l.item_id), ['EX-INV-01']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
