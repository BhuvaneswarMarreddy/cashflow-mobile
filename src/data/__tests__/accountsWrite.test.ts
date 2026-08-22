import { doc, setDoc } from '@firebase/firestore';

import { triggerRefresh } from '@/hooks/useRefresh';
import { firebaseAuth } from '@/services/firebase';

import { accountDocument, setAssumedMonthlySpend, type NewAccount } from '../accountsWrite';

/**
 * `setAssumedMonthlySpend` mocks the wire, not Firestore — same posture as
 * `decisions.test.ts` mocking the callable. This asserts the write SHAPE and
 * the refresh trigger, never re-derives what the server does with it.
 */
jest.mock('@firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(() => ({ path: 'users/u1' })),
  serverTimestamp: jest.fn(() => 'SERVER_TIME'),
  setDoc: jest.fn(),
}));

jest.mock('@/services/firebase', () => ({
  firebaseAuth: jest.fn(),
  firestore: jest.fn(() => ({})),
  isFirebaseConfigured: jest.fn(() => true),
}));

jest.mock('@/hooks/useRefresh', () => ({
  triggerRefresh: jest.fn(),
}));

const mockSetDoc = setDoc as jest.Mock;
const mockDoc = doc as jest.Mock;
const mockFirebaseAuth = firebaseAuth as jest.Mock;
const mockTriggerRefresh = triggerRefresh as jest.Mock;

/**
 * The opening anchor, and the dollars boundary.
 *
 * These two are the whole correctness of adding an account by hand. The anchor
 * rule mirrors `openingAnchor()` in the web app (issue #83) — if it drifts, an
 * imported history silently disappears behind a $0 starting balance, which is
 * exactly the failure that rule exists to prevent.
 */
const NOW = new Date(2026, 7, 9, 15, 42); // 9 Aug 2026, LOCAL

const base: NewAccount = {
  name: '  Apple Card  ',
  kind: 'credit-card',
  provider: 'apple',
  openingBalanceCents: null,
};

describe('accountDocument', () => {
  it('writes NO openingDate when the balance is left blank, so all history counts', () => {
    const doc = accountDocument(base, 0, NOW);
    expect(doc.openingDate).toBeUndefined();
    expect(doc.openingBalance).toBe(0);
  });

  it('anchors to today when a balance IS stated, so only later rows move it', () => {
    const doc = accountDocument({ ...base, openingBalanceCents: 123_456 }, 0, NOW);
    expect(doc.openingDate).toBe('2026-08-09');
    expect(doc.openingBalance).toBe(1234.56);
  });

  /**
   * A typed zero is a CLAIM ("I owe nothing today"), not an absence. Collapsing
   * it to the blank case would silently re-count an entire imported history
   * against an account the owner said was clear.
   */
  it('treats a typed zero as a real claim, not as blank', () => {
    const doc = accountDocument({ ...base, openingBalanceCents: 0 }, 0, NOW);
    expect(doc.openingDate).toBe('2026-08-09');
    expect(doc.openingBalance).toBe(0);
  });

  it('converts cents to the dollars the web model stores', () => {
    const doc = accountDocument(
      { ...base, openingBalanceCents: 1, creditLimitCents: 500_000 },
      0,
      NOW,
    );
    expect(doc.openingBalance).toBe(0.01);
    expect(doc.creditLimit).toBe(5000);
  });

  it('satisfies the fields firestore.rules requires on create', () => {
    const doc = accountDocument(base, 3, NOW);
    for (const key of ['name', 'type', 'provider', 'openingBalance', 'isActive']) {
      expect(doc[key]).toBeDefined();
    }
    expect(doc.name).toBe('Apple Card');
    expect(doc.type).toBe('credit_card');
    expect(doc.isActive).toBe(true);
    expect(doc.sortIndex).toBe(3);
  });

  it('maps every offered kind to one of the five AccountType values', () => {
    const allowed = ['bank_account', 'debit_card', 'credit_card', 'cash', 'personal_loan'];
    for (const kind of ['checking', 'credit-card', 'loan', 'cash'] as const) {
      expect(allowed).toContain(accountDocument({ ...base, kind }, 0, NOW).type);
    }
  });

  it('omits optional fields rather than writing undefined, which Firestore rejects', () => {
    const doc = accountDocument(base, 0, NOW);
    expect('lastFourDigits' in doc).toBe(false);
    expect('creditLimit' in doc).toBe(false);
    expect('dueDate' in doc).toBe(false);
  });
});

describe('setAssumedMonthlySpend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
    mockFirebaseAuth.mockReturnValue({ currentUser: { uid: 'u1' } });
  });

  it('merge-writes the dollars figure under settings.assumedMonthlySpend and refreshes', async () => {
    await setAssumedMonthlySpend(9000);

    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'users', 'u1');
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      { settings: { assumedMonthlySpend: 9000 } },
      { merge: true },
    );
    expect(mockTriggerRefresh).toHaveBeenCalledWith('tap');
  });

  it('writes null to clear the assumption, and still refreshes', async () => {
    await setAssumedMonthlySpend(null);

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      { settings: { assumedMonthlySpend: null } },
      { merge: true },
    );
    expect(mockTriggerRefresh).toHaveBeenCalledWith('tap');
  });

  it('throws NOT_SIGNED_IN and never writes or refreshes when there is no user', async () => {
    mockFirebaseAuth.mockReturnValue({ currentUser: null });

    await expect(setAssumedMonthlySpend(9000)).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });

  it('wraps a write failure into a retryable AppError and does not refresh', async () => {
    mockSetDoc.mockRejectedValue(new Error('boom'));

    await expect(setAssumedMonthlySpend(9000)).rejects.toMatchObject({
      code: 'ASSUMED_SPEND_WRITE_FAILED',
      retryable: true,
    });
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });
});
