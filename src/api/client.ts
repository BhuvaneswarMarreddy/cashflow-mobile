import { appConfig } from '@/config/env';
import { AppError, categoryForStatus, normalizeError } from '@/errors';
import { createCorrelationId } from '@/utils/id';

import { createAuthInterceptor, createLoggingInterceptor } from './interceptors';
import type {
  ApiClient,
  ApiInterceptor,
  ApiResponse,
  RequestConfig,
  RequestContext,
  RetryPolicy,
} from './types';

export interface ApiClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  interceptors?: ApiInterceptor[];
  retryPolicy?: RetryPolicy;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Retry only what retrying can fix.
 *
 * A 400 will be a 400 next time; a dropped connection or a 503 may not be. The
 * backoff is exponential with a cap so a flaky network does not turn into a
 * request storm on a phone.
 */
export const defaultRetryPolicy: RetryPolicy = {
  shouldRetry: (attempt, error) =>
    attempt < 3 && error.retryable && error.category !== 'validation',
  delayMs: (attempt) => Math.min(250 * 2 ** (attempt - 1), 2000),
};

const buildUrl = (baseUrl: string, path: string, query: RequestConfig['query']): string => {
  const base = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return base;
  const pairs = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pairs.length > 0 ? `${base}?${pairs.join('&')}` : base;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError({
      category: 'data',
      code: 'MALFORMED_JSON',
      technicalMessage: 'Response body was not valid JSON',
    });
  }
};

export const createApiClient = (options: ApiClientOptions = {}): ApiClient => {
  const baseUrl = options.baseUrl ?? appConfig.apiBaseUrl;
  const defaultTimeout = options.timeoutMs ?? appConfig.requestTimeoutMs;
  const maxRetries = options.maxRetries ?? appConfig.maxRetries;
  const interceptors = options.interceptors ?? [
    createAuthInterceptor(),
    createLoggingInterceptor(),
  ];
  const retryPolicy = options.retryPolicy ?? defaultRetryPolicy;
  const doFetch = options.fetchImpl ?? fetch;

  const attemptOnce = async <T>(
    config: RequestConfig,
    context: RequestContext,
  ): Promise<ApiResponse<T>> => {
    for (const interceptor of interceptors) await interceptor.onRequest?.(context);

    const controller = new AbortController();
    const timeoutMs = config.timeoutMs ?? defaultTimeout;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    config.signal?.addEventListener('abort', () => controller.abort());

    try {
      const response = await doFetch(context.url, {
        method: context.method,
        headers: context.headers,
        ...(context.body !== undefined && context.method !== 'GET'
          ? { body: JSON.stringify(context.body) }
          : {}),
        signal: controller.signal,
      });

      const durationMs = Date.now() - context.startedAt;

      if (!response.ok) {
        throw new AppError({
          category: categoryForStatus(response.status),
          code: `HTTP_${response.status}`,
          technicalMessage: `${context.method} ${context.url} responded ${response.status}`,
          correlationId: context.correlationId,
          metadata: { status: response.status, durationMs },
        });
      }

      const result: ApiResponse<T> = {
        data: (await parseBody(response)) as T,
        status: response.status,
        correlationId: context.correlationId,
        durationMs,
      };
      for (const interceptor of interceptors) interceptor.onResponse?.(context, result);
      return result;
    } catch (raw) {
      const error =
        raw instanceof Error && raw.name === 'AbortError'
          ? new AppError({
              category: 'network',
              code: 'TIMEOUT',
              technicalMessage: `Request exceeded ${timeoutMs}ms`,
              correlationId: context.correlationId,
            })
          : normalizeError(raw, context.correlationId);
      for (const interceptor of interceptors) interceptor.onError?.(context, error);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  const request = async <T>(config: RequestConfig): Promise<ApiResponse<T>> => {
    const correlationId = config.correlationId ?? createCorrelationId();
    const url = buildUrl(baseUrl, config.path, config.query);
    const allowedRetries = config.retries ?? maxRetries;

    let attempt = 0;
    while (true) {
      attempt += 1;
      const context: RequestContext = {
        method: config.method,
        url,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
          ...config.headers,
        },
        body: config.body,
        correlationId,
        attempt,
        startedAt: Date.now(),
        skipAuth: config.skipAuth ?? false,
      };

      try {
        return await attemptOnce<T>(config, context);
      } catch (raw) {
        const error = normalizeError(raw, correlationId);
        const canRetry = attempt <= allowedRetries && retryPolicy.shouldRetry(attempt, error);
        if (!canRetry) throw error;
        await sleep(retryPolicy.delayMs(attempt));
      }
    }
  };

  const withBody =
    (method: 'POST' | 'PUT' | 'PATCH') =>
    <T>(path: string, body?: unknown, config: Partial<RequestConfig> = {}) =>
      request<T>({ ...config, method, path, body });

  return {
    request,
    get: (path, config = {}) => request({ ...config, method: 'GET', path }),
    post: withBody('POST'),
    put: withBody('PUT'),
    patch: withBody('PATCH'),
    delete: (path, config = {}) => request({ ...config, method: 'DELETE', path }),
  };
};

export const apiClient = createApiClient();
