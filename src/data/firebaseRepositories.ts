import { httpsCallable } from '@firebase/functions';

import { AppError } from '@/errors';
import { loggerFor } from '@/logging';
import { firebaseFunctions, isFirebaseConfigured } from '@/services/firebase';
import { useFinanceStore } from '@/store/financeStore';

import type { Repositories, SnapshotBundle } from './types';
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
 * The real data source: one call to `homeSnapshot`.
 *
 * **Why a callable and not Firestore reads.** Firestore does not store
 * balances. `PaymentAccount.currentBalance` is derived in memory by
 * `withDerivedBalances`, and re-deriving it here would mean shipping a second
 * copy of the web app's money logic to the phone — two implementations, two
 * answers, and the owner asking which one is right. The callable runs the
 * *same* `src/lib/**` functions the browser runs and returns finished figures.
 *
 * The domain model is integer cents; the server does the dollars→cents
 * conversion so no float ever crosses the wire as a balance.
 */

const log = loggerFor('data');

/** Exactly the payload `functions/src/snapshot.ts` returns. */
interface SnapshotPayload {
  generatedAt: string;
  // `assumedMonthlySpendCents` is populated below, from the server's nested
  // `snapshot.assumedMonthlySpend` — never sent pre-converted, same reason
  // `generatedAt` is excluded.
  snapshot: Omit<FinancialSnapshot, 'generatedAt' | 'assumedMonthlySpendCents'> & {
    /**
     * CHAT-SPEND-001 / FIN-SPEND-001: `settings.assumedMonthlySpend`, in
     * DOLLARS — the one exception to this payload's integer-cents convention,
     * because it is a pass-through of the raw settings value, not a derived
     * figure. The server nests it inside `snapshot` beside `includePending`
     * (both are policy fields the figures were derived under). Converted to
     * cents once below, the same boundary `accountsWrite.ts`'s `toDollars`
     * mirrors in reverse.
     */
    assumedMonthlySpend: number | null;
  };
  accounts: Account[];
  upcoming: UpcomingPayment[];
  /**
   * CHAT-BILLS-001: the Bills register digest, for chat context and the
   * (future) Upcoming feed. Arrives already in CENTS — the general payload
   * rule (see `toCents` below); `assumedMonthlySpend` above is the one
   * documented exception, being a raw settings passthrough, not a register.
   */
  bills: BillDigest[];
  goals: SavingsGoal[];
  activity: Transaction[];
}

const toCents = (dollars: number): number => Math.round(dollars * 100);

/**
 * One refresh makes one network call.
 *
 * `refreshFinancialData` fires all five repository methods inside a single
 * `Promise.allSettled`, so they start in the same tick and every one of them
 * attaches to the same in-flight promise. The slot is cleared on settle, so the
 * *next* refresh genuinely refetches — this is request coalescing, not a cache,
 * and there is deliberately no TTL that could serve a stale balance.
 */
let inFlight: Promise<SnapshotPayload> | null = null;

const fetchSnapshot = (): Promise<SnapshotPayload> => {
  if (inFlight) return inFlight;

  if (!isFirebaseConfigured()) {
    return Promise.reject(
      new AppError({
        code: 'FIREBASE_NOT_CONFIGURED',
        category: 'service-unavailable',
        userMessage: 'This build has no Firebase project configured.',
        technicalMessage: 'EXPO_PUBLIC_FIREBASE_* are missing — copy .env.example to .env.',
        retryable: false,
      }),
    );
  }

  const callable = httpsCallable<void, SnapshotPayload>(firebaseFunctions(), 'homeSnapshot');
  const started = Date.now();

  inFlight = callable()
    .then((result) => {
      // Counts and duration only. The figures themselves never reach a log.
      log.info('snapshot.fetched', {
        metadata: {
          durationMs: Date.now() - started,
          accounts: result.data.accounts.length,
          activity: result.data.activity.length,
        },
      });
      return result.data;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

/**
 * Pull the banks, not just the cache.
 *
 * `syncNow` is the Python callable the web app's Refresh button already calls —
 * it runs the Plaid sync and writes new rows to Firestore. It is deliberately
 * NOT part of `fetchSnapshot`: deriving figures is cheap and happens on every
 * screen mount, whereas hitting Plaid is slow (its timeout is 300s) and should
 * happen when a person deliberately asks for it.
 *
 * The floor exists because pull-to-refresh is easy to do repeatedly and a bank
 * round-trip per pull is rude to both Plaid and the battery. Inside the window,
 * the pull still re-derives — the user sees a refresh, it just reuses the rows
 * already fetched.
 */
export const BANK_SYNC_FLOOR_MS = 2 * 60 * 1000;

let lastBankSyncAt = 0;

export interface BankSyncResult {
  ran: boolean;
  added?: number;
  error?: string | null;
}

export const syncBanks = async (force = false): Promise<BankSyncResult> => {
  if (!isFirebaseConfigured()) return { ran: false };
  if (!force && Date.now() - lastBankSyncAt < BANK_SYNC_FLOOR_MS) return { ran: false };

  const callable = httpsCallable<void, { added?: number; error?: string | null }>(
    firebaseFunctions(),
    'sync_now',
  );
  const started = Date.now();
  try {
    const { data } = await callable();
    // The floor is armed only on a CLEAN run. Arming it after a failure meant a
    // user whose bank credentials had expired could pull to refresh repeatedly
    // for two minutes and never actually retry the banks — the pull looked like
    // it did something and could not possibly fix anything.
    if (!data.error) lastBankSyncAt = Date.now();
    log.info('banks.synced', {
      metadata: { durationMs: Date.now() - started, added: data.added ?? 0 },
    });
    // The Python side never throws for a provider failure — it returns the
    // message so the button can show it. Surface it rather than claiming success.
    return { ran: true, added: data.added ?? 0, error: data.error ?? null };
  } catch (error) {
    log.warn('banks.sync_failed', {
      metadata: { code: (error as { code?: string })?.code ?? 'unknown' },
    });
    // A failed bank sync must not fail the refresh: the stored ledger is still
    // real, just not newer. The snapshot below is what the screens need.
    return { ran: false, error: 'Could not reach your banks.' };
  }
};

export const createFirebaseRepositories = (): Repositories => ({
  accounts: {
    list: async () => (await fetchSnapshot()).accounts,
    byId: async (id) => (await fetchSnapshot()).accounts.find((a) => a.id === id) ?? null,
  },

  activity: {
    list: async (options = {}) => {
      const { activity } = await fetchSnapshot();
      const scoped = options.accountId
        ? activity.filter((t) => t.accountId === options.accountId)
        : activity;
      return options.limit ? scoped.slice(0, options.limit) : scoped;
    },
  },

  snapshot: {
    current: async (): Promise<SnapshotBundle> => {
      // Read BEFORE the await: once the result lands the store is about to be
      // overwritten with it, and "previous" would become a copy of "current".
      const previous = useFinanceStore.getState().snapshot;
      const payload = await fetchSnapshot();
      return {
        snapshot: {
          ...payload.snapshot,
          generatedAt: payload.generatedAt,
          assumedMonthlySpendCents:
            payload.snapshot.assumedMonthlySpend !== null
              ? toCents(payload.snapshot.assumedMonthlySpend)
              : null,
        },
        // The server keeps no history, so "previous" is the last figure THIS
        // session held. On a cold start there is none and change detection
        // correctly reports nothing rather than inventing a delta.
        previous,
      };
    },
  },

  plan: {
    upcoming: async () => (await fetchSnapshot()).upcoming,
    bills: async () => (await fetchSnapshot()).bills,
    goals: async () => (await fetchSnapshot()).goals,
    nextPaycheck: async (): Promise<Paycheck | null> =>
      (await fetchSnapshot()).snapshot.nextPaycheck,
  },
});
