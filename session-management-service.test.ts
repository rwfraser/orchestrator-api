import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManagementService } from './session-management-service';
import type { CreateSessionRequest, RealtimeEvent, SubmitTurnRequest } from './orchestrator-api.types';
import { ApiValidationError } from './validation';
import type { RtcAdapter } from './rtc-adapter';

const createSessionInput: CreateSessionRequest = {
  schema_version: '1.0',
  tenant_id: 'tenant_test',
  user_id: 'user_test',
  locale: 'en-US',
  persona: 'owner_operator',
  channel: 'web',
  features: {
    rag_enabled: true,
    barge_in_enabled: true,
    visual_generation_enabled: false,
  },
  client_capabilities: {
    webrtc: true,
    websocket_fallback: true,
  },
};

const makeTurnInput = (turnId: string): SubmitTurnRequest => ({
  schema_version: '1.0',
  turn_id: turnId,
  input: {
    type: 'text',
    text: 'How quickly is ROI?',
  },
  context: {
    sales_stage: 'consideration',
    offer_id: 'offer_q3',
    current_scene_mode: 'AVATAR_LEAD',
  },
});

const makeAssistantDeltaEvent = (sessionId: string, turnId: string, sequence: number): RealtimeEvent => ({
  schema_version: '1.0',
  session_id: sessionId,
  turn_id: turnId,
  event_id: `evt-${sequence}`,
  sequence,
  event_type: 'assistant_text_delta',
  sent_at: new Date().toISOString(),
  payload: { delta: 'Hello' },
});

const makeTurnCompleteEvent = (sessionId: string, turnId: string, sequence: number): RealtimeEvent => ({
  schema_version: '1.0',
  session_id: sessionId,
  turn_id: turnId,
  event_id: `evt-${sequence}`,
  sequence,
  event_type: 'turn_complete',
  sent_at: new Date().toISOString(),
  payload: { status: 'ok' },
});

const makeFatalErrorEvent = (sessionId: string, turnId: string, sequence: number): RealtimeEvent => ({
  schema_version: '1.0',
  session_id: sessionId,
  turn_id: turnId,
  event_id: `evt-${sequence}`,
  sequence,
  event_type: 'error',
  sent_at: new Date().toISOString(),
  payload: {
    code: 'INTERNAL_ERROR',
    severity: 'fatal',
    message: 'provider down',
    fallback_applied: false,
  },
});

const makeScenePlanEvent = (sessionId: string, turnId: string, sequence: number): RealtimeEvent => ({
  schema_version: '1.0',
  session_id: sessionId,
  turn_id: turnId,
  event_id: `evt-${sequence}`,
  sequence,
  event_type: 'scene_plan',
  sent_at: new Date().toISOString(),
  payload: {
    mode: 'VISUAL_LEAD',
    scene_type: 'roi_demo',
    asset_query: {
      product: 'myselfserve',
      persona: 'owner_operator',
      intent: 'price_justification',
    },
    avatar_layout: {
      position: 'bottom_right',
      scale: 0.35,
      z_index: 2,
    },
    transition: {
      type: 'push_left',
      duration_ms: 300,
    },
    guards: {
      min_mode_dwell_ms: 2500,
      max_switches_per_10s: 2,
    },
  },
});

test('createSession initializes active session with AVATAR_LEAD mode', () => {
  const service = new SessionManagementService();
  const created = service.createSession(createSessionInput);
  const state = service.getSession(created.session_id);

  assert.equal(state.session_id, created.session_id);
  assert.equal(state.status, 'active');
  assert.equal(state.active_turn_id, null);
  assert.equal(state.scene_mode, 'AVATAR_LEAD');
});

