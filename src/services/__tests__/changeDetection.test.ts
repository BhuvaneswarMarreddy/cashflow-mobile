import type { FinancialSnapshot, UpcomingPayment } from '@/types';

import { detectChanges } from '../changeDetection';

const NOW = Date.parse('2026-08-09T12:00:00.000Z');

const snapshot = (overrides: Partial<FinancialSnapshot> = {}): FinancialSnapshot => ({
  generatedAt: new Date(NOW).toISOString(),
  cashCents: 230_100,
  runway: {
    hasBurn: true,
    label: '17 days',
    days: 17,
    months: 0.5,
    date: '2026-08-26',
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
  lastBankSyncAt: null,
  includePending: false,
  nextPaycheck: null,
  ...overrides,
});

const bill = (overrides: Partial<UpcomingPayment> = {}): UpcomingPayment => ({
  id: 'up_1',
  name: 'Rent',
  dueDate: '2026-08-25',
  amountCents: 145_000,
  accountId: null,
  kind: 'bill',
  autopay: false,
  ...overrides,
});

const context = (overrides: Partial<Parameters<typeof detectChanges>[2]> = {}) => ({
  upcoming: [],
  newTransactionCount: 0,
  now: NOW,
  ...overrides,
});

describe('detectChanges', () => {
  it('reports a cash decrease with the exact amount', () => {
    const changes = detectChanges(
      snapshot({ cashCents: 230_100 }),
      snapshot({ cashCents: 254_100 }),
      context(),
    );

    const cash = changes.find((change) => change.kind === 'cash-decrease');
    expect(cash?.amountCents).toBe(-24_000);
    expect(cash?.detail).toBe('Down $240.00 since your last refresh');
  });

  it('treats a card balance going down as good news', () => {
    const changes = detectChanges(
      snapshot({ creditCardBalanceCents: 4_500 }),
      snapshot({ creditCardBalanceCents: 234_500 }),
      context(),
    );

    const card = changes.find((change) => change.kind === 'card-decrease');
    expect(card?.severity).toBe('positive');
    expect(card?.amountCents).toBe(-230_000);
  });

  it('ignores sub-dollar noise', () => {
    const changes = detectChanges(
      snapshot({ cashCents: 230_142 }),
      snapshot({ cashCents: 230_100 }),
      context(),
    );

    expect(changes).toHaveLength(0);
  });

  it('produces nothing but new-transaction news when there is no history', () => {
    const changes = detectChanges(snapshot(), null, context({ newTransactionCount: 2 }));

    expect(changes).toHaveLength(1);
    expect(changes[0]?.label).toBe('2 new transactions');
  });

  it('warns about a bill due within three days when it is not on autopay', () => {
    const changes = detectChanges(
      snapshot(),
      null,
      context({ upcoming: [bill({ dueDate: '2026-08-11', autopay: false })] }),
    );

    const due = changes.find((change) => change.kind === 'bill-due-soon');
    expect(due?.severity).toBe('warning');
    expect(due?.detail).toBe('$1,450.00 due in 2 days');
  });

  it('does not warn when autopay will handle it', () => {
    const changes = detectChanges(
      snapshot(),
      null,
      context({ upcoming: [bill({ dueDate: '2026-08-11', autopay: true })] }),
    );

    expect(changes.find((change) => change.kind === 'bill-due-soon')?.severity).toBe(
      'informational',
    );
  });

  it('ignores bills outside the urgency window', () => {
    const changes = detectChanges(
      snapshot(),
      null,
      context({ upcoming: [bill({ dueDate: '2026-08-25' })] }),
    );

    expect(changes.find((change) => change.kind === 'bill-due-soon')).toBeUndefined();
  });

  it('orders by severity first, then by size within a severity', () => {
    const changes = detectChanges(
      snapshot({
        cashCents: 200_000,
        creditCardBalanceCents: 20_000,
        runway: { ...snapshot().runway, days: 22, label: '22 days' },
      }),
      snapshot({ cashCents: 254_100, creditCardBalanceCents: 45_200 }),
      context({ upcoming: [bill({ dueDate: '2026-08-10', autopay: false })] }),
    );

    expect(changes.map((change) => change.severity)).toEqual([
      'warning',
      'positive',
      'positive',
      'informational',
    ]);

    // Within the positive group, the bigger movement comes first.
    expect(Math.abs(changes[1]?.amountCents ?? 0)).toBeGreaterThanOrEqual(
      Math.abs(changes[2]?.amountCents ?? 0),
    );
  });
});
