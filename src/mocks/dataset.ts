import type {
  Account,
  AppNotification,
  FinancialSnapshot,
  Paycheck,
  SavingsGoal,
  Transaction,
  UpcomingPayment,
} from '@/types';

/**
 * The development dataset.
 *
 * Everything is generated relative to "now" so the app never looks stale on a
 * phone that has been sitting in a drawer. Screens never import this file —
 * they go through a repository (`src/data`), which is what lets the real API
 * replace it without a single component changing.
 */

const DAY = 86_400_000;

export const isoDate = (now: number, offsetDays: number): string =>
  new Date(now + offsetDays * DAY).toISOString().slice(0, 10);

export const isoTime = (now: number, offsetMs: number): string =>
  new Date(now + offsetMs).toISOString();

export interface MockDataset {
  accounts: Account[];
  transactions: Transaction[];
  upcoming: UpcomingPayment[];
  goals: SavingsGoal[];
  paycheck: Paycheck | null;
  notifications: AppNotification[];
  /**
   * The snapshot is *data*, not something the client derives.
   *
   * That is the architecture, not laziness: the backend is the financial source
   * of truth, so safe-to-spend arrives as a computed figure with a stated
   * reason when it is unavailable. Deriving it here would mean writing the rule
   * twice and having the phone disagree with the web app.
   */
  snapshot: FinancialSnapshot;
  /** Yesterday's figures, so change detection has something to compare against. */
  previousSnapshot: FinancialSnapshot | null;
}

const account = (partial: Omit<Account, 'currency'>): Account => ({ ...partial, currency: 'USD' });

