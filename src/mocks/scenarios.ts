import { buildBaseDataset, isoDate, isoTime, type MockDataset } from './dataset';

/**
 * Development scenarios.
 *
 * Switching between these in Settings → Developer beats editing fixtures by
 * hand: every screen state the app can reach — including the ones that are
 * awkward to produce on purpose, like a partial sync or a savings milestone —
 * is one tap away on the phone.
 */
export const SCENARIO_IDS = [
  'healthy',
  'credit-heavy',
  'low-cash',
  'upcoming-bill',
  'paycheck-arriving',
  'refresh-failed',
  'partial-sync',
  'no-accounts',
  'offline',
  'large-change',
  'savings-milestone',
] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];

/** How the fake network behaves under this scenario. */
export interface ScenarioBehaviour {
  /** Every fetch fails. */
  failAll?: boolean;
  /** Accounts succeed, activity fails — exercises `partialSuccess`. */
  failActivity?: boolean;
  /** The app should present itself as offline. */
  offline?: boolean;
  /** Extra latency on top of the base simulated delay. */
  extraLatencyMs?: number;
}

export interface Scenario {
  id: ScenarioId;
  label: string;
  description: string;
  behaviour: ScenarioBehaviour;
  build: (now: number) => MockDataset;
}

const derive = (now: number, mutate: (data: MockDataset) => void): MockDataset => {
  const data = buildBaseDataset(now);
  mutate(data);
  return data;
};

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  healthy: {
    id: 'healthy',
    label: 'Healthy finances',
    description: 'Positive cash, small card balance, paycheck on the way.',
    behaviour: {},
    build: (now) => buildBaseDataset(now),
  },

  'credit-heavy': {
    id: 'credit-heavy',
    label: 'Credit-card heavy',
    description: 'Card balance dominates; safe-to-spend is squeezed.',
    behaviour: {},
    build: (now) =>
      derive(now, (data) => {
        const card = data.accounts.find((a) => a.id === 'acc_card');
        if (card) {
          card.balanceCents = 412_700;
          card.availableCents = 487_300;
        }
        data.snapshot.creditCardBalanceCents = 412_700;
        data.snapshot.upcomingTotalCents = 572_940;
        const cardPayment = data.upcoming.find((u) => u.id === 'up_card');
        if (cardPayment) cardPayment.amountCents = 412_700;
      }),
  },

  'low-cash': {
    id: 'low-cash',
    label: 'Low cash',
    description: 'Checking nearly empty and committed spending exceeds it.',
    behaviour: {},
    build: (now) =>
      derive(now, (data) => {
        const checking = data.accounts.find((a) => a.id === 'acc_checking');
        if (checking) {
          checking.balanceCents = 8_420;
          checking.availableCents = 8_420;
        }
        // Committed bills exceed available cash and the runway collapses to
        // days. The UI has to say this out loud rather than clamping it.
        data.snapshot.cashCents = 8_420;
        data.snapshot.runway = {
          ...data.snapshot.runway,
          label: '1 day',
          days: 1,
          months: 0,
          date: isoDate(now, 1),
          reserveProgress: 0,
          nextMonthTarget: 1,
          amountToNextMonthCents: 411_580,
        };
      }),
  },

  'upcoming-bill': {
    id: 'upcoming-bill',
    label: 'Upcoming bill',
    description: 'Rent is due tomorrow and it is not on autopay.',
    behaviour: {},
    build: (now) =>
      derive(now, (data) => {
        const rent = data.upcoming.find((u) => u.id === 'up_rent');
        if (rent) rent.dueDate = isoDate(now, 1);
        data.upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      }),
  },

  'paycheck-arriving': {
    id: 'paycheck-arriving',
    label: 'Paycheck arriving',
    description: 'Confirmed paycheck lands tomorrow.',
    behaviour: {},
    build: (now) =>
      derive(now, (data) => {
        const paycheck = {
          expectedDate: isoDate(now, 1),
          amountCents: 430_000,
          source: 'Acme Corp',
          confidence: 'confirmed' as const,
        };
        data.paycheck = paycheck;
        data.snapshot.nextPaycheck = paycheck;
      }),
  },

  'refresh-failed': {
    id: 'refresh-failed',
    label: 'Refresh failed',
    description: 'Every request fails; existing figures stay visible but stale.',
    behaviour: { failAll: true },
    build: (now) => buildBaseDataset(now),
  },

  'partial-sync': {
    id: 'partial-sync',
    label: 'Partial synchronisation',
    description: 'Balances refresh but activity does not — a partial success.',
    behaviour: { failActivity: true },
    build: (now) =>
      derive(now, (data) => {
        const card = data.accounts.find((a) => a.id === 'acc_card');
        if (card) {
          card.status = 'error';
          card.lastSyncedAt = isoTime(now, -3 * 86_400_000);
        }
      }),
  },

  'no-accounts': {
    id: 'no-accounts',
    label: 'No accounts',
    description: 'A fresh install with nothing connected.',
    behaviour: {},
    build: (now) => ({
      accounts: [],
      transactions: [],
      upcoming: [],
      bills: [],
      goals: [],
      paycheck: null,
      notifications: [],
      snapshot: {
        generatedAt: isoTime(now, 0),
        cashCents: 0,
        // Nothing connected, so nothing measured. `hasBurn: false` is what stops
        // the hero rendering "0 days", which would read as a measured fact.
        runway: {
          hasBurn: false,
          label: 'Not measured yet',
          days: 0,
          months: 0,
          date: isoDate(now, 0),
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
        assumedMonthlySpendCents: null,
        lastBankSyncAt: null,
        includePending: false,
        nextPaycheck: null,
      },
      previousSnapshot: null,
    }),
  },

  offline: {
    id: 'offline',
    label: 'Offline',
    description: 'No connectivity; cached figures remain readable.',
    behaviour: { offline: true, failAll: true },
    build: (now) => buildBaseDataset(now),
  },

  'large-change': {
    id: 'large-change',
    label: 'Large account change',
    description: 'A $2,300 card payoff and a week of runway gained since your last refresh.',
    behaviour: {},
    build: (now) =>
      derive(now, (data) => {
        const card = data.accounts.find((a) => a.id === 'acc_card');
        if (card) card.balanceCents = 4_500;
        data.snapshot.creditCardBalanceCents = 4_500;
        data.snapshot.runway = { ...data.snapshot.runway, label: '24 days', days: 24 };
        if (data.previousSnapshot) {
          data.previousSnapshot.creditCardBalanceCents = 234_500;
        }
      }),
  },

  'savings-milestone': {
    id: 'savings-milestone',
    label: 'Savings milestone',
    description: 'The emergency fund goal has just been reached.',
    behaviour: {},
    build: (now) =>
      derive(now, (data) => {
        const goal = data.goals.find((g) => g.id === 'goal_emergency');
        if (goal) goal.savedCents = goal.targetCents;
        const savings = data.accounts.find((a) => a.id === 'acc_savings');
        if (savings) savings.balanceCents = 500_000;
        data.snapshot.cashCents = 730_100;
        // 7301 / 4200 = 1.7 months of runway; the second reserve month is met.
        data.snapshot.runway = {
          ...data.snapshot.runway,
          label: '53 days',
          days: 53,
          months: 1.7,
          date: isoDate(now, 53),
          reserveProgress: 0.34,
          nextMonthTarget: 2,
          amountToNextMonthCents: 109_900,
        };
      }),
  },
};

export const DEFAULT_SCENARIO: ScenarioId = 'healthy';

export const scenarioList = (): Scenario[] => SCENARIO_IDS.map((id) => SCENARIOS[id]);
