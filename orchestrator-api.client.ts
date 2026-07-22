import type {
  CreateSessionRequest,
  CreateSessionResponse,
  EndSessionResponse,
  GetSessionResponse,
  RealtimeEvent,
  SubmitTurnRequest,
  SubmitTurnResponse,
} from './orchestrator-api.types';

export interface VideoBackgroundSummary {
  commands_emitted: number;
  events_processed: number;
  last_command_id: string | null;
  last_event_id: string | null;
  updated_at: string | null;
}

export interface VideoBackgroundStateResponse {
  schema_version: '1.0';
  state: {
    mode: 'AVATAR_LEAD' | 'SPLIT_FOCUS' | 'VISUAL_LEAD';
    focus: 'VIDEO_FOREGROUND' | 'AVATAR_FOREGROUND' | 'SPLIT_FOCUS';
    scene_type: string;
    asset_query: {
      product: string;
      persona: string;
      intent: string;
    } | null;
    last_transition_type: string;
    last_transition_duration_ms: number;
    updated_at: string;
  };
}

export interface VideoBackgroundCommandsResponse {
  schema_version: '1.0';
  commands: Array<{
    command_id: string;
    kind: 'APPLY_SCENE_PLAN' | 'APPLY_SCENE_TRANSITION';
    mode: 'AVATAR_LEAD' | 'SPLIT_FOCUS' | 'VISUAL_LEAD';
    focus: 'VIDEO_FOREGROUND' | 'AVATAR_FOREGROUND' | 'SPLIT_FOCUS';
    scene_type: string;
    asset_query: {
      product: string;
      persona: string;
      intent: string;
    } | null;
    transition_type: string;
    duration_ms: number;
    issued_at: string;
  }>;
}

export interface VideoBackgroundSummaryResponse {
  schema_version: '1.0';
  summary: VideoBackgroundSummary;
}

export interface SessionEventsResponse {
  schema_version: '1.0';
  events: RealtimeEvent[];
}

export interface ProcessInternalEventResponse {
  schema_version: '1.0';
  accepted: boolean;
  event_id: string;
  sequence: number;
  latest_command_id: string | null;
}

export interface OrchestratorApiClientConfig {
  baseUrl: string;
  getAuthToken?: () => string | null | Promise<string | null>;
  headers?: Record<string, string>;
}

export class OrchestratorApiClient {
  constructor(private readonly config: OrchestratorApiClientConfig) {}

  async createSession(input: CreateSessionRequest): Promise<CreateSessionResponse> {
    return this.request<CreateSessionResponse>('sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getSession(sessionId: string): Promise<GetSessionResponse> {
    return this.request<GetSessionResponse>(`sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
    });
  }

  async submitTurn(sessionId: string, input: SubmitTurnRequest, idempotencyKey?: string): Promise<SubmitTurnResponse> {
    return this.request<SubmitTurnResponse>(`sessions/${encodeURIComponent(sessionId)}/turns`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    });
  }

  async endSession(sessionId: string): Promise<EndSessionResponse> {
    return this.request<EndSessionResponse>(`sessions/${encodeURIComponent(sessionId)}/end`, {
      method: 'POST',
    });
  }

  async processInternalEvent(event: RealtimeEvent): Promise<ProcessInternalEventResponse> {
    return this.request<ProcessInternalEventResponse>('internal/events', {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }

  async getVideoBackgroundState(sessionId: string): Promise<VideoBackgroundStateResponse> {
    return this.request<VideoBackgroundStateResponse>(
      `internal/sessions/${encodeURIComponent(sessionId)}/video-background/state`,
      { method: 'GET' },
    );
  }

  async getVideoBackgroundCommands(sessionId: string): Promise<VideoBackgroundCommandsResponse> {
    return this.request<VideoBackgroundCommandsResponse>(
      `internal/sessions/${encodeURIComponent(sessionId)}/video-background/commands`,
      { method: 'GET' },
    );
  }

  async getVideoBackgroundSummary(sessionId: string): Promise<VideoBackgroundSummaryResponse> {
    return this.request<VideoBackgroundSummaryResponse>(
      `internal/sessions/${encodeURIComponent(sessionId)}/video-background/summary`,
      { method: 'GET' },
    );
  }

  async getSessionEvents(sessionId: string): Promise<SessionEventsResponse> {
    return this.request<SessionEventsResponse>(`internal/sessions/${encodeURIComponent(sessionId)}/events`, {
      method: 'GET',
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const token = await this.config.getAuthToken?.();
    const normalizedBaseUrl = this.config.baseUrl.endsWith('/') ? this.config.baseUrl : `${this.config.baseUrl}/`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.config.headers ?? {}),
      ...(init.headers as Record<string, string> | undefined),
    };

    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(new URL(path, normalizedBaseUrl), {
      ...init,
      headers,
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Orchestrator API request failed (${response.status}): ${raw}`);
    }

    return (await response.json()) as T;
  }
}
