import type { Section } from './envelope.ts';

interface EventBase { schema_version: number; ts: string }

export interface SessionEvent extends EventBase {
  event: 'session';
  session_id: string;
  section: Section | 'all';
  phase: 'start' | 'end';
  active_minutes?: number;
  reason?: 'explicit' | 'idle' | 'recovered';
}
export interface SettingChange extends EventBase { event: 'setting_change'; key: 'exam_date' | 'goal_dates' | 'backup_folder'; value: unknown }
export interface ConfigChange extends EventBase { event: 'config_change'; config_id: string; preset: unknown; effective_ts: string }
export interface CardEvent extends EventBase {
  event: 'card_event';
  card_id: string;
  kind: 'leech_pause' | 'resume' | 'reset' | 'retire';
  rating?: 0;
  state?: 'New';
  due?: string;
}
export interface OverrideEvent extends EventBase { event: 'override_confirm' | 'override_revert'; attempt_id: string }
export interface OutsidePractice extends EventBase { event: 'outside_practice'; source: string; description: string; score?: string }
export interface ExternalResult extends EventBase {
  event: 'external_result';
  kind: 'ga4_exam' | 'portfolio_piece';
  data:
    | { date: string; score: number; passed: boolean }
    | { title: string; data_source: string; real_data: boolean };
}
export interface ReportEvent extends EventBase { event: 'content_report'; item_id: string; text: string }

export type AppEvent =
  | SessionEvent | SettingChange | ConfigChange | CardEvent | OverrideEvent
  | OutsidePractice | ExternalResult | ReportEvent;
