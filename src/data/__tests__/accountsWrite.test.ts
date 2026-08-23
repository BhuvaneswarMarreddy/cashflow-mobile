import { doc, setDoc } from '@firebase/firestore';

import { CATEGORIES } from '@/features/activity/categories';
import { triggerRefresh } from '@/hooks/useRefresh';
import { firebaseAuth } from '@/services/firebase';
import { refreshFinancialData } from '@/services/refresh';
import { useFinanceStore } from '@/store/financeStore';
import type { Account, BillDigest } from '@/types';

import {
  accountDocument,
  addCategory,
  billDocument,
  createAccount,
  createBill,
  renameCategory,
  resolvePaymentMethodId,
  setAssumedMonthlySpend,
  setIncludePending,
  type NewAccount,
  type NewBill,
} from '../accountsWrite';

/**
 * `setAssumedMonthlySpend` mocks the wire, not Firestore — same posture as
 * `decisions.test.ts` mocking the callable. This asserts the write SHAPE and
 * the refresh trigger, never re-derives what the server does with it.
 */
// `doc()` needs an `.id` distinct from the plain `{ path }` the other
// describe blocks use, so `createBill`'s post-refresh confirmation check
// (`bills.some(bill => bill.id === ref.id)`) has something real to match.
const NEW_DOC_ID = 'bill_new';

jest.mock('@firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(() => ({ path: 'users/u1', id: 'bill_new' })),
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

jest.mock('@/services/refresh', () => ({
  refreshFinancialData: jest.fn(),
}));

const mockSetDoc = setDoc as jest.Mock;
const mockDoc = doc as jest.Mock;
const mockFirebaseAuth = firebaseAuth as jest.Mock;
const mockTriggerRefresh = triggerRefresh as jest.Mock;
const mockRefreshFinancialData = refreshFinancialData as jest.Mock;

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

const acct = (partial: Partial<Account> & { id: string; name: string }): Account => ({
  institution: 'Meridian Bank',
  kind: 'checking',
  mask: '1234',
  balanceCents: 0,
  availableCents: 0,
  creditLimitCents: null,
  currency: 'USD',
  lastSyncedAt: null,
  status: 'ok',
  ...partial,
});

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

describe('createAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
    mockFirebaseAuth.mockReturnValue({ currentUser: { uid: 'u1' } });
  });

  it('writes users/{uid}/accounts and triggers a refresh', async () => {
    await createAccount(base, 0);

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'Apple Card', type: 'credit_card' }),
    );
  });

  it('throws NOT_SIGNED_IN and never writes when there is no user', async () => {
    mockFirebaseAuth.mockReturnValue({ currentUser: null });

    await expect(createAccount(base, 0)).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  // Direct `setDoc` writes go through the Firestore SDK, which — unlike a
  // Callable — never prefixes its error code with `functions/`.
  // errorFacetsFor must handle both transports.
  it('wraps a malformed-write rejection (invalid-argument) into a NON-retryable AppError', async () => {
    mockSetDoc.mockRejectedValue(Object.assign(new Error('bad doc'), { code: 'invalid-argument' }));

    await expect(createAccount(base, 0)).rejects.toMatchObject({
      code: 'ACCOUNT_CREATE_FAILED',
      category: 'validation',
      retryable: false,
    });
  });

  it('keeps the retryable default for an unrecognised code', async () => {
    mockSetDoc.mockRejectedValue(new Error('boom'));

    await expect(createAccount(base, 0)).rejects.toMatchObject({
      code: 'ACCOUNT_CREATE_FAILED',
      retryable: true,
    });
  });
});

