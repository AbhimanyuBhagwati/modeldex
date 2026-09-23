export type Phase = 'idle' | 'charge' | 'transform' | 'collapse' | 'reveal';

/** Milestones measured from the start of one evolution, in milliseconds. */
export const EVOLUTION_TIMING = {
  transform: 1500,
  collapse: 3200,
  reveal: 3800,
  finish: 5600,
  intermission: 1200,
} as const;

export interface PlaybackState {
  picked: number | null;
  phase: Phase;
  journey: { id: number; from: number; to: number } | null;
  report: number | null;
  auto: boolean;
  serial: number;
}

export type PlaybackAction =
  | { type: 'start'; from: number; total: number; auto: boolean }
  | { type: 'phase'; id: number; phase: Exclude<Phase, 'idle' | 'charge'> }
  | { type: 'finish'; id: number }
  | { type: 'settle'; index: number }
  | { type: 'stopAuto' };

export const initialPlayback: PlaybackState = {
  picked: null,
  phase: 'idle',
  journey: null,
  report: null,
  auto: false,
  serial: 0,
};

const PHASE_ORDER: Record<Phase, number> = { idle: 0, charge: 1, transform: 2, collapse: 3, reveal: 4 };

/** Journey ids make delayed callbacks harmless after skipping or choosing another stage. */
export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case 'start': {
      if (!Number.isInteger(action.from) || !Number.isInteger(action.total) || action.from < 0 || action.from + 1 >= action.total) return state;
      const id = state.serial + 1;
      return { picked: action.from, phase: 'charge', journey: { id, from: action.from, to: action.from + 1 }, report: null, auto: action.auto, serial: id };
    }
    case 'phase': {
      if (state.journey?.id !== action.id || PHASE_ORDER[action.phase] <= PHASE_ORDER[state.phase]) return state;
      return {
        ...state,
        phase: action.phase,
        ...(action.phase === 'reveal' ? { picked: state.journey.to, report: state.journey.to } : {}),
      };
    }
    case 'finish': {
      if (state.journey?.id !== action.id) return state;
      return { ...state, picked: state.journey.to, report: state.journey.to, phase: 'idle', journey: null };
    }
    case 'settle': {
      if (!Number.isInteger(action.index) || action.index < 0) return state;
      return { ...state, picked: action.index, phase: 'idle', journey: null, report: action.index > 0 ? action.index : null, auto: false };
    }
    case 'stopAuto':
      return state.auto ? { ...state, auto: false } : state;
  }
}
