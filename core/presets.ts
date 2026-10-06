import type { Section } from './envelope.ts';

export interface DeckPreset {
  deck: Section;
  desired_retention: number;
  learning_steps: string[];
  relearning_steps: string[];
  maximum_interval: number;
  enable_fuzz: boolean;
  exam_boost?: { retention: number; days_before: number };
}