test('createSession uses injected rtc adapter and endSession releases connection once', () => {
  const calls: { provision: number; release: number } = { provision: 0, release: 0 };
  const adapter: RtcAdapter = {
    provisionConnection: ({ session_id }) => {
      calls.provision += 1;
      return {
        transport: 'webrtc',
        provider: 'agora',
        room_name: `agora_${session_id}`,
        join_token: 'agora-token',
      };
    },
    releaseConnection: () => {
      calls.release += 1;
    },
  };

  const service = new SessionManagementService(30 * 60_000, 2_500, 2, adapter);
  const created = service.createSession(createSessionInput);
  assert.equal(created.realtime.provider, 'agora');
  assert.match(created.realtime.room_name, /^agora_sess_/);
  assert.equal(calls.provision, 1);

  service.endSession(created.session_id);
  service.endSession(created.session_id);
  assert.equal(calls.release, 1);
});

test('submitTurn accepts first turn and blocks another in-progress turn', () => {
  const service = new SessionManagementService();
  const session = service.createSession(createSessionInput);

  const first = service.submitTurn(session.session_id, makeTurnInput('turn-1'));
  assert.equal(first.status, 'accepted');

  assert.throws(
    () => service.submitTurn(session.session_id, makeTurnInput('turn-2')),
    (error: unknown) =>
      error instanceof ApiValidationError &&
      error.failure.status === 409 &&
      error.failure.body.error.code === 'INVALID_REQUEST',
  );
});

test('ingestEvent normalizes sequence and turn_complete clears active turn for next submission', () => {
  const service = new SessionManagementService();
  const session = service.createSession(createSessionInput);
  service.submitTurn(session.session_id, makeTurnInput('turn-1'));

  const evt1 = service.ingestEvent(session.session_id, makeAssistantDeltaEvent(session.session_id, 'turn-1', 1));
  assert.equal(evt1.sequence, 1);

  const evt2 = service.ingestEvent(session.session_id, makeTurnCompleteEvent(session.session_id, 'turn-1', 2));
  assert.equal(evt2.sequence, 2);

  const stateAfter = service.getSession(session.session_id);
  assert.equal(stateAfter.active_turn_id, null);

  const secondTurn = service.submitTurn(session.session_id, makeTurnInput('turn-2'));
  assert.equal(secondTurn.turn_id, 'turn-2');
});

test('fatal error event fails the turn and allows a new turn', () => {
  const service = new SessionManagementService();
  const session = service.createSession(createSessionInput);
  service.submitTurn(session.session_id, makeTurnInput('turn-1'));

  const errorEvt = service.ingestEvent(session.session_id, makeFatalErrorEvent(session.session_id, 'turn-1', 1));
  assert.equal(errorEvt.event_type, 'error');

  const stateAfter = service.getSession(session.session_id);
  assert.equal(stateAfter.active_turn_id, null);

  const next = service.submitTurn(session.session_id, makeTurnInput('turn-2'));
  assert.equal(next.status, 'accepted');
});

test('rejects out-of-order event sequence', () => {
  const service = new SessionManagementService();
  const session = service.createSession(createSessionInput);
  service.submitTurn(session.session_id, makeTurnInput('turn-1'));

  service.ingestEvent(session.session_id, makeAssistantDeltaEvent(session.session_id, 'turn-1', 1));

  assert.throws(
    () => service.ingestEvent(session.session_id, makeAssistantDeltaEvent(session.session_id, 'turn-1', 1)),
    (error: unknown) =>
      error instanceof ApiValidationError &&
      error.failure.status === 409 &&
      error.failure.body.error.message.includes('Out-of-order event sequence'),
  );
});

test('scene_transition rejects mismatched from_mode', () => {
  const service = new SessionManagementService(30 * 60_000, 0, 5);
  const session = service.createSession(createSessionInput);
  service.submitTurn(session.session_id, makeTurnInput('turn-1'));

  const badTransition: RealtimeEvent = {
    schema_version: '1.0',
    session_id: session.session_id,
    turn_id: 'turn-1',
    event_id: 'evt-1',
    sequence: 1,
    event_type: 'scene_transition',
    sent_at: new Date().toISOString(),
    payload: {
      from_mode: 'SPLIT_FOCUS',
      to_mode: 'VISUAL_LEAD',
      type: 'fade',
      duration_ms: 250,
    },
  };

  assert.throws(
    () => service.ingestEvent(session.session_id, badTransition),
    (error: unknown) =>
      error instanceof ApiValidationError &&
      error.failure.status === 409 &&
      error.failure.body.error.message.includes('Scene transition mismatch'),
  );
});

