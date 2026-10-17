// web/src/lib/tutor-settings.ts: the AI tutor's card in Settings and the panel's model line (block P, T-20 to T-22). Pure helpers: what
// each control shows and what each Save sends. A key passes through keyToSave on its way to the server and is kept nowhere: not here, not
// in browser storage, a URL, a log or an error line.
import {
  DEFAULT_TUTOR_EFFORT, TUTOR_EFFORTS, type TutorEffort, type TutorKeyBody, type TutorKeyView, type TutorProviderName, type TutorStatusView,
} from '../../../schemas/tutor.ts';
import { spendLine } from '../tutor/thread.ts';

/** The on or off switch (T-22 `tutor_enabled`). */
export const SWITCH_LABEL = 'Use the AI tutor';
export const switchNotice = (on: boolean): string => (on ? 'Tutor switched on.' : 'Tutor switched off.');

const PROVIDER_NAMES: Record<TutorProviderName, string> = { claude: 'Claude', openai: 'OpenAI' };
/** A price in US dollars: two decimals at least, more only when the price has them ($0.075). */
export const usd = (n: number): string => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false })}`;

/** The name a key row, its buttons and its notices use. */
export const keyName = (p: TutorProviderName): string => `${PROVIDER_NAMES[p]} API key`;
/** The line under an unavailable model: which key to add, in the rows below the list. */
const keyNeeded = (p: TutorProviderName): string => `Add ${p === 'openai' ? 'an' : 'a'} ${keyName(p)} below to use this model.`;

export interface ModelOption { id: string; label: string; price: string; available: boolean; note: string | null }
/** T-21: every model the server offers, its price per million tokens in and out, and why one cannot be picked. */
export const modelOptions = (s: TutorStatusView): ModelOption[] => s.models.map((m) => ({
  id: m.id, label: m.label, price: `${usd(m.input_usd)} in and ${usd(m.output_usd)} out per million tokens`,
  available: m.available, note: m.available ? null : keyNeeded(m.provider),
}));
/** The model Save sends: one the list holds and whose provider has a key; null closes Save. */
export const modelToSave = (id: string, s: TutorStatusView): string | null => (s.models.some((m) => m.id === id && m.available) ? id : null);

/** T-21: the effort, Medium unless Settings says otherwise. */
export const EFFORT_OPTIONS: readonly { value: TutorEffort; label: string }[] = TUTOR_EFFORTS.map((value) => {
  const word = value.charAt(0).toUpperCase() + value.slice(1);
  return { value, label: value === DEFAULT_TUTOR_EFFORT ? `${word} (the default)` : word };
});
export const EFFORT_NOTE = 'Higher effort thinks longer: slower replies that cost more.';

/**
 * A choice not saved yet (a model or an effort) after the status is read again: kept while the saved value is the one it was chosen
 * against and it can still be picked; otherwise the saved value. The first read (no choice yet) shows the saved value.
 */
export function keepChoice<T extends string>(draft: T | null, savedBefore: T | null, savedNow: T, usable: (v: T) => boolean = () => true): T {
  return draft !== null && savedBefore === savedNow && usable(draft) ? draft : savedNow;
}

/** The model in use by its label, and the provider when it is not the model's own (the fake test hook, T-23, answers for every model). */
function modelName(s: TutorStatusView): string {
  const m = s.models.find((x) => x.id === s.model);
  if (m) return m.provider === s.provider ? m.label : `${m.label} (${s.provider})`;
  return s.model === s.provider || s.provider === 'claude' || s.provider === 'openai' ? s.model : `${s.model} (${s.provider})`;
}
/** The panel's quiet line: the model and the effort in use. */
export const modelLine = (s: TutorStatusView): string => `${modelName(s)}, ${s.effort} effort`;
/** The card's first line: on, with the model, the effort and today's spend; or off, with the server's reason (never a key). */
export const statusLine = (s: TutorStatusView): string =>
  (s.enabled ? `On: ${modelLine(s)}. ${spendLine(s)}.` : s.reason ? `Off. ${s.reason}` : 'Off.');

/** T-20: where a provider's key comes from. The key itself never reaches the browser. */
export const keyView = (s: TutorStatusView, p: TutorProviderName): TutorKeyView => s.keys.find((k) => k.provider === p) ?? { provider: p, source: null };
export const keySourceLine = (source: TutorKeyView['source']): string =>
  (source === 'settings' ? 'Saved in the app.' : source === 'env' ? 'Read from .env or the environment.' : 'Not set.');
/** Remove takes out only a key saved in the app; a key in .env or the environment stays there. */
export const canRemoveKey = (k: TutorKeyView): boolean => k.source === 'settings';
export const keyNotice = (p: TutorProviderName, saved: boolean): string => `${keyName(p)} ${saved ? 'saved' : 'removed'}.`;
export const KEYS_NOTE = 'A key saved here stays on this computer and is never shown again. It is used instead of a key in .env.';
/** What Save sends: the field's key without the white space around it; null (Save closed) for an empty field. The server checks the rest. */
export function keyToSave(provider: TutorProviderName, text: string): TutorKeyBody | null {
  const key = text.trim();
  return key === '' ? null : { provider, key };
}
export const removeKeyBody = (provider: TutorProviderName): TutorKeyBody => ({ provider, key: null });
