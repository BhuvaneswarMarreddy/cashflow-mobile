import { create } from 'zustand';

import type { ErrorCategory } from '@/errors';
import type { CategoryOption } from '@/features/activity/categories';
import type {
  Account,
  BillDigest,
  FinancialSnapshot,
  Paycheck,
  SavingsGoal,
  SnapshotChange,
  Transaction,
  UpcomingPayment,
} from '@/types';

/**
 * Cached server state.
 *
 * **Not persisted, on purpose.** Balances and transactions are re-fetchable and
 * are the most sensitive thing this app touches; writing them to device storage
 * would buy a slightly faster cold start in exchange for a durable copy of
 * someone's finances sitting in a phone backup. Preferences persist; money does
 * not.
 */
export type RefreshStatus = 'idle' | 'refreshing' | 'success' | 'partialSuccess' | 'failed';

/** Sections that can fail independently, so a partial refresh can say which. */
export type FinanceSection = 'snapshot' | 'accounts' | 'activity' | 'plan';

export interface FinanceError {
  category: ErrorCategory;
  userMessage: string;
  retryable: boolean;
  correlationId: string | null;
}

interface FinanceState {
  snapshot: FinancialSnapshot | null;
  previousSnapshot: FinancialSnapshot | null;
  accounts: Account[];
  transactions: Transaction[];
  upcoming: UpcomingPayment[];
  bills: BillDigest[];
  /** cashflow-mobile#24. The owner's resolved category set — `[]` until the
   *  first snapshot lands; every consumer falls back to the 13 defaults via
   *  `resolveCategories()` (`@/features/activity/categories`) rather than
   *  reading this field directly. */
  categories: CategoryOption[];
  goals: SavingsGoal[];
  paycheck: Paycheck | null;
  changes: SnapshotChange[];

  status: RefreshStatus;
  /** ISO time of the last refresh that produced any data at all. */
  lastRefreshedAt: string | null;
  lastError: FinanceError | null;
  failedSections: FinanceSection[];
  /** False until the first refresh completes — drives skeletons vs. content. */
  hasLoadedOnce: boolean;

  beginRefresh: () => void;
  applyResult: (result: {
    snapshot?: FinancialSnapshot;
    previousSnapshot?: FinancialSnapshot | null;
    accounts?: Account[];
    transactions?: Transaction[];
    upcoming?: UpcomingPayment[];
    bills?: BillDigest[];
    categories?: CategoryOption[];
    goals?: SavingsGoal[];
    paycheck?: Paycheck | null;
    changes?: SnapshotChange[];
    status: RefreshStatus;
    failedSections: FinanceSection[];
    error: FinanceError | null;
    refreshedAt: string | null;
  }) => void;
  reset: () => void;
}

const EMPTY = {
  snapshot: null,
  previousSnapshot: null,
  accounts: [] as Account[],
  transactions: [] as Transaction[],
  upcoming: [] as UpcomingPayment[],
  bills: [] as BillDigest[],
  categories: [] as CategoryOption[],
  goals: [] as SavingsGoal[],
  paycheck: null,
  changes: [] as SnapshotChange[],
  status: 'idle' as RefreshStatus,
  lastRefreshedAt: null,
  lastError: null,
  failedSections: [] as FinanceSection[],
  hasLoadedOnce: false,
};

export const useFinanceStore = create<FinanceState>()((set) => ({
  ...EMPTY,

  beginRefresh: () => set({ status: 'refreshing' }),

  /**
   * Applies whatever came back. Sections that failed are simply absent from the
   * result and keep their previous values — a failed activity fetch must not
   * blank out the transactions already on screen.
   */
  applyResult: (result) =>
    set((state) => ({
      snapshot: result.snapshot ?? state.snapshot,
      previousSnapshot:
        result.previousSnapshot !== undefined ? result.previousSnapshot : state.previousSnapshot,
      accounts: result.accounts ?? state.accounts,
      transactions: result.transactions ?? state.transactions,
      upcoming: result.upcoming ?? state.upcoming,
      bills: result.bills ?? state.bills,
      categories: result.categories ?? state.categories,
      goals: result.goals ?? state.goals,
      paycheck: result.paycheck !== undefined ? result.paycheck : state.paycheck,
      changes: result.changes ?? state.changes,
      status: result.status,
      failedSections: result.failedSections,
      lastError: result.error,
      lastRefreshedAt: result.refreshedAt ?? state.lastRefreshedAt,
      hasLoadedOnce: state.hasLoadedOnce || result.status !== 'failed',
    })),

  reset: () => set({ ...EMPTY }),
}));

export const selectIsRefreshing = (state: FinanceState): boolean => state.status === 'refreshing';

/** True when there is nothing to show yet and a refresh is in flight. */
export const selectIsInitialLoading = (state: FinanceState): boolean =>
  !state.hasLoadedOnce && state.status === 'refreshing';