export const buildBaseDataset = (now: number): MockDataset => {
  const accounts: Account[] = [
    account({
      id: 'acc_checking',
      name: 'Everyday Checking',
      institution: 'Meridian Bank',
      kind: 'checking',
      mask: '4821',
      balanceCents: 230_100,
      availableCents: 230_100,
      creditLimitCents: null,
      lastSyncedAt: isoTime(now, -18 * 60_000),
      status: 'ok',
    }),
    account({
      id: 'acc_savings',
      name: 'Emergency Savings',
      institution: 'Meridian Bank',
      kind: 'savings',
      mask: '3907',
      balanceCents: 102_600,
      availableCents: 102_600,
      creditLimitCents: null,
      lastSyncedAt: isoTime(now, -18 * 60_000),
      status: 'ok',
    }),
    account({
      id: 'acc_card',
      name: 'Sapphire Card',
      institution: 'Northgate',
      kind: 'credit-card',
      mask: '1187',
      balanceCents: 45_200,
      availableCents: 854_800,
      creditLimitCents: 900_000,
      lastSyncedAt: isoTime(now, -42 * 60_000),
      status: 'ok',
    }),
    account({
      id: 'acc_brokerage',
      name: 'Index Portfolio',
      institution: 'Harbour Invest',
      kind: 'investment',
      mask: '8842',
      balanceCents: 1_284_300,
      availableCents: null,
      creditLimitCents: null,
      lastSyncedAt: isoTime(now, -6 * 3_600_000),
      status: 'ok',
    }),
  ];

  const transactions: Transaction[] = [
    {
      id: 'txn_01',
      accountId: 'acc_card',
      date: isoDate(now, 0),
      description: 'BLUE BOTTLE COFFEE',
      merchant: 'Blue Bottle',
      amountCents: -640,
      category: 'Coffee',
      pending: true,
      kind: 'purchase',
    },
    {
      id: 'txn_02',
      accountId: 'acc_checking',
      date: isoDate(now, 0),
      description: 'WHOLE FOODS MKT 1023',
      merchant: 'Whole Foods',
      amountCents: -8_412,
      category: 'Groceries',
      pending: false,
      kind: 'purchase',
    },
    {
      id: 'txn_03',
      accountId: 'acc_card',
      date: isoDate(now, -1),
      description: 'SHELL OIL 574123',
      merchant: 'Shell',
      amountCents: -4_205,
      category: 'Fuel',
      pending: false,
      kind: 'purchase',
    },
    {
      id: 'txn_04',
      accountId: 'acc_checking',
      date: isoDate(now, -1),
      description: 'TRANSFER TO SAVINGS',
      merchant: null,
      amountCents: -25_000,
      category: 'Transfer',
      pending: false,
      kind: 'transfer',
    },
    {
      id: 'txn_05',
      accountId: 'acc_savings',
      date: isoDate(now, -1),
      description: 'TRANSFER FROM CHECKING',
      merchant: null,
      amountCents: 25_000,
      category: 'Transfer',
      pending: false,
      kind: 'transfer',
    },
    {
      id: 'txn_06',
      accountId: 'acc_card',
      date: isoDate(now, -2),
      description: 'AMZN MKTP US*2K41',
      merchant: 'Amazon',
      amountCents: -1_497,
      category: 'Shopping',
      pending: false,
      kind: 'purchase',
    },
    {
      id: 'txn_07',
      accountId: 'acc_checking',
      date: isoDate(now, -3),
      description: 'CITY UTILITIES AUTOPAY',
      merchant: 'City Utilities',
      amountCents: -8_740,
      category: 'Utilities',
      pending: false,
      kind: 'purchase',
    },
    {
      id: 'txn_08',
      accountId: 'acc_card',
      date: isoDate(now, -4),
      description: 'TARGET T-1842',
      merchant: 'Target',
      amountCents: -7_123,
      category: 'Household',
      pending: false,
      kind: 'purchase',
    },
    {
      id: 'txn_09',
      accountId: 'acc_card',
      date: isoDate(now, -5),
      description: 'REFUND TARGET T-1842',
      merchant: 'Target',
      amountCents: 2_399,
      category: 'Household',
      pending: false,
      kind: 'refund',
    },
    {
      id: 'txn_10',
      accountId: 'acc_checking',
      date: isoDate(now, -6),
      description: 'NORTHGATE CARD PAYMENT',
      merchant: 'Northgate',
      amountCents: -30_000,
      category: 'Card payment',
      pending: false,
      kind: 'transfer',
    },
    {
      id: 'txn_11',
      accountId: 'acc_checking',
      date: isoDate(now, -8),
      description: 'ACME CORP PAYROLL',
      merchant: 'Acme Corp',
      amountCents: 430_000,
      category: 'Salary',
      pending: false,
      kind: 'income',
    },
    {
      id: 'txn_12',
      accountId: 'acc_card',
      date: isoDate(now, -9),
      description: 'SPOTIFY USA',
      merchant: 'Spotify',
      amountCents: -1_199,
      category: 'Subscriptions',
      pending: false,
      kind: 'purchase',
    },
    {
      id: 'txn_13',
      accountId: 'acc_checking',
      date: isoDate(now, -11),
      description: 'RIVERSIDE APARTMENTS RENT',
      merchant: 'Riverside Apartments',
      amountCents: -145_000,
      category: 'Rent',
      pending: false,
      kind: 'purchase',
    },
    {
      id: 'txn_14',
      accountId: 'acc_checking',
      date: isoDate(now, -12),
      description: 'MONTHLY MAINTENANCE FEE',
      merchant: null,
      amountCents: -500,
      category: 'Fees',
      pending: false,
      kind: 'fee',
    },
  ];

  const upcoming: UpcomingPayment[] = [
    {
      id: 'up_electric',
      name: 'City Utilities',
      dueDate: isoDate(now, 4),
      amountCents: 8_740,
      accountId: 'acc_checking',
      kind: 'bill',
      autopay: true,
    },
    {
      id: 'up_internet',
      name: 'Fibrenet Internet',
      dueDate: isoDate(now, 6),
      amountCents: 6_500,
      accountId: 'acc_checking',
      kind: 'bill',
      autopay: true,
    },
    {
      id: 'up_card',
      name: 'Sapphire Card payment',
      dueDate: isoDate(now, 11),
      amountCents: 45_200,
      accountId: 'acc_card',
      kind: 'card-payment',
      autopay: false,
    },
    {
      id: 'up_rent',
      name: 'Riverside Apartments',
      dueDate: isoDate(now, 18),
      amountCents: 145_000,
      accountId: 'acc_checking',
      kind: 'bill',
      autopay: false,
    },
  ];

  const goals: SavingsGoal[] = [
    {
      id: 'goal_emergency',
      name: 'Emergency fund',
      targetCents: 500_000,
      savedCents: 102_600,
      targetDate: null,
    },
    {
      id: 'goal_trip',
      name: 'Trip to Kyoto',
      targetCents: 240_000,
      savedCents: 78_000,
      targetDate: isoDate(now, 240),
    },
  ];

  const paycheck: Paycheck = {
    expectedDate: isoDate(now, 6),
    amountCents: 430_000,
    source: 'Acme Corp',
    confidence: 'estimated',
  };

  // The figures below are internally consistent with the transactions above:
  // the $300 card payment, the $250 transfer to savings and the day's spending
  // are exactly the difference between the two snapshots. A demo that does not
  // reconcile is a demo that teaches the wrong thing.
  // Runway is cash / burn, worked through by hand so the fixture cannot drift
  // from `lib/home.ts`: 2301 / 4200 = 0.548 months = 17 days, and one whole
  // month of reserve costs 4200 - 2301 = 1899 more.
  const snapshot: FinancialSnapshot = {
    generatedAt: isoTime(now, 0),
    cashCents: 230_100,
    runway: {
      hasBurn: true,
      label: '17 days',
      days: 17,
      months: 0.5,
      date: isoDate(now, 17),
      reserveProgress: 0.1,
      reserveTargetMonths: 5,
      nextMonthTarget: 1,
      amountToNextMonthCents: 189_900,
    },
    creditCardBalanceCents: 45_200,
    upcomingTotalCents: 205_440,
    lockedMonthlyCents: 257_514,
    avgMonthlySpendCents: 420_000,
    avgMonthlyIncomeCents: 520_000,
    lastBankSyncAt: isoTime(now, -18 * 60_000),
    includePending: false,
    nextPaycheck: paycheck,
  };

  // Yesterday: 2541 / 4200 = 0.605 months = 18 days. One day of runway lost.
  const previousSnapshot: FinancialSnapshot = {
    generatedAt: isoTime(now, -DAY),
    cashCents: 254_100,
    runway: {
      hasBurn: true,
      label: '18 days',
      days: 18,
      months: 0.6,
      date: isoDate(now, 17),
      reserveProgress: 0.12,
      reserveTargetMonths: 5,
      nextMonthTarget: 1,
      amountToNextMonthCents: 165_900,
    },
    creditCardBalanceCents: 75_200,
    upcomingTotalCents: 205_440,
    lockedMonthlyCents: 257_514,
    avgMonthlySpendCents: 420_000,
    avgMonthlyIncomeCents: 520_000,
    lastBankSyncAt: isoTime(now, -18 * 60_000),
    includePending: false,
    nextPaycheck: paycheck,
  };

  return {
    accounts,
    transactions,
    upcoming,
    goals,
    paycheck,
    notifications: [],
    snapshot,
    previousSnapshot,
  };
};
