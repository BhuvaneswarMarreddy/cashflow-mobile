import { loggerFor, redactUrl } from '@/logging';
import { createStreamStore } from '@/utils/streamStore';

import { authService, type AuthService } from './auth';
import type { ApiInterceptor } from './types';

/**
 * A completed API call, as Diagnostics shows it.
 *
 * Only safe metadata: method, path, timing, status, correlation ID. Never
 * headers, never bodies — those are exactly where tokens and account numbers
 * live.
 */
export interface ApiCallRecord {
  id: string;
  timestamp: string;
  method: string;
  /** Redacted: query values are masked, tokens removed. */
  url: string;
  correlationId: string;
  attempt: number;
  status: number | null;
  durationMs: number;
  outcome: 'success' | 'failure';
  errorCode?: string;
}

export const API_BUFFER_SIZE = 100;

export const useApiStream = createStreamStore<ApiCallRecord>(API_BUFFER_SIZE);

/** Attaches the bearer token. The only place the app touches Authorization. */
export const createAuthInterceptor = (service: AuthService = authService): ApiInterceptor => ({
  name: 'auth',
  onRequest: async (context) => {
    if (context.skipAuth) return;
    const token = await service.getAccessToken();
    if (token) context.headers.Authorization = `Bearer ${token}`;
  },
});

/**
 * Centralised request/response logging.
 *
 * Everything it emits passes through the redaction layer first, which is what
 * makes it safe to leave enabled in a build that talks to real financial data.
 */
export const createLoggingInterceptor = (): ApiInterceptor => {
  const log = loggerFor('api');

  const record = (entry: ApiCallRecord): void => useApiStream.getState().push(entry);

  return {
    name: 'logging',
    onRequest: (context) => {
      log.debug('api.request_started', {
        correlationId: context.correlationId,
        metadata: {
          method: context.method,
          url: redactUrl(context.url),
          attempt: context.attempt,
        },
      });
    },
    onResponse: (context, response) => {
      log.info('api.request_completed', {
        correlationId: context.correlationId,
        metadata: {
          method: context.method,
          url: redactUrl(context.url),
          status: response.status,
          durationMs: response.durationMs,
          attempt: context.attempt,
        },
      });
      record({
        id: `${context.correlationId}:${context.attempt}`,
        timestamp: new Date(context.startedAt).toISOString(),
        method: context.method,
        url: redactUrl(context.url),
        correlationId: context.correlationId,
        attempt: context.attempt,
        status: response.status,
        durationMs: response.durationMs,
        outcome: 'success',
      });
    },
    onError: (context, error) => {
      const durationMs = Date.now() - context.startedAt;
      log.error('api.request_failed', {
        correlationId: context.correlationId,
        metadata: {
          method: context.method,
          url: redactUrl(context.url),
          durationMs,
          attempt: context.attempt,
          ...error.toLogPayload(),
        },
      });
      record({
        id: `${context.correlationId}:${context.attempt}`,
        timestamp: new Date(context.startedAt).toISOString(),
        method: context.method,
        url: redactUrl(context.url),
        correlationId: context.correlationId,
        attempt: context.attempt,
        status: typeof error.metadata?.status === 'number' ? error.metadata.status : null,
        durationMs,
        outcome: 'failure',
        errorCode: error.code,
      });
    },
  };
};
