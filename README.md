# Orchestrator API
This repository contains the realtime orchestrator API, validation schemas, session state management logic, and tests for video background integration.

## API Documentation
- Video background integration endpoints: `VIDEO_BACKGROUND_API.md`
- OpenAPI specification: `openapi.orchestrator.v1.yaml`

## Frontend Integration
- React component: `OrchestratedSalesAvatar.tsx`
- Client exports: `client.ts`

To use the frontend component, install React in your application and import from this package's `client.ts` barrel. The component consumes the orchestration API and realtime stream, renders avatar/video layers, and applies transitions from `scene_plan` and `scene_transition` events.
