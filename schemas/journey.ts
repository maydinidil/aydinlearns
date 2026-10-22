// schemas/journey.ts: the study journey's event names and screens (owner decision D77, 2026-10-13). The server writes the events;
// the browser names its screens with these, and the server checks them.

/**
 * The screens the browser reports, one per route family in web/src/App.tsx. A route App.tsx does not know shows Today. Sprint 7 (Task M2,
 * S7-18): `mocks` is the Recruiter mocks screen, `mock` a mock's start screen and its run, `mock_review` an ended run's review.
 */
export const SCREENS = ['today', 'map', 'drill', 'mistakes', 'ga4_run', 'ga4_labs', 'ga4_lab', 'ga4_map', 'methodology_map',
  'reading', 'practice', 'lesson', 'inbox', 'case', 'opener', 'portfolio', 'progress', 'explore', 'item', 'setup',
  'mocks', 'mock', 'mock_review'] as const;
export type Screen = typeof SCREENS[number];

/**
 * The run kinds `run_started` and `run_finished` name: an SQL drill's (level, chosen, cumulative), a live rep, a GA4 run's, and (sprint 7,
 * Task M2) the screen mock's; Part 2 (Task N3, N1 M11) the knowledge, case-round and take-home mocks'. The journey is not the learning log.
 */
export const JOURNEY_RUN_KINDS = ['level', 'chosen', 'cumulative', 'live_rep', 'mini_drill', 'half_mock', 'full_mock', 'screen_mock',
  'knowledge_mock', 'case_round_mock', 'take_home_mock'] as const;
export type JourneyRunKind = typeof JOURNEY_RUN_KINDS[number];

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
  | 'lab_opened' | 'lab_answered' | 'tutor_asked'
  | 'review_card_changed' | 'concept_state_changed'
  | 'study_session_started' | 'study_session_ended';
