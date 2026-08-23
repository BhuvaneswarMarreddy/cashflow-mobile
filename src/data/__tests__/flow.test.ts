import { httpsCallable } from '@firebase/functions';

import { isFirebaseConfigured } from '@/services/firebase';

import { fetchFlowNode } from '../flow';

/**
 * `fetchFlowNode` previously had NO try/catch — a raw Firebase error escaped
 * to the caller with no `userMessage`, unlike its sibling `fetchFlow`. These
 * tests pin the same classified-AppError treatment `fetchFlow` already had.
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

describe('fetchFlowNode', () => {
  it('returns the node detail on success', async () => {
    const detail = { nodeId: 'n1', label: 'Groceries', period: { label: 'Aug' }, count: 2, folded: false, rows: [] };
    const callable = jest.fn().mockResolvedValue({ data: detail });
    mockHttpsCallable.mockReturnValue(callable);

    await expect(fetchFlowNode('n1', 'month', 'k1')).resolves.toEqual(detail);
    expect(callable).toHaveBeenCalledWith({ nodeId: 'n1', range: 'month', key: 'k1' });
  });

  it('throws FIREBASE_NOT_CONFIGURED and never calls the callable', async () => {
    mockIsFirebaseConfigured.mockReturnValue(false);

    await expect(fetchFlowNode('n1', 'month')).rejects.toMatchObject({
      code: 'FIREBASE_NOT_CONFIGURED',
    });
    expect(mockHttpsCallable).not.toHaveBeenCalled();
  });

  it('wraps a callable rejection into a classified AppError instead of leaking it raw', async () => {
    const callable = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('gone'), { code: 'functions/not-found' }));
    mockHttpsCallable.mockReturnValue(callable);

    await expect(fetchFlowNode('n1', 'month')).rejects.toMatchObject({
      code: 'FLOW_NODE_FETCH_FAILED',
      category: 'data',
      retryable: false,
      userMessage: "Cashflow couldn't load that detail.",
    });
  });

  it('keeps the retryable default for an unrecognised code', async () => {
    const callable = jest.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: 'functions/internal' }));
    mockHttpsCallable.mockReturnValue(callable);

    await expect(fetchFlowNode('n1', 'month')).rejects.toMatchObject({
      code: 'FLOW_NODE_FETCH_FAILED',
      retryable: true,
    });
  });
});
