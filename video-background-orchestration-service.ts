import { randomUUID } from 'node:crypto';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  EndSessionResponse,
  GetSessionResponse,
  RealtimeEvent,
  ScenePlanPayload,
  SceneTransitionPayload,
  SubmitTurnRequest,
  SubmitTurnResponse,
} from './orchestrator-api.types';
import { SessionManagementService } from './session-management-service';
import type { VideoBackgroundCommand, VideoBackgroundControllerState } from './video-background-controller';

export interface OrchestrationSummary {
  commands_emitted: number;
  events_processed: number;
  last_command_id: string | null;
  last_event_id: string | null;
  updated_at: string | null;
}

export interface ProcessRealtimeEventResult {
  event: RealtimeEvent;
  latest_command: VideoBackgroundCommand | null;
  video_background_state: VideoBackgroundControllerState;
  summary: OrchestrationSummary;
}

interface SessionOrchestrationRuntime {
  commands_emitted: number;
  events_processed: number;
  last_command_id: string | null;
  last_event_id: string | null;
  updated_at: string | null;
}

export class VideoBackgroundOrchestrationService {
  private readonly sessionRuntime = new Map<string, SessionOrchestrationRuntime>();

  constructor(private readonly sessionService: SessionManagementService = new SessionManagementService()) {}

  createSession(input: CreateSessionRequest): CreateSessionResponse {
    const session = this.sessionService.createSession(input);
    this.sessionRuntime.set(session.session_id, {
      commands_emitted: 0,
      events_processed: 0,
      last_command_id: null,
      last_event_id: null,
      updated_at: new Date().toISOString(),
    });
    return session;
  }

  getSession(sessionId: string): GetSessionResponse {
    return this.sessionService.getSession(sessionId);
  }

  endSession(sessionId: string): EndSessionResponse {
    const response = this.sessionService.endSession(sessionId);
    this.touchRuntime(sessionId, {});
    return response;
  }

  submitTurn(sessionId: string, input: SubmitTurnRequest): SubmitTurnResponse {
    return this.sessionService.submitTurn(sessionId, input);
  }

  processRealtimeEvent(event: RealtimeEvent): ProcessRealtimeEventResult {
    const normalized = this.sessionService.ingestEvent(event.session_id, event);
    const commands = this.sessionService.listVideoBackgroundCommands(event.session_id);
    const latestCommand = commands.length > 0 ? commands[commands.length - 1] ?? null : null;

    this.touchRuntime(event.session_id, {
      events_processed_increment: 1,
      last_event_id: normalized.event_id,
      last_command_id: latestCommand?.command_id ?? null,
      commands_emitted: commands.length,
    });

    return {
      event: normalized,
      latest_command: latestCommand,
      video_background_state: this.sessionService.getVideoBackgroundState(event.session_id),
      summary: this.getOrchestrationSummary(event.session_id),
    };
  }

  orchestrateScenePlan(
    sessionId: string,
    turnId: string,
    payload: ScenePlanPayload,
    sequence: number,
  ): ProcessRealtimeEventResult {
    return this.processRealtimeEvent({
      schema_version: '1.0',
      session_id: sessionId,
      turn_id: turnId,
      event_id: `evt_${randomUUID()}`,
      sequence,
      event_type: 'scene_plan',
      sent_at: new Date().toISOString(),
      payload,
    });
  }

  orchestrateSceneTransition(
    sessionId: string,
    turnId: string,
    payload: SceneTransitionPayload,
    sequence: number,
  ): ProcessRealtimeEventResult {
    return this.processRealtimeEvent({
      schema_version: '1.0',
      session_id: sessionId,
      turn_id: turnId,
      event_id: `evt_${randomUUID()}`,
      sequence,
      event_type: 'scene_transition',
      sent_at: new Date().toISOString(),
      payload,
    });
  }

  listEvents(sessionId: string): RealtimeEvent[] {
    return this.sessionService.listEvents(sessionId);
  }

  listVideoBackgroundCommands(sessionId: string): VideoBackgroundCommand[] {
    return this.sessionService.listVideoBackgroundCommands(sessionId);
  }

  getVideoBackgroundState(sessionId: string): VideoBackgroundControllerState {
    return this.sessionService.getVideoBackgroundState(sessionId);
  }

  getOrchestrationSummary(sessionId: string): OrchestrationSummary {
    const runtime = this.sessionRuntime.get(sessionId);
    if (!runtime) {
      return {
        commands_emitted: 0,
        events_processed: 0,
        last_command_id: null,
        last_event_id: null,
        updated_at: null,
      };
    }

    return {
      commands_emitted: runtime.commands_emitted,
      events_processed: runtime.events_processed,
      last_command_id: runtime.last_command_id,
      last_event_id: runtime.last_event_id,
      updated_at: runtime.updated_at,
    };
  }

  private touchRuntime(
    sessionId: string,
    update: {
      events_processed_increment?: number;
      commands_emitted?: number;
      last_command_id?: string | null;
      last_event_id?: string | null;
    },
  ): void {
    const current = this.sessionRuntime.get(sessionId) ?? {
      commands_emitted: 0,
      events_processed: 0,
      last_command_id: null,
      last_event_id: null,
      updated_at: null,
    };

    const next: SessionOrchestrationRuntime = {
      commands_emitted: update.commands_emitted ?? current.commands_emitted,
      events_processed: current.events_processed + (update.events_processed_increment ?? 0),
      last_command_id: update.last_command_id ?? current.last_command_id,
      last_event_id: update.last_event_id ?? current.last_event_id,
      updated_at: new Date().toISOString(),
    };
    this.sessionRuntime.set(sessionId, next);
  }
}

export const videoBackgroundOrchestrationService = new VideoBackgroundOrchestrationService();
