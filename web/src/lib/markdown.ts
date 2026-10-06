// web/src/lib/markdown.ts: a small renderer model for lesson text. It produces data, never HTML strings.
export type Inline = { kind: 'text' | 'code' | 'strong' | 'em'; text: string };
export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: 'para'; inlines: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'list'; items: Inline[][] }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] };

// Only a complete pair is emphasis. The text inside ** or * may not start or end with whitespace, so arithmetic
// such as `a * b * c` stays plain text, and an opening * needs a character that is not a letter, digit or _
// before it (or the start of the text), so unspaced `a*b*c` stays plain too (sprint 2). Anything that does not
// match is kept as written.
const INLINE = /`([^`]+)`|\*\*([^*\s](?:[^*]*[^*\s])?)\*\*|(?<!\w)\*([^*\s](?:[^*]*[^*\s])?)\*/g;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const text = (to: number) => { if (to > last) out.push({ kind: 'text', text: s.slice(last, to) }); };
  for (const m of s.matchAll(INLINE)) {
    text(m.index);
    if (m[1] !== undefined) out.push({ kind: 'code', text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'strong', text: m[2] });
    else out.push({ kind: 'em', text: m[3]! });
    last = m.index + m[0].length;
  }
  text(s.length);
  return out;
}

const cells = (line: string): string[] => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function parseMarkdown(md: string): Block[] {
  // Every line terminator becomes \n first, so no later regex sees one hidden inside a line.
  const lines = md.replace(/\r\n?|\u2028|\u2029/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) body.push(lines[i++]!);
      i++;
      out.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { out.push({ kind: 'heading', level: h[1]!.length as 1 | 2 | 3, inlines: parseInline(h[2]!) }); i++; continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) items.push(parseInline(lines[i++]!.replace(/^\s*[-*]\s+/, '')));
      out.push({ kind: 'list', items });
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(lines[i++]!);
      const [head, , ...body] = rows;
      out.push({ kind: 'table', header: cells(head!).map(parseInline), rows: body.map((r) => cells(r).map(parseInline)) });
      continue;
    }
    const para: string[] = [lines[i++]!];   // always consume the current line, so this loop cannot stall
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,3}\s|```|\s*[-*]\s|\s*\|)/.test(lines[i]!)) para.push(lines[i++]!);
    out.push({ kind: 'para', inlines: parseInline(para.join(' ')) });
  }
  return out;
}
