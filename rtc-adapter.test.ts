import test from 'node:test';
import assert from 'node:assert/strict';
import { createRtcAdapter } from './rtc-adapter';
import type { CreateSessionRequest, RealtimeProvider } from './orchestrator-api.types';

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

const buildConnection = (provider: RealtimeProvider) => {
  const adapter = createRtcAdapter(provider);
  return adapter.provisionConnection({
    session_id: 'sess_test',
    expires_at: new Date().toISOString(),
    request: createSessionInput,
  });
};

test('createRtcAdapter returns provider-specific realtime metadata for all supported providers', () => {
  const livekit = buildConnection('livekit');
  assert.equal(livekit.provider, 'livekit');
  assert.equal(livekit.transport, 'webrtc');
  assert.equal(livekit.room_name, 'sales_sess_test');

  const daily = buildConnection('daily');
  assert.equal(daily.provider, 'daily');
  assert.equal(daily.transport, 'webrtc');
  assert.equal(daily.room_name, 'daily_sess_test');

  const agora = buildConnection('agora');
  assert.equal(agora.provider, 'agora');
  assert.equal(agora.transport, 'webrtc');
  assert.equal(agora.room_name, 'agora_sess_test');

  const tencent = buildConnection('tencent_rtc');
  assert.equal(tencent.provider, 'tencent_rtc');
  assert.equal(tencent.transport, 'webrtc');
  assert.equal(tencent.room_name, 'trtc_sess_test');
});
