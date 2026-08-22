import type { CategoryOption } from '@/features/activity/categories';
import type {
  Account,
  BillDigest,
  FinancialSnapshot,
  Paycheck,
  SavingsGoal,
  Transaction,
  UpcomingPayment,
} from '@/types';

/**
 * Repository contracts.
 *
 * This is the seam between the app and wherever data comes from. Screens and
 * hooks depend on these interfaces only — never on `fetch`, never on the mock
 * dataset — which is what makes "swap the mocks for the real API" a one-file
 * change in `src/data/index.ts`.
 */

export interface SnapshotBundle {
  snapshot: FinancialSnapshot;
  /** Yesterday's figures. Null when there is no history to compare against. */
  previous: FinancialSnapshot | null;
}

export interface AccountsRepository {
  list(): Promise<Account[]>;
  byId(id: string): Promise<Account | null>;
}

export interface ActivityRepository {
  list(options?: { accountId?: string; limit?: number }): Promise<Transaction[]>;
}

export interface SnapshotRepository {
  current(): Promise<SnapshotBundle>;
}

export interface PlanRepository {
  upcoming(): Promise<UpcomingPayment[]>;
  /** The Bills register digest — recurring definitions, not projected occurrences. */
  bills(): Promise<BillDigest[]>;
  goals(): Promise<SavingsGoal[]>;
  nextPaycheck(): Promise<Paycheck | null>;
  /** cashflow-mobile#24. The owner's resolved category set (defaults + custom,
   *  archived preserved) — same idiom as `bills()`, threaded from the same
   *  `homeSnapshot` payload. */
  categories(): Promise<CategoryOption[]>;
}

export interface Repositories {
  accounts: AccountsRepository;
  activity: ActivityRepository;
  snapshot: SnapshotRepository;
  plan: PlanRepository;
}
