import type { FinancialSnapshot, SnapshotChange } from '@/types';

import { summarizeFailure, summarizeMorning, summarizeRefresh, toNotification } from '../summarize';

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
  assumedMonthlySpendCents: null,
  lastBankSyncAt: null,
  includePending: false,
  nextPaycheck: {
    expectedDate: '2026-08-14',
    amountCents: 430_000,
    source: 'Acme Corp',
    confidence: 'estimated',
  },
  ...overrides,
});

const change = (overrides: Partial<SnapshotChange> = {}): SnapshotChange => ({
  id: 'c1',
  kind: 'card-decrease',
  label: 'Card balance decreased',
  detail: 'Down $500.00 since your last refresh',
  amountCents: -50_000,
  severity: 'positive',
  ...overrides,
});

describe('summarizeRefresh', () => {
  it('summarises rather than itemising', () => {
    const draft = summarizeRefresh({
      snapshot: snapshot(),
      changes: [change(), change({ id: 'c2', kind: 'cash-decrease', amountCents: -12_800 })],
      now: NOW,
      hasBaseline: true,
    });

    expect(draft.summary).toBe(
      'Your credit-card balance dropped $500. Your cash is down $128. Your runway is 17 days. Your next paycheck is expected Friday, Aug 14.',
    );
  });

  it('never lists more than two changes', () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      change({ id: `c${index}`, kind: 'cash-decrease', amountCents: -1_000 * (index + 1) }),
    );

    const draft = summarizeRefresh({ snapshot: snapshot(), changes: many, now: NOW, hasBaseline: true });
    const sentences = draft.summary.split('. ').filter(Boolean);

    // two changes + runway + paycheck
    expect(sentences.length).toBeLessThanOrEqual(4);
  });

  it('says plainly when nothing moved', () => {
    const draft = summarizeRefresh({ snapshot: snapshot(), changes: [], now: NOW, hasBaseline: true });
    expect(draft.summary).toContain('Nothing has changed since your last refresh.');
    expect(draft.category).toBe('success');
  });

  it('escalates when something needs attention and drops the paycheck chatter', () => {
    const draft = summarizeRefresh({
      snapshot: snapshot(),
      changes: [
        change({
          kind: 'bill-due-soon',
          severity: 'warning',
          label: 'Rent is due soon',
          detail: '$1,450.00 due in 2 days',
        }),
      ],
      now: NOW,
      hasBaseline: true,
    });

    expect(draft.title).toBe('Something needs your attention');
    expect(draft.category).toBe('warning');
    expect(draft.severity).toBe('high');
    expect(draft.summary).not.toContain('paycheck');
  });

  it('says the runway is unknown rather than reporting zero days', () => {
    const draft = summarizeRefresh({
      snapshot: snapshot({ runway: { ...snapshot().runway, hasBurn: false } }),
      changes: [],
      now: NOW,
      hasBaseline: true,
    });

    expect(draft.summary).toContain("can't work out a runway yet");
    expect(draft.summary).not.toContain('0 days');
  });

  it('is explicit about a shortfall rather than quoting a runway over it', () => {
    const draft = summarizeRefresh({
      snapshot: snapshot({ cashCents: 100_000, upcomingTotalCents: 131_600 }),
      changes: [],
      now: NOW,
      hasBaseline: true,
    });

    expect(draft.summary).toContain("$316 short of what's already committed");
  });
});

describe('summarizeMorning', () => {
  it('reports position without deltas', () => {
    const draft = summarizeMorning({ snapshot: snapshot(), changes: [], now: NOW, hasBaseline: true });
    expect(draft.title).toBe('Morning update');
    expect(draft.summary).toBe(
      'Your accounts refreshed successfully. Your runway is 17 days. Your next paycheck is expected Friday, Aug 14.',
    );
  });
});

describe('summarizeFailure', () => {
  it('reassures that the old figures still stand', () => {
    const draft = summarizeFailure("Cashflow can't reach the network right now.");
    expect(draft.summary).toContain('last ones Cashflow could confirm');
    expect(draft.category).toBe('warning');
  });
});

describe('toNotification', () => {
  it('starts unread and carries the correlation ID', () => {
    const notification = toNotification(
      summarizeMorning({ snapshot: snapshot(), changes: [], now: NOW, hasBaseline: true }),
      { source: 'refresh', correlationId: 'cf_9', now: NOW },
    );

    expect(notification.read).toBe(false);
    expect(notification.correlationId).toBe('cf_9');
    expect(notification.timestamp).toBe('2026-08-09T12:00:00.000Z');
  });
});

/**
 * The card on Home was fixed first and this path was left behind: the same
 * sentence also ships as a push notification, from the same empty-changes
 * condition. A background refresh after the app is killed has no baseline and
 * hit exactly that case — the app telling someone "nothing has changed" when
 * it had nothing to compare against.
 */
describe('summarizeRefresh with no baseline', () => {
  it('does not claim stillness when there was nothing to compare against', () => {
    const draft = summarizeRefresh({
      snapshot: snapshot(),
      changes: [],
      now: NOW,
      hasBaseline: false,
    });

    expect(draft.summary).not.toMatch(/nothing has changed/i);
  });

  it('still says it when a baseline existed', () => {
    const draft = summarizeRefresh({
      snapshot: snapshot(),
      changes: [],
      now: NOW,
      hasBaseline: true,
    });

    expect(draft.summary).toMatch(/nothing has changed/i);
  });
});
