import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createOrchestratorApp } from './orchestrator-app';
import { SessionManagementService } from './session-management-service';
import { VideoBackgroundOrchestrationService } from './video-background-orchestration-service';
import { OrchestratorApiClient } from './orchestrator-api.client';
import { OrchestratorRealtimeClient } from './orchestrator-realtime.client';
import type { RealtimeEvent } from './orchestrator-api.types';

const createSessionRequest = {
  schema_version: '1.0' as const,
  tenant_id: 'tenant_client',
  user_id: 'user_client',
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

const startServer = async () => {
  const orchestrationService = new VideoBackgroundOrchestrationService(new SessionManagementService(30 * 60_000, 0, 5));
  const app = createOrchestratorApp(orchestrationService);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address() as AddressInfo;
  const baseOrigin = `http://localhost:${address.port}`;
  return {
    baseOrigin,
    server,
  };
};

test('OrchestratorApiClient performs end-to-end orchestration flow against API server', async () => {
  const { baseOrigin, server } = await startServer();

  try {
    const client = new OrchestratorApiClient({
      baseUrl: `${baseOrigin}/api/v1/orchestrator`,
      getAuthToken: async () => null,
    });

    const session = await client.createSession(createSessionRequest);
    assert.equal(session.schema_version, '1.0');

    const turnId = `turn-${Date.now()}`;
    await client.submitTurn(session.session_id, {
      schema_version: '1.0',
      turn_id: turnId,
      input: {
        type: 'text',
        text: 'Show me ROI visuals.',
      },
      context: {
        sales_stage: 'consideration',
        offer_id: 'offer_q3',
        current_scene_mode: 'AVATAR_LEAD',
      },
    });

    const event: RealtimeEvent = {
      schema_version: '1.0',
      session_id: session.session_id,
      turn_id: turnId,
      event_id: 'evt-1',
      sequence: 1,
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
          duration_ms: 250,
        },
        guards: {
          min_mode_dwell_ms: 2500,
          max_switches_per_10s: 2,
        },
      },
    };

    const processed = await client.processInternalEvent(event);
    assert.equal(processed.accepted, true);
    assert.equal(processed.sequence, 1);

    const commands = await client.getVideoBackgroundCommands(session.session_id);
    assert.equal(commands.commands.length, 1);
    assert.equal(commands.commands[0]?.kind, 'APPLY_SCENE_PLAN');
    assert.equal(commands.commands[0]?.focus, 'VIDEO_FOREGROUND');

    const summary = await client.getVideoBackgroundSummary(session.session_id);
    assert.equal(summary.summary.events_processed, 1);
    assert.equal(summary.summary.commands_emitted, 1);
    assert.equal(typeof summary.summary.last_command_id, 'string');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('OrchestratorApiClient surfaces non-2xx responses as errors', async () => {
  const { baseOrigin, server } = await startServer();

  try {
    const client = new OrchestratorApiClient({
      baseUrl: `${baseOrigin}/api/v1/orchestrator`,
    });

    await assert.rejects(
      () => client.getSession('missing-session'),
      (error: unknown) => error instanceof Error && error.message.includes('Orchestrator API request failed (404)'),
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('OrchestratorRealtimeClient builds URLs and dispatches socket events to handlers', async () => {
  class MockWebSocket {
    static instances: MockWebSocket[] = [];

    readonly listeners = new Map<string, Array<(event: any) => void>>();
    closed = false;
    url: string;

    constructor(url: string | URL) {
      this.url = String(url);
      MockWebSocket.instances.push(this);
    }

    addEventListener(type: string, handler: (event: any) => void): void {
      const current = this.listeners.get(type) ?? [];
      current.push(handler);
      this.listeners.set(type, current);
    }

    close(): void {
      this.closed = true;
      this.emit('close', { code: 1000, reason: 'closed' });
    }

    emit(type: string, event: any): void {
      const handlers = this.listeners.get(type) ?? [];
      handlers.forEach((handler) => handler(event));
    }
  }

  const originalWebSocket = globalThis.WebSocket;
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket;

  try {
    const realtimeClient = new OrchestratorRealtimeClient({
      baseHttpUrl: 'https://example.com',
      getAuthToken: async () => 'token-123',
    });

    const builtUrl = realtimeClient.buildSessionEventsWsUrl('session/with-space', 'tok');
    assert.equal(
      builtUrl,
      'wss://example.com/api/v1/orchestrator/sessions/session%2Fwith-space/events?token=tok',
    );

    let opened = false;
    let eventCount = 0;
    let closed = false;

    const subscription = await realtimeClient.subscribeToSessionEvents('sess-1', {
      onOpen: () => {
        opened = true;
      },
      onEvent: (_event) => {
        eventCount += 1;
      },
      onClose: () => {
        closed = true;
      },
    });

    const socket = MockWebSocket.instances[0];
    assert.ok(socket);
    assert.equal(
      socket?.url,
      'wss://example.com/api/v1/orchestrator/sessions/sess-1/events?token=token-123',
    );

    socket?.emit('open', {});
    socket?.emit('message', {
      data: JSON.stringify({
        schema_version: '1.0',
        session_id: 'sess-1',
        turn_id: 'turn-1',
        event_id: 'evt-1',
        sequence: 1,
        event_type: 'assistant_text_delta',
        sent_at: new Date().toISOString(),
        payload: { delta: 'hello' },
      } satisfies RealtimeEvent),
    });
    socket?.emit('message', { data: 'not-json' });

    subscription.close();

    assert.equal(opened, true);
    assert.equal(eventCount, 1);
    assert.equal(socket?.closed, true);
    assert.equal(closed, true);
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
  }
});
