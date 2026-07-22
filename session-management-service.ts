import { randomUUID } from 'node:crypto';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  EndSessionResponse,
  GetSessionResponse,
  RealtimeEvent,
  RealtimeEventEnvelope,
  SceneMode,
  ScenePlanPayload,
  SubmitTurnRequest,
  SubmitTurnResponse,
} from './orchestrator-api.types';
import { ApiValidationError, makeApiError } from './validation';
import {
  RealtimeVideoBackgroundController,
  type VideoBackgroundCommand,
  type VideoBackgroundControllerState,
} from './video-background-controller';

type TurnState = 'accepted' | 'streaming' | 'completed' | 'failed';
type SessionState = 'active' | 'ended';

interface TurnRuntimeState {
  turn_id: string;
  state: TurnState;
  created_at: string;
  updated_at: string;
}

interface SessionRuntimeState {
  session_id: string;
  status: SessionState;
  created_at: string;
  expires_at: string;
  scene_mode: SceneMode;
  last_scene_mode_change_ms: number;
  mode_change_window_ms: number[];
  sequence_counter: number;
  active_turn_id: string | null;
  turns: Map<string, TurnRuntimeState>;
  events: RealtimeEvent[];
  video_background_controller: RealtimeVideoBackgroundController;
}

export class SessionManagementService {
  private readonly sessions = new Map<string, SessionRuntimeState>();

  constructor(
    private readonly sessionTtlMs = 30 * 60_000,
    private readonly minModeDwellMs = 2_500,
    private readonly maxModeSwitchesPer10s = 2,
  ) {}

  createSession(input: CreateSessionRequest): CreateSessionResponse {
    const sessionId = `sess_${randomUUID()}`;
    const now = Date.now();
    const expiresAt = new Date(now + this.sessionTtlMs).toISOString();
    const roomName = `sales_${sessionId}`;

    const response: CreateSessionResponse = {
      schema_version: input.schema_version,
      session_id: sessionId,
      expires_at: expiresAt,
      realtime: {
        transport: 'webrtc',
        provider: 'livekit',
        room_name: roomName,
        join_token: 'replace-with-ephemeral-rtc-token',
      },
    };

    this.sessions.set(sessionId, {
      session_id: sessionId,
      status: 'active',
      created_at: new Date(now).toISOString(),
      expires_at: expiresAt,
      scene_mode: 'AVATAR_LEAD',
      last_scene_mode_change_ms: now,
      mode_change_window_ms: [],
      sequence_counter: 0,
      active_turn_id: null,
      turns: new Map<string, TurnRuntimeState>(),
      events: [],
      video_background_controller: new RealtimeVideoBackgroundController('AVATAR_LEAD'),
    });

    return response;
  }

  getSession(sessionId: string): GetSessionResponse {
    const session = this.requireSession(sessionId);
    this.expireSessionIfNeeded(session);

    return {
      schema_version: '1.0',
      session_id: session.session_id,
      status: session.status,
      active_turn_id: session.active_turn_id,
      scene_mode: session.scene_mode,
      provider_health: {
        rtc: 'ok',
        avatar: 'ok',
        tts: 'ok',
      },
    };
  }

  endSession(sessionId: string): EndSessionResponse {
    const session = this.requireSession(sessionId);
    session.status = 'ended';
    session.active_turn_id = null;

    return {
      schema_version: '1.0',
      session_id: session.session_id,
      status: 'ended',
    };
  }

  submitTurn(sessionId: string, input: SubmitTurnRequest): SubmitTurnResponse {
    const session = this.requireSession(sessionId);
    this.ensureSessionIsUsable(session);

    if (session.active_turn_id) {
      const active = session.turns.get(session.active_turn_id);
      if (active && active.state !== 'completed' && active.state !== 'failed') {
        throw new ApiValidationError(
          makeApiError('INVALID_REQUEST', `Turn '${active.turn_id}' is still in progress`, { status: 409 }),
        );
      }
    }

    const nowIso = new Date().toISOString();
    session.active_turn_id = input.turn_id;
    session.turns.set(input.turn_id, {
      turn_id: input.turn_id,
      state: 'accepted',
      created_at: nowIso,
      updated_at: nowIso,
    });

    return {
      schema_version: input.schema_version,
      turn_id: input.turn_id,
      status: 'accepted',
      stream_channel: 'realtime',
    };
  }

