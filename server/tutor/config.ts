// server/tutor/config.ts: whether the tutor is on, and with what (block P, T-20 to T-23; spec §4, §8, D91). A pure function of the Settings
// values, where each provider's key came from and the fake test hook, so the tests pass their own. The route asks it on every request,
// so a change in Settings or a key saved there counts from the next question on.
// The reason is plain words that point to Settings: never a variable or a .env line, never a key, and never a Settings value as it was
// stored. A value the app does not know (from a hand-edited log) reads as its default, as the daily cap does (T-06).
import type { KeySource } from './keys.ts';
import { DEFAULT_EFFORT, DEFAULT_MODEL, isEffort, modelInfo, PROVIDER_LABEL, type ModelInfo } from './models.ts';
import type { Effort, KeyProvider, TutorProvider } from './types.ts';

/** The tutor's settings as server/app.ts keeps them; absent or null is the default. */
export interface TutorSettings { tutor_enabled?: unknown; tutor_model?: unknown; tutor_effort?: unknown }
export interface TutorState {
  /** On: switched on, and the chosen model's provider has a key (or the fake test hook answers). */
  enabled: boolean;
  /** The Settings switch: on unless Settings turned it off. */
  switched_on: boolean;
  /** The chosen model's provider, or `fake` under the test hook. */
  provider: TutorProvider;
  /** The chosen model's catalog ID. */
  model: string;
  effort: Effort;
  /** Why the tutor is off, in plain words; null when it is on. */
  reason: string | null;
}

export const chosenModel = (s: TutorSettings): ModelInfo => modelInfo(s.tutor_model) ?? modelInfo(DEFAULT_MODEL)!;
export const chosenEffort = (s: TutorSettings): Effort => (isEffort(s.tutor_effort) ? s.tutor_effort : DEFAULT_EFFORT);
export const switchedOn = (s: TutorSettings): boolean => s.tutor_enabled !== false;

const SWITCHED_OFF = 'The tutor is switched off in Settings.';
const needsKey = (m: ModelInfo): string =>
  `${m.label} needs ${m.provider === 'openai' ? 'an' : 'a'} ${PROVIDER_LABEL[m.provider]} key. Add one in Settings to turn the tutor on.`;

/** T-23: `fake` (AYDINLEARNS_TUTOR_PROVIDER=fake, a test hook) answers for every model with the fake model, with no key. */
export function tutorState(s: TutorSettings, sourceOf: (p: KeyProvider) => KeySource, fake: boolean): TutorState {
  const m = chosenModel(s);
  const base = { switched_on: switchedOn(s), provider: fake ? 'fake' as const : m.provider, model: m.id, effort: chosenEffort(s) };
  if (!base.switched_on) return { ...base, enabled: false, reason: SWITCHED_OFF };
  if (!fake && sourceOf(m.provider) === null) return { ...base, enabled: false, reason: needsKey(m) };
  return { ...base, enabled: true, reason: null };
}
