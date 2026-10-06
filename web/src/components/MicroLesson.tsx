// web/src/components/MicroLesson.tsx: a leech's micro-lesson and a demoted concept's refresher, as Today offers them
// (design §5 "Flags on top of the states"; rulings S2-25, S2-28; Task B15). The micro-lesson is the reading and both worked
// examples; the refresher is the stage 0 worked example. "Done" logs the `micro_lesson` or `refresher` exposure, which
// resets a leech's card or clears the refresher (server/app.ts). Nothing is logged until "Done".
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Lesson } from '../../../schemas/lesson.ts';
import { MICRO_LESSON_INTRO, refresherIntro } from '../lib/labels.ts';
import { Markdown } from './Markdown.tsx';
import { WorkedExample } from './WorkedExample.tsx';

export function MicroLesson({ conceptId, kind, title, onDone }: { conceptId: string; kind: 'micro_lesson' | 'refresher'; title: string; onDone: () => void }) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);     // one exposure per click, even on a double-click

  useEffect(() => { api.lesson(conceptId).then(setLesson, (e: Error) => setError(e.message)); }, [conceptId]);

  async function done() {
    setSending(true);
    setError(null);
    try {
      await api.exposure(conceptId, kind);
      onDone();
    } catch (e) {
      setError(`It was not saved: ${(e as Error).message}`);
      setSending(false);
    }
  }

  const micro = kind === 'micro_lesson';
  return (
    <section>
      <h2>{micro ? 'Micro-lesson' : 'Refresher'}: {title}</h2>
      <p className="callout">{micro ? MICRO_LESSON_INTRO : refresherIntro(title)}</p>
      {!lesson && !error && <p>Loading...</p>}
      {lesson && micro && (
        <article>
          <Markdown text={lesson.reading_md} />
          <h3>Syntax</h3>
          <Markdown text={lesson.syntax_md} />
          {lesson.dialect_note && <p className="callout"><strong>Dialect note:</strong> {lesson.dialect_note}</p>}
        </article>
      )}
      {lesson && <WorkedExample example={lesson.worked_examples[0]} />}
      {lesson && micro && lesson.worked_examples[1] && <WorkedExample example={lesson.worked_examples[1]} />}
      {error && <p role="alert">{error}</p>}
      {/* Done is offered once the text is on the screen, so the exposure records a reading that happened. */}
      {lesson && <button type="button" onClick={() => void done()} disabled={sending}>Done</button>}
    </section>
  );
}
