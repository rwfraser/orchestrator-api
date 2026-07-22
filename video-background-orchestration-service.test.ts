import test from 'node:test';
import assert from 'node:assert/strict';
import { VideoBackgroundOrchestrationService } from './video-background-orchestration-service';
import { SessionManagementService } from './session-management-service';
import type { CreateSessionRequest } from './orchestrator-api.types';
import { ApiValidationError } from './validation';

const createSessionRequest: CreateSessionRequest = {
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

test('processRealtimeEvent updates summary counters and tracks latest command/event', () => {
  const service = new VideoBackgroundOrchestrationService(new SessionManagementService(30 * 60_000, 0, 5));
  const session = service.createSession(createSessionRequest);

  service.submitTurn(session.session_id, {
    schema_version: '1.0',
    turn_id: 'turn-1',
    input: { type: 'text', text: 'show roi visuals' },
    context: { sales_stage: 'consideration', offer_id: 'offer_q3', current_scene_mode: 'AVATAR_LEAD' },
  });

  const result = service.processRealtimeEvent({
    schema_version: '1.0',
    session_id: session.session_id,
    turn_id: 'turn-1',
    event_id: 'evt-1',
    sequence: 1,
    event_type: 'scene_plan',
    sent_at: new Date().toISOString(),
    payload: {
      mode: 'VISUAL_LEAD',
      scene_type: 'roi_demo',
      asset_query: { product: 'myselfserve', persona: 'owner_operator', intent: 'price_justification' },
      avatar_layout: { position: 'bottom_right', scale: 0.35, z_index: 2 },
      transition: { type: 'push_left', duration_ms: 300 },
      guards: { min_mode_dwell_ms: 2500, max_switches_per_10s: 2 },
    },
  });

  assert.equal(result.summary.events_processed, 1);
  assert.equal(result.summary.commands_emitted, 1);
  assert.equal(result.summary.last_event_id, result.event.event_id);
  assert.equal(result.summary.last_command_id, result.latest_command?.command_id ?? null);
});

test('orchestrateScenePlan and orchestrateSceneTransition produce expected focus evolution', () => {
  const service = new VideoBackgroundOrchestrationService(new SessionManagementService(30 * 60_000, 0, 5));
  const session = service.createSession(createSessionRequest);

  service.submitTurn(session.session_id, {
    schema_version: '1.0',
    turn_id: 'turn-1',
    input: { type: 'text', text: 'show roi visuals' },
    context: { sales_stage: 'consideration', offer_id: 'offer_q3', current_scene_mode: 'AVATAR_LEAD' },
  });

  const first = service.orchestrateScenePlan(
    session.session_id,
    'turn-1',
    {
      mode: 'VISUAL_LEAD',
      scene_type: 'roi_demo',
      asset_query: { product: 'myselfserve', persona: 'owner_operator', intent: 'price_justification' },
      avatar_layout: { position: 'bottom_right', scale: 0.35, z_index: 2 },
      transition: { type: 'push_left', duration_ms: 300 },
      guards: { min_mode_dwell_ms: 2500, max_switches_per_10s: 2 },
    },
    1,
  );
  assert.equal(first.video_background_state.focus, 'VIDEO_FOREGROUND');

  const second = service.orchestrateSceneTransition(
    session.session_id,
    'turn-1',
    { from_mode: 'VISUAL_LEAD', to_mode: 'SPLIT_FOCUS', type: 'fade', duration_ms: 250 },
    2,
  );
  assert.equal(second.video_background_state.focus, 'SPLIT_FOCUS');
  assert.equal(second.summary.commands_emitted, 2);
});

test('getOrchestrationSummary returns zeroed defaults for unknown session', () => {
  const service = new VideoBackgroundOrchestrationService(new SessionManagementService());
  const summary = service.getOrchestrationSummary('missing-session');

  assert.equal(summary.commands_emitted, 0);
  assert.equal(summary.events_processed, 0);
  assert.equal(summary.last_command_id, null);
  assert.equal(summary.last_event_id, null);
  assert.equal(summary.updated_at, null);
});

test('endSession preserves runtime summary and updates timestamp', () => {
  const service = new VideoBackgroundOrchestrationService(new SessionManagementService(30 * 60_000, 0, 5));
  const session = service.createSession(createSessionRequest);

  service.submitTurn(session.session_id, {
    schema_version: '1.0',
    turn_id: 'turn-1',
    input: { type: 'text', text: 'show roi visuals' },
    context: { sales_stage: 'consideration', offer_id: 'offer_q3', current_scene_mode: 'AVATAR_LEAD' },
  });

  service.processRealtimeEvent({
    schema_version: '1.0',
    session_id: session.session_id,
    turn_id: 'turn-1',
    event_id: 'evt-1',
    sequence: 1,
    event_type: 'scene_plan',
    sent_at: new Date().toISOString(),
    payload: {
      mode: 'VISUAL_LEAD',
      scene_type: 'roi_demo',
      asset_query: { product: 'myselfserve', persona: 'owner_operator', intent: 'price_justification' },
      avatar_layout: { position: 'bottom_right', scale: 0.35, z_index: 2 },
      transition: { type: 'push_left', duration_ms: 300 },
      guards: { min_mode_dwell_ms: 2500, max_switches_per_10s: 2 },
    },
  });

  const before = service.getOrchestrationSummary(session.session_id);
  assert.equal(before.events_processed, 1);
  assert.equal(before.commands_emitted, 1);

  service.endSession(session.session_id);
  const after = service.getOrchestrationSummary(session.session_id);
  assert.equal(after.events_processed, 1);
  assert.equal(after.commands_emitted, 1);
  assert.equal(typeof after.updated_at, 'string');
});

test('processRealtimeEvent propagates validation errors for unknown session', () => {
  const service = new VideoBackgroundOrchestrationService(new SessionManagementService());

  assert.throws(
    () =>
      service.processRealtimeEvent({
        schema_version: '1.0',
        session_id: 'missing-session',
        turn_id: 'turn-1',
        event_id: 'evt-1',
        sequence: 1,
        event_type: 'scene_plan',
        sent_at: new Date().toISOString(),
        payload: {
          mode: 'VISUAL_LEAD',
          scene_type: 'roi_demo',
          asset_query: { product: 'myselfserve', persona: 'owner_operator', intent: 'price_justification' },
          avatar_layout: { position: 'bottom_right', scale: 0.35, z_index: 2 },
          transition: { type: 'push_left', duration_ms: 300 },
          guards: { min_mode_dwell_ms: 2500, max_switches_per_10s: 2 },
        },
      }),
    (error: unknown) =>
      error instanceof ApiValidationError &&
      error.failure.status === 404 &&
      error.failure.body.error.code === 'SESSION_NOT_FOUND',
  );
});
