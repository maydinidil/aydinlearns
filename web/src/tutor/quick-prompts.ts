// web/src/tutor/quick-prompts.ts: the quick prompts beside a failed grade (spec §4). Each only fills the question; the learner sends it.
export interface QuickPrompt { label: string; question: string }

export function quickPrompts(g: { outcome: string; errorId: string | null }): QuickPrompt[] {
  if (g.outcome === 'pass') return [];
  return [
    { label: 'Why is this wrong?', question: 'Why is this wrong?' },
    ...(g.errorId ? [{ label: 'Explain this error', question: `Explain this error (${g.errorId}) for my query.` }] : []),
    { label: 'Give me a hint', question: 'Give me a hint.' },
  ];
}
