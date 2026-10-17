// server/tutor/providers/fake.ts: AYDINLEARNS_TUTOR_PROVIDER=fake (spec §4, T-11). A local model for the tests and the smoke rows: it
// streams a fixed teaching reply that names the screen and the question, calls nothing and costs nothing (its price row is all zeros).
import type { TutorDone, TutorModel, TutorModelInput } from '../types.ts';

export const FAKE_MARK = 'Fake tutor:';

export function fakeModel(o: { delayMs?: number } = {}): TutorModel {
  return {
    provider: 'fake',
    model: 'fake',
    async *ask(input: TutorModelInput): AsyncGenerator<string, TutorDone, void> {
      const screen = /^Screen: (.+)$/m.exec(input.question)?.[1] ?? 'unknown';
      const asked = (/<question>\n([\s\S]*?)\n<\/question>/.exec(input.question)?.[1] ?? '').slice(0, 80);
      const reply = `${FAKE_MARK} you are on the ${screen} screen and asked "${asked}". What do you think the first step is?`;
      for (const piece of reply.match(/[\s\S]{1,24}/g) ?? []) {
        if (o.delayMs) await new Promise((done) => setTimeout(done, o.delayMs));
        if (input.signal?.aborted) break;
        yield piece;
      }
      const chars = input.system.length + input.question.length + input.turns.reduce((n, t) => n + t.text.length, 0);
      return { end: 'done', usage: { input_tokens: Math.ceil(chars / 4), cache_write_tokens: 0, cached_input_tokens: 0, output_tokens: Math.ceil(reply.length / 4) } };
    },
  };
}
