// schemas/tutor.ts: the AI tutor's wire shapes (AI tutor design §4), shared by server/routes/tutor.ts and web/src/tutor/. No imports.
/** T-08: after the streamed reply, this character, then one JSON summary line. */
export const SUMMARY_MARK = '\u001e';
/** The browser cuts its snapshot here, longest section first (spec §5); the server refuses more than 32,000 characters. */
export const SNAPSHOT_MAX = 24_000;

/** T-21 (block P): how long the model may think before it answers. Medium unless Settings says otherwise. */
export type TutorEffort = 'low' | 'medium' | 'high';
export const TUTOR_EFFORTS: readonly TutorEffort[] = ['low', 'medium', 'high'];
export const DEFAULT_TUTOR_EFFORT: TutorEffort = 'medium';
/** The two providers a learner can hold a key for. The fake model is a test hook and never shows in Settings. */
export type TutorProviderName = 'claude' | 'openai';
/** T-21: one model Settings offers, its price in US dollars per million tokens, and whether its provider has a key. */
export interface TutorModelView { id: string; label: string; provider: TutorProviderName; input_usd: number; output_usd: number; available: boolean }
/** T-20: whether a provider has a key, and where it came from. The key itself never reaches the browser. */
export interface TutorKeyView { provider: TutorProviderName; source: 'settings' | 'env' | null }
/** POST /api/tutor/keys: save a key (a string) or remove the one saved in Settings (null). The answer never holds a key. */
export interface TutorKeyBody { provider: TutorProviderName; key: string | null }
export const TUTOR_KEY_PATH = '/api/tutor/keys';

export interface TutorStatusView {
  /** On: switched on in Settings, and the chosen model's provider has a key (or the fake test model answers). */
  enabled: boolean;
  /** The Settings switch (T-22). */
  switched_on: boolean;
  provider: string; model: string; effort: TutorEffort;
  /** Why the tutor is off, in plain words; null when it is on. Never holds a key. */
  reason: string | null;
  models: TutorModelView[];
  keys: TutorKeyView[];
  spent_today_usd: number;
  /** The daily limit in US dollars; null: no daily limit (T-22). */
  cap_usd: number | null;
  run_on: boolean;
}
export interface TutorItemRef { item_id: string; item_instance_id: string; phase: string }
export interface TutorExchange { question: string; reply: string }
export interface TutorAskBody { screen: string; subject_id?: string; snapshot: string; item: TutorItemRef | null; thread: TutorExchange[]; question: string }
/** `cap_usd` null: no daily limit. */
export interface TutorSummary { outcome: 'answered' | 'refused' | 'error'; message: string | null; cost_usd: number; spent_today_usd: number; cap_usd: number | null; counted: boolean }