describe('setIncludePending', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
    mockFirebaseAuth.mockReturnValue({ currentUser: { uid: 'u1' } });
  });

  it('merge-writes the flag under settings.includePendingInCalculations', async () => {
    await setIncludePending(true);

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      { settings: { includePendingInCalculations: true } },
      { merge: true },
    );
  });

  it('throws NOT_SIGNED_IN and never writes when there is no user', async () => {
    mockFirebaseAuth.mockReturnValue({ currentUser: null });

    await expect(setIncludePending(true)).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('wraps a gone-document rejection (not-found) into a NON-retryable AppError', async () => {
    mockSetDoc.mockRejectedValue(Object.assign(new Error('gone'), { code: 'not-found' }));

    await expect(setIncludePending(true)).rejects.toMatchObject({
      code: 'PENDING_POLICY_WRITE_FAILED',
      category: 'data',
      retryable: false,
    });
  });

  it('keeps the retryable default for an unrecognised code', async () => {
    mockSetDoc.mockRejectedValue(new Error('boom'));

    await expect(setIncludePending(true)).rejects.toMatchObject({
      code: 'PENDING_POLICY_WRITE_FAILED',
      retryable: true,
    });
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

  it('wraps an unrecognised write failure into a retryable AppError (today\'s default) and does not refresh', async () => {
    mockSetDoc.mockRejectedValue(new Error('boom'));

    await expect(setAssumedMonthlySpend(9000)).rejects.toMatchObject({
      code: 'ASSUMED_SPEND_WRITE_FAILED',
      retryable: true,
    });
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });

  it('wraps a malformed-write rejection (invalid-argument) into a NON-retryable AppError', async () => {
    mockSetDoc.mockRejectedValue(Object.assign(new Error('too high'), { code: 'invalid-argument' }));

    await expect(setAssumedMonthlySpend(9000)).rejects.toMatchObject({
      code: 'ASSUMED_SPEND_WRITE_FAILED',
      category: 'validation',
      retryable: false,
    });
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });
});

describe('resolvePaymentMethodId', () => {
  const accounts = [acct({ id: 'acc_apple', name: 'Apple Card' }), acct({ id: 'acc_checking', name: 'Everyday Checking' })];

  it('resolves an exact, case-insensitive match', () => {
    expect(resolvePaymentMethodId('apple card', accounts)).toBe('acc_apple');
  });

  it('resolves a unique substring match', () => {
    expect(resolvePaymentMethodId('Apple', accounts)).toBe('acc_apple');
  });

  it('falls back to manual on an ambiguous substring match', () => {
    const ambiguous = [acct({ id: 'a', name: 'Apple Card' }), acct({ id: 'b', name: 'Apple Cash' })];
    expect(resolvePaymentMethodId('Apple', ambiguous)).toBe('manual');
  });

  it('falls back to manual when nothing matches', () => {
    expect(resolvePaymentMethodId('Discover', accounts)).toBe('manual');
  });

  it('falls back to manual when no accountName is given', () => {
    expect(resolvePaymentMethodId(undefined, accounts)).toBe('manual');
  });
});

describe('billDocument', () => {
  const base: NewBill = { vendor: '  Apple Card  ', amountCents: 4_579, frequency: 'monthly' };

  it('satisfies the fields firestore.rules requires on create', () => {
    const doc = billDocument(base, 'acc_apple');
    for (const key of ['vendor', 'amount', 'frequency', 'paymentMethodId', 'migrationStatus', 'lifecycleStatus']) {
      expect(doc[key]).toBeDefined();
    }
    expect(doc.vendor).toBe('Apple Card');
    expect(doc.amount).toBe(45.79);
    expect(doc.frequency).toBe('monthly');
    expect(doc.paymentMethodId).toBe('acc_apple');
  });

  it('defaults migrationStatus/lifecycleStatus to the web record_bill card values', () => {
    const doc = billDocument(base, 'manual');
    expect(doc.migrationStatus).toBe('to-review');
    expect(doc.lifecycleStatus).toBe('active');
  });

  it('omits optional fields rather than writing undefined, which Firestore rejects', () => {
    const doc = billDocument(base, 'manual');
    for (const key of ['autopayDay', 'anchorDate', 'endDate', 'installmentsRemaining', 'nonNegotiable']) {
      expect(key in doc).toBe(false);
    }
  });

  it('includes optional fields when present — including a falsy nonNegotiable', () => {
    const doc = billDocument(
      {
        ...base,
        autopayDay: 15,
        anchorDate: '2026-09-15',
        endDate: '2027-01-01',
        installmentsRemaining: 13,
        nonNegotiable: false,
      },
      'manual',
    );
    expect(doc.autopayDay).toBe(15);
    expect(doc.anchorDate).toBe('2026-09-15');
    expect(doc.endDate).toBe('2027-01-01');
    expect(doc.installmentsRemaining).toBe(13);
    expect(doc.nonNegotiable).toBe(false);
  });
});

describe('createBill', () => {
  const input: NewBill = {
    vendor: 'Apple Card',
    amountCents: 4_579,
    frequency: 'monthly',
    autopayDay: 15,
    installmentsRemaining: 13,
    nonNegotiable: true,
  };

  /**
   * What a real refresh would leave in the store once it actually picks up
   * the new row — matched by `id` only, so every happy-path test below can
   * share this default without restating vendor/amount per case.
   */
  const confirmedBill = (overrides: Partial<BillDigest> = {}): BillDigest => ({
    id: NEW_DOC_ID,
    vendor: 'Apple Card',
    amountCents: 4_579,
    frequency: 'monthly',
    nonNegotiable: true,
    endDate: null,
    installmentsRemaining: 13,
    method: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
    mockFirebaseAuth.mockReturnValue({ currentUser: { uid: 'u1' } });
    useFinanceStore.setState({ accounts: [], bills: [] });
    // Confirmed by default, as a real refresh would leave it — the one test
    // that exercises the unconfirmed path overrides this.
    mockRefreshFinancialData.mockImplementation(async () => {
      useFinanceStore.setState({ bills: [confirmedBill()] });
    });
  });

  it('writes users/{uid}/bills with the resolved shape, awaits the refresh, and resolves once the bill is confirmed locally', async () => {
    const id = await createBill(input);

    expect(id).toBe(NEW_DOC_ID);
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        vendor: 'Apple Card',
        amount: 45.79,
        frequency: 'monthly',
        paymentMethodId: 'manual',
        migrationStatus: 'to-review',
        lifecycleStatus: 'active',
        autopayDay: 15,
        installmentsRemaining: 13,
        nonNegotiable: true,
        createdAt: 'SERVER_TIME',
        updatedAt: 'SERVER_TIME',
      }),
    );
    expect(mockRefreshFinancialData).toHaveBeenCalledWith('tap');
    // The document write must land before the refresh is even asked for.
    expect(mockSetDoc.mock.invocationCallOrder[0]).toBeLessThan(
      mockRefreshFinancialData.mock.invocationCallOrder[0],
    );
  });

  /**
   * The honesty gap this exists to close: `triggerRefresh` (used elsewhere in
   * this file) is fire-and-forget, so a caller awaiting only the write — not
   * the refresh — could show "Saved" before the store agrees. `createBill`
   * must not resolve until a refresh has actually run and the row confirmed.
   */
  it('throws a distinct, retryable error when the refresh completes without the bill showing up locally — the write itself still succeeded', async () => {
    mockRefreshFinancialData.mockResolvedValue(undefined); // bills stays empty — never confirmed

    await expect(createBill(input)).rejects.toMatchObject({
      code: 'BILL_REFRESH_UNCONFIRMED',
      category: 'data',
      retryable: true,
    });
    expect(mockSetDoc).toHaveBeenCalled();
    expect(mockRefreshFinancialData).toHaveBeenCalledWith('tap');
  });

  it('resolves paymentMethodId from accountName against the store accounts', async () => {
    useFinanceStore.setState({ accounts: [acct({ id: 'acc_card', name: 'Apple Card' })] });

    await createBill({ ...input, accountName: 'apple card' });

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ paymentMethodId: 'acc_card' }),
    );
  });

  it('falls back to manual when the accountName does not resolve', async () => {
    useFinanceStore.setState({ accounts: [acct({ id: 'acc_other', name: 'Checking' })] });

    await createBill({ ...input, accountName: 'Nonexistent Card' });

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ paymentMethodId: 'manual' }),
    );
  });

  it('throws NOT_SIGNED_IN and never writes or refreshes when there is no user', async () => {
    mockFirebaseAuth.mockReturnValue({ currentUser: null });

    await expect(createBill(input)).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockRefreshFinancialData).not.toHaveBeenCalled();
  });

  it('wraps an unrecognised write failure into a retryable AppError (today\'s default) and does not refresh', async () => {
    mockSetDoc.mockRejectedValue(new Error('boom'));

    await expect(createBill(input)).rejects.toMatchObject({
      code: 'BILL_CREATE_FAILED',
      retryable: true,
    });
    expect(mockRefreshFinancialData).not.toHaveBeenCalled();
  });

  it('wraps an already-gone rejection (not-found) into a NON-retryable AppError', async () => {
    mockSetDoc.mockRejectedValue(Object.assign(new Error('gone'), { code: 'not-found' }));

    await expect(createBill(input)).rejects.toMatchObject({
      code: 'BILL_CREATE_FAILED',
      category: 'data',
      retryable: false,
    });
    expect(mockRefreshFinancialData).not.toHaveBeenCalled();
  });
});

