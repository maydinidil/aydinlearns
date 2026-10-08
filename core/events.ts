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
/** `portfolio_folder` since log version 4 (D35): the folder a case's portfolio page and CSV are exported to. */
export interface SettingChange extends EventBase { event: 'setting_change'; key: 'exam_date' | 'goal_dates' | 'backup_folder' | 'portfolio_folder'; value: unknown }
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
/** The real GA4 exam, entered in Settings (design §2.1 stage 1). */
export interface ExternalGa4Exam extends EventBase { event: 'external_result'; kind: 'ga4_exam'; data: { date: string; score: number; passed: boolean } }
/** A finalised portfolio piece, entered in Settings (design §2.1 stage 1). */
export interface ExternalPortfolioPiece extends EventBase {
  event: 'external_result'; kind: 'portfolio_piece'; data: { title: string; data_source: string; real_data: boolean };
}
/** Since log version 4, a union on `kind`, so each kind's data has its own shape; the records themselves are unchanged. */
export type ExternalResult = ExternalGa4Exam | ExternalPortfolioPiece;
export interface ReportEvent extends EventBase { event: 'content_report'; item_id: string; text: string }
/**
 * D35 (log version 4, S4B-16): one portfolio export of a solved case. `files` are the names written into the portfolio folder
 * (the page and the CSV), and `data_source` is the label the page carries.
 */
export interface CaseExport extends EventBase { event: 'case_export'; case_id: string; files: string[]; data_source: string }

export type AppEvent =
  | SessionEvent | SettingChange | ConfigChange | CardEvent | OverrideEvent
  | OutsidePractice | ExternalResult | ReportEvent | CaseExport;
