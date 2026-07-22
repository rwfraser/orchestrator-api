import type { RealtimeEvent } from './orchestrator-api.types';

export interface RealtimeSubscription {
  close: () => void;
}

export interface RealtimeClientConfig {
  baseHttpUrl: string;
  getAuthToken?: () => string | null | Promise<string | null>;
}

export class OrchestratorRealtimeClient {
  constructor(private readonly config: RealtimeClientConfig) {}

  async subscribeToSessionEvents(
    sessionId: string,
    handlers: {
      onEvent: (event: RealtimeEvent) => void;
      onOpen?: () => void;
      onError?: (error: Event) => void;
      onClose?: (event: CloseEvent) => void;
    },
  ): Promise<RealtimeSubscription> {
    const token = await this.config.getAuthToken?.();
    const wsUrl = this.buildSessionEventsWsUrl(sessionId, token ?? undefined);

    const socket = new WebSocket(wsUrl);

    socket.addEventListener('open', () => handlers.onOpen?.());
    socket.addEventListener('error', (event) => handlers.onError?.(event));
    socket.addEventListener('close', (event) => handlers.onClose?.(event));
    socket.addEventListener('message', (messageEvent) => {
      try {
        const parsed = JSON.parse(String(messageEvent.data)) as RealtimeEvent;
        handlers.onEvent(parsed);
      } catch {
        // Ignore non-JSON or malformed payloads.
      }
    });

    return {
      close: () => socket.close(),
    };
  }

  buildSessionEventsWsUrl(sessionId: string, token?: string): string {
    const http = new URL(`/api/v1/orchestrator/sessions/${encodeURIComponent(sessionId)}/events`, this.config.baseHttpUrl);
    const protocol = http.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new URL(http.toString());
    ws.protocol = protocol;
    if (token) ws.searchParams.set('token', token);
    return ws.toString();
  }
}
