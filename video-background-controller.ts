import { randomUUID } from 'node:crypto';
import type { AssetQuery, SceneMode, ScenePlanPayload, SceneTransitionPayload } from './orchestrator-api.types';

export type VideoFocusMode = 'VIDEO_FOREGROUND' | 'AVATAR_FOREGROUND' | 'SPLIT_FOCUS';

export interface VideoBackgroundControllerState {
  mode: SceneMode;
  focus: VideoFocusMode;
  scene_type: string;
  asset_query: AssetQuery | null;
  last_transition_type: string;
  last_transition_duration_ms: number;
  updated_at: string;
}

export interface VideoBackgroundCommand {
  command_id: string;
  kind: 'APPLY_SCENE_PLAN' | 'APPLY_SCENE_TRANSITION';
  mode: SceneMode;
  focus: VideoFocusMode;
  scene_type: string;
  asset_query: AssetQuery | null;
  transition_type: string;
  duration_ms: number;
  issued_at: string;
}

export class RealtimeVideoBackgroundController {
  private state: VideoBackgroundControllerState;
  private readonly commands: VideoBackgroundCommand[] = [];

  constructor(initialMode: SceneMode = 'AVATAR_LEAD') {
    this.state = {
      mode: initialMode,
      focus: this.resolveFocus(initialMode),
      scene_type: 'default',
      asset_query: null,
      last_transition_type: 'none',
      last_transition_duration_ms: 0,
      updated_at: new Date().toISOString(),
    };
  }

  applyScenePlan(payload: ScenePlanPayload): VideoBackgroundCommand {
    const now = new Date().toISOString();
    const command: VideoBackgroundCommand = {
      command_id: `vbg_${randomUUID()}`,
      kind: 'APPLY_SCENE_PLAN',
      mode: payload.mode,
      focus: this.resolveFocus(payload.mode),
      scene_type: payload.scene_type,
      asset_query: payload.asset_query,
      transition_type: payload.transition.type,
      duration_ms: payload.transition.duration_ms,
      issued_at: now,
    };

    this.state = {
      mode: command.mode,
      focus: command.focus,
      scene_type: command.scene_type,
      asset_query: command.asset_query,
      last_transition_type: command.transition_type,
      last_transition_duration_ms: command.duration_ms,
      updated_at: now,
    };
    this.commands.push(command);

    return command;
  }

  applySceneTransition(payload: SceneTransitionPayload): VideoBackgroundCommand {
    const now = new Date().toISOString();
    const command: VideoBackgroundCommand = {
      command_id: `vbg_${randomUUID()}`,
      kind: 'APPLY_SCENE_TRANSITION',
      mode: payload.to_mode,
      focus: this.resolveFocus(payload.to_mode),
      scene_type: this.state.scene_type,
      asset_query: this.state.asset_query,
      transition_type: payload.type,
      duration_ms: payload.duration_ms,
      issued_at: now,
    };

    this.state = {
      ...this.state,
      mode: command.mode,
      focus: command.focus,
      last_transition_type: command.transition_type,
      last_transition_duration_ms: command.duration_ms,
      updated_at: now,
    };
    this.commands.push(command);

    return command;
  }

  getState(): VideoBackgroundControllerState {
    return { ...this.state };
  }

  listCommands(): VideoBackgroundCommand[] {
    return [...this.commands];
  }

  private resolveFocus(mode: SceneMode): VideoFocusMode {
    if (mode === 'VISUAL_LEAD') return 'VIDEO_FOREGROUND';
    if (mode === 'SPLIT_FOCUS') return 'SPLIT_FOCUS';
    return 'AVATAR_FOREGROUND';
  }
}
