import express, { type NextFunction, type Request, type Response } from 'express';
import {
  ApiValidationError,
  makeApiError,
  parseCreateSessionRequest,
  parseRealtimeEvent,
  parseSubmitTurnRequest,
} from './validation';
import { VideoBackgroundOrchestrationService } from './video-background-orchestration-service';

export const createOrchestratorApp = (service: VideoBackgroundOrchestrationService): express.Express => {
  const app = express();
  app.use(express.json());

  app.post('/api/v1/orchestrator/sessions', (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = parseCreateSessionRequest(req.body);
      const response = service.createSession(input);
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/orchestrator/internal/sessions/:session_id/video-background/summary', (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.session_id;
      if (!sessionId) {
        throw new ApiValidationError(makeApiError('SESSION_NOT_FOUND', 'session_id path parameter is required', { status: 404 }));
      }
      const summary = service.getOrchestrationSummary(sessionId);
      res.status(200).json({ schema_version: '1.0', summary });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/orchestrator/sessions/:session_id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.session_id;
      if (!sessionId) {
        throw new ApiValidationError(makeApiError('SESSION_NOT_FOUND', 'session_id path parameter is required', { status: 404 }));
      }
      const response = service.getSession(sessionId);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/orchestrator/sessions/:session_id/turns', (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = parseSubmitTurnRequest(req.body);
      const sessionId = req.params.session_id;
      if (!sessionId) {
        throw new ApiValidationError(makeApiError('SESSION_NOT_FOUND', 'session_id path parameter is required', { status: 404 }));
      }
      const response = service.submitTurn(sessionId, input);
      res.status(202).json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/orchestrator/internal/events', (req: Request, res: Response, next: NextFunction) => {
    try {
      const event = parseRealtimeEvent(req.body);
      const result = service.processRealtimeEvent(event);
      res.status(200).json({
        schema_version: '1.0',
        accepted: true,
        event_id: result.event.event_id,
        sequence: result.event.sequence,
        latest_command_id: result.latest_command?.command_id ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/orchestrator/internal/sessions/:session_id/events', (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.session_id;
      if (!sessionId) {
        throw new ApiValidationError(makeApiError('SESSION_NOT_FOUND', 'session_id path parameter is required', { status: 404 }));
      }
      const events = service.listEvents(sessionId);
      res.status(200).json({ schema_version: '1.0', events });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/orchestrator/internal/sessions/:session_id/video-background/state', (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.session_id;
      if (!sessionId) {
        throw new ApiValidationError(makeApiError('SESSION_NOT_FOUND', 'session_id path parameter is required', { status: 404 }));
      }
      const state = service.getVideoBackgroundState(sessionId);
      res.status(200).json({ schema_version: '1.0', state });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/orchestrator/internal/sessions/:session_id/video-background/commands', (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.session_id;
      if (!sessionId) {
        throw new ApiValidationError(makeApiError('SESSION_NOT_FOUND', 'session_id path parameter is required', { status: 404 }));
      }
      const commands = service.listVideoBackgroundCommands(sessionId);
      res.status(200).json({ schema_version: '1.0', commands });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/orchestrator/sessions/:session_id/end', (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.session_id;
      if (!sessionId) {
        throw new ApiValidationError(makeApiError('SESSION_NOT_FOUND', 'session_id path parameter is required', { status: 404 }));
      }
      const response = service.endSession(sessionId);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiValidationError) {
      res.status(err.failure.status).json(err.failure.body);
      return;
    }

    const fallback = makeApiError('INTERNAL_ERROR', 'Unexpected server error', {
      status: 500,
      retryable: true,
    });
    res.status(fallback.status).json(fallback.body);
  });

  return app;
};