test('scene_transition enforces max mode switches per 10 seconds', () => {
  const service = new SessionManagementService(30 * 60_000, 0, 1);
  const session = service.createSession(createSessionInput);
  service.submitTurn(session.session_id, makeTurnInput('turn-1'));

  const transitionOne: RealtimeEvent = {
    schema_version: '1.0',
    session_id: session.session_id,
    turn_id: 'turn-1',
    event_id: 'evt-1',
    sequence: 1,
    event_type: 'scene_transition',
    sent_at: new Date().toISOString(),
    payload: {
      from_mode: 'AVATAR_LEAD',
      to_mode: 'SPLIT_FOCUS',
      type: 'push_left',
      duration_ms: 300,
    },
  };

  const transitionTwo: RealtimeEvent = {
    schema_version: '1.0',
    session_id: session.session_id,
    turn_id: 'turn-1',
    event_id: 'evt-2',
    sequence: 2,
    event_type: 'scene_transition',
    sent_at: new Date().toISOString(),
    payload: {
      from_mode: 'SPLIT_FOCUS',
      to_mode: 'VISUAL_LEAD',
      type: 'push_left',
      duration_ms: 300,
    },
  };

  const first = service.ingestEvent(session.session_id, transitionOne);
  assert.equal(first.sequence, 1);

  assert.throws(
    () => service.ingestEvent(session.session_id, transitionTwo),
    (error: unknown) =>
      error instanceof ApiValidationError &&
      error.failure.status === 409 &&
      error.failure.body.error.message.includes('violated mode transition guards'),
  );
});

test('scene_plan emits a video background command and updates controller state', () => {
  const service = new SessionManagementService(30 * 60_000, 0, 5);
  const session = service.createSession(createSessionInput);
  service.submitTurn(session.session_id, makeTurnInput('turn-1'));

  service.ingestEvent(session.session_id, makeScenePlanEvent(session.session_id, 'turn-1', 1));

  const commands = service.listVideoBackgroundCommands(session.session_id);
  assert.equal(commands.length, 1);
  assert.equal(commands[0]?.kind, 'APPLY_SCENE_PLAN');
  assert.equal(commands[0]?.focus, 'VIDEO_FOREGROUND');
  assert.equal(commands[0]?.scene_type, 'roi_demo');

  const state = service.getVideoBackgroundState(session.session_id);
  assert.equal(state.mode, 'VISUAL_LEAD');
  assert.equal(state.focus, 'VIDEO_FOREGROUND');
  assert.equal(state.scene_type, 'roi_demo');
});

test('scene_transition emits transition command and keeps scene context', () => {
  const service = new SessionManagementService(30 * 60_000, 0, 5);
  const session = service.createSession(createSessionInput);
  service.submitTurn(session.session_id, makeTurnInput('turn-1'));

  service.ingestEvent(session.session_id, makeScenePlanEvent(session.session_id, 'turn-1', 1));

  const transitionEvent: RealtimeEvent = {
    schema_version: '1.0',
    session_id: session.session_id,
    turn_id: 'turn-1',
    event_id: 'evt-2',
    sequence: 2,
    event_type: 'scene_transition',
    sent_at: new Date().toISOString(),
    payload: {
      from_mode: 'VISUAL_LEAD',
      to_mode: 'SPLIT_FOCUS',
      type: 'fade',
      duration_ms: 250,
    },
  };

  service.ingestEvent(session.session_id, transitionEvent);
  const commands = service.listVideoBackgroundCommands(session.session_id);
  assert.equal(commands.length, 2);
  assert.equal(commands[1]?.kind, 'APPLY_SCENE_TRANSITION');
  assert.equal(commands[1]?.focus, 'SPLIT_FOCUS');
  assert.equal(commands[1]?.scene_type, 'roi_demo');

  const state = service.getVideoBackgroundState(session.session_id);
  assert.equal(state.mode, 'SPLIT_FOCUS');
  assert.equal(state.focus, 'SPLIT_FOCUS');
  assert.equal(state.scene_type, 'roi_demo');
});

