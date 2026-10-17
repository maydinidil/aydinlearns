// server/tutor/prices.ts: what each model costs, in US dollars per million tokens (spec §8, D98, T-09, T-21), from the providers' official
// pages on 2026-10-17. Every model Settings offers (models.ts) has a row (a test checks), so the daily limit can always price a reply.
// Claude's rows: a cache write costs 1.25x input; Claude Opus 5.5 lists cache reads at $0.20, Sonnet 5.5 at $0.10 (T-21 corrected it).
// Claude Haiku 5.5's row holds for prompts of 100K tokens or fewer; the tutor never comes near that, since the server refuses a snapshot
// over 32,000 characters. OpenAI bills no cache write (the provider reports none); its cache_write column only bounds the worst cost.
import type { TutorUsage } from './types.ts';

export interface Price { input: number; cache_write: number; cached_input: number; output: number }
export const PRICES: Readonly<Record<string, Price>> = {
  'claude-haiku-5-5': { input: 0.10, cache_write: 0.125, cached_input: 0.01, output: 0.50 },
  'claude-sonnet-5-5': { input: 2, cache_write: 2.5, cached_input: 0.10, output: 10 },
  'claude-opus-5-5': { input: 4, cache_write: 5, cached_input: 0.20, output: 20 },
  'gpt-6-luna': { input: 0.10, cache_write: 0.125, cached_input: 0.01, output: 0.50 },
  'gpt-6.1-sol': { input: 2, cache_write: 2.5, cached_input: 0.10, output: 10 },
  fake: { input: 0, cache_write: 0, cached_input: 0, output: 0 },
};
/** Own rows only: a name like `toString` is no row (T2/T4 review I1). */
export const priceOf = (model: string): Price | null => (Object.hasOwn(PRICES, model) ? PRICES[model]! : null);

/** A reply's cost in US dollars, rounded to a millionth of a dollar. Tokens times dollars per million tokens is millionths of a dollar. */
export function costOf(p: Price, u: TutorUsage): number {
  const micros = u.input_tokens * p.input + u.cache_write_tokens * p.cache_write + u.cached_input_tokens * p.cached_input + u.output_tokens * p.output;
  return Math.round(micros) / 1_000_000;
}

/** T-10: the most a call can cost: its input at one token per 3 characters and the dearer input price, plus every output token it may write. */
export function worstCost(p: Price, inputChars: number, maxTokens: number): number {
  return (Math.ceil(inputChars / 3) * Math.max(p.input, p.cache_write) + maxTokens * p.output) / 1_000_000;
}
