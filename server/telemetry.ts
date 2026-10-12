// server/telemetry.ts: OpenTelemetry for the local app (owner decision D75, 2026-10-12). Off unless DASH0_OTLP_ENDPOINT and
// DASH0_AUTH_TOKEN are both set: then traces, metrics and logs go to that OTLP/HTTP endpoint, with the token as a Bearer header.
// It is the one network call the app may make, and only the learner can turn it on; with either value missing, no SDK code loads.
// The launcher and `npm start` load .env and preload this file (`--import`), so the HTTP instrumentation is in place before the
// server's modules load. server/main.ts imports it too, for stopTelemetry.
import { register } from 'node:module';
import { APP_VERSION } from './version.ts';

export interface TelemetryConfig { endpoint: string; token: string }

/** The endpoint (without a trailing slash) and the token, or null when either is missing or blank: then telemetry stays off. */
export function telemetryConfig(env: Record<string, string | undefined>): TelemetryConfig | null {
  const endpoint = env.DASH0_OTLP_ENDPOINT?.trim().replace(/\/+$/, '');
  const token = env.DASH0_AUTH_TOKEN?.trim();
  return endpoint && token ? { endpoint, token } : null;
}

let stop = async (): Promise<void> => {};

/** Sends what is still buffered, then stops. It never holds the app's exit for more than 2 seconds; a no-op while telemetry is off. */
export const stopTelemetry = (): Promise<void> =>
  Promise.race([stop(), new Promise<void>((done) => setTimeout(done, 2_000).unref())]);

type Done = (result: { code: number; error?: Error }) => void;

/**
 * Prints a line when a signal's exports start or stop reaching the endpoint, so the console says whether Dash0 takes the data.
 * The SDK drops failed exports silently otherwise. The line never carries the token.
 */
function reported<T extends { export(items: never, done: Done): void }>(exporter: T, signal: string, success: number): T {
  const send = exporter.export.bind(exporter) as (items: unknown, done: Done) => void;
  let accepted: boolean | null = null;
  (exporter as { export(items: unknown, done: Done): void }).export = (items, done) => send(items, (result) => {
    const ok = result.code === success;
    if (ok !== accepted) {
      accepted = ok;
      console.log(ok ? `aydinlearns: telemetry: ${signal} reach the endpoint.`
        : `aydinlearns: telemetry: ${signal} were not accepted (${result.error?.message ?? 'no reason given'}). Check DASH0_OTLP_ENDPOINT and DASH0_AUTH_TOKEN in .env.`);
    }
    done(result);
  });
  return exporter;
}

async function start(c: TelemetryConfig): Promise<void> {
  const host = new URL(c.endpoint).host;                      // a value that is not a URL stops here, before anything starts
  // The app is ES modules, and the instrumentation's require hook never sees an import. This loader hook lets it patch node:http
  // as well. It intercepts http only, so every other module loads exactly as before.
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url, { data: { include: ['node:http', 'http'] } });
  const [{ NodeSDK, core, logs, metrics, resources }, { HttpInstrumentation }, { OTLPTraceExporter }, { OTLPMetricExporter }, { OTLPLogExporter }] =
    await Promise.all([import('@opentelemetry/sdk-node'), import('@opentelemetry/instrumentation-http'),
      import('@opentelemetry/exporter-trace-otlp-proto'), import('@opentelemetry/exporter-metrics-otlp-proto'), import('@opentelemetry/exporter-logs-otlp-proto')]);
  const headers = { Authorization: `Bearer ${c.token}` };
  const url = (signal: string) => `${c.endpoint}/v1/${signal}`;
  const ok = core.ExportResultCode.SUCCESS;
  const sdk = new NodeSDK({
    // These three only. The default detectors would add host.name and process.owner: the PC's name and the Windows username.
    resource: resources.resourceFromAttributes({ 'service.name': 'aydinlearns', 'service.version': APP_VERSION, 'deployment.environment.name': 'local' }),
    autoDetectResources: false,
    traceExporter: reported(new OTLPTraceExporter({ url: url('traces'), headers }), 'traces', ok),
    metricReaders: [new metrics.PeriodicExportingMetricReader({ exporter: reported(new OTLPMetricExporter({ url: url('metrics'), headers }), 'metrics', ok) })],
    logRecordProcessors: [new logs.BatchLogRecordProcessor({ exporter: reported(new OTLPLogExporter({ url: url('logs'), headers }), 'logs', ok) })],
    // Incoming requests only: the app makes no outgoing ones, and DuckDB runs in a child process no instrumentation reaches.
    instrumentations: [new HttpInstrumentation()],
  });
  sdk.start();
  stop = () => sdk.shutdown().catch(() => {});
  console.log(`aydinlearns: telemetry on: traces, metrics and logs go to ${host}.`);
}

const config = telemetryConfig(process.env);
// Read once, then removed. A forked child (the SQL runner, which inherits this preload with the server's flags) finds no token,
// so it never starts telemetry and stays offline (R17); and the token is passed to no child process.
delete process.env.DASH0_OTLP_ENDPOINT;
delete process.env.DASH0_AUTH_TOKEN;
// Telemetry never stops the app: a bad endpoint prints why, and the app runs without it.
if (config) await start(config).catch((e: unknown) => console.log(`aydinlearns: telemetry off: ${e instanceof Error ? e.message : String(e)}`));
