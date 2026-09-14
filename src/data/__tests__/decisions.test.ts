import { httpsCallable } from '@firebase/functions';

import { triggerRefresh } from '@/hooks/useRefresh';
import { isFirebaseConfigured } from '@/services/firebase';

import { applyMerchantRule, undoDecision, type RuleMatch, type RuleSet } from '../decisions';

/**
 * `applyDecision` / `undoDecision` are server callables (Task 2/3). This file
 * mocks the wire, not the ledger, the same posture as `accountsWrite.test.ts`
 * mocking Firestore: assert what THIS client sends and does with what comes
 * back, never re-derive the server's own logic.
 */

jest.mock('@firebase/functions', () => ({
  httpsCallable: jest.fn(),
}));

jest.mock('@/services/firebase', () => ({
  firebaseFunctions: jest.fn(() => ({})),
  isFirebaseConfigured: jest.fn(() => true),
}));

jest.mock('@/hooks/useRefresh', () => ({
  triggerRefresh: jest.fn(),
}));

const mockHttpsCallable = httpsCallable as jest.Mock;
const mockIsFirebaseConfigured = isFirebaseConfigured as jest.Mock;
const mockTriggerRefresh = triggerRefresh as jest.Mock;

const match: RuleMatch = { field: 'merchant', op: 'contains', value: 'Starbucks' };
const set: RuleSet = { category: 'Coffee' };

beforeEach(() => {
  jest.clearAllMocks();
  mockIsFirebaseConfigured.mockReturnValue(true);
});

describe('applyMerchantRule', () => {
  it('sends the merchantRule shape, returns the summary, and refetches', async () => {
    const callable = jest.fn().mockResolvedValue({
      data: { decisionId: 'd1', changed: { transactionsMatched: 4, monthsAffected: ['2026-08'] } },
    });
    mockHttpsCallable.mockReturnValue(callable);

    const result = await applyMerchantRule({ match, set });

    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'applyDecision');
    expect(callable).toHaveBeenCalledWith({ kind: 'merchantRule', match, set });
    expect(result).toEqual({
      decisionId: 'd1',
      changed: { transactionsMatched: 4, monthsAffected: ['2026-08'] },
    });
    expect(mockTriggerRefresh).toHaveBeenCalledWith('tap');
  });

  it('throws FIREBASE_NOT_CONFIGURED and never calls the callable or refresh', async () => {
    mockIsFirebaseConfigured.mockReturnValue(false);

    await expect(applyMerchantRule({ match, set })).rejects.toMatchObject({
      code: 'FIREBASE_NOT_CONFIGURED',
    });
    expect(mockHttpsCallable).not.toHaveBeenCalled();
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });

  it('wraps a malformed-rule rejection (functions/invalid-argument) into a NON-retryable AppError', async () => {
    // A malformed rule is not fixed by retrying the identical request —
    // `functions/invalid-argument` is the real, prefixed code a Callable
    // rejection carries (see errorFacetsFor).
    const callable = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('bad match'), { code: 'functions/invalid-argument' }));
    mockHttpsCallable.mockReturnValue(callable);

    await expect(applyMerchantRule({ match, set })).rejects.toMatchObject({
      code: 'DECISION_WRITE_FAILED',
      category: 'validation',
      retryable: false,
    });
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });

  it('keeps the retryable default for an unrecognised code', async () => {
    const callable = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('boom'), { code: 'functions/internal' }));
    mockHttpsCallable.mockReturnValue(callable);

    await expect(applyMerchantRule({ match, set })).rejects.toMatchObject({
      code: 'DECISION_WRITE_FAILED',
      retryable: true,
    });
  });
});

describe('undoDecision', () => {
  it('sends the decisionId, resolves, and refetches', async () => {
    const callable = jest.fn().mockResolvedValue({ data: { ok: true } });
    mockHttpsCallable.mockReturnValue(callable);

    await undoDecision('d1');

    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'undoDecision');
    expect(callable).toHaveBeenCalledWith({ decisionId: 'd1' });
    expect(mockTriggerRefresh).toHaveBeenCalledWith('tap');
  });

  it('throws FIREBASE_NOT_CONFIGURED and never calls the callable or refresh', async () => {
    mockIsFirebaseConfigured.mockReturnValue(false);

    await expect(undoDecision('d1')).rejects.toMatchObject({ code: 'FIREBASE_NOT_CONFIGURED' });
    expect(mockHttpsCallable).not.toHaveBeenCalled();
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });

  it('wraps an already-gone rejection (functions/not-found) into a NON-retryable AppError', async () => {
    // The rule is already gone — retrying the identical undo can never
    // succeed. `functions/not-found` is the real, prefixed code.
    const callable = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('gone'), { code: 'functions/not-found' }));
    mockHttpsCallable.mockReturnValue(callable);

    await expect(undoDecision('d1')).rejects.toMatchObject({
      code: 'DECISION_WRITE_FAILED',
      category: 'data',
      retryable: false,
    });
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });

  it('keeps the retryable default for an unrecognised code', async () => {
    const callable = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('boom'), { code: 'functions/internal' }));
    mockHttpsCallable.mockReturnValue(callable);

    await expect(undoDecision('d1')).rejects.toMatchObject({
      code: 'DECISION_WRITE_FAILED',
      retryable: true,
    });
  });
});