  ingestEvent(sessionId: string, event: RealtimeEvent): RealtimeEvent {
    const session = this.requireSession(sessionId);
    this.ensureSessionIsUsable(session);

    const turn = this.requireTurn(session, event.turn_id);
    this.ensureTurnCanAcceptEvent(session, turn, event);

    const normalized = this.normalizeEvent(session, event);
    this.applyEventStateTransition(session, turn, normalized);
    session.events.push(normalized);

    return normalized;
  }

  listEvents(sessionId: string): RealtimeEvent[] {
    const session = this.requireSession(sessionId);
    this.expireSessionIfNeeded(session);
    return [...session.events];
  }

  listVideoBackgroundCommands(sessionId: string): VideoBackgroundCommand[] {
    const session = this.requireSession(sessionId);
    this.expireSessionIfNeeded(session);
    return session.video_background_controller.listCommands();
  }

  getVideoBackgroundState(sessionId: string): VideoBackgroundControllerState {
    const session = this.requireSession(sessionId);
    this.expireSessionIfNeeded(session);
    return session.video_background_controller.getState();
  }

  private requireSession(sessionId: string): SessionRuntimeState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ApiValidationError(makeApiError('SESSION_NOT_FOUND', `Session '${sessionId}' was not found`, { status: 404 }));
    }
    return session;
  }

  private ensureSessionIsUsable(session: SessionRuntimeState): void {
    this.expireSessionIfNeeded(session);
    if (session.status === 'ended') {
      throw new ApiValidationError(makeApiError('INVALID_REQUEST', `Session '${session.session_id}' is ended`, { status: 409 }));
    }
  }

  private expireSessionIfNeeded(session: SessionRuntimeState): void {
    const now = Date.now();
    if (new Date(session.expires_at).getTime() <= now) {
      session.status = 'ended';
      session.active_turn_id = null;
    }
  }

  private requireTurn(session: SessionRuntimeState, turnId: string): TurnRuntimeState {
    const turn = session.turns.get(turnId);
    if (!turn) {
      throw new ApiValidationError(
        makeApiError('INVALID_REQUEST', `Unknown turn '${turnId}' for session '${session.session_id}'`, { status: 400 }),
      );
    }
    return turn;
  }

  private ensureTurnCanAcceptEvent(
    session: SessionRuntimeState,
    turn: TurnRuntimeState,
    event: RealtimeEvent,
  ): void {
    if (session.active_turn_id !== turn.turn_id && turn.state !== 'completed' && turn.state !== 'failed') {
      throw new ApiValidationError(
        makeApiError(
          'INVALID_REQUEST',
          `Turn '${turn.turn_id}' is not active; active turn is '${session.active_turn_id ?? 'none'}'`,
          { status: 409 },
        ),
      );
    }

    if (turn.state === 'completed' || turn.state === 'failed') {
      throw new ApiValidationError(
        makeApiError('INVALID_REQUEST', `Turn '${turn.turn_id}' is already ${turn.state}`, { status: 409 }),
      );
    }

    if (event.sequence <= session.sequence_counter) {
      throw new ApiValidationError(
        makeApiError(
          'INVALID_REQUEST',
          `Out-of-order event sequence '${event.sequence}'. Last sequence is '${session.sequence_counter}'`,
          { status: 409 },
        ),
      );
    }
  }

  private normalizeEvent(session: SessionRuntimeState, event: RealtimeEvent): RealtimeEvent {
    const nextSequence = session.sequence_counter + 1;
    const eventId = event.event_id || `evt_${randomUUID()}`;
    const sentAt = new Date().toISOString();

    const normalized: RealtimeEventEnvelope = {
      ...event,
      schema_version: '1.0',
      event_id: eventId,
      sequence: nextSequence,
      sent_at: sentAt,
      session_id: session.session_id,
    };

    session.sequence_counter = nextSequence;
    return normalized as RealtimeEvent;
  }

  private applyEventStateTransition(
    session: SessionRuntimeState,
    turn: TurnRuntimeState,
    event: RealtimeEvent,
  ): void {
    const nowIso = new Date().toISOString();

    switch (event.event_type) {
      case 'assistant_text_delta':
      case 'assistant_text_final':
      case 'voice_chunk_ready':
      case 'timing_cue':
      case 'avatar_layout_update':
        if (turn.state === 'accepted') turn.state = 'streaming';
        turn.updated_at = nowIso;
        break;
      case 'scene_plan':
        if (turn.state === 'accepted') turn.state = 'streaming';
        this.tryApplySceneModeFromScenePlan(session, event.payload.mode);
        this.applyVideoBackgroundScenePlan(session, event.payload, session.scene_mode);
        turn.updated_at = nowIso;
        break;
      case 'scene_transition':
        if (turn.state === 'accepted') turn.state = 'streaming';
        this.applySceneTransition(session, event.payload.from_mode, event.payload.to_mode);
        session.video_background_controller.applySceneTransition(event.payload);
        turn.updated_at = nowIso;
        break;
      case 'turn_complete':
        turn.state = 'completed';
        turn.updated_at = nowIso;
        if (session.active_turn_id === turn.turn_id) {
          session.active_turn_id = null;
        }
        break;
      case 'error':
        if (event.payload.severity === 'fatal') {
          turn.state = 'failed';
          if (session.active_turn_id === turn.turn_id) {
            session.active_turn_id = null;
          }
        } else if (turn.state === 'accepted') {
          turn.state = 'streaming';
        }
        turn.updated_at = nowIso;
        break;
      default:
        break;
    }
  }

  private tryApplySceneModeFromScenePlan(session: SessionRuntimeState, mode: SceneMode): void {
    if (mode === session.scene_mode) return;
    if (!this.canChangeSceneMode(session, mode)) return;
    this.commitSceneModeChange(session, mode);
  }

  private applyVideoBackgroundScenePlan(
    session: SessionRuntimeState,
    payload: ScenePlanPayload,
    effectiveMode: SceneMode,
  ): void {
    const normalizedPayload: ScenePlanPayload = {
      ...payload,
      mode: effectiveMode,
    };
    session.video_background_controller.applyScenePlan(normalizedPayload);
  }

  private applySceneTransition(session: SessionRuntimeState, fromMode: SceneMode, toMode: SceneMode): void {
    if (session.scene_mode !== fromMode) {
      throw new ApiValidationError(
        makeApiError(
          'INVALID_REQUEST',
          `Scene transition mismatch. Current mode '${session.scene_mode}', received from_mode '${fromMode}'`,
          { status: 409 },
        ),
      );
    }

    if (!this.canChangeSceneMode(session, toMode)) {
      throw new ApiValidationError(
        makeApiError('INVALID_REQUEST', `Scene mode change to '${toMode}' violated mode transition guards`, { status: 409 }),
      );
    }

    this.commitSceneModeChange(session, toMode);
  }

  private canChangeSceneMode(session: SessionRuntimeState, nextMode: SceneMode): boolean {
    if (nextMode === session.scene_mode) return true;

    const now = Date.now();
    const dwellSatisfied = now - session.last_scene_mode_change_ms >= this.minModeDwellMs;
    if (!dwellSatisfied) return false;

    const windowStart = now - 10_000;
    session.mode_change_window_ms = session.mode_change_window_ms.filter((ts) => ts >= windowStart);
    return session.mode_change_window_ms.length < this.maxModeSwitchesPer10s;
  }

  private commitSceneModeChange(session: SessionRuntimeState, nextMode: SceneMode): void {
    const now = Date.now();
    session.scene_mode = nextMode;
    session.last_scene_mode_change_ms = now;
    session.mode_change_window_ms.push(now);
  }
}

export const sessionManagementService = new SessionManagementService();