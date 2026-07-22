import { z } from 'zod';

export const SchemaVersionSchema = z.literal('1.0');

export const SceneModeSchema = z.enum(['AVATAR_LEAD', 'SPLIT_FOCUS', 'VISUAL_LEAD']);
export const HealthStateSchema = z.enum(['ok', 'degraded', 'down']);
export const RealtimeTransportSchema = z.literal('webrtc');
export const RealtimeProviderSchema = z.literal('livekit');

export const EventTypeSchema = z.enum([
  'assistant_text_delta',
  'assistant_text_final',
  'voice_chunk_ready',
  'timing_cue',
  'scene_plan',
  'scene_transition',
  'avatar_layout_update',
  'turn_complete',
  'error',
]);

export const ErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'SESSION_NOT_FOUND',
  'PROVIDER_UNAVAILABLE',
  'SCHEMA_VALIDATION_FAILED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);

export const SessionFeaturesSchema = z
  .object({
    rag_enabled: z.boolean(),
    barge_in_enabled: z.boolean(),
    visual_generation_enabled: z.boolean(),
  })
  .strict();

export const ClientCapabilitiesSchema = z
  .object({
    webrtc: z.boolean(),
    websocket_fallback: z.boolean(),
  })
  .strict();

export const CreateSessionRequestSchema = z
  .object({
    schema_version: SchemaVersionSchema,
    tenant_id: z.string(),
    user_id: z.string(),
    locale: z.string(),
    persona: z.string(),
    channel: z.string(),
    features: SessionFeaturesSchema,
    client_capabilities: ClientCapabilitiesSchema,
  })
  .strict();

export const RealtimeConnectionSchema = z
  .object({
    transport: RealtimeTransportSchema,
    provider: RealtimeProviderSchema,
    room_name: z.string(),
    join_token: z.string(),
  })
  .strict();

export const CreateSessionResponseSchema = z
  .object({
    schema_version: SchemaVersionSchema,
    session_id: z.string(),
    expires_at: z.string(),
    realtime: RealtimeConnectionSchema,
  })
  .strict();

export const TurnInputSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
  })
  .strict();

export const TurnContextSchema = z
  .object({
    sales_stage: z.string(),
    offer_id: z.string(),
    current_scene_mode: SceneModeSchema,
  })
  .strict();

export const SubmitTurnRequestSchema = z
  .object({
    schema_version: SchemaVersionSchema,
    turn_id: z.string(),
    input: TurnInputSchema,
    context: TurnContextSchema,
  })
  .strict();

export const SubmitTurnResponseSchema = z
  .object({
    schema_version: SchemaVersionSchema,
    turn_id: z.string(),
    status: z.literal('accepted'),
    stream_channel: z.literal('realtime'),
  })
  .strict();

export const ProviderHealthSchema = z
  .object({
    rtc: HealthStateSchema,
    avatar: HealthStateSchema,
    tts: HealthStateSchema,
  })
  .strict();

export const GetSessionResponseSchema = z
  .object({
    schema_version: SchemaVersionSchema,
    session_id: z.string(),
    status: z.enum(['active', 'ended']),
    active_turn_id: z.string().nullable(),
    scene_mode: SceneModeSchema,
    provider_health: ProviderHealthSchema,
  })
  .strict();

export const EndSessionResponseSchema = z
  .object({
    schema_version: SchemaVersionSchema,
    session_id: z.string(),
    status: z.literal('ended'),
  })
  .strict();

export const ErrorDetailSchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
  })
  .strict();

export const ErrorResponseSchema = z
  .object({
    schema_version: SchemaVersionSchema,
    error: ErrorDetailSchema,
  })
  .strict();

export const AssetQuerySchema = z
  .object({
    product: z.string(),
    persona: z.string(),
    intent: z.string(),
  })
  .strict();

export const AvatarPositionSchema = z.enum(['center', 'left', 'right', 'bottom_left', 'bottom_right']);

export const AvatarLayoutSchema = z
  .object({
    position: AvatarPositionSchema,
    scale: z.number(),
    z_index: z.number().int(),
  })
  .strict();

