import { OrchestratorApiClient } from './orchestrator-api.client';
import { OrchestratorRealtimeClient } from './orchestrator-realtime.client';
import type { SubmitTurnRequest } from './orchestrator-api.types';

const BASE_URL = 'http://localhost:3000/api/v1/orchestrator';

const apiClient = new OrchestratorApiClient({
  baseUrl: BASE_URL,
  getAuthToken: async () => null,
});

const realtimeClient = new OrchestratorRealtimeClient({
  baseHttpUrl: 'http://localhost:3000',
  getAuthToken: async () => null,
});

export const startSalesSession = async (): Promise<void> => {
  const session = await apiClient.createSession({
    schema_version: '1.0',
    tenant_id: 'tenant_demo',
    user_id: 'user_demo',
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
  });

  const turn: SubmitTurnRequest = {
    schema_version: '1.0',
    turn_id: `turn_${Date.now()}`,
    input: { type: 'text', text: 'Show me ROI in 30 seconds.' },
    context: {
      sales_stage: 'consideration',
      offer_id: 'offer_q3',
      current_scene_mode: 'AVATAR_LEAD',
    },
  };

  await apiClient.submitTurn(session.session_id, turn, `idempotency-${turn.turn_id}`);

  const subscription = await realtimeClient.subscribeToSessionEvents(session.session_id, {
    onOpen: () => {
      // Realtime stream connected.
    },
    onEvent: async (event) => {
      if (event.event_type === 'scene_plan' || event.event_type === 'scene_transition') {
        const state = await apiClient.getVideoBackgroundState(session.session_id);
        const summary = await apiClient.getVideoBackgroundSummary(session.session_id);
        // Drive UI from `state` and optionally render telemetry from `summary`.
        void state;
        void summary;
      }
    },
  });

  // Call subscription.close() when the session view unmounts.
  void subscription;
};
