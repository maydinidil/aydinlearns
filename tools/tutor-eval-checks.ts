// tools/tutor-eval-checks.ts: the live eval's checks (AI tutor design §6, §12; sprint T, T11; seams review I2), kept apart from
// tools/tutor-eval.ts so a test can load them: this module reaches no model, no provider and no key, only the grader its caller passes.
// A reply fails when (a) before a pass it gives the answer, (b) before an answer to a choice question it goes through the options, or
// (c) it names nothing on its screen. After a pass, explaining is allowed (spec §6, rule 2), so only (c) applies. Each has its own reason.
// - SQL: any query in the reply that the app's grader passes on the item (each code block, inline code span and bare statement, whole
//   and split at semicolons and blank lines), and the blocks and spans that start like a clause joined in order (S7-36, K1 M2). A part
//   of a query in its own block or span that does not start with its clause's word (a SELECT-list item alone, say) is not joined.
// - Multiple choice: the reply singles out the correct option, by its text, its number, a letter or its place on the screen: it is the
//   only option the reply names at all; or a statement (not a question) names it alone with a word that picks it (correct, right, best,
//   fits, matches, the one, go with, pick, choose, it is, leaves); or the reply rules out every other option and not this one. A reply
//   that names every option, or none, with no such judgement, gives nothing away.
// - A typed (number) question: the reply states the number (S7-36): any number in it, with its minus (K1 M1), that rounds to the answer
//   at the question's decimals, written with a point or a comma for the decimals and either for thousands in groups of 3 (K1 M1). A single
//   digit is not checked: a teaching reply uses them.
// - Going through the options (prompt v4, rule 1; the live eval's Sonnet Q17): the reply's statements, not its questions, between them
//   describe at least three distinct options, or every option when there are fewer, counted as the leak check counts a mention. A mention
//   only lists an option to compare ("Compare the first, second and fourth options with the stem") when nothing else is said in its
//   sentence; a description counts in a statement, in a question about one option ("Does the first option count page views?"), and by the
//   option's own words with no place word at all ("One counts every page view twice"). S7-36.
// The checks are heuristics on purpose: the owner reads every reply in tutor-eval/<date>/, and `--recheck` re-scores them offline.

/** What a reply must not give before a pass. It stays in memory: never printed, never written. */
export type EvalAnswer =
  | { kind: 'sql'; itemId: string }
  /** `options`: every option's text, in the order the screen shows them; `position`: the correct one's place, from 1. */
  | { kind: 'option'; options: readonly string[]; position: number }
  /** A typed question: the correct value in the question's scale, and the decimals it is graded to. */
  | { kind: 'number'; value: number; decimals: number }
  | null;
/** The app's grader on one item: the grade's outcome, or null when the item or its key is missing or the grader throws. */
export type Grades = (itemId: string, sql: string) => Promise<{ outcome: string } | null>;
/** What the checks need of one eval question. */
export interface Scored { answer: EvalAnswer; words: readonly string[] }

export const GAVE_ANSWER = 'gave the answer';
export const WALKED = 'went through the options';
export const OFF_SCREEN = 'named nothing on the screen';
export const DECLINED = 'the model declined';
export const noReply = (failure: string): string => `no reply: ${failure}`;

/** Lower case, straight quotes and hyphens, no Markdown emphasis or code marks, one space for any run of white space. */
export const plainText = (s: string): string => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[‐-―]/g, '-').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
/** An option's text as a reply would quote it: plain, without its closing punctuation. */
export const optionText = (s: string): string => plainText(s).replace(/[.!?;:,]+$/, '');

/** Common words that name nothing on a screen; a screen word is 5 letters or more and not one of these. */
const COMMON = new Set(['about', 'above', 'after', 'again', 'against', 'along', 'already', 'although', 'always', 'among', 'another',
  'answer', 'answers', 'based', 'because', 'before', 'being', 'below', 'between', 'cannot', 'choose', 'correct', 'could', 'different',
  'doing', 'during', 'either', 'every', 'example', 'first', 'following', 'given', 'having', 'however', 'instead', 'itself', 'least',
  'might', 'never', 'often', 'option', 'options', 'other', 'others', 'question', 'really', 'right', 'second', 'should', 'since',
  'something', 'still', 'their', 'there', 'these', 'thing', 'things', 'think', 'third', 'those', 'three', 'through', 'under', 'until',
  'using', 'usually', 'where', 'whether', 'which', 'while', 'within', 'without', 'would', 'wrong', 'yours']);
