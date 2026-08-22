/**
 * Domain models.
 *
 * **Money is integer cents, everywhere.** No float ever holds a balance: 0.1 +
 * 0.2 is not 0.3, and a financial app that rounds in the UI has already lost
 * the argument. Formatting to dollars happens once, in `src/utils/format.ts`.
 *
 * **A number that cannot be backed is `null`, not `0`.** A zero renders as a
 * measured fact and is indistinguishable from "we don't know yet" — which is
 * the single most expensive class of bug in a money app. Screens are required
 * to render the absent case as absent.
 */

export type Currency = 'USD';

export type AccountKind = 'checking' | 'savings' | 'credit-card' | 'investment' | 'loan' | 'cash';

export type AccountStatus = 'ok' | 'stale' | 'error';

export interface Account {
  id: string;
  name: string;
  institution: string;
  kind: AccountKind;
  /** Last four digits only. The full number never reaches this client. */
  mask: string;
  /**
   * Positive for assets, positive for amounts *owed* on credit and loans — the
   * sign convention is per-kind, and `netWorthContribution` in
   * `src/utils/money.ts` is the one place that resolves it.
   */
  balanceCents: number;
  availableCents: number | null;
  creditLimitCents: number | null;
  currency: Currency;
  /** ISO timestamp of the last successful sync, or null if never synced. */
  lastSyncedAt: string | null;
  status: AccountStatus;
}

export type TransactionKind = 'purchase' | 'income' | 'transfer' | 'refund' | 'fee';

export interface Transaction {
  id: string;
  accountId: string;
  /** ISO date (no time) — banks post by day. */
  date: string;
  description: string;
  merchant: string | null;
  /** Negative is money leaving, positive is money arriving. */
  amountCents: number;
  category: string;
  pending: boolean;
  kind: TransactionKind;
}

export type UpcomingPaymentKind = 'bill' | 'subscription' | 'loan' | 'card-payment';

export interface UpcomingPayment {
  id: string;
  name: string;
  /** ISO date. */
  dueDate: string;
  amountCents: number;
  accountId: string | null;
  kind: UpcomingPaymentKind;
  autopay: boolean;
}

/** Mirrors the web's `BillFrequency` (src/lib/bills.ts) exactly — a closed set. */
export type BillFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';

/**
 * A recurring obligation from the Bills register — the RECURRING DEFINITION,
 * not a projected occurrence (see `UpcomingPayment` for that). Chat context
 * uses this to answer "what are my recurring payments" and to avoid proposing
 * a `record_bill` duplicate.
 */
export interface BillDigest {
  id: string;
  vendor: string;
  amountCents: number;
  frequency: BillFrequency;
  nonNegotiable: boolean;
}

export interface Paycheck {
  /** ISO date. */
  expectedDate: string;
  amountCents: number;
  source: string;
  /** `estimated` means derived from cadence, not confirmed by the employer. */
  confidence: 'confirmed' | 'estimated';
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  targetDate: string | null;
}

/**
 * How long the money lasts — the headline figure, from `lib/home.ts` on the
 * server (UI-102). Cash over measured burn, and nothing else: it is not capped,
 * not smoothed, and not invented when there is nothing to divide by.
 */
export interface SnapshotRunway {
  /**
   * False when no spending has been measured yet. The screen must render no
   * runway at all in that case — there is no burn to divide by, so any number
   * shown would be made up.
   */
  hasBurn: boolean;
  /** How it is spoken: "42 days", "7.3 months", "Not measured yet". */
  label: string;
  days: number;
  months: number;
  /** ISO date the runway reaches. Meaningless when `hasBurn` is false. */
  date: string;
  /** Runway measured against the reserve target, 0..1. */
  reserveProgress: number;
  reserveTargetMonths: number;
  /** The next whole month of runway worth chasing; 0 once the target is met. */
  nextMonthTarget: number;
  /** What reaching `nextMonthTarget` costs; 0 once the target is met. */
  amountToNextMonthCents: number;
}

/**
 * Everything the Home screen needs, computed server-side by the `homeSnapshot`
 * callable — which runs the *same* `src/lib/**` functions the web app runs, so
 * the two clients cannot disagree about a number.
 *
 * There is deliberately no "safe to spend" here. The system does not compute
 * one, and a figure this client invented would be a second opinion on the
 * user's money. Runway is the answer to "how am I doing".
 */
export interface FinancialSnapshot {
  generatedAt: string;
  cashCents: number;
  runway: SnapshotRunway;
  creditCardBalanceCents: number;
  upcomingTotalCents: number;
  /** Non-negotiable bills per month — the floor under every spending decision. */
  lockedMonthlyCents: number;
  avgMonthlySpendCents: number;
  avgMonthlyIncomeCents: number;
  /**
   * CHAT-SPEND-001: the owner's own monthly-spend assumption, from
   * `settings.assumedMonthlySpend`, in cents. `null` means no override — the
   * runway above is the server's measured figure. When set, the server has
   * already substituted it into `avgMonthlySpendCents` and the runway maths;
   * this field exists only so the UI can mark that figure as an assumption,
   * not a measurement.
   */
  assumedMonthlySpendCents: number | null;
  /**
   * When the banks were last actually reached (`meta/plaid.lastSuccess`).
   *
   * A property of the SYNC, not of an account: one Plaid run covers every
   * linked institution and nothing stores a per-account stamp. `null` means no
   * successful run is on record — which is "not known", not "never synced".
   */
  lastBankSyncAt: string | null;
  /**
   * FIN-PENDING-001: whether provider holds counted toward every figure above.
   *
   * Carried on the snapshot rather than read separately, so the toggle a screen
   * shows is provably the policy the maths used.
   */
  includePending: boolean;
  nextPaycheck: Paycheck | null;
}

export type ChangeSeverity = 'positive' | 'informational' | 'warning';

/** One line of "what changed since your last refresh". */
export interface SnapshotChange {
  id: string;
  kind:
    | 'cash-increase'
    | 'cash-decrease'
    | 'runway-change'
    | 'card-decrease'
    | 'card-increase'
    | 'new-transactions'
    | 'bill-due-soon';
  label: string;
  detail: string;
  amountCents: number | null;
  severity: ChangeSeverity;
}
