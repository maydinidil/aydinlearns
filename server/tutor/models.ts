// server/tutor/models.ts: the models Settings offers (T-21, block P), the default, the effort and a reply's token limit by effort. The
// route turns these into the wire shapes of schemas/tutor.ts (TutorModelView, TutorEffort); a test keeps the two lists the same. Every
// model here has a price row in prices.ts (a test checks), so the daily limit can always price a reply.
import type { Effort, KeyProvider } from './types.ts';

export interface ModelInfo { id: string; label: string; provider: KeyProvider }
export const MODELS: readonly ModelInfo[] = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', provider: 'claude' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', provider: 'claude' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'claude' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', provider: 'openai' },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', provider: 'openai' },
];
export const DEFAULT_MODEL = 'claude-haiku-5-5';
/** The provider's name as the learner reads it. */
export const PROVIDER_LABEL: Readonly<Record<KeyProvider, string>> = { claude: 'Claude', openai: 'OpenAI' };

export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high'];
export const DEFAULT_EFFORT: Effort = 'medium';
/** T-21: a reply's token limit grows with the effort, so thinking leaves room for the answer. The reservation uses the same limit. */
const TOKEN_LIMITS: Readonly<Record<Effort, number>> = { low: 4_096, medium: 8_192, high: 16_384 };
export const tokenLimit = (e: Effort): number => TOKEN_LIMITS[e];

/** The catalog entry for an ID, or null; anything that is not one of the IDs above (a built-in name like toString too) is null. */
export const modelInfo = (id: unknown): ModelInfo | null => MODELS.find((m) => m.id === id) ?? null;
export const isEffort = (v: unknown): v is Effort => (EFFORTS as readonly unknown[]).includes(v);
