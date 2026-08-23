import type {
  AppNotification,
  FinancialSnapshot,
  NotificationCategory,
  NotificationSeverity,
  SnapshotChange,
} from '@/types';
import { createId } from '@/utils/id';
import { daysUntil, formatCurrency, formatDate } from '@/utils/format';

/**
 * Notification copy.
 *
 * The rule this file exists to enforce: **Cashflow summarises, it never
 * itemises.** Three notifications reading "Amazon $14.97", "Gas $42.00",
 * "Walmart $71.23" are noise a person learns to swipe away. One that says what
 * moved and what it means is worth reading.
 *
 * So: at most two facts, one sentence about what the user can do or need not
 * do, and no lists. Everything is derived from the snapshot and the detected
 * changes — there is no template with a blank for a merchant name.
 */

export interface SummaryInput {
  snapshot: FinancialSnapshot;
  changes: readonly SnapshotChange[];
  now: number;
  /**
   * Whether a previous snapshot existed to compare against. Balances are never
   * persisted to device storage, so on a cold start there is no baseline — and
   * saying "nothing has changed" then is a claim the app cannot make. A
   * background refresh after the app is killed hits exactly that case.
   */
  hasBaseline?: boolean;
}

export interface SummaryDraft {
  title: string;
  summary: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
}

/**
 * The standing sentence every summary ends on.
 *
 * Runway, because that is the figure the system computes; when no burn has been
 * measured there is nothing to divide by, so it falls back to stating the cash
 * rather than inventing a duration.
 */
const standingSentence = (snapshot: FinancialSnapshot): string => {
  if (!snapshot.runway.hasBurn) {
    return `You have ${formatCurrency(snapshot.cashCents)} in cash; Cashflow can't work out a runway yet.`;
  }
  const left = snapshot.cashCents - snapshot.upcomingTotalCents;
  if (left < 0) {
    return `You are ${formatCurrency(Math.abs(left))} short of what's already committed.`;
  }
  return `Your runway is ${snapshot.runway.label}.`;
};

const paycheckSentence = (snapshot: FinancialSnapshot, now: number): string | null => {
  const paycheck = snapshot.nextPaycheck;
  if (!paycheck) return null;
  const days = daysUntil(paycheck.expectedDate, now);
  if (Number.isNaN(days) || days < 0 || days > 7) return null;
  const when =
    days === 0 ? 'today' : days === 1 ? 'tomorrow' : formatDate(paycheck.expectedDate, 'weekday');
  const hedge = paycheck.confidence === 'estimated' ? 'is expected' : 'arrives';
  return `Your next paycheck ${hedge} ${when}.`;
};

/** The one-line version of a change, written for a notification rather than a list row. */
const changeSentence = (change: SnapshotChange): string => {
  const amount = change.amountCents === null ? null : formatCurrency(Math.abs(change.amountCents));
  switch (change.kind) {
    case 'cash-increase':
      return `Your cash is up ${amount}.`;
    case 'cash-decrease':
      return `Your cash is down ${amount}.`;
    case 'runway-change':
      return `${change.label} — ${change.detail}.`;
    case 'card-decrease':
      return `Your credit-card balance dropped ${amount}.`;
    case 'card-increase':
      return `Your credit-card balance grew ${amount}.`;
    case 'bill-due-soon':
      return `${change.label} — ${change.detail}.`;
    case 'new-transactions':
      return `${change.label}.`;
    default:
      return `${change.label}.`;
  }
};

/**
 * Builds the summary shown after a refresh.
 *
 * Two changes maximum. A third is where a notification stops being a summary
 * and starts being a report, and a report belongs in the app.
 */
export const summarizeRefresh = (input: SummaryInput): SummaryDraft => {
  const { snapshot, changes, now, hasBaseline = true } = input;
  const urgent = changes.find((change) => change.severity === 'warning');
  const headline = changes.slice(0, 2).map(changeSentence);

  const sentences: string[] = [];
  if (headline.length === 0) {
    // Only claim stillness when there was something to compare against.
    if (hasBaseline) sentences.push('Nothing has changed since your last refresh.');
  } else {
    sentences.push(...headline);
  }
  sentences.push(standingSentence(snapshot));

  if (!urgent) {
    const paycheck = paycheckSentence(snapshot, now);
    if (paycheck) sentences.push(paycheck);
  }

  return {
    title: urgent ? 'Something needs your attention' : 'Cashflow updated',
    summary: sentences.join(' '),
    category: urgent ? 'warning' : changes.length > 0 ? 'insight' : 'success',
    severity: urgent ? 'high' : 'low',
  };
};

/** The calmer, scheduled version — no deltas, just where things stand. */
export const summarizeMorning = (input: SummaryInput): SummaryDraft => {
  const sentences = ['Your accounts refreshed successfully.', standingSentence(input.snapshot)];
  const paycheck = paycheckSentence(input.snapshot, input.now);
  if (paycheck) sentences.push(paycheck);

  return {
    title: 'Morning update',
    summary: sentences.join(' '),
    category: 'insight',
    severity: 'low',
  };
};

export const summarizeFailure = (reason: string): SummaryDraft => ({
  title: "Cashflow couldn't refresh",
  summary: `${reason} Your figures are still the last ones Cashflow could confirm.`,
  category: 'warning',
  severity: 'medium',
});

/** Turns a draft into a stored notification. */
export const toNotification = (
  draft: SummaryDraft,
  options: { source: string; correlationId: string | null; now: number },
): AppNotification => ({
  id: createId('ntf'),
  title: draft.title,
  summary: draft.summary,
  timestamp: new Date(options.now).toISOString(),
  category: draft.category,
  severity: draft.severity,
  read: false,
  target: { screen: 'Home' },
  source: options.source,
  correlationId: options.correlationId,
});
