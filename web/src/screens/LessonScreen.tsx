// web/src/screens/LessonScreen.tsx: one concept's lesson (design §4). An optional pretest, the reading, the
// worked example, the lesson block with fading, then practice. Every step opens from the step bar at any time.
// The lesson remembers its place per concept (owner decision D7): the step, the lesson block's item and stage, and the
// pretest answers. It works the same when the browser's storage is missing or refuses (web/src/lib/labels.ts).
import { useEffect, useRef, useState } from 'react';
import { api, type RetestView } from '../api.ts';
import type { Lesson } from '../../../schemas/lesson.ts';
import type { Exposure } from '../../../core/envelope.ts';
import { Markdown } from '../components/Markdown.tsx';
import { WorkedExample } from '../components/WorkedExample.tsx';
import { PageHead } from '../components/PageHead.tsx';
import { crumbParts } from '../lib/crumb.ts';
import { WhyClause } from '../components/WhyClause.tsx';
import { ItemPanel } from '../components/ItemPanel.tsx';
import { ExercisePanel, type ClosedResult } from '../components/ExercisePanel.tsx';
import { afterItem, pretestSkipsLesson, stageFor, startBlock, type BlockState } from '../lib/lesson-flow.ts';
import { conceptTitle, loadTitles, poolLabels, readPosition, retestCallout, writePosition, type LessonStep, type Titles } from '../lib/labels.ts';

type Step = LessonStep;
const STEPS: [Step, string][] = [['pretest', 'Pretest (optional)'], ['reading', 'Reading'], ['worked', 'Worked example'], ['block', 'Lesson block'], ['practice', 'Practice']];

