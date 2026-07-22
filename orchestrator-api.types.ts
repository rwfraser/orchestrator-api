export type SchemaVersion = '1.0';

export type SceneMode = 'AVATAR_LEAD' | 'SPLIT_FOCUS' | 'VISUAL_LEAD';
export type HealthState = 'ok' | 'degraded' | 'down';
export type RealtimeTransport = 'webrtc';
export type RealtimeProvider = 'livekit';

export type EventType =
  | 'assistant_text_delta'
  | 'assistant_text_final'
  | 'voice_chunk_ready'
  | 'timing_cue'
  | 'scene_plan'
  | 'scene_transition'
  | 'avatar_layout_update'
  | 'turn_complete'
  | 'error';

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'SESSION_NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface SessionFeatures {
  rag_enabled: boolean;
  barge_in_enabled: boolean;
  visual_generation_enabled: boolean;
}

export interface ClientCapabilities {
  webrtc: boolean;
  websocket_fallback: boolean;
}

export interface CreateSessionRequest {
  schema_version: SchemaVersion;
  tenant_id: string;
  user_id: string;
  locale: string;
  persona: string;
  channel: string;
  features: SessionFeatures;
  client_capabilities: ClientCapabilities;
}

export interface RealtimeConnection {
  transport: RealtimeTransport;
  provider: RealtimeProvider;
  room_name: string;
  join_token: string;
}

export interface CreateSessionResponse {
  schema_version: SchemaVersion;
  session_id: string;
  expires_at: string;
  realtime: RealtimeConnection;
}

export interface TurnInput {
  type: 'text';
  text: string;
}

export interface TurnContext {
  sales_stage: string;
  offer_id: string;
  current_scene_mode: SceneMode;
}

export interface SubmitTurnRequest {
  schema_version: SchemaVersion;
  turn_id: string;
  input: TurnInput;
  context: TurnContext;
}

export interface SubmitTurnResponse {
  schema_version: SchemaVersion;
  turn_id: string;
  status: 'accepted';
  stream_channel: 'realtime';
}

export interface ProviderHealth {
  rtc: HealthState;
  avatar: HealthState;
  tts: HealthState;
}

export interface GetSessionResponse {
  schema_version: SchemaVersion;
  session_id: string;
  status: 'active' | 'ended';
  active_turn_id: string | null;
  scene_mode: SceneMode;
  provider_health: ProviderHealth;
}

export interface EndSessionResponse {
  schema_version: SchemaVersion;
  session_id: string;
  status: 'ended';
}

export interface ErrorDetail {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export interface ErrorResponse {
  schema_version: SchemaVersion;
  error: ErrorDetail;
}

export interface AssetQuery {
  product: string;
  persona: string;
  intent: string;
}

export type AvatarPosition = 'center' | 'left' | 'right' | 'bottom_left' | 'bottom_right';

export interface AvatarLayout {
  position: AvatarPosition;
  scale: number;
  z_index: number;
}

export interface Transition {
  type: string;
  duration_ms: number;
}

export interface SceneGuards {
  min_mode_dwell_ms: number;
  max_switches_per_10s: number;
}

export interface AssistantTextDeltaPayload {
  delta: string;
}

export interface AssistantTextFinalPayload {
  text: string;
}

export interface VoiceChunkReadyPayload {
  chunk_id: string;
  sequence: number;
  duration_ms: number;
  mime_type: string;
}

export type TimingCueType = 'show_caption' | 'bring_video_foreground' | 'highlight_cta' | 'custom';
export type TimingCueTarget = 'compositor' | 'captions' | 'overlays';

export interface TimingCuePayload {
  at_ms: number;
  cue_type: TimingCueType;
  target: TimingCueTarget;
  metadata: Record<string, unknown>;
}

export interface ScenePlanPayload {
  mode: SceneMode;
  scene_type: string;
  asset_query: AssetQuery;
  avatar_layout: AvatarLayout;
  transition: Transition;
  guards: SceneGuards;
}

export interface SceneTransitionPayload {
  from_mode: SceneMode;
  to_mode: SceneMode;
  type: string;
  duration_ms: number;
}

export interface AvatarLayoutUpdatePayload {
  position: AvatarPosition;
  scale: number;
  z_index: number;
}

export interface TurnCompletePayload {
  status: 'ok';
}

export interface EventErrorPayload {
  code: ErrorCode;
  severity: 'recoverable' | 'fatal';
  message: string;
  fallback_applied: boolean;
}

export type RealtimeEventPayload =
  | AssistantTextDeltaPayload
  | AssistantTextFinalPayload
  | VoiceChunkReadyPayload
  | TimingCuePayload
  | ScenePlanPayload
  | SceneTransitionPayload
  | AvatarLayoutUpdatePayload
  | TurnCompletePayload
  | EventErrorPayload;

export interface RealtimeEventEnvelope<TPayload = RealtimeEventPayload> {
  schema_version: SchemaVersion;
  session_id: string;
  turn_id: string;
  event_id: string;
  sequence: number;
  event_type: EventType;
  sent_at: string;
  payload: TPayload;
}

export type RealtimeEvent =
  | RealtimeEventEnvelope<AssistantTextDeltaPayload>
  | RealtimeEventEnvelope<AssistantTextFinalPayload>
  | RealtimeEventEnvelope<VoiceChunkReadyPayload>
  | RealtimeEventEnvelope<TimingCuePayload>
  | RealtimeEventEnvelope<ScenePlanPayload>
  | RealtimeEventEnvelope<SceneTransitionPayload>
  | RealtimeEventEnvelope<AvatarLayoutUpdatePayload>
  | RealtimeEventEnvelope<TurnCompletePayload>
  | RealtimeEventEnvelope<EventErrorPayload>;
