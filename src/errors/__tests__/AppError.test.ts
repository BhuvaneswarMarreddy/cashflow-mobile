import { AppError, categoryForStatus, isAppError, normalizeError } from '../AppError';

describe('AppError', () => {
  it('supplies a calm user message per category', () => {
    expect(new AppError({ category: 'network' }).userMessage).toBe(
      "Cashflow can't reach the network right now.",
    );
    expect(new AppError({ category: 'unexpected' }).userMessage).toBe(
      'Something went wrong. Nothing was changed.',
    );
  });

  it('marks retryable categories, and only those', () => {
    expect(new AppError({ category: 'network' }).retryable).toBe(true);
    expect(new AppError({ category: 'service-unavailable' }).retryable).toBe(true);
    expect(new AppError({ category: 'validation' }).retryable).toBe(false);
    expect(new AppError({ category: 'authentication' }).retryable).toBe(false);
  });

  it('keeps the technical message out of what the user sees', () => {
    const error = new AppError({
      category: 'data',
      technicalMessage: 'column balance_cents missing from /accounts payload',
    });

    expect(error.userMessage).not.toContain('balance_cents');
    expect(error.technicalMessage).toContain('balance_cents');
  });
});

describe('normalizeError', () => {
  it('passes an AppError through unchanged', () => {
    const original = new AppError({ category: 'validation', correlationId: 'cf_1' });
    expect(normalizeError(original)).toBe(original);
  });

  it('attaches a correlation ID to an AppError that lacks one', () => {
    const normalized = normalizeError(new AppError({ category: 'network' }), 'cf_2');
    expect(normalized.correlationId).toBe('cf_2');
    expect(normalized.category).toBe('network');
  });

  it('classifies a failed fetch as a network error', () => {
    const normalized = normalizeError(new TypeError('Network request failed'));
    expect(normalized.category).toBe('network');
    expect(normalized.retryable).toBe(true);
  });

  it('classifies an aborted request as network', () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    expect(normalizeError(abort).category).toBe('network');
  });

  it('classifies a JSON parse failure as a data error', () => {
    expect(normalizeError(new SyntaxError('Unexpected token <')).category).toBe('data');
  });

  it('handles a thrown string without crashing', () => {
    const normalized = normalizeError('something odd');
    expect(isAppError(normalized)).toBe(true);
    expect(normalized.category).toBe('unexpected');
  });

  it('handles a thrown non-error object', () => {
    expect(normalizeError({ weird: true }).technicalMessage).toBe('Non-error value thrown');
  });
});

describe('categoryForStatus', () => {
  it.each([
    [401, 'authentication'],
    [403, 'authentication'],
    [404, 'data'],
    [422, 'validation'],
    [429, 'service-unavailable'],
    [500, 'service-unavailable'],
    [503, 'service-unavailable'],
  ])('maps %i to %s', (status, expected) => {
    expect(categoryForStatus(status)).toBe(expected);
  });
});
