// schemas/presets.ts (design §5)
import type { DeckPreset } from '../core/presets.ts';

export const PRESETS: Record<'sql' | 'ga4' | 'methodology', DeckPreset> = {
  sql: { deck: 'sql', desired_retention: 0.9, learning_steps: ['15m'], relearning_steps: ['15m'], maximum_interval: 180, enable_fuzz: true },
  ga4: { deck: 'ga4', desired_retention: 0.9, learning_steps: ['15m'], relearning_steps: ['15m'], maximum_interval: 180, enable_fuzz: true, exam_boost: { retention: 0.93, days_before: 14 } },
  methodology: { deck: 'methodology', desired_retention: 0.9, learning_steps: ['15m'], relearning_steps: ['15m'], maximum_interval: 180, enable_fuzz: true },
};

// S2-13: the scheduler config IDs live with the wrapper in core/scheduler.ts. Re-exported here, so each preset and its ID
// are found in one place.
export { CONFIG_IDS } from '../core/scheduler.ts';
