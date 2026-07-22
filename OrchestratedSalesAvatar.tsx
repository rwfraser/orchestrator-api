import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OrchestratorApiClient } from './orchestrator-api.client';
import { OrchestratorRealtimeClient, type RealtimeSubscription } from './orchestrator-realtime.client';
import type { CreateSessionRequest, SubmitTurnRequest } from './orchestrator-api.types';
import {
  applyRealtimeEventToPresentation,
  initialPresentationState,
  type FrontendPresentationState,
} from './frontend-orchestration-state';

export interface OrchestratedSalesAvatarProps {
  apiBaseUrl: string;
  realtimeBaseHttpUrl: string;
  authToken?: string | null;
  avatarVideoUrl?: string;
  sceneVideoSources?: Record<string, string>;
  defaultSceneVideoUrl: string;
  initialSessionRequest?: Partial<CreateSessionRequest>;
  className?: string;
}

export const OrchestratedSalesAvatar = ({
  apiBaseUrl,
  realtimeBaseHttpUrl,
  authToken = null,
  avatarVideoUrl,
  sceneVideoSources = {},
  defaultSceneVideoUrl,
  initialSessionRequest,
  className,
}: OrchestratedSalesAvatarProps) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<FrontendPresentationState>(initialPresentationState);
  const [status, setStatus] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latestTranscript, setLatestTranscript] = useState<string>('');
  const [latestSummary, setLatestSummary] = useState<string>('');
  const subscriptionRef = useRef<RealtimeSubscription | null>(null);

  const apiClient = useMemo(
    () =>
      new OrchestratorApiClient({
        baseUrl: apiBaseUrl,
        getAuthToken: async () => authToken,
      }),
    [apiBaseUrl, authToken],
  );

  const realtimeClient = useMemo(
    () =>
      new OrchestratorRealtimeClient({
        baseHttpUrl: realtimeBaseHttpUrl,
        getAuthToken: async () => authToken,
      }),
    [realtimeBaseHttpUrl, authToken],
  );

  const activeBackgroundSource = sceneVideoSources[presentation.sceneType] ?? defaultSceneVideoUrl;

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      setStatus('starting');
      setErrorMessage(null);

      try {
        const session = await apiClient.createSession({
          schema_version: '1.0',
          tenant_id: initialSessionRequest?.tenant_id ?? 'tenant_default',
          user_id: initialSessionRequest?.user_id ?? 'user_default',
          locale: initialSessionRequest?.locale ?? 'en-US',
          persona: initialSessionRequest?.persona ?? 'owner_operator',
          channel: initialSessionRequest?.channel ?? 'web',
          features: initialSessionRequest?.features ?? {
            rag_enabled: true,
            barge_in_enabled: true,
            visual_generation_enabled: false,
          },
          client_capabilities: initialSessionRequest?.client_capabilities ?? {
            webrtc: true,
            websocket_fallback: true,
          },
        });

        if (!mounted) return;
        setSessionId(session.session_id);

        subscriptionRef.current = await realtimeClient.subscribeToSessionEvents(session.session_id, {
          onEvent: async (event) => {
            if (!mounted) return;

            setPresentation((current) => applyRealtimeEventToPresentation(current, event));

            if (event.event_type === 'assistant_text_delta') {
              setLatestTranscript((prev) => `${prev}${event.payload.delta}`);
            }
            if (event.event_type === 'assistant_text_final') {
              setLatestTranscript(event.payload.text);
            }
            if (event.event_type === 'scene_plan' || event.event_type === 'scene_transition') {
              const summary = await apiClient.getVideoBackgroundSummary(session.session_id);
              if (mounted) {
                setLatestSummary(
                  `events=${summary.summary.events_processed}, commands=${summary.summary.commands_emitted}`,
                );
              }
            }
          },
          onError: () => {
            if (!mounted) return;
            setStatus('error');
            setErrorMessage('Realtime connection failed.');
          },
        });

        if (mounted) setStatus('ready');
      } catch (error) {
        if (!mounted) return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Failed to initialize session.');
      }
    };

    void setup();

    return () => {
      mounted = false;
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
      if (sessionId) {
        void apiClient.endSession(sessionId).catch(() => {
          // Best-effort shutdown
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitUserPrompt = async (text: string) => {
    if (!sessionId) return;
    const turn: SubmitTurnRequest = {
      schema_version: '1.0',
      turn_id: `turn_${Date.now()}`,
      input: { type: 'text', text },
      context: {
        sales_stage: 'consideration',
        offer_id: 'offer_q3',
        current_scene_mode: presentation.mode,
      },
    };

    await apiClient.submitTurn(sessionId, turn, `idempotency-${turn.turn_id}`);
  };

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: 480,
        overflow: 'hidden',
        borderRadius: 16,
        border: '1px solid #2b2b2b',
        background: '#111',
      }}
    >
      <video
        key={activeBackgroundSource}
        src={activeBackgroundSource}
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: presentation.focus === 'VIDEO_FOREGROUND' ? 20 : 5,
          transform: presentation.focus === 'VIDEO_FOREGROUND' ? 'scale(1.03)' : 'scale(1)',
          transition: `all ${presentation.transitionDurationMs}ms ease`,
          opacity: 1,
        }}
      />

      <div
        style={{
          position: 'absolute',
          right: presentation.focus === 'VIDEO_FOREGROUND' ? 24 : 40,
          bottom: 24,
          width: presentation.focus === 'VIDEO_FOREGROUND' ? 180 : 260,
          height: presentation.focus === 'VIDEO_FOREGROUND' ? 220 : 320,
          zIndex: presentation.focus === 'VIDEO_FOREGROUND' ? 25 : 30,
          transition: `all ${presentation.transitionDurationMs}ms ease`,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.2)',
          background: '#1a1a1a',
        }}
      >
        {avatarVideoUrl ? (
          <video
            src={avatarVideoUrl}
            autoPlay
            muted
            loop
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontSize: 14,
            }}
          >
            Animated Avatar
          </div>
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 12,
          zIndex: 40,
          padding: 12,
          borderRadius: 10,
          background: 'rgba(0,0,0,0.55)',
          color: '#f2f2f2',
          fontSize: 13,
        }}
      >
        <div>
          <strong>Status:</strong> {status}
          {errorMessage ? ` — ${errorMessage}` : ''}
        </div>
        <div>
          <strong>Mode:</strong> {presentation.mode} / <strong>Focus:</strong> {presentation.focus}
        </div>
        <div>
          <strong>Scene:</strong> {presentation.sceneType} / <strong>Transition:</strong> {presentation.transitionType}
        </div>
        <div>
          <strong>Summary:</strong> {latestSummary || 'No orchestration events yet'}
        </div>
        <div style={{ marginTop: 6 }}>
          <strong>Transcript:</strong> {latestTranscript || '(waiting for response)'}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void submitUserPrompt('Give me a 30 second ROI pitch with supporting visuals.')}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 50,
          border: 0,
          borderRadius: 999,
          padding: '10px 14px',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Trigger Demo Turn
      </button>
    </div>
  );
};