export const TransitionSchema = z
  .object({
    type: z.string(),
    duration_ms: z.number().int(),
  })
  .strict();

export const SceneGuardsSchema = z
  .object({
    min_mode_dwell_ms: z.number().int(),
    max_switches_per_10s: z.number().int(),
  })
  .strict();

export const AssistantTextDeltaPayloadSchema = z
  .object({
    delta: z.string(),
  })
  .strict();

export const AssistantTextFinalPayloadSchema = z
  .object({
    text: z.string(),
  })
  .strict();

export const VoiceChunkReadyPayloadSchema = z
  .object({
    chunk_id: z.string(),
    sequence: z.number().int().min(1),
    duration_ms: z.number().int().min(1),
    mime_type: z.string(),
  })
  .strict();

export const TimingCueTypeSchema = z.enum(['show_caption', 'bring_video_foreground', 'highlight_cta', 'custom']);
export const TimingCueTargetSchema = z.enum(['compositor', 'captions', 'overlays']);

export const TimingCuePayloadSchema = z
  .object({
    at_ms: z.number().int().min(0),
    cue_type: TimingCueTypeSchema,
    target: TimingCueTargetSchema,
    metadata: z.record(z.string(), z.unknown()),
  })
  .strict();

export const ScenePlanPayloadSchema = z
  .object({
    mode: SceneModeSchema,
    scene_type: z.string(),
    asset_query: AssetQuerySchema,
    avatar_layout: AvatarLayoutSchema,
    transition: TransitionSchema,
    guards: SceneGuardsSchema,
  })
  .strict();

export const SceneTransitionPayloadSchema = z
  .object({
    from_mode: SceneModeSchema,
    to_mode: SceneModeSchema,
    type: z.string(),
    duration_ms: z.number().int(),
  })
  .strict();

export const AvatarLayoutUpdatePayloadSchema = z
  .object({
    position: AvatarPositionSchema,
    scale: z.number(),
    z_index: z.number().int(),
  })
  .strict();

export const TurnCompletePayloadSchema = z
  .object({
    status: z.literal('ok'),
  })
  .strict();

export const EventErrorPayloadSchema = z
  .object({
    code: ErrorCodeSchema,
    severity: z.enum(['recoverable', 'fatal']),
    message: z.string(),
    fallback_applied: z.boolean(),
  })
  .strict();

const RealtimeEventBaseSchema = z
  .object({
    schema_version: SchemaVersionSchema,
    session_id: z.string(),
    turn_id: z.string(),
    event_id: z.string(),
    sequence: z.number().int().min(1),
    sent_at: z.string(),
  })
  .strict();

export const AssistantTextDeltaEventSchema = RealtimeEventBaseSchema.extend({
  event_type: z.literal('assistant_text_delta'),
  payload: AssistantTextDeltaPayloadSchema,
});

export const AssistantTextFinalEventSchema = RealtimeEventBaseSchema.extend({
  event_type: z.literal('assistant_text_final'),
  payload: AssistantTextFinalPayloadSchema,
});

export const VoiceChunkReadyEventSchema = RealtimeEventBaseSchema.extend({
  event_type: z.literal('voice_chunk_ready'),
  payload: VoiceChunkReadyPayloadSchema,
});

export const TimingCueEventSchema = RealtimeEventBaseSchema.extend({
  event_type: z.literal('timing_cue'),
  payload: TimingCuePayloadSchema,
});

export const ScenePlanEventSchema = RealtimeEventBaseSchema.extend({
  event_type: z.literal('scene_plan'),
  payload: ScenePlanPayloadSchema,
});

export const SceneTransitionEventSchema = RealtimeEventBaseSchema.extend({
  event_type: z.literal('scene_transition'),
  payload: SceneTransitionPayloadSchema,
});

export const AvatarLayoutUpdateEventSchema = RealtimeEventBaseSchema.extend({
  event_type: z.literal('avatar_layout_update'),
  payload: AvatarLayoutUpdatePayloadSchema,
});

export const TurnCompleteEventSchema = RealtimeEventBaseSchema.extend({
  event_type: z.literal('turn_complete'),
  payload: TurnCompletePayloadSchema,
});

