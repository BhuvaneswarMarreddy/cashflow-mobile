import { httpsCallable } from '@firebase/functions';

import { isFirebaseConfigured } from '@/services/firebase';

import { createFirebaseRepositories } from '../firebaseRepositories';

/**
 * Mocks the wire, not the server — same posture as `chat.test.ts`. This suite
 * covers only the one piece of client-side maths this module does:
 * `assumedMonthlySpend` dollars → `assumedMonthlySpendCents`, at the boundary
 * where the payload becomes the store's `FinancialSnapshot`.
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

const basePayload = (assumedMonthlySpend: number | null) => ({
  generatedAt: '2026-08-21T00:00:00.000Z',
  snapshot: {
    cashCents: 100,
    runway: {
      hasBurn: false,
      label: 'Not measured yet',
      days: 0,
      months: 0,
      date: '2026-08-21',
      reserveProgress: 0,
      reserveTargetMonths: 5,
      nextMonthTarget: 0,
      amountToNextMonthCents: 0,
    },
    creditCardBalanceCents: 0,
    upcomingTotalCents: 0,
    lockedMonthlyCents: 0,
    avgMonthlySpendCents: 0,
    avgMonthlyIncomeCents: 0,
    lastBankSyncAt: null,
    includePending: false,
    nextPaycheck: null,
    // Nested beside includePending — the server's placement for policy fields.
    assumedMonthlySpend,
  },
  accounts: [],
  categories: [],
  upcoming: [],
  bills: [],
  goals: [],
  activity: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  mockIsFirebaseConfigured.mockReturnValue(true);
});

describe('createFirebaseRepositories snapshot.current', () => {
  it('converts a set assumedMonthlySpend from dollars to cents', async () => {
    const callable = jest.fn().mockResolvedValue({ data: basePayload(9000) });
    mockHttpsCallable.mockReturnValue(callable);

    const { snapshot } = await createFirebaseRepositories().snapshot.current();

    expect(snapshot.assumedMonthlySpendCents).toBe(900_000);
  });

  it('passes through null when no assumption is set', async () => {
    const callable = jest.fn().mockResolvedValue({ data: basePayload(null) });
    mockHttpsCallable.mockReturnValue(callable);

    const { snapshot } = await createFirebaseRepositories().snapshot.current();

    expect(snapshot.assumedMonthlySpendCents).toBeNull();
  });
});

describe('createFirebaseRepositories plan.bills', () => {
  it('carries the Bills register digest through from the payload, one call for both', async () => {
    const bills = [
      { id: 'bill_1', vendor: 'City Utilities', amountCents: 8_740, frequency: 'monthly' as const, nonNegotiable: false },
    ];
    const callable = jest.fn().mockResolvedValue({ data: { ...basePayload(null), bills } });
    mockHttpsCallable.mockReturnValue(callable);

    const result = await createFirebaseRepositories().plan.bills();

    expect(result).toEqual(bills);
    expect(callable).toHaveBeenCalledTimes(1);
  });
});

/**
 * cashflow-mobile#24. `categories` is a top-level payload field, sibling to
 * `bills`/`goals`/`accounts` — NOT nested inside `snapshot` (verified against
 * `functions/src/snapshot.ts`'s `buildSnapshot`).
 */
describe('createFirebaseRepositories plan.categories', () => {
  it('carries the resolved category set through from the payload', async () => {
    const categories = [
      { value: 'food', label: 'Food & Dining', icon: '🍽️', archived: false },
      { value: 'vacations', label: 'Vacations', icon: '🏖️' },
    ];
    const callable = jest.fn().mockResolvedValue({ data: { ...basePayload(null), categories } });
    mockHttpsCallable.mockReturnValue(callable);

    const result = await createFirebaseRepositories().plan.categories();

    expect(result).toEqual([
      { value: 'food', label: 'Food & Dining', icon: '🍽️' },
      { value: 'vacations', label: 'Vacations', icon: '🏖️' },
    ]);
  });

  it('preserves an archived category rather than dropping it', async () => {
    const categories = [{ value: 'old-hobby', label: 'Old Hobby', icon: '🎨', archived: true }];
    const callable = jest.fn().mockResolvedValue({ data: { ...basePayload(null), categories } });
    mockHttpsCallable.mockReturnValue(callable);

    const result = await createFirebaseRepositories().plan.categories();

    expect(result).toEqual([{ value: 'old-hobby', label: 'Old Hobby', icon: '🎨', archived: true }]);
  });

  it('carries a missing icon through as absent, never synthesizing one here', async () => {
    const categories = [{ value: 'vacations', label: 'Vacations' }];
    const callable = jest.fn().mockResolvedValue({ data: { ...basePayload(null), categories } });
    mockHttpsCallable.mockReturnValue(callable);

    const result = await createFirebaseRepositories().plan.categories();

    expect(result).toEqual([{ value: 'vacations', label: 'Vacations' }]);
  });
});
