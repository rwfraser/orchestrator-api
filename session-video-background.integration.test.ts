import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createOrchestratorApp } from './orchestrator-app';
import { SessionManagementService } from './session-management-service';
import { VideoBackgroundOrchestrationService } from './video-background-orchestration-service';

const createSessionRequest = {
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
} as const;

const makeTurnRequest = (turnId: string) => ({
  schema_version: '1.0',
  turn_id: turnId,
  input: {
    type: 'text',
    text: 'show me ROI',
  },
  context: {
    sales_stage: 'consideration',
    offer_id: 'offer_q3',
    current_scene_mode: 'AVATAR_LEAD',
  },
});

const makeScenePlanEvent = (sessionId: string, turnId: string, sequence: number) => ({
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

test('POST scene_plan triggers APPLY_SCENE_PLAN video background command', async () => {
  const service = new VideoBackgroundOrchestrationService(new SessionManagementService(30 * 60_000, 0, 5));
  const app = createOrchestratorApp(service);

  const createRes = await request(app).post('/api/v1/orchestrator/sessions').send(createSessionRequest).expect(201);
  const sessionId = createRes.body.session_id as string;

  await request(app).post(`/api/v1/orchestrator/sessions/${sessionId}/turns`).send(makeTurnRequest('turn-1')).expect(202);

  await request(app)
    .post('/api/v1/orchestrator/internal/events')
    .send(makeScenePlanEvent(sessionId, 'turn-1', 1))
    .expect(200);

  const commandsRes = await request(app)
    .get(`/api/v1/orchestrator/internal/sessions/${sessionId}/video-background/commands`)
    .expect(200);

  assert.equal(Array.isArray(commandsRes.body.commands), true);
  assert.equal(commandsRes.body.commands.length, 1);
  assert.equal(commandsRes.body.commands[0].kind, 'APPLY_SCENE_PLAN');
  assert.equal(commandsRes.body.commands[0].mode, 'VISUAL_LEAD');
  assert.equal(commandsRes.body.commands[0].focus, 'VIDEO_FOREGROUND');
  assert.equal(commandsRes.body.commands[0].scene_type, 'roi_demo');
});

test('scene_transition event appends APPLY_SCENE_TRANSITION command with expected focus', async () => {
  const service = new VideoBackgroundOrchestrationService(new SessionManagementService(30 * 60_000, 0, 5));
  const app = createOrchestratorApp(service);

  const createRes = await request(app).post('/api/v1/orchestrator/sessions').send(createSessionRequest).expect(201);
  const sessionId = createRes.body.session_id as string;

  await request(app).post(`/api/v1/orchestrator/sessions/${sessionId}/turns`).send(makeTurnRequest('turn-1')).expect(202);

  await request(app)
    .post('/api/v1/orchestrator/internal/events')
    .send(makeScenePlanEvent(sessionId, 'turn-1', 1))
    .expect(200);

  await request(app)
    .post('/api/v1/orchestrator/internal/events')
    .send({
      schema_version: '1.0',
      session_id: sessionId,
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
    })
    .expect(200);

  const commandsRes = await request(app)
    .get(`/api/v1/orchestrator/internal/sessions/${sessionId}/video-background/commands`)
    .expect(200);

  assert.equal(commandsRes.body.commands.length, 2);
  assert.equal(commandsRes.body.commands[1].kind, 'APPLY_SCENE_TRANSITION');
  assert.equal(commandsRes.body.commands[1].mode, 'SPLIT_FOCUS');
  assert.equal(commandsRes.body.commands[1].focus, 'SPLIT_FOCUS');

  const stateRes = await request(app)
    .get(`/api/v1/orchestrator/internal/sessions/${sessionId}/video-background/state`)
    .expect(200);

  assert.equal(stateRes.body.state.mode, 'SPLIT_FOCUS');
  assert.equal(stateRes.body.state.focus, 'SPLIT_FOCUS');

  const summaryRes = await request(app)
    .get(`/api/v1/orchestrator/internal/sessions/${sessionId}/video-background/summary`)
    .expect(200);
  assert.equal(summaryRes.body.summary.events_processed, 2);
  assert.equal(summaryRes.body.summary.commands_emitted, 2);
  assert.equal(typeof summaryRes.body.summary.last_command_id, 'string');
});
