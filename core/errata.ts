// Format: markdown tables with the header | ID | Type | Source | Ref | Summary | Action | Slice |
export type ErrataType = 'fix' | 'owner_decision' | 'rejected' | 'deferred';
export interface ErrataEntry {
  id: string; type: ErrataType; source: string; ref: string; summary: string; action: string; slice: string;
}

const HEADER = ['ID', 'Type', 'Source', 'Ref', 'Summary', 'Action', 'Slice'];
const TYPES: ErrataType[] = ['fix', 'owner_decision', 'rejected', 'deferred'];

// A cell may hold a literal pipe (SQL such as `a || b`) written as `\|`. Only a pipe that is
// not preceded by a backslash separates cells.
function cells(line: string): string[] {
  return line.trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.replaceAll('\\|', '|').trim());
}

export function parseErrata(md: string): ErrataEntry[] {
  const out: ErrataEntry[] = [];
  let inTable = false;
  const lines = md.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    if (!line.trim().startsWith('|')) { inTable = false; continue; }
    const c = cells(line);
    if (c.join('|') === HEADER.join('|')) { inTable = true; continue; }
    if (!inTable || /^-+$/.test(c[0]!.replace(/:/g, ''))) continue;
    if (c.length !== HEADER.length) {
      throw new Error(`ERRATA line ${i + 1} (${c[0]}): expected ${HEADER.length} cells, found ${c.length}`);
    }
    const [id, type, source, ref, summary, action, slice] = c;
    if (!TYPES.includes(type as ErrataType)) throw new Error(`ERRATA ${id}: unknown type "${type}"`);
    out.push({ id: id!, type: type as ErrataType, source: source!, ref: ref!, summary: summary!, action: action!, slice: slice! });
  }
  return out;
}
