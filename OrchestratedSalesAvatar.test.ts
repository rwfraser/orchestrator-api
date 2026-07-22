import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { OrchestratedSalesAvatar } from './OrchestratedSalesAvatar';
import { OrchestratorApiClient } from './orchestrator-api.client';
import { OrchestratorRealtimeClient } from './orchestrator-realtime.client';
import type { RealtimeEvent, SubmitTurnRequest } from './orchestrator-api.types';

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const treeText = (renderer: TestRenderer.ReactTestRenderer): string =>
  JSON.stringify(renderer.toJSON() ?? '').replace(/\\n/g, ' ');

test('initializes session and reflects scene_plan transition state', async () => {
  let onEvent: ((event: RealtimeEvent) => Promise<void> | void) | null = null;
  let closed = false;

  const createSessionMock = async () => ({
    schema_version: '1.0' as const,
    session_id: 'sess-1',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    realtime: {
      transport: 'webrtc' as const,
      provider: 'livekit' as const,
      room_name: 'room-1',
      join_token: 'token',
    },
  });

  const summaryMock = async () => ({
    schema_version: '1.0' as const,
    summary: {
      commands_emitted: 1,
      events_processed: 1,
      last_command_id: 'cmd-1',
      last_event_id: 'evt-1',
      updated_at: new Date().toISOString(),
    },
  });

  const submitTurnMock = async (_sessionId: string, _turn: SubmitTurnRequest) => ({
    schema_version: '1.0' as const,
    turn_id: 'turn-1',
    status: 'accepted' as const,
    stream_channel: 'realtime' as const,
  });

  const originalCreateSession = OrchestratorApiClient.prototype.createSession;
  const originalGetSummary = OrchestratorApiClient.prototype.getVideoBackgroundSummary;
  const originalSubmitTurn = OrchestratorApiClient.prototype.submitTurn;
  const originalSubscribe = OrchestratorRealtimeClient.prototype.subscribeToSessionEvents;

  OrchestratorApiClient.prototype.createSession = createSessionMock as typeof OrchestratorApiClient.prototype.createSession;
  OrchestratorApiClient.prototype.getVideoBackgroundSummary =
    summaryMock as typeof OrchestratorApiClient.prototype.getVideoBackgroundSummary;
  OrchestratorApiClient.prototype.submitTurn = submitTurnMock as typeof OrchestratorApiClient.prototype.submitTurn;
  OrchestratorRealtimeClient.prototype.subscribeToSessionEvents = (async (_sessionId, handlers) => {
    onEvent = handlers.onEvent;
    return {
      close: () => {
        closed = true;
      },
    };
  }) as typeof OrchestratorRealtimeClient.prototype.subscribeToSessionEvents;

  try {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(OrchestratedSalesAvatar, {
          apiBaseUrl: 'https://example.com/api/v1/orchestrator',
          realtimeBaseHttpUrl: 'https://example.com',
          defaultSceneVideoUrl: 'https://cdn.example.com/default.mp4',
          sceneVideoSources: {
            roi_demo: 'https://cdn.example.com/roi.mp4',
          },
        }),
      );
    });

    await flush();
    assert.ok(treeText(renderer).includes('Status:'));
    assert.ok(treeText(renderer).includes('ready'));

    assert.ok(onEvent);
    await act(async () => {
      await onEvent?.({
        schema_version: '1.0',
        session_id: 'sess-1',
        turn_id: 'turn-1',
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
            duration_ms: 300,
          },
          guards: {
            min_mode_dwell_ms: 2500,
            max_switches_per_10s: 2,
          },
        },
      });
    });

    const afterEventText = treeText(renderer);
    assert.ok(afterEventText.includes('VISUAL_LEAD'));
    assert.ok(afterEventText.includes('VIDEO_FOREGROUND'));
    assert.ok(afterEventText.includes('events=1, commands=1'));

    await act(async () => {
      renderer.unmount();
    });
    assert.equal(closed, true);
  } finally {
    OrchestratorApiClient.prototype.createSession = originalCreateSession;
    OrchestratorApiClient.prototype.getVideoBackgroundSummary = originalGetSummary;
    OrchestratorApiClient.prototype.submitTurn = originalSubmitTurn;
    OrchestratorRealtimeClient.prototype.subscribeToSessionEvents = originalSubscribe;
  }
});

test('submits a demo turn when trigger button is clicked', async () => {
  const submitCalls: Array<{ sessionId: string; turn: SubmitTurnRequest; key?: string }> = [];

  const originalCreateSession = OrchestratorApiClient.prototype.createSession;
  const originalGetSummary = OrchestratorApiClient.prototype.getVideoBackgroundSummary;
  const originalSubmitTurn = OrchestratorApiClient.prototype.submitTurn;
  const originalSubscribe = OrchestratorRealtimeClient.prototype.subscribeToSessionEvents;

  OrchestratorApiClient.prototype.createSession = (async () => ({
    schema_version: '1.0' as const,
    session_id: 'sess-2',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    realtime: {
      transport: 'webrtc' as const,
      provider: 'livekit' as const,
      room_name: 'room-2',
      join_token: 'token',
    },
  })) as typeof OrchestratorApiClient.prototype.createSession;

  OrchestratorApiClient.prototype.getVideoBackgroundSummary = (async () => ({
    schema_version: '1.0' as const,
    summary: {
      commands_emitted: 0,
      events_processed: 0,
      last_command_id: null,
      last_event_id: null,
      updated_at: null,
    },
  })) as typeof OrchestratorApiClient.prototype.getVideoBackgroundSummary;

  OrchestratorApiClient.prototype.submitTurn = (async (sessionId, turn, key) => {
    submitCalls.push({ sessionId, turn, key });
    return {
      schema_version: '1.0' as const,
      turn_id: turn.turn_id,
      status: 'accepted' as const,
      stream_channel: 'realtime' as const,
    };
  }) as typeof OrchestratorApiClient.prototype.submitTurn;

  OrchestratorRealtimeClient.prototype.subscribeToSessionEvents = (async () => ({
    close: () => undefined,
  })) as typeof OrchestratorRealtimeClient.prototype.subscribeToSessionEvents;

  try {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(OrchestratedSalesAvatar, {
          apiBaseUrl: 'https://example.com/api/v1/orchestrator',
          realtimeBaseHttpUrl: 'https://example.com',
          defaultSceneVideoUrl: 'https://cdn.example.com/default.mp4',
        }),
      );
    });

    await flush();

    const button = renderer.root.findByType('button');
    await act(async () => {
      await button.props.onClick();
    });

    assert.equal(submitCalls.length, 1);
    assert.equal(submitCalls[0]?.sessionId, 'sess-2');
    assert.ok(submitCalls[0]?.turn.input.text.includes('30 second ROI pitch'));
    assert.ok(submitCalls[0]?.key?.startsWith('idempotency-turn_'));
  } finally {
    OrchestratorApiClient.prototype.createSession = originalCreateSession;
    OrchestratorApiClient.prototype.getVideoBackgroundSummary = originalGetSummary;
    OrchestratorApiClient.prototype.submitTurn = originalSubmitTurn;
    OrchestratorRealtimeClient.prototype.subscribeToSessionEvents = originalSubscribe;
  }
});
