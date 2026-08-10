import { AppError } from '@/errors';

import { createApiClient, defaultRetryPolicy } from '../client';
import type { ApiInterceptor } from '../types';

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }) as Response;

/** Typed view of what the client actually passed to `fetch`. */
const callArgs = (fetchImpl: jest.Mock, index = 0): [string, RequestInit] =>
  fetchImpl.mock.calls[index] as unknown as [string, RequestInit];

const options = { baseUrl: 'https://api.test', interceptors: [] as ApiInterceptor[] };

describe('createApiClient', () => {
  it('builds a URL with an encoded query string', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse([]));
    const client = createApiClient({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.get('/transactions', { query: { accountId: 'acc 1', limit: 20 } });

    expect(callArgs(fetchImpl)[0]).toBe('https://api.test/transactions?accountId=acc%201&limit=20');
  });

  it('omits undefined query values rather than sending "undefined"', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse([]));
    const client = createApiClient({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.get('/transactions', { query: { accountId: undefined, limit: 5 } });

    expect(callArgs(fetchImpl)[0]).toBe('https://api.test/transactions?limit=5');
  });

  it('sends a correlation ID header and returns it with the response', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ ok: true }));
    const client = createApiClient({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });

    const response = await client.get('/snapshot', { correlationId: 'cf_trace' });

    const [, init] = callArgs(fetchImpl);
    expect((init.headers as Record<string, string>)['X-Correlation-Id']).toBe('cf_trace');
    expect(response.correlationId).toBe('cf_trace');
  });

  it('turns a 503 into a retryable service error', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({}, 503));
    const client = createApiClient({
      ...options,
      maxRetries: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.get('/accounts')).rejects.toMatchObject({
      category: 'service-unavailable',
      code: 'HTTP_503',
      retryable: true,
    });
  });

  it('does not retry a validation failure', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({}, 422));
    const client = createApiClient({
      ...options,
      maxRetries: 3,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.get('/accounts')).rejects.toMatchObject({ category: 'validation' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and succeeds', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ recovered: true }));

    const client = createApiClient({
      ...options,
      maxRetries: 2,
      retryPolicy: { shouldRetry: (attempt) => attempt < 3, delayMs: () => 0 },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const response = await client.get<{ recovered: boolean }>('/accounts');

    expect(response.data.recovered).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports malformed JSON as a data error rather than crashing', async () => {
    const fetchImpl = jest.fn(
      async () => ({ ok: true, status: 200, text: async () => '<html>oops' }) as Response,
    );
    const client = createApiClient({
      ...options,
      maxRetries: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.get('/accounts')).rejects.toMatchObject({
      category: 'data',
      code: 'MALFORMED_JSON',
    });
  });

  it('runs interceptors in order and lets them amend headers', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({}));
    const seen: string[] = [];

    const client = createApiClient({
      baseUrl: 'https://api.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      interceptors: [
        {
          name: 'auth',
          onRequest: (context) => {
            context.headers.Authorization = 'Bearer token';
            seen.push('request');
          },
        },
        { name: 'log', onResponse: () => seen.push('response') },
      ],
    });

    await client.get('/accounts');

    const [, init] = callArgs(fetchImpl);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token');
    expect(seen).toEqual(['request', 'response']);
  });

  it('notifies interceptors when a request fails', async () => {
    const onError = jest.fn();
    const client = createApiClient({
      baseUrl: 'https://api.test',
      maxRetries: 0,
      interceptors: [{ name: 'log', onError }],
      fetchImpl: (async () => jsonResponse({}, 500)) as unknown as typeof fetch,
    });

    await expect(client.get('/accounts')).rejects.toBeDefined();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('defaultRetryPolicy', () => {
  it('backs off exponentially, with a ceiling', () => {
    expect(defaultRetryPolicy.delayMs(1)).toBe(250);
    expect(defaultRetryPolicy.delayMs(2)).toBe(500);
    expect(defaultRetryPolicy.delayMs(9)).toBe(2000);
  });

  it('gives up after three attempts', () => {
    const error = new AppError({ category: 'network' });
    expect(defaultRetryPolicy.shouldRetry(2, error)).toBe(true);
    expect(defaultRetryPolicy.shouldRetry(3, error)).toBe(false);
  });
});