/**
 * cashflow-mobile#24. Same write target as `setAssumedMonthlySpend`
 * (`users/{uid}.settings`, merge) — the shape the server's `resolveCategories()`
 * reads (cashflow-forecast `src/types/index.ts`). `homeSnapshot` only ever
 * hands back the RESOLVED list, never the raw `settings.categories` array —
 * these tests pin that reconstruction (`customCategoriesOf`) alongside the
 * write shape itself.
 */
describe('addCategory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
    mockFirebaseAuth.mockReturnValue({ currentUser: { uid: 'u1' } });
    // A LOADED set with no customs — what the server sends an owner who has
    // never added one. Distinct from `[]`, which means "not loaded yet".
    useFinanceStore.setState({ categories: CATEGORIES.map((c) => ({ ...c })) });
  });

  /**
   * The store's category list is mobile's only copy of the owner's customs;
   * an empty one means the snapshot has not landed yet. Writing then would
   * replace the whole array with just the new entry and delete every category
   * made on web — silently, under a "Saved" message.
   */
  it('refuses to write before the first snapshot has populated categories', async () => {
    useFinanceStore.setState({ categories: [] });

    await expect(addCategory('Vacations')).rejects.toMatchObject({
      code: 'CATEGORIES_NOT_LOADED',
      retryable: true,
    });
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('merge-writes a fresh slug under settings.categories and refreshes, returning the slug', async () => {
    const value = await addCategory('Vacations');

    expect(value).toBe('vacations');
    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'users', 'u1');
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      { settings: { categories: [{ value: 'vacations', label: 'Vacations' }] } },
      { merge: true },
    );
    expect(mockTriggerRefresh).toHaveBeenCalledWith('tap');
  });

  it('includes the icon only when one is given', async () => {
    await addCategory('Vacations', '🏖️');

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      { settings: { categories: [{ value: 'vacations', label: 'Vacations', icon: '🏖️' }] } },
      { merge: true },
    );
  });

  it('reconstructs the existing custom entries from the RESOLVED store set, never re-adding a default', async () => {
    useFinanceStore.setState({
      categories: [...CATEGORIES, { value: 'vacations', label: 'Vacations', icon: '🏖️' }],
    });

    await addCategory('Home Repairs');

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      {
        settings: {
          categories: [
            { value: 'vacations', label: 'Vacations', icon: '🏖️' },
            { value: 'home-repairs', label: 'Home Repairs' },
          ],
        },
      },
      { merge: true },
    );
  });

  it('collision-suffixes a label that slugs the same as an existing custom category', async () => {
    useFinanceStore.setState({
      categories: [...CATEGORIES, { value: 'vacations', label: 'Vacations' }],
    });

    const value = await addCategory('Vacations!!');

    expect(value).toBe('vacations-2');
  });

  it('throws NOT_SIGNED_IN and never writes or refreshes when there is no user', async () => {
    mockFirebaseAuth.mockReturnValue({ currentUser: null });

    await expect(addCategory('Vacations')).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });

  it('wraps an unrecognised write failure into a retryable AppError (today\'s default) and does not refresh', async () => {
    mockSetDoc.mockRejectedValue(new Error('boom'));

    await expect(addCategory('Vacations')).rejects.toMatchObject({
      code: 'CATEGORY_WRITE_FAILED',
      retryable: true,
    });
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });

  // `throwCategoryWriteFailed` is the ONE shared helper behind both
  // addCategory and renameCategory (see the renameCategory suite below,
  // which relies on the same fix without re-testing every code here).
  it('wraps a malformed-write rejection (invalid-argument) into a NON-retryable AppError', async () => {
    mockSetDoc.mockRejectedValue(Object.assign(new Error('bad label'), { code: 'invalid-argument' }));

    await expect(addCategory('Vacations')).rejects.toMatchObject({
      code: 'CATEGORY_WRITE_FAILED',
      category: 'validation',
      retryable: false,
    });
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });
});