export const ErrorEventSchema = RealtimeEventBaseSchema.extend({
  event_type: z.literal('error'),
  payload: EventErrorPayloadSchema,
});

export const RealtimeEventSchema = z.discriminatedUnion('event_type', [
  AssistantTextDeltaEventSchema,
  AssistantTextFinalEventSchema,
  VoiceChunkReadyEventSchema,
  TimingCueEventSchema,
  ScenePlanEventSchema,
  SceneTransitionEventSchema,
  AvatarLayoutUpdateEventSchema,
  TurnCompleteEventSchema,
  ErrorEventSchema,
]);

export const RealtimeEventEnvelopeSchema = z
  .object({
    schema_version: SchemaVersionSchema,
    session_id: z.string(),
    turn_id: z.string(),
    event_id: z.string(),
    sequence: z.number().int().min(1),
    event_type: EventTypeSchema,
    sent_at: z.string(),
    payload: z.union([
      AssistantTextDeltaPayloadSchema,
      AssistantTextFinalPayloadSchema,
      VoiceChunkReadyPayloadSchema,
      TimingCuePayloadSchema,
      ScenePlanPayloadSchema,
      SceneTransitionPayloadSchema,
      AvatarLayoutUpdatePayloadSchema,
      TurnCompletePayloadSchema,
      EventErrorPayloadSchema,
    ]),
  })
  .strict();

export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;
export type SceneMode = z.infer<typeof SceneModeSchema>;
export type HealthState = z.infer<typeof HealthStateSchema>;
export type RealtimeTransport = z.infer<typeof RealtimeTransportSchema>;
export type RealtimeProvider = z.infer<typeof RealtimeProviderSchema>;
export type EventType = z.infer<typeof EventTypeSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export type SessionFeatures = z.infer<typeof SessionFeaturesSchema>;
export type ClientCapabilities = z.infer<typeof ClientCapabilitiesSchema>;
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export type RealtimeConnection = z.infer<typeof RealtimeConnectionSchema>;
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;
export type TurnInput = z.infer<typeof TurnInputSchema>;
export type TurnContext = z.infer<typeof TurnContextSchema>;
export type SubmitTurnRequest = z.infer<typeof SubmitTurnRequestSchema>;
export type SubmitTurnResponse = z.infer<typeof SubmitTurnResponseSchema>;
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;
export type GetSessionResponse = z.infer<typeof GetSessionResponseSchema>;
export type EndSessionResponse = z.infer<typeof EndSessionResponseSchema>;
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type AssetQuery = z.infer<typeof AssetQuerySchema>;
export type AvatarPosition = z.infer<typeof AvatarPositionSchema>;
export type AvatarLayout = z.infer<typeof AvatarLayoutSchema>;
export type Transition = z.infer<typeof TransitionSchema>;
export type SceneGuards = z.infer<typeof SceneGuardsSchema>;
export type AssistantTextDeltaPayload = z.infer<typeof AssistantTextDeltaPayloadSchema>;
export type AssistantTextFinalPayload = z.infer<typeof AssistantTextFinalPayloadSchema>;
export type VoiceChunkReadyPayload = z.infer<typeof VoiceChunkReadyPayloadSchema>;
export type TimingCueType = z.infer<typeof TimingCueTypeSchema>;
export type TimingCueTarget = z.infer<typeof TimingCueTargetSchema>;
export type TimingCuePayload = z.infer<typeof TimingCuePayloadSchema>;
export type ScenePlanPayload = z.infer<typeof ScenePlanPayloadSchema>;
export type SceneTransitionPayload = z.infer<typeof SceneTransitionPayloadSchema>;
export type AvatarLayoutUpdatePayload = z.infer<typeof AvatarLayoutUpdatePayloadSchema>;
export type TurnCompletePayload = z.infer<typeof TurnCompletePayloadSchema>;
export type EventErrorPayload = z.infer<typeof EventErrorPayloadSchema>;
export type RealtimeEventEnvelope = z.infer<typeof RealtimeEventEnvelopeSchema>;
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;
