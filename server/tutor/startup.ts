// server/tutor/startup.ts: reads the tutor's start environment once, when server/main.ts imports it (second, after telemetry), then
// removes both keys from process.env (the D75 pattern, spec §9). The SQL runner is forked later with the server's environment, so it
// never holds a key. The start keys stay in this module's scope until openTutorKeys() hands them to the key store (T-20), where a key
// saved in Settings wins over them. No model is made at start (block P): the route asks makeTutorModel() for one per question, with the
// model and effort Settings names, and the SDKs load only then.
// Both SDKs add the headers named in ANTHROPIC_CUSTOM_HEADERS and OPENAI_CUSTOM_HEADERS (a gateway's token, say) to every call, and have
// no option to stop it. They read them when makeTutorModel() builds a client, so removing them here keeps every tutor call to its key.
// AYDINLEARNS_TUTOR_PROVIDER is only the test hook now (T-23): `fake` answers for every model with the fake model; any other value is
// ignored, since Settings picks the model and so the provider.
import { fileURLToPath } from 'node:url';
import { keysFileFrom, TutorKeys, type KeyStore } from './keys.ts';
import type { ModelChoice, TutorModel } from './types.ts';

const START = { claude: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY };
const KEYS_FILE = keysFileFrom(process.env, fileURLToPath(new URL('../..', import.meta.url)));
/** T-23: the fake test hook is on. */
export const TUTOR_FAKE = (process.env.AYDINLEARNS_TUTOR_PROVIDER ?? '').trim().toLowerCase() === 'fake';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_CUSTOM_HEADERS;
delete process.env.OPENAI_CUSTOM_HEADERS;

/** The key store over tutor-keys.json (or AYDINLEARNS_KEYS_FILE) and the start keys. server/main.ts opens it once. */
export const openTutorKeys = (): Promise<TutorKeys> => TutorKeys.open(KEYS_FILE, START);

/** The model for one question. Under the test hook, the fake; otherwise the provider's, with the key the store gives for it. */
export async function makeTutorModel(c: ModelChoice, keys: Pick<KeyStore, 'secretFor'>): Promise<TutorModel> {
  if (TUTOR_FAKE || c.provider === 'fake') {
    // T-19: the smoke test slows the fake model's reply (milliseconds between pieces) to close the panel mid-reply; the fake only.
    const fakeDelay = Number(process.env.AYDINLEARNS_TUTOR_FAKE_DELAY_MS ?? '');
    return (await import('./providers/fake.ts')).fakeModel({ delayMs: Number.isFinite(fakeDelay) && fakeDelay > 0 ? Math.min(fakeDelay, 5_000) : 0 });
  }
  const apiKey = keys.secretFor(c.provider);
  if (!apiKey) throw new Error(`The tutor has no ${c.provider === 'openai' ? 'OpenAI' : 'Claude'} key.`);
  if (c.provider === 'claude') return (await import('./providers/anthropic.ts')).anthropicModel({ apiKey, model: c.model, effort: c.effort });
  return (await import('./providers/openai.ts')).openaiModel({ apiKey, model: c.model, effort: c.effort });
}
