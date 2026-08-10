import {
  daysUntil,
  formatCurrency,
  formatDate,
  formatDelta,
  formatDueIn,
  formatMask,
  formatRelativeTime,
} from '../format';

const AUG_9 = new Date('2026-08-09T12:00:00.000Z').getTime();

describe('formatCurrency', () => {
  it('renders whole dollars by default', () => {
    expect(formatCurrency(230_100)).toBe('$2,301');
  });

  it('renders cents when asked', () => {
    expect(formatCurrency(230_150, { whole: false })).toBe('$2,301.50');
  });

  it('puts the sign before the currency symbol, not inside it', () => {
    // `-$240` and `$-240` both occur in the wild; only one reads as money.
    expect(formatCurrency(-24_000)).toBe('−$240');
  });

  it('marks positive values only when explicitly signed', () => {
    expect(formatCurrency(24_000)).toBe('$240');
    expect(formatDelta(24_000)).toBe('+$240');
    expect(formatDelta(-24_000)).toBe('−$240');
    expect(formatDelta(0)).toBe('$0');
  });

  it('never loses precision to floating point', () => {
    // 0.1 + 0.2 in dollars is the classic failure; in cents it cannot happen.
    expect(formatCurrency(10 + 20, { whole: false })).toBe('$0.30');
  });
});

describe('formatMask', () => {
  it('shows only the last four digits', () => {
    expect(formatMask('4821')).toBe('•••• 4821');
    expect(formatMask('123456784821')).toBe('•••• 4821');
  });
});

describe('formatRelativeTime', () => {
  it('is specific rather than vague, because freshness matters', () => {
    expect(formatRelativeTime(new Date(AUG_9 - 30_000).toISOString(), AUG_9)).toBe('just now');
    expect(formatRelativeTime(new Date(AUG_9 - 4 * 60_000).toISOString(), AUG_9)).toBe(
      '4 minutes ago',
    );
    expect(formatRelativeTime(new Date(AUG_9 - 60 * 60_000).toISOString(), AUG_9)).toBe(
      '1 hour ago',
    );
    expect(formatRelativeTime(new Date(AUG_9 - 26 * 3_600_000).toISOString(), AUG_9)).toBe(
      'yesterday',
    );
  });

  it('says "never" rather than inventing a time', () => {
    expect(formatRelativeTime(null)).toBe('never');
  });

  it('does not crash on a malformed timestamp', () => {
    expect(formatRelativeTime('not-a-date', AUG_9)).toBe('unknown');
  });
});

describe('due dates', () => {
  it('counts whole days to a due date', () => {
    expect(daysUntil('2026-08-12T12:00:00.000Z', AUG_9)).toBe(3);
  });

  it('reads a date-only string as that calendar day, not UTC midnight', () => {
    // Regression: `new Date('2026-08-14')` is midnight UTC, which is 13 August
    // in any timezone west of Greenwich — a bill shown as due a day early.
    expect(formatDate('2026-08-14', 'weekday')).toBe('Friday, Aug 14');
    expect(daysUntil('2026-08-14', AUG_9)).toBe(5);
  });

  it('counts calendar days regardless of the time of day', () => {
    const lateEvening = new Date(2026, 7, 9, 23, 30).getTime();
    const earlyMorning = new Date(2026, 7, 9, 6, 15).getTime();
    expect(daysUntil('2026-08-10', lateEvening)).toBe(1);
    expect(daysUntil('2026-08-10', earlyMorning)).toBe(1);
  });

  it('reads naturally near today', () => {
    expect(formatDueIn('2026-08-09T12:00:00.000Z', AUG_9)).toBe('today');
    expect(formatDueIn('2026-08-10T12:00:00.000Z', AUG_9)).toBe('tomorrow');
    expect(formatDueIn('2026-08-14T12:00:00.000Z', AUG_9)).toBe('in 5 days');
  });

  it('says overdue rather than a negative count', () => {
    expect(formatDueIn('2026-08-07T12:00:00.000Z', AUG_9)).toBe('2 days overdue');
  });
});
