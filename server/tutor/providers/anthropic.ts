// server/tutor/providers/anthropic.ts: Claude through @anthropic-ai/sdk (spec §4, §8, D97): messages.stream, the system prompt marked for
// caching (it caches once it passes the model's minimum prefix), the effort chosen in Settings as output_config.effort (T-21), the given
// max_tokens (the route's token limit for that effort), one retry, 60 seconds. Thinking is left at the model's default and never shown
// or kept: only text deltas are yielded (T-07). `fetch` is the SDK's own option; the tests
// pass a recorded stream through it. `authToken: null` keeps the SDK from also sending an ANTHROPIC_AUTH_TOKEN it would otherwise read
// from the environment, and the host set here keeps ANTHROPIC_BASE_URL from sending the key elsewhere: the tutor uses the one key from
// the key store, at Anthropic (spec §9). Startup removes ANTHROPIC_CUSTOM_HEADERS, which the SDK has no option to ignore.
import Anthropic from '@anthropic-ai/sdk';
import type { Effort, TutorDone, TutorModel, TutorModelInput } from '../types.ts';
import { failureOf } from './errors.ts';

export function anthropicModel(o: { apiKey: string; model: string; effort: Effort; fetch?: typeof fetch; maxRetries?: number }): TutorModel {
  const client = new Anthropic({ apiKey: o.apiKey, authToken: null, baseURL: 'https://api.anthropic.com', maxRetries: o.maxRetries ?? 1, timeout: 60_000,
    ...(o.fetch ? { fetch: o.fetch } : {}) });
  return {
    provider: 'claude',
    model: o.model,
    async *ask(input: TutorModelInput): AsyncGenerator<string, TutorDone, void> {
      let started = false;
      try {
        const stream = client.messages.stream({
          model: o.model,
          max_tokens: input.maxTokens,
          system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
          output_config: { effort: o.effort },
          messages: [...input.turns.map((t) => ({ role: t.role, content: t.text })), { role: 'user' as const, content: input.question }],
        }, { signal: input.signal });
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            started = true;
            yield event.delta.text;
          }
        }
        // A stream that broke or closed before message_stop rejects here, even when the loop above ended quietly.
        const m = await stream.finalMessage();
        const u = m.usage;
        return {
          end: m.stop_reason === 'refusal' ? 'refused' : m.stop_reason === 'max_tokens' ? 'max_tokens' : 'done',
          usage: { input_tokens: u.input_tokens, cache_write_tokens: u.cache_creation_input_tokens ?? 0, cached_input_tokens: u.cache_read_input_tokens ?? 0, output_tokens: u.output_tokens },
        };
      } catch (e) {
        throw failureOf(e, 'claude', started);
      }
    },
  };
}
