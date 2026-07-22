import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createOrchestratorApp } from './orchestrator-app';
import { createRtcAdapter } from './rtc-adapter';
import { SessionManagementService } from './session-management-service';
import { VideoBackgroundOrchestrationService } from './video-background-orchestration-service';
import type { RealtimeProvider } from './orchestrator-api.types';

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

const buildAppWithProvider = (provider: RealtimeProvider) => {
  const adapter = createRtcAdapter(provider);
  const sessionService = new SessionManagementService(30 * 60_000, 2_500, 2, adapter);
  const orchestrationService = new VideoBackgroundOrchestrationService(sessionService);
  return createOrchestratorApp(orchestrationService);
};

test('session creation reflects configured livekit adapter', async () => {
  const app = buildAppWithProvider('livekit');
  const response = await request(app).post('/api/v1/orchestrator/sessions').send(createSessionRequest).expect(201);

  assert.equal(response.body.realtime.provider, 'livekit');
  assert.match(response.body.realtime.room_name as string, /^sales_sess_/);
});

test('session creation reflects configured daily adapter', async () => {
  const app = buildAppWithProvider('daily');
  const response = await request(app).post('/api/v1/orchestrator/sessions').send(createSessionRequest).expect(201);

  assert.equal(response.body.realtime.provider, 'daily');
  assert.match(response.body.realtime.room_name as string, /^daily_sess_/);
});

test('session creation reflects configured agora adapter', async () => {
  const app = buildAppWithProvider('agora');
  const response = await request(app).post('/api/v1/orchestrator/sessions').send(createSessionRequest).expect(201);

  assert.equal(response.body.realtime.provider, 'agora');
  assert.match(response.body.realtime.room_name as string, /^agora_sess_/);
});

test('session creation reflects configured tencent adapter', async () => {
  const app = buildAppWithProvider('tencent_rtc');
  const response = await request(app).post('/api/v1/orchestrator/sessions').send(createSessionRequest).expect(201);

  assert.equal(response.body.realtime.provider, 'tencent_rtc');
  assert.match(response.body.realtime.room_name as string, /^trtc_sess_/);
});