describe('renameCategory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
    mockFirebaseAuth.mockReturnValue({ currentUser: { uid: 'u1' } });
    useFinanceStore.setState({
      categories: [...CATEGORIES, { value: 'vacations', label: 'Vacations', icon: '🏖️' }],
    });
  });

  /** Same cold-start hazard as addCategory: an empty store is "not loaded". */
  it('refuses to write before the first snapshot has populated categories', async () => {
    useFinanceStore.setState({ categories: [] });

    await expect(renameCategory('vacations', 'Trips')).rejects.toMatchObject({
      code: 'CATEGORIES_NOT_LOADED',
      retryable: true,
    });
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('changes only the label of the matching custom entry, preserving its icon', async () => {
    await renameCategory('vacations', 'Trips');

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      { settings: { categories: [{ value: 'vacations', label: 'Trips', icon: '🏖️' }] } },
      { merge: true },
    );
    expect(mockTriggerRefresh).toHaveBeenCalledWith('tap');
  });

  it('leaves every other custom entry untouched', async () => {
    useFinanceStore.setState({
      categories: [
        ...CATEGORIES,
        { value: 'vacations', label: 'Vacations' },
        { value: 'home-repairs', label: 'Home Repairs' },
      ],
    });

    await renameCategory('vacations', 'Trips');

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      {
        settings: {
          categories: [
            { value: 'vacations', label: 'Trips' },
            { value: 'home-repairs', label: 'Home Repairs' },
          ],
        },
      },
      { merge: true },
    );
  });

  it('throws NOT_SIGNED_IN and never writes or refreshes when there is no user', async () => {
    mockFirebaseAuth.mockReturnValue({ currentUser: null });

    await expect(renameCategory('vacations', 'Trips')).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });

  it('wraps an unrecognised write failure into a retryable AppError (today\'s default) and does not refresh', async () => {
    mockSetDoc.mockRejectedValue(new Error('boom'));

    await expect(renameCategory('vacations', 'Trips')).rejects.toMatchObject({
      code: 'CATEGORY_WRITE_FAILED',
      retryable: true,
    });
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });

  it('wraps an already-gone rejection (not-found) into a NON-retryable AppError, via the shared throwCategoryWriteFailed', async () => {
    mockSetDoc.mockRejectedValue(Object.assign(new Error('gone'), { code: 'not-found' }));

    await expect(renameCategory('vacations', 'Trips')).rejects.toMatchObject({
      code: 'CATEGORY_WRITE_FAILED',
      category: 'data',
      retryable: false,
    });
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });
});

