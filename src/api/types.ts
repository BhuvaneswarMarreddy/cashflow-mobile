import type { AppError } from '@/errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestConfig<TBody = unknown> {
  method: HttpMethod;
  /** Path relative to `apiBaseUrl`, e.g. `/accounts`. */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: TBody;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Overrides the client default. 0 disables retries for this call. */
  retries?: number;
  /** Supply to join this call to an existing user action. */
  correlationId?: string;
  /** Skip the auth interceptor — used by the token-refresh call itself. */
  skipAuth?: boolean;
  signal?: AbortSignal;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  correlationId: string;
  durationMs: number;
}

/**
 * Mutable per-request state that interceptors read and amend. Headers are
 * mutated in place — that is how the auth interceptor attaches a token without
 * every call site knowing authentication exists.
 */
export interface RequestContext {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  correlationId: string;
  attempt: number;
  startedAt: number;
  skipAuth: boolean;
}

export interface ApiInterceptor {
  name: string;
  onRequest?(context: RequestContext): void | Promise<void>;
  onResponse?(context: RequestContext, response: ApiResponse<unknown>): void;
  onError?(context: RequestContext, error: AppError): void;
}

export interface RetryPolicy {
  shouldRetry(attempt: number, error: AppError): boolean;
  delayMs(attempt: number): number;
}

export interface ApiClient {
  request<T>(config: RequestConfig): Promise<ApiResponse<T>>;
  get<T>(path: string, config?: Partial<RequestConfig>): Promise<ApiResponse<T>>;
  post<T>(path: string, body?: unknown, config?: Partial<RequestConfig>): Promise<ApiResponse<T>>;
  put<T>(path: string, body?: unknown, config?: Partial<RequestConfig>): Promise<ApiResponse<T>>;
  patch<T>(path: string, body?: unknown, config?: Partial<RequestConfig>): Promise<ApiResponse<T>>;
  delete<T>(path: string, config?: Partial<RequestConfig>): Promise<ApiResponse<T>>;
}
