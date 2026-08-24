import type { FinancialSnapshot, SnapshotChange, UpcomingPayment } from '@/types';
import { daysUntil, formatCurrency } from '@/utils/format';

/**
 * "What changed since your last refresh."
 *
 * Deliberately shallow: it diffs two snapshots and reads the bill dates. It
 * does not infer intent, categorise behaviour or predict anything — that
 * belongs to the backend, and building a second opinion here is how the phone
 * ends up disagreeing with the web app.
 */

/** Below this, a delta is noise (interest, a rounding difference, a pending hold). */
export const CHANGE_THRESHOLD_CENTS = 100;

/** A bill inside this window is worth interrupting someone about. */
export const BILL_URGENCY_DAYS = 3;

export interface ChangeContext {
  upcoming: readonly UpcomingPayment[];
  /** Transactions that appeared since the previous snapshot. */
  newTransactionCount: number;
  now: number;
}

const SEVERITY_RANK: Record<SnapshotChange['severity'], number> = {
  warning: 0,
  positive: 1,
  informational: 2,
};

export const detectChanges = (
  current: FinancialSnapshot,
  previous: FinancialSnapshot | null,
  context: ChangeContext,
): SnapshotChange[] => {
  const changes: SnapshotChange[] = [];

  if (previous) {
    const cashDelta = current.cashCents - previous.cashCents;
    if (Math.abs(cashDelta) >= CHANGE_THRESHOLD_CENTS) {
      changes.push({
        id: 'change-cash',
        kind: cashDelta > 0 ? 'cash-increase' : 'cash-decrease',
        label: cashDelta > 0 ? 'Cash increased' : 'Cash decreased',
        detail: `${cashDelta > 0 ? 'Up' : 'Down'} ${formatCurrency(Math.abs(cashDelta), { whole: false })} since your last refresh`,
        amountCents: cashDelta,
        severity: cashDelta > 0 ? 'positive' : 'informational',
      });
    }

    // Runway, not savings: the system has no savings-account concept, and the
    // number the owner is actually trying to move is how long the money lasts.
    // Reported in days only once there is a burn rate to divide by.
    const runwayDelta = current.runway.days - previous.runway.days;
    if (current.runway.hasBurn && previous.runway.hasBurn && Math.abs(runwayDelta) >= 1) {
      const grew = runwayDelta > 0;
      changes.push({
        id: 'change-runway',
        kind: 'runway-change',
        label: grew ? 'Runway grew' : 'Runway shortened',
        detail: `${grew ? 'Up' : 'Down'} ${Math.abs(runwayDelta)} day${Math.abs(runwayDelta) === 1 ? '' : 's'} — now ${current.runway.label}`,
        // Days, not money. `null` keeps this row out of every cents formatter.
        amountCents: null,
        severity: grew ? 'positive' : 'informational',
      });
    }

    const cardDelta = current.creditCardBalanceCents - previous.creditCardBalanceCents;
    if (Math.abs(cardDelta) >= CHANGE_THRESHOLD_CENTS) {
      const paidDown = cardDelta < 0;
      changes.push({
        id: 'change-card',
        kind: paidDown ? 'card-decrease' : 'card-increase',
        label: paidDown ? 'Card balance decreased' : 'Card balance increased',
        detail: `${paidDown ? 'Down' : 'Up'} ${formatCurrency(Math.abs(cardDelta), { whole: false })} since your last refresh`,
        amountCents: cardDelta,
        severity: paidDown ? 'positive' : 'informational',
      });
    }
  }

  // `previous &&`, same guard every other delta above sits behind. Without it a
  // cold start reported the WHOLE first page as "N new transactions / Appeared
  // since your last refresh" — the store is never persisted, so `knownIds` is
  // empty and every fetched row looks new. Raising the activity page to 200
  // quadrupled that false number, and it sat directly under a header that
  // correctly said "Recent changes" because no baseline existed. The app
  // contradicted itself in adjacent elements.
  if (previous && context.newTransactionCount > 0) {
    changes.push({
      id: 'change-transactions',
      kind: 'new-transactions',
      label: `${context.newTransactionCount} new transaction${context.newTransactionCount === 1 ? '' : 's'}`,
      detail: 'Appeared since your last refresh',
      amountCents: null,
      severity: 'informational',
    });
  }

  const urgent = context.upcoming
    .filter((payment) => {
      const days = daysUntil(payment.dueDate, context.now);
      return !Number.isNaN(days) && days >= 0 && days <= BILL_URGENCY_DAYS;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const nextUrgent = urgent[0];
  if (nextUrgent) {
    const days = daysUntil(nextUrgent.dueDate, context.now);
    changes.push({
      id: 'change-bill',
      kind: 'bill-due-soon',
      label:
        urgent.length === 1
          ? `${nextUrgent.name} is due soon`
          : `${urgent.length} bills are due soon`,
      detail:
        days === 0
          ? `${formatCurrency(nextUrgent.amountCents, { whole: false })} due today`
          : `${formatCurrency(nextUrgent.amountCents, { whole: false })} due in ${days} day${days === 1 ? '' : 's'}`,
      amountCents: nextUrgent.amountCents,
      severity: nextUrgent.autopay ? 'informational' : 'warning',
    });
  }

  return changes.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return Math.abs(b.amountCents ?? 0) - Math.abs(a.amountCents ?? 0);
  });
};