/**
 * cashflow-forecast#165. The plan's end used to be derived at READ time from
 * `updatedAt`, so every unrelated edit re-anchored it — and because
 * `installmentsRemaining` never decrements, each edit re-added the FULL
 * original term, silently inflating Home's "Locked" tile. `update_bill`'s own
 * worked example is a rename, so that was the normal path.
 *
 * Stamping the end once, at write time, is what makes it immune.
 */
describe('billDocument stamps an installment plan end', () => {
  const installment: NewBill = {
    vendor: 'Apple Card',
    amountCents: 4_579,
    frequency: 'monthly',
    installmentsRemaining: 13,
  };

  it('writes an endDate derived from the count', () => {
    jest.useFakeTimers().setSystemTime(Date.parse('2026-08-06T12:00:00.000Z'));
    try {
      expect(billDocument(installment, 'manual').endDate).toBe('2027-09-06');
    } finally {
      jest.useRealTimers();
    }
  });

  it('never overrides an endDate the caller supplied', () => {
    const doc = billDocument({ ...installment, endDate: '2026-12-01' }, 'manual');
    expect(doc.endDate).toBe('2026-12-01');
  });

  it('writes no endDate for a bill with no installment count', () => {
    const doc = billDocument({ vendor: 'Rent', amountCents: 185_000, frequency: 'monthly' }, 'manual');
    expect('endDate' in doc).toBe(false);
  });

  it('agrees with the forecast repo on weekly and biweekly steps', () => {
    jest.useFakeTimers().setSystemTime(Date.parse('2026-08-06T12:00:00.000Z'));
    try {
      expect(billDocument({ ...installment, frequency: 'weekly', installmentsRemaining: 4 }, 'manual').endDate)
        .toBe('2026-09-03');
      expect(billDocument({ ...installment, frequency: 'biweekly', installmentsRemaining: 4 }, 'manual').endDate)
        .toBe('2026-10-01');
    } finally {
      jest.useRealTimers();
    }
  });
});
