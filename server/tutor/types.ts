// server/tutor/types.ts: the tutor's shared types (AI tutor design §4, D91 to D99). It imports nothing, so every tutor unit and its
// tests can read it. Node strips types only: no enums and no constructor parameter properties here.
export type TutorProvider = 'claude' | 'openai' | 'fake';
/** T-20: the two providers a key can be saved for. The fake model needs none. */
export type KeyProvider = 'claude' | 'openai';
/** T-21: how long the model may think before it answers (schemas/tutor.ts TutorEffort, which no tutor file imports). */
export type Effort = 'low' | 'medium' | 'high';
/** What one question asks for (block P): the provider, the catalog model and the effort, from Settings. The key comes from the key store. */
export interface ModelChoice { provider: TutorProvider; model: string; effort: Effort }
/** One earlier turn of the thread, as plain text (T-07). */
export interface TutorTurn { role: 'user' | 'assistant'; text: string }
/** What a provider is asked: the system prompt (stable, so it caches), the earlier turns, then this question with its context. */
export interface TutorModelInput { system: string; turns: TutorTurn[]; question: string; maxTokens: number; signal?: AbortSignal }
/** Tokens as the provider counted them. `input_tokens` is the uncached input; a cache write and a cache read are counted apart. */
export interface TutorUsage { input_tokens: number; cache_write_tokens: number; cached_input_tokens: number; output_tokens: number }
/** How a reply ended: done, declined by the model, or stopped at max_tokens. */
export interface TutorDone { end: 'done' | 'refused' | 'max_tokens'; usage: TutorUsage }
/** A model: `ask` yields the reply's text in pieces and returns how it ended. It throws a TutorFailure. */
export interface TutorModel {
  readonly provider: TutorProvider;
  readonly model: string;
  ask(input: TutorModelInput): AsyncGenerator<string, TutorDone, void>;
}
/**
 * Why a call failed (spec §10). `cut_off`: the stream broke after the provider's first event (S7-32). `declined`: the provider refused
 * on policy (S7-31), which the learner reads as the model declining.
 */
export type TutorFailureKind = 'key_refused' | 'busy' | 'offline' | 'cut_off' | 'refused_request' | 'declined';
export class TutorFailure extends Error {
  readonly kind: TutorFailureKind;
  /**
   * S7-32: the input the provider reported before the call failed (Claude's message_start), output 0; null when it reported none. The
   * route counts a cut reply from it.
   */
  readonly usage: TutorUsage | null;
  constructor(kind: TutorFailureKind, message: string, usage: TutorUsage | null = null) {
    super(message); this.kind = kind; this.usage = usage; this.name = 'TutorFailure';
  }
}
