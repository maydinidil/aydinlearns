// server/tutor/providers/openai.ts: OpenAI through the `openai` package (spec §4, §8, D97): the Responses API, streamed, with the system
// prompt as `instructions`, the same turns, and `store: false`, so OpenAI keeps no stored response. The effort chosen in Settings goes as
// reasoning.effort (T-21): both OpenAI models Settings offers reason; the reasoning itself is never shown or kept. OpenAI counts cached
// input and cache writes inside input_tokens; this splits both out, so each is priced as its price row says (S7-31). The host, admin
// key, organization and project are set here, so OPENAI_BASE_URL,
// OPENAI_ADMIN_KEY, OPENAI_ORG_ID and OPENAI_PROJECT_ID are never read: the tutor uses the one key from the key store, at OpenAI (spec §9).
// Startup removes OPENAI_CUSTOM_HEADERS, which the SDK has no option to ignore. `logLevel: 'warn'` keeps a request's body out of the
// console whatever OPENAI_LOG says (S7-32). OpenAI reports no usage before its final event, so a cut call carries none.
import OpenAI from 'openai';
import type { Effort, TutorDone, TutorModel, TutorModelInput } from '../types.ts';
import { failureOf } from './errors.ts';

/** The fields of a finished response this reads. */
type Finished = { status?: string | null; incomplete_details?: { reason?: string } | null;
  usage?: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } } | null };

export function openaiModel(o: { apiKey: string; model: string; effort: Effort; fetch?: typeof fetch; maxRetries?: number }): TutorModel {
  const client = new OpenAI({ apiKey: o.apiKey, baseURL: 'https://api.openai.com/v1', adminAPIKey: null, organization: null, project: null,
    maxRetries: o.maxRetries ?? 1, timeout: 60_000, logLevel: 'warn', ...(o.fetch ? { fetch: o.fetch } : {}) });
  return {
    provider: 'openai',
    model: o.model,
    async *ask(input: TutorModelInput): AsyncGenerator<string, TutorDone, void> {
      const at = { connected: false, started: false };
      try {
        const stream = await client.responses.create({
          model: o.model,
          instructions: input.system,
          max_output_tokens: input.maxTokens,
          reasoning: { effort: o.effort },
          stream: true,
          store: false,
          input: [...input.turns.map((t) => ({ role: t.role, content: t.text })), { role: 'user' as const, content: input.question }],
        }, { signal: input.signal });
        let refused = false;
        let done: Finished | null = null;
        // openai 7.27.0 never yields an `error` event: it throws it (and any event carrying an `error` field) as an APIError with no HTTP
        // status, which failureOf reads by its code below. A failed response goes through the same reading by its error's code.
        for await (const event of stream) {
          at.connected = true;
          if (event.type === 'response.output_text.delta') { at.started = true; yield event.delta; }
          else if (event.type === 'response.refusal.delta') refused = true;
          else if (event.type === 'response.completed' || event.type === 'response.incomplete') done = event.response;
          else if (event.type === 'response.failed') throw failureOf({ code: event.response.error?.code ?? 'server_error' }, 'openai', at);
        }
        // The SDK ends the loop quietly when the stream closes before its final event (Claude's SDK rejects instead): treat both alike.
        if (!done) throw new Error('The stream closed before the response finished.');
        const u = done.usage;
        const cached = u?.input_tokens_details?.cached_tokens ?? 0;
        const written = u?.input_tokens_details?.cache_write_tokens ?? 0;
        const incomplete = done.status === 'incomplete';
        return {
          end: refused || (incomplete && done.incomplete_details?.reason === 'content_filter') ? 'refused' : incomplete ? 'max_tokens' : 'done',
          usage: { input_tokens: Math.max(0, (u?.input_tokens ?? 0) - cached - written), cache_write_tokens: written, cached_input_tokens: cached, output_tokens: u?.output_tokens ?? 0 },
        };
      } catch (e) {
        throw failureOf(e, 'openai', at);
      }
    },
  };
}
