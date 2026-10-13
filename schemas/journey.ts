// schemas/journey.ts: the study journey's event names and screens (owner decision D77, 2026-10-13). The server writes the events;
// the browser names its screens with these, and the server checks them.

/** The screens the browser reports, one per route family in web/src/App.tsx. A route App.tsx does not know shows Today. */
export const SCREENS = ['today', 'map', 'drill', 'mistakes', 'ga4_run', 'ga4_labs', 'ga4_lab', 'ga4_map', 'methodology_map',
  'reading', 'practice', 'lesson', 'inbox', 'case', 'opener', 'portfolio', 'progress', 'explore', 'item', 'setup'] as const;
export type Screen = typeof SCREENS[number];

/** The route the browser posts a screen view to. */
export const JOURNEY_PATH = '/api/journey';
/** A screen's subject: an item, concept, case or lab ID from the address. Anything else is dropped (browser) or refused (server). */
export const SUBJECT_ID = /^[A-Za-z0-9._:-]{1,80}$/;

export type JourneyEventName =
  | 'session_started' | 'session_ended' | 'screen_viewed'
  | 'lesson_started' | 'exercise_submitted' | 'exercise_passed' | 'exercise_failed'
  | 'item_viewed' | 'hint_opened' | 'answer_shown' | 'other_way_opened' | 'item_closed' | 'material_studied'
  | 'run_started' | 'run_finished'
  | 'case_opened' | 'case_self_check' | 'case_exported'
  | 'lab_opened' | 'lab_answered'
  | 'review_card_changed' | 'concept_state_changed'
  | 'study_session_started' | 'study_session_ended';
