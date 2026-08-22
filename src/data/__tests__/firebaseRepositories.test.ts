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
  upcoming: [],
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