export function LessonScreen({ conceptId }: { conceptId: string }) {
  // Read once, when the lesson opens; App keys this screen by concept, so each concept starts from its own place.
  const [saved] = useState(() => readPosition(conceptId));
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [titles, setTitles] = useState<Titles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(saved?.step ?? 'pretest');
  // An item is served only when the learner starts the pretest, so opening a lesson to read it serves no item.
  const [pretestStarted, setPretestStarted] = useState((saved?.pretest.length ?? 0) > 0);
  const [pretest, setPretest] = useState<{ passed: boolean; helped: boolean }[]>(saved?.pretest ?? []);
  const [block, setBlock] = useState<BlockState>(saved?.block ?? startBlock);
  const [retests, setRetests] = useState<RetestView[]>([]);
  const [retestsError, setRetestsError] = useState<string | null>(null);
  const [exposureError, setExposureError] = useState<string | null>(null);
  const exposed = useRef(new Set<Exposure['kind']>());

  useEffect(() => { api.lesson(conceptId).then(setLesson, (e: Error) => setError(e.message)); }, [conceptId]);
  // Without the titles the heading shows the concept's ID, which is still right.
  useEffect(() => { loadTitles(api.curriculum).then(setTitles, () => {}); }, []);
  useEffect(() => { writePosition(conceptId, { step, block, pretest }); }, [conceptId, step, block, pretest]);

  // Viewing the reading or a worked example (the stage 0 step, or the one shown again in the block) writes
  // one exposure per kind (design §13). A failed write is shown, and the next view tries again.
  const blockDone = !!lesson && block.index >= lesson.lesson_item_ids.length;
  const viewing: Exposure['kind'] | null = !lesson ? null : step === 'reading' ? 'reading'
    : step === 'worked' || (step === 'block' && block.showWorkedAgain && !blockDone) ? 'worked_example' : null;
  useEffect(() => {
    if (!viewing || exposed.current.has(viewing)) return;
    exposed.current.add(viewing);
    api.exposure(conceptId, viewing).then(() => setExposureError(null), (e: Error) => {
      exposed.current.delete(viewing);
      setExposureError(`Opening the ${viewing === 'reading' ? 'reading' : 'worked example'} was not logged: ${e.message}`);
    });
  }, [viewing, conceptId]);

  useEffect(() => {
    if (step !== 'practice') return;
    api.retests().then((r) => { setRetests(r); setRetestsError(null); }, (e: Error) => setRetestsError(`Re-tests could not be loaded: ${e.message}`));
  }, [step]);

  const title = conceptTitle(titles, conceptId);
  if (error) return <p role="alert">{error}</p>;
  if (!lesson) return <p>Loading the lesson...</p>;

  function pretestClosed(r: ClosedResult) {
    const next = [...pretest, { passed: r.passed, helped: r.helped }];
    setPretest(next);
    if (next.length === 2) setStep(pretestSkipsLesson(next) ? 'practice' : 'reading');
  }
  function blockClosed(r: ClosedResult) { setBlock((b) => afterItem(b, r)); }

  const skipsLesson = pretestSkipsLesson(pretest);
  const stage = stageFor(block);
  const retest = retests.find((r) => r.conceptId === conceptId);
  return (
    <section className="lesson">
      <PageHead section="sql" title={title} crumb={crumbParts({ section: 'sql', level: titles?.get(conceptId)?.level ?? null, concept: null, place: null, hideLabels: false })} />
      <nav className="steps" aria-label="Lesson steps">{STEPS.map(([s, label]) => (
        <button key={s} type="button" aria-current={step === s ? 'step' : undefined} onClick={() => setStep(s)}>{step === s ? <strong>{label}</strong> : label}</button>
      ))}</nav>
      {exposureError && <p role="alert" className="notice">{exposureError}</p>}

      {step === 'pretest' && (pretest.length >= 2 ? (
        <p className="read-col">{skipsLesson ? 'You already know this. Go straight to practice.' : 'Pretest done. Start with the reading.'}</p>
      ) : !pretestStarted ? (
        <p className="read-col">Two quick questions. If you solve both without help, you can skip straight to practice.{' '}
          <button type="button" onClick={() => setPretestStarted(true)}>Start the pretest</button>{' '}
          <button type="button" onClick={() => setStep('reading')}>Skip the pretest</button></p>
      ) : (
        <div>
          <p className="read-col">Question {pretest.length + 1} of 2. <button type="button" onClick={() => setStep('reading')}>Skip the pretest</button></p>
          <ItemPanel key={lesson.pretest_item_ids[pretest.length]} itemId={lesson.pretest_item_ids[pretest.length]!} phase="pretest" onClosed={pretestClosed} />
        </div>
      ))}

      {step === 'reading' && (
        <article className="read-col">
          <Markdown sql text={lesson.reading_md} />
          <h3>Syntax</h3>
          <Markdown sql text={lesson.syntax_md} />
          {lesson.dialect_note && <p className="callout"><strong>Dialect note:</strong> {lesson.dialect_note}</p>}
          <button type="button" onClick={() => setStep('worked')}>Next: the worked example</button>
        </article>
      )}

      {step === 'worked' && (
        <div className="read-col">
          <WorkedExample example={lesson.worked_examples[0]} />
          {lesson.why_clause && <WhyClause why={lesson.why_clause} />}
          <button type="button" onClick={() => setStep('block')}>Start the lesson block</button>
        </div>
      )}

      {step === 'block' && (blockDone ? (
        <p>Lesson block done. The re-test opens later, after 3 more exercises; the Practice step shows when. Practise in the meantime.{' '}
          <button type="button" onClick={() => setStep('practice')}>Practice</button></p>
      ) : (
        <div>
          {block.showWorkedAgain && <><p>Here is the worked example again before the next item.</p><WorkedExample example={lesson.worked_examples[0]} /></>}
          <p className="muted">Item {block.index + 1} of {lesson.lesson_item_ids.length}. {stage === 3 ? 'Blank editor.' : `The grey text is written for you and cannot be changed. Write ${stage === 1 ? 'the missing part' : 'the rest of the query'}.`}</p>
          <ExercisePanel key={`${lesson.lesson_item_ids[block.index]}-${block.index}`} itemId={lesson.lesson_item_ids[block.index]!} phase="lesson_block" stage={stage} onClosed={blockClosed} />
        </div>
      ))}

      {step === 'practice' && (
        <div>
          {skipsLesson && <p className="callout">You solved both pretest questions without help, so you can skip the lesson. The reading, the worked example and the lesson block stay open above.</p>}
          {retestsError && <p role="alert" className="notice">{retestsError}</p>}
          {retest && <p className="callout">{retestCallout(title, retest, new Date())}
            {retest.ready && <>. <a href={`#/item/${retest.itemId}?phase=retest`}>Start the re-test</a></>}</p>}
          <h2>Practice</h2>
          <ol>{poolLabels(lesson.pool_item_ids).map((x) => <li key={x.id}><a href={`#/item/${x.id}`}>{x.label}</a></li>)}</ol>
        </div>
      )}
    </section>
  );
}
