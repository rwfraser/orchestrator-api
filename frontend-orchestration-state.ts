import type { RealtimeEvent } from './orchestrator-api.types';

export type PresentationMode = 'AVATAR_LEAD' | 'SPLIT_FOCUS' | 'VISUAL_LEAD';
export type VisualFocus = 'AVATAR_FOREGROUND' | 'SPLIT_FOCUS' | 'VIDEO_FOREGROUND';

export interface FrontendPresentationState {
  mode: PresentationMode;
  focus: VisualFocus;
  sceneType: string;
  transitionType: string;
  transitionDurationMs: number;
  lastEventType: RealtimeEvent['event_type'] | null;
}

export const initialPresentationState: FrontendPresentationState = {
  mode: 'AVATAR_LEAD',
  focus: 'AVATAR_FOREGROUND',
  sceneType: 'default',
  transitionType: 'none',
  transitionDurationMs: 250,
  lastEventType: null,
};

export const focusFromMode = (mode: PresentationMode): VisualFocus => {
  if (mode === 'VISUAL_LEAD') return 'VIDEO_FOREGROUND';
  if (mode === 'SPLIT_FOCUS') return 'SPLIT_FOCUS';
  return 'AVATAR_FOREGROUND';
};

export const applyRealtimeEventToPresentation = (
  current: FrontendPresentationState,
  event: RealtimeEvent,
): FrontendPresentationState => {
  switch (event.event_type) {
    case 'scene_plan':
      return {
        mode: event.payload.mode,
        focus: focusFromMode(event.payload.mode),
        sceneType: event.payload.scene_type,
        transitionType: event.payload.transition.type,
        transitionDurationMs: event.payload.transition.duration_ms,
        lastEventType: event.event_type,
      };
    case 'scene_transition':
      return {
        ...current,
        mode: event.payload.to_mode,
        focus: focusFromMode(event.payload.to_mode),
        transitionType: event.payload.type,
        transitionDurationMs: event.payload.duration_ms,
        lastEventType: event.event_type,
      };
    default:
      return {
        ...current,
        lastEventType: event.event_type,
      };
  }
};