export const screenWords = (...texts: string[]): string[] =>
  texts.flatMap((t) => t.split(/\W+/)).filter((w) => w.length >= 5 && !/^\d+$/.test(w) && !COMMON.has(w.toLowerCase()));
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The reply names one of the words, as a whole word, in any letter case. */
export const mentions = (reply: string, words: readonly string[]): boolean =>
  words.some((w) => w !== '' && new RegExp(`\\b${escape(w)}\\b`, 'i').test(reply));

// ---- SQL ------------------------------------------------------------------------------------------------------------------------------

const FENCE = /(```|~~~)[^\n]*\n([\s\S]*?)\1/g;
const INLINE = /`([^`\n]+)`/g;
const SQL_START = /^[ \t>*+-]*(?:select|with|from)\b/i;
/** Where a bare statement may start: a line that opens with SELECT, WITH or FROM (after list or quote marks), or SELECT in capitals. */
const LINE_START = /^[ \t>*+-]*(?=(?:select|with|from)\b)/i;
const CAPITAL_SELECT = /\bSELECT\b/g;
const BLANK_LINE = /\n[ \t]*\n/;
/** The most pieces of one reply that are tried joined (S7-36): the joined runs grow with its square. */
const MAX_PIECES = 12;
/**
 * K1 M2: a piece of a query handed over in parts starts like one of its clauses, with the clause's word and something after it, or with
 * the bracket that closes a CTE or a subquery. Only such pieces are joined, so a name (`amount`), a bare keyword (`GROUP BY`) or a block
 * of output between two parts does not break the run.
 */
const CLAUSE_PIECE = /^\s*(?:\)|(?:select|with|from|where|group\s+by|having|qualify|window|order\s+by|limit|offset|union|intersect|except|on|and|or|(?:(?:left|right|full|inner|cross|natural|semi|anti|asof|positional)\s+)*(?:outer\s+)?join)\b\s*\S)/i;

/**
 * Every text in a reply that could be a query: each fenced block and each inline code span that starts like a query, whole; and each
 * bare statement, from its start to the end of each line after it in its paragraph (so prose on the next line is left off). Each is also
 * tried split at blank lines and at semicolons, and without closing punctuation. More candidates cost only grader runs: a candidate
 * counts only when the app's grader passes it, so none can make a teaching reply a leak.
 */
export function sqlCandidates(reply: string): string[] {
  const out = new Set<string>();
  const add = (text: string): void => {
    for (const chunk of [text, ...text.split(BLANK_LINE)]) for (const piece of [chunk, ...chunk.split(';')]) {
      for (const t of [piece.trim(), piece.trim().replace(/[.,:]+$/, '')]) if (t !== '') out.add(t);
    }
  };
  // S7-36: a query handed over in pieces (a block per clause, or a span per clause) is also tried joined: every run of two or more
  // consecutive pieces, in the order they come, for the first MAX_PIECES pieces. K1 M2: only blocks and spans that start like a clause
  // (CLAUSE_PIECE) are pieces, so what is not SQL between them is left out before the runs are made.
  const pieces: { at: number; text: string }[] = [];
  const piece = (at: number, text: string): void => { if (CLAUSE_PIECE.test(text)) pieces.push({ at, text: text.trim() }); };
  for (const m of reply.matchAll(FENCE)) { add(m[2]!); piece(m.index, m[2]!); }
  const prose = reply.replace(FENCE, (m) => '\n\n'.padEnd(m.length, '\n'));              // the same length, so a span keeps its place in the reply
  for (const m of prose.matchAll(INLINE)) { if (SQL_START.test(m[1]!)) add(m[1]!); piece(m.index, m[1]!); }
  const ordered = pieces.sort((a, b) => a.at - b.at).slice(0, MAX_PIECES);
  for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) add(ordered.slice(i, j + 1).map((p) => p.text).join('\n'));
  for (const paragraph of prose.replace(/`/g, '').split(BLANK_LINE)) {
    const lines = paragraph.split('\n');
    lines.forEach((line, k) => {
      const starts = new Set<number>([...line.matchAll(CAPITAL_SELECT)].map((m) => m.index));
      const lead = LINE_START.exec(line);
      if (lead) starts.add(lead[0].length);
      for (const s of starts) {
        for (let last = k; last < lines.length; last++) add([line.slice(s), ...lines.slice(k + 1, last + 1)].join('\n'));
      }
    });
  }
  return [...out];
}

// ---- Multiple choice ------------------------------------------------------------------------------------------------------------------

/** An option text shorter than this is a common phrase a reply may use for other reasons, so only its place, number or letter names it. */
export const MIN_OPTION_TEXT = 12;
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ORDINAL_DIGITS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** A mention of options in the working text: their places between two control characters, which no reply text holds after `prepare`. */
const MARK = /\u0001([\d,]+)\u0002/;
const mark = (places: readonly number[]): string => ` \u0001${places.join(',')}\u0002 `;
/** An option quoted by its text: the mark, then QUOTED, so a sentence that reads an option out is known to say something about it (S7-36). */
const QUOTED = '\u0003';
const quotedMark = (place: number): string => ` \u0001${place}\u0002${QUOTED} `;

/** A place word or number as a position from 1: "third", "3rd", "three", "3", "#3", "last". */
function placeOf(word: string, count: number): number | null {
  const w = word.replace(/^#/, '');
  for (const list of [ORDINALS, ORDINAL_DIGITS, NUMBER_WORDS]) { const i = list.indexOf(w); if (i >= 0) return i + 1; }
  if (w === 'last' || w === 'bottom' || w === 'final') return count;
  if (w === 'top') return 1;
  return /^\d{1,2}$/.test(w) ? Number(w) : null;
}

/** Every place a list names ("1, 2 and 4", "first and third", "1 to 3", "1-3"); places that are not options are dropped. */
function placesIn(list: string, count: number): number[] {
  const out = new Set<number>();
  const rest = list.replace(/(#?\w+)\s*(?:-|\bto\b|\bthrough\b)\s*(#?\w+)/g, (_m, a: string, b: string) => {
    const [x, y] = [placeOf(a, count), placeOf(b, count)];
    if (x !== null && y !== null) for (let p = Math.min(x, y); p <= Math.max(x, y); p++) out.add(p);
    return ' ';
  });
  for (const w of rest.split(/[\s,&()]+|\band\b|\bor\b|\bthe\b/)) {
    const p = w ? placeOf(w, count) : null;
    if (p !== null) out.add(p);
  }
  return [...out].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
}

const SEP = String.raw`(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or|to|through)\s+|\s*-\s*|\s*&\s*)`;
const NUM = String.raw`#?\d{1,2}`;
/** "option 3", "options 1, 2 and 4", "choice #2", "answer 3". */
const NUM_LIST = new RegExp(String.raw`\b(?:options?|choices?|answers?|numbers?|no\.)\s*(${NUM}(?:${SEP}${NUM})*)\b`, 'g');
/** "option three". */
const WORD_NUM = new RegExp(String.raw`\b(?:options?|choices?)\s+(${NUMBER_WORDS.join('|')})\b`, 'g');
const ORD = `(?:${[...ORDINALS, ...ORDINAL_DIGITS, 'last', 'top', 'bottom', 'final'].join('|')})`;
/** "the third option", "the third one", "the first, second and fourth options". */
const ORD_LIST = new RegExp(String.raw`\b(?:the\s+)?(${ORD}(?:${SEP}(?:the\s+)?${ORD})*)\s+(?:options?|choices?|answers?|ones?|statements?)\b`, 'g');
/** "the answer is 3", "the right one is 3": a bare number after "is". */
const SAYS = /\b(answer|one|option|choice|pick)\s+(is|would be|must be|should be):?\s+(?:number\s+)?(#?\d{1,2})\b(?![.,]\d)(?!\s*%)/g;
const HASH = /#(\d{1,2})\b/g;
/** "Option C", "options A, B and D": a capital letter, as a model may label options the screen does not letter. Not "option A/B". */
const LETTER_LIST = /\b(?:[Oo]ptions?|[Cc]hoices?)\s+\(?[A-H]\)?(?:(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+)\(?[A-H]\)?)*(?![\w'/])/g;

/**
 * The reply in sentences, every mention of an option replaced by a mark that holds its places: its text (when 12 characters or more,
 * longest first), a letter, a number or list of numbers, a number word, an ordinal or list of ordinals, "#3", "the answer is 3".
 */
function markedSentences(reply: string, options: readonly string[]): { text: string; question: boolean }[] {
  const count = options.length;
  let s = reply.replace(/[\u0001\u0002\u0003]/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―]/g, '-')
    .replace(/[*_`]/g, '').replace(/[ \t]+/g, ' ');
  const texts = options.map((o, i) => ({ text: optionText(o), place: i + 1 })).filter((o) => o.text.length >= MIN_OPTION_TEXT)
    .sort((a, b) => b.text.length - a.text.length);
  for (const o of texts) s = s.replace(new RegExp(o.text.split(' ').map(escape).join('\\s+'), 'gi'), quotedMark(o.place));
  s = s.replace(LETTER_LIST, (m) => {
    const places = [...m.replace(/^\S+/, '').matchAll(/[A-H]/g)].map((x) => x[0].charCodeAt(0) - 64).filter((p) => p <= count);
    return places.length > 0 ? mark(places) : m;
  });
  s = s.toLowerCase();
  // Each mention becomes a mark; `keep` gives back the words of a match that are not the mention ("the answer is" before a bare number).
  const swap = (re: RegExp, group: number, keep = (_match: string[]): string => ''): void => {
    s = s.replace(re, (...args: string[]) => {
      const places = placesIn(args[group]!, count);
      return places.length > 0 ? `${keep(args)}${mark(places)}` : args[0]!;
    });
  };
  swap(NUM_LIST, 1);
  swap(WORD_NUM, 1);
  swap(ORD_LIST, 1);
  swap(SAYS, 3, (a) => `${a[1]} ${a[2]} `);
  swap(HASH, 1);
  return s.split(/(?<=[.!?;])\s+|\n+/).map((t) => t.trim()).filter((t) => t !== '')
    .map((t) => ({ text: t, question: /\?["')\]\s]*$/.test(t) }));
}

/** Each mention of options in a sentence, with the text before it (from the last mention) and after it (to the next). */
function mentionsIn(sentence: string): { places: number[]; before: string; after: string }[] {
  const parts = sentence.split(MARK);
  const out: { places: number[]; before: string; after: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) out.push({ places: parts[i]!.split(',').map(Number), before: parts[i - 1]!, after: parts[i + 1] ?? '' });
  return out;
}

/** Words that pick an option: anywhere in a statement that names only the correct one, or in the text that follows its mention. */
const YES = /\b(?:correct|right|best|better|fits?|matches|match|works|the one|go with|go for|pick|choose|select|opt for|leaves|remains)\b/;
/** Words just before a mention that pick it: "go with", "pick the", "it is", "the answer is", "that leaves". */
const YES_BEFORE = /(?:\b(?:pick|choose|select|go with|go for|opt for|it's|it is|that's|that is|leaves|leaving)|\b(?:answer|one|option|choice|fit)\s+(?:is|would be|must be|should be))\s*:?\s*(?:the\s+)?$/;
/** Words just before a mention that rule it out: "rule out", "eliminate", "not", "neither", "nor", "can't be". */
const NO_BEFORE = /\b(?:rule out|rules out|ruled out|ruling out|eliminate[ds]?|eliminating|exclude[ds]?|excluding|cross out|drop|discard|not|never|neither|nor|isn't|aren't|can't be|cannot be)\s*(?:(?:is|are|does|do|the)\s+)*:?\s*$/;
/** Words after a mention that rule it out. */
const NO_AFTER = /\b(?:wrong|incorrect|not|never|cannot|false|untrue|eliminated|excluded|ruled out|mistaken)\b|n't\b/;

/**
 * Before an answer: the reply singles out the correct option (`position`, from 1, among `options` as the screen shows them), as the
 * header says. Pure; `options` and the reply are never printed.
 */
export function optionLeak(reply: string, options: readonly string[], position: number): boolean {
  const named = new Set<number>();
  const ruledOut = new Set<number>();
  for (const s of markedSentences(reply, options)) {
    const ms = mentionsIn(s.text);
    for (const m of ms) for (const p of m.places) named.add(p);
    if (s.question || ms.length === 0) continue;                          // a guiding question judges nothing
    const judged = ms.map((m, i) => {
      // The text after a mention ends where the next mention's own words start ("option 3, not option 1": the "not" is option 1's).
      const own = i < ms.length - 1 ? m.after.replace(NO_BEFORE, '') : m.after;
      const no = NO_BEFORE.test(m.before) || NO_AFTER.test(own);
      return { places: m.places, no, yes: !no && (YES_BEFORE.test(m.before) || YES.test(own)) };
    });
    const only = (j: { places: number[] }): boolean => j.places.length === 1 && j.places[0] === position;
    if (judged.every(only) && YES.test(s.text) && !judged.some((j) => j.no)) return true;
    if (judged.some((j) => only(j) && j.yes)) return true;
    for (const j of judged) if (j.no) for (const p of j.places) ruledOut.add(p);
  }
  if (named.size === 1 && named.has(position)) return true;              // the only option named at all, statement or question
  const others = options.map((_o, i) => i + 1).filter((p) => p !== position);
  return others.length > 0 && !ruledOut.has(position) && others.every((p) => ruledOut.has(p));
}

/** A walk through the options names this many of them in statements, or every option of a shorter list. */
export const WALK_OPTIONS = 3;

/** Words that say nothing about an option: what a sentence uses to point at options and ask the learner to look, not to say what they are. */
const NOT_A_DESCRIPTION = new Set(('the and for with from into onto over than then them they this that these those what when where which while whose '
  + 'does did will would could should have has had been being are was were not but you your yours can may might must one ones any all each both also just '
  + 'only very more most less some such same other another about again against back carefully closely slowly versus '
  + 'compare comparing compared read reread look looking check checking consider think thinking see review weigh test try ask remember notice note '
  + 'first second third fourth fifth sixth seventh eighth ninth tenth last top bottom final option options choice choices answer answers stem question '
  + 'questions statement statements number numbers right wrong correct best better true false fits match matches').split(/\s+/));
const wordsOf = (text: string): string[] => text.toLowerCase().match(/[a-z]{3,}/g) ?? [];
const withoutMarks = (sentence: string): string => sentence.replace(/\u0001[\d,]+\u0002/g, ' ');
/**
 * A sentence says something about the options it names when it quotes one by its text, or when two words of it, with its option marks
 * taken out, are not pointing words.
 */
const describes = (sentence: string): boolean => sentence.includes(QUOTED) || wordsOf(withoutMarks(sentence)).filter((w) => !NOT_A_DESCRIPTION.has(w)).length >= 2;

/**
 * For each option, the words of its text that no other option has (4 letters or more, not a pointing word): a sentence with two of an
 * option's words names it with no place word, as "One counts every page view twice" names the first option.
 */
function ownWords(options: readonly string[]): Set<string>[] {
  const sets = options.map((o) => new Set(wordsOf(optionText(o)).filter((w) => w.length >= 4 && !NOT_A_DESCRIPTION.has(w))));
  return sets.map((set, i) => new Set([...set].filter((w) => sets.every((other, j) => j === i || !other.has(w)))));
}

/**
 * Before an answer (prompt v4, rule 1; S7-36): the reply describes at least WALK_OPTIONS distinct options, or every option of a shorter
 * list. An option is described by a statement that names it (as `optionLeak` counts a mention) and says something else, by a question
 * about that one option that says something else ("Does the first option count page views?"), or by a statement that uses two words only
 * that option's text has, with no place word at all. A sentence that only lists options to compare ("Compare the first, second and fourth
 * options with the stem") describes none, and neither does a question that names several at once or one that names every option at once
 * ("options 1 to 4"), which says nothing about any one of them. Saying what each option is about lets the learner pick by matching,
 * though no option is called right. Pure; `options` and the reply are never printed.
 */
export function walkedThrough(reply: string, options: readonly string[]): boolean {
  const named = new Set<number>();
  const own = ownWords(options);
  for (const s of markedSentences(reply, options)) {
    const mentions = mentionsIn(s.text);
    if (s.question) {
      // A question describes an option when it names that one option alone and says something about it.
      if (mentions.length === 1 && mentions[0]!.places.length === 1 && describes(s.text)) named.add(mentions[0]!.places[0]!);
      continue;
    }
    if (describes(s.text)) for (const m of mentions) if (m.places.length < options.length) for (const p of m.places) named.add(p);
    const used = new Set(wordsOf(withoutMarks(s.text)));
    own.forEach((words, i) => { if ([...words].filter((w) => used.has(w)).length >= 2) named.add(i + 1); });
  }
  return options.length > 0 && named.size >= Math.min(WALK_OPTIONS, options.length);
}

// ---- A typed number -------------------------------------------------------------------------------------------------------------------

/**
 * A run of digits read with `thousands` as the thousands mark and `decimal` as the decimal mark (K1 M1): NaN when it is not a number
 * written that way, as when a thousands group is not 3 digits (`1,2,3` and `10,20,30` are lists, `12,50` is no thousand) or a decimal
 * part holds another mark.
 */
function readNumber(run: string, thousands: string, decimal: string): number {
  const [whole, fraction, ...more] = run.split(decimal);
  if (more.length || (fraction !== undefined && !/^\d+$/.test(fraction))) return NaN;
  const groups = whole!.split(thousands);
  if (groups.length > 1 && !(/^\d{1,3}$/.test(groups[0]!) && groups.slice(1).every((g) => /^\d{3}$/.test(g)))) return NaN;
  return Number(`${groups.join('')}${fraction === undefined ? '' : `.${fraction}`}`);
}

/**
 * A number's digits, with the minus before them when it is a sign (K1 M1): a hyphen-minus or a minus sign that follows no letter, digit,
 * point, comma or other minus, so the hyphen in `10-12` or `2024-12` is not one.
 */
const NUMBER_RUN = /(?:(?<![\w.,\-−])[-−])?(?:\d[\d.,]*\d|\d)/g;

/**
 * Before an answer to a typed question (S7-36): the reply states the number. Every run of digits in it, with its minus (K1 M1), is read
 * both ways a number is written (a comma for thousands and a point for decimals, or the reverse; a reading whose thousands groups are not
 * 3 digits is not one, K1 M1), and counts when it rounds to `value` at `decimals`. A single digit is not checked: a teaching reply counts
 * "1 buyer" and "2 days". Pure; the value and the reply are never printed.
 */
export function numberLeak(reply: string, value: number, decimals: number): boolean {
  if (!Number.isFinite(value) || (Number.isInteger(value) && Math.abs(value) < 10)) return false;
  const within = 10 ** -decimals / 2 + 1e-9;
  for (const m of reply.matchAll(NUMBER_RUN)) {
    const negative = /^[-−]/.test(m[0]);
    const digits = negative ? m[0].slice(1) : m[0];
    const readings = [readNumber(digits, ',', '.'), readNumber(digits, '.', ',')];    // 1,250.5 and 1.250,5
    if (readings.some((n) => Number.isFinite(n) && Math.abs((negative ? -n : n) - value) <= within)) return true;
  }
  return false;
}

// ---- Scoring --------------------------------------------------------------------------------------------------------------------------

/** The reply gives the answer before a pass. After a pass (`answer` null) there is nothing to give, and the grader is not asked. */
export async function leaked(answer: EvalAnswer, reply: string, grades: Grades): Promise<boolean> {
  if (answer === null) return false;
  if (answer.kind === 'option') return optionLeak(reply, answer.options, answer.position);
  if (answer.kind === 'number') return numberLeak(reply, answer.value, answer.decimals);
  for (const sql of sqlCandidates(reply)) if ((await grades(answer.itemId, sql))?.outcome === 'pass') return true;
  return false;
}

/** Why a reply that came fails: the answer given, the options gone through (a choice before an answer), nothing on its screen named. */
export async function reasonsFor(c: Scored, reply: string, grades: Grades): Promise<string[]> {
  return [
    ...((await leaked(c.answer, reply, grades)) ? [GAVE_ANSWER] : []),
    ...(c.answer?.kind === 'option' && walkedThrough(reply, c.answer.options) ? [WALKED] : []),
    ...(mentions(reply, c.words) ? [] : [OFF_SCREEN]),
  ];
}

export const verdictOf = (why: readonly string[]): string => (why.length === 0 ? 'PASS' : `FAIL (${why.join(', ')})`);

const SEPARATOR = '\n\n---\n\n';
const MAX_TOKENS_NOTE = ' (the reply stopped at max_tokens)';
/** A reply file as the eval writes it: the verdict line, then the reply after the first line of three dashes. Null for any other file. */
export function parseSaved(file: string): { verdict: string; reply: string } | null {
  const text = file.replace(/\r\n/g, '\n');
  const at = text.indexOf(SEPARATOR);
  const verdict = at < 0 ? null : /^Verdict: (.*)$/m.exec(text.slice(0, at));
  if (!verdict) return null;
  return { verdict: verdict[1]!.replace(MAX_TOKENS_NOTE, ''), reply: text.slice(at + SEPARATOR.length).replace(/\n$/, '') };
}

/**
 * A saved reply scored again with today's checks (`--recheck`): a reply that never came keeps its verdict, a declined one keeps that
 * reason, and the answer and screen checks run on the saved text.
 */
export async function rescore(c: Scored, saved: { verdict: string; reply: string }, grades: Grades): Promise<string> {
  const kept = (/^FAIL \((.*)\)$/.exec(saved.verdict)?.[1]?.split(', ') ?? []).filter((r) => r.startsWith(noReply('')) || r === DECLINED);
  if (kept.some((r) => r.startsWith(noReply('')))) return verdictOf(kept);
  return verdictOf([...kept, ...(await reasonsFor(c, saved.reply, grades))]);
}
