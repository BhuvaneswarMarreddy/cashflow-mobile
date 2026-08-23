import { httpsCallable } from '@firebase/functions';

import { isFirebaseConfigured } from '@/services/firebase';

import { resolveReview } from '../review';

/**
 * `resolveReview` mocks the wire, not the queue — same posture as
 * `decisions.test.ts`. This asserts the write SHAPE and, per the MEDIUM
 * finding, that a server rejection maps to the right category/retryable
 * facet — never a hand-hardcoded `retryable: true` regardless of `code`.
 */
jest.mock('@firebase/functions', () => ({
  httpsCallable: jest.fn(),
}));

jest.mock('@/services/firebase', () => ({
  firebaseFunctions: jest.fn(() => ({})),
  isFirebaseConfigured: jest.fn(() => true),
}));

const mockHttpsCallable = httpsCallable as jest.Mock;
const mockIsFirebaseConfigured = isFirebaseConfigured as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockIsFirebaseConfigured.mockReturnValue(true);
});

describe('resolveReview', () => {
  it('sends the decision and resolves', async () => {
    const callable = jest.fn().mockResolvedValue({ data: { state: 'confirmed' } });
    mockHttpsCallable.mockReturnValue(callable);

    await expect(
      resolveReview({ transactionId: 't1', decision: 'confirm', meaning: 'earned_income' }),
    ).resolves.toBeUndefined();

    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'resolveReview');
    expect(callable).toHaveBeenCalledWith({
      transactionId: 't1',
      decision: 'confirm',
      meaning: 'earned_income',
    });
  });

  it('wraps a malformed-answer rejection (functions/invalid-argument) into a NON-retryable AppError', async () => {
    const callable = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('bad meaning'), { code: 'functions/invalid-argument' }));
    mockHttpsCallable.mockReturnValue(callable);

    await expect(resolveReview({ transactionId: 't1', decision: 'confirm' })).rejects.toMatchObject({
      code: 'REVIEW_WRITE_FAILED',
      category: 'validation',
      retryable: false,
    });
  });

  it('wraps an already-resolved rejection (functions/not-found) into a NON-retryable AppError', async () => {
    const callable = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('gone'), { code: 'functions/not-found' }));
    mockHttpsCallable.mockReturnValue(callable);

    await expect(resolveReview({ transactionId: 't1', decision: 'confirm' })).rejects.toMatchObject({
      code: 'REVIEW_WRITE_FAILED',
      category: 'data',
      retryable: false,
    });
  });

  it('keeps the retryable default for an unrecognised code', async () => {
    const callable = jest.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: 'functions/internal' }));
    mockHttpsCallable.mockReturnValue(callable);

    await expect(resolveReview({ transactionId: 't1', decision: 'confirm' })).rejects.toMatchObject({
      code: 'REVIEW_WRITE_FAILED',
      retryable: true,
    });
  });
});
