import { type ZodSchema, ZodError } from 'zod';
import {
  CreateSessionRequestSchema,
  EndSessionResponseSchema,
  ErrorResponseSchema,
  GetSessionResponseSchema,
  RealtimeEventSchema,
  SubmitTurnRequestSchema,
} from './orchestrator-api.zod';

export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'SESSION_NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ValidationFailure {
  status: number;
  body: {
    schema_version: '1.0';
    error: {
      code: ApiErrorCode;
      message: string;
      retryable: boolean;
    };
  };
}

export class ApiValidationError extends Error {
  constructor(public readonly failure: ValidationFailure) {
    super(failure.body.error.message);
    this.name = 'ApiValidationError';
  }
}

export const makeApiError = (
  code: ApiErrorCode,
  message: string,
  options?: { status?: number; retryable?: boolean },
): ValidationFailure => ({
  status: options?.status ?? 400,
  body: {
    schema_version: '1.0',
    error: {
      code,
      message,
      retryable: options?.retryable ?? false,
    },
  },
});

const zodIssuesToMessage = (error: ZodError): string =>
  error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');

export const parseOrThrow = <T>(
  schema: ZodSchema<T>,
  value: unknown,
  context: string,
): T => {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  throw new ApiValidationError(
    makeApiError('INVALID_REQUEST', `${context} validation failed: ${zodIssuesToMessage(result.error)}`),
  );
};

export const safeParseApi = <T>(
  schema: ZodSchema<T>,
  value: unknown,
  context: string,
): { ok: true; data: T } | { ok: false; error: ValidationFailure } => {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };

  return {
    ok: false,
    error: makeApiError('INVALID_REQUEST', `${context} validation failed: ${zodIssuesToMessage(result.error)}`),
  };
};

export const parseCreateSessionRequest = (value: unknown) =>
  parseOrThrow(CreateSessionRequestSchema, value, 'CreateSessionRequest');

export const parseSubmitTurnRequest = (value: unknown) =>
  parseOrThrow(SubmitTurnRequestSchema, value, 'SubmitTurnRequest');

export const parseRealtimeEvent = (value: unknown) =>
  parseOrThrow(RealtimeEventSchema, value, 'RealtimeEvent');

export const validateGetSessionResponse = (value: unknown) =>
  parseOrThrow(GetSessionResponseSchema, value, 'GetSessionResponse');

export const validateEndSessionResponse = (value: unknown) =>
  parseOrThrow(EndSessionResponseSchema, value, 'EndSessionResponse');

export const validateErrorResponse = (value: unknown) =>
  parseOrThrow(ErrorResponseSchema, value, 'ErrorResponse');

