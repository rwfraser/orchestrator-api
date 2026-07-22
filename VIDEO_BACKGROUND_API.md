# Video Background Integration API Endpoints
This document describes the orchestrator endpoints used to drive and inspect real-time video background behavior from session events.

## Base path
`/api/v1/orchestrator`

## 1) Create session
- **Method**: `POST`
- **Path**: `/sessions`
- **Purpose**: Creates a session and initializes the video background controller state to `AVATAR_LEAD`.

## 2) Submit turn
- **Method**: `POST`
- **Path**: `/sessions/:session_id/turns`
- **Purpose**: Registers a turn that can receive realtime events (`scene_plan`, `scene_transition`) used for video background updates.

## 3) Ingest orchestration event (internal)
- **Method**: `POST`
- **Path**: `/internal/events`
- **Purpose**: Accepts realtime events and triggers video background commands.

### Event types relevant to video background
- `scene_plan`: emits an `APPLY_SCENE_PLAN` command.
- `scene_transition`: emits an `APPLY_SCENE_TRANSITION` command.

## 4) Get session video background state (internal)
- **Method**: `GET`
- **Path**: `/internal/sessions/:session_id/video-background/state`
- **Purpose**: Returns effective controller state after ingested scene events.

### Response shape
- `schema_version`: API schema version.
- `state.mode`: current orchestrated mode (`AVATAR_LEAD`, `SPLIT_FOCUS`, `VISUAL_LEAD`).
- `state.focus`: derived visual focus (`AVATAR_FOREGROUND`, `SPLIT_FOCUS`, `VIDEO_FOREGROUND`).
- `state.scene_type`: active scene context (for example, `roi_demo`).
- `state.asset_query`: active scene asset query metadata.
- `state.last_transition_type`: most recent transition type.
- `state.last_transition_duration_ms`: most recent transition duration.
- `state.updated_at`: timestamp of latest state update.

## 5) Get emitted video background commands (internal)
- **Method**: `GET`
- **Path**: `/internal/sessions/:session_id/video-background/commands`
- **Purpose**: Returns command history emitted by the controller for verification, debugging, and downstream execution.

### Command kinds
- `APPLY_SCENE_PLAN`
- `APPLY_SCENE_TRANSITION`

### Command fields
- `command_id`
- `kind`
- `mode`
- `focus`
- `scene_type`
- `asset_query`
- `transition_type`
- `duration_ms`
- `issued_at`

## 6) Get event history (internal)
- **Method**: `GET`
- **Path**: `/internal/sessions/:session_id/events`
- **Purpose**: Returns normalized ingested event history (including sequence ordering).

## 7) End session
- **Method**: `POST`
- **Path**: `/sessions/:session_id/end`
- **Purpose**: Ends the session and stops further state changes.

## Notes
- Event ordering is enforced by normalized sequence handling in the session service.
- Scene transition guardrails (dwell and switch frequency) are enforced before final mode updates are applied.
- When guardrails prevent a requested scene mode, the controller receives the effective mode.
