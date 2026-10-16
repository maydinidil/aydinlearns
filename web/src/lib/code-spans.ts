// web/src/lib/code-spans.ts: splits a line at its backtick pairs so the screen can show the text between them as code (sprint 6, Task G4).
// The server's unavailable-case line (server/content.ts unavailableLine) keeps its backticks; the inbox renders them as <code>.
export interface TextPart { text: string; code: boolean }

/** The text between a pair of backticks is code; a lone backtick or an empty pair stays as written. */
export function codeSpans(line: string): TextPart[] {
  const parts: TextPart[] = [];
  let plain = '';
  let rest = line;
  for (;;) {
    const open = rest.indexOf('`');
    const close = open === -1 ? -1 : rest.indexOf('`', open + 1);
    if (close === -1 || close === open + 1) {
      // No usable pair here: an empty pair is kept as text, and the search goes on after it.
      if (close === open + 1 && open !== -1) { plain += rest.slice(0, close + 1); rest = rest.slice(close + 1); continue; }
      break;
    }
    plain += rest.slice(0, open);
    if (plain) parts.push({ text: plain, code: false });
    plain = '';
    parts.push({ text: rest.slice(open + 1, close), code: true });
    rest = rest.slice(close + 1);
  }
  plain += rest;
  if (plain) parts.push({ text: plain, code: false });
  return parts;
}
