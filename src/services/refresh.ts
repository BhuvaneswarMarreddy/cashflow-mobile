import { usageAnalytics } from '@/analytics';
import { systemAudit } from '@/audit';
import { isEnabled } from '@/config/featureFlags';
import { repositories } from '@/data';
import { syncBanks, type BankSyncResult } from '@/data/firebaseRepositories';
import { AppError, normalizeError } from '@/errors';
import { loggerFor } from '@/logging';
import { useFinanceStore, type FinanceSection } from '@/store/financeStore';
import { systemClock, type Clock } from '@/utils/clock';
import { createCorrelationId } from '@/utils/id';

import { detectChanges } from './changeDetection';
import { notificationService } from './notifications';
import { summarizeFailure, summarizeRefresh } from './summarize';

/**
 * Refresh orchestration — one path, whatever triggered it.
 *
 * Pull-to-refresh, the header button, app foreground and (later) a scheduled
 * background wake all land here, so there is exactly one place that decides
 * what "refreshed" means, one place that records the audit trail, and one
 * place that can produce the summary notification. Two refresh
 * implementations is how a phone ends up showing two different balances.
 *
 * Sections are fetched concurrently and settled independently: balances can
 * succeed while activity fails, which is `partialSuccess` rather than a failure
 * that wipes the screen.
 */
export type RefreshTrigger = 'launch' | 'pull' | 'tap' | 'foreground' | 'background';

/** Triggers the user did not initiate should not produce a notification. */
const NOTIFYING_TRIGGERS: readonly RefreshTrigger[] = ['pull', 'tap', 'background'];

export interface RefreshOptions {
  clock?: Clock;
}

const log = loggerFor('refresh');

export const refreshFinancialData = async (
  trigger: RefreshTrigger,
  options: RefreshOptions = {},
): Promise<void> => {
  const clock = options.clock ?? systemClock;
  const store = useFinanceStore.getState();

  if (store.status === 'refreshing') {
    log.debug('refresh.skipped_already_running', { metadata: { trigger } });
    return;
  }

  const correlationId = createCorrelationId();
  const stage = systemAudit.begin('refresh', 'financial.refresh', {
    correlationId,
    source: trigger,
  });
  usageAnalytics.track('refresh.initiated', 'system', { target: trigger });
  store.beginRefresh();

  // A pull or an explicit tap means "go and look at my banks", so the Plaid
  // sync runs FIRST and the derivation below then sees whatever it added.
  // Launch and foreground deliberately do not: those happen without anyone
  // asking, and a bank round-trip on every app switch is not a refresh, it is
  // a rate limit waiting to happen. `syncBanks` applies its own floor.
  let bankSync: BankSyncResult = { ran: false };
  if (!isEnabled('ENABLE_MOCK_API') && (trigger === 'pull' || trigger === 'tap')) {
    bankSync = await syncBanks();
    systemAudit.record('sync', 'banks.sync', bankSync.error ? 'failed' : 'succeeded', {
      correlationId,
      source: trigger,
      ...(bankSync.error ? { reason: bankSync.error } : {}),
    });
  }

  const [snapshotResult, accountsResult, activityResult, upcomingResult, goalsResult] =
    await Promise.allSettled([
      repositories.snapshot.current(),
      repositories.accounts.list(),
      repositories.activity.list({ limit: 50 }),
      repositories.plan.upcoming(),
      repositories.plan.goals(),
    ]);

  const failedSections: FinanceSection[] = [];
  const errors: AppError[] = [];

  const collect = <T>(section: FinanceSection, result: PromiseSettledResult<T>): T | undefined => {
    if (result.status === 'fulfilled') {
      systemAudit.record('sync', `${section}.fetch`, 'succeeded', {
        correlationId,
        source: trigger,
      });
      return result.value;
    }
    const error = normalizeError(result.reason, correlationId);
    errors.push(error);
    if (!failedSections.includes(section)) failedSections.push(section);
    systemAudit.record('sync', `${section}.fetch`, 'failed', {
      correlationId,
      source: trigger,
      reason: error.code,
    });
    return undefined;
  };

  const snapshotBundle = collect('snapshot', snapshotResult);
  const accounts = collect('accounts', accountsResult);
  const transactions = collect('activity', activityResult);
  const upcoming = collect('plan', upcomingResult);
  const goals = collect('plan', goalsResult);

  // A failed bank sync is a PARTIAL refresh, not a clean one. The derivation
  // below still succeeds — it just re-derives yesterday's rows — so without this
  // the pull reported success with a fresh timestamp while the banks were
  // unreachable, which is the app telling the owner their figures are current
  // when they are not.
  if (bankSync.error) {
    failedSections.push('snapshot');
    errors.push(
      new AppError({
        category: 'service-unavailable',
        code: 'BANK_SYNC_FAILED',
        userMessage: `${bankSync.error} These figures are from the last successful sync.`,
        technicalMessage: bankSync.error,
        retryable: true,
        correlationId,
      }),
    );
  }

  const everythingFailed = snapshotBundle === undefined && accounts === undefined;
  const status = everythingFailed
    ? 'failed'
    : failedSections.length > 0
      ? 'partialSuccess'
      : 'success';

  // New transactions are counted by identity against what was already known,
  // not by list length — a refresh that drops a pending row would otherwise
  // read as "nothing new" while the totals moved.
  const knownIds = new Set(useFinanceStore.getState().transactions.map((t) => t.id));
  const newTransactionCount =
    transactions === undefined ? 0 : transactions.filter((t) => !knownIds.has(t.id)).length;

  let changes = useFinanceStore.getState().changes;
  if (snapshotBundle) {
    const changeStage = systemAudit.begin('change-detection', 'snapshot.diff', {
      correlationId,
      source: trigger,
    });
    changes = detectChanges(snapshotBundle.snapshot, snapshotBundle.previous, {
      upcoming: upcoming ?? useFinanceStore.getState().upcoming,
      newTransactionCount,
      now: clock.now(),
    });
    changeStage.succeeded({ changeCount: changes.length, newTransactionCount });
  }

  const firstError = errors[0] ?? null;

  useFinanceStore.getState().applyResult({
    ...(snapshotBundle ? { snapshot: snapshotBundle.snapshot } : {}),
    ...(snapshotBundle ? { previousSnapshot: snapshotBundle.previous } : {}),
    ...(accounts ? { accounts } : {}),
    ...(transactions ? { transactions } : {}),
    ...(upcoming ? { upcoming } : {}),
    ...(goals ? { goals } : {}),
    ...(snapshotBundle ? { paycheck: snapshotBundle.snapshot.nextPaycheck } : {}),
    changes,
    status,
    failedSections,
    error:
      status === 'success' || firstError === null
        ? null
        : {
            category: firstError.category,
            userMessage: firstError.userMessage,
            retryable: firstError.retryable,
            correlationId,
          },
    refreshedAt: status === 'failed' ? null : clock.iso(),
  });

  if (status === 'failed') {
    stage.failed(firstError?.code ?? 'UNKNOWN', { failedSections });
    usageAnalytics.track('refresh.failed', 'system', {
      target: trigger,
      outcome: 'failure',
      errorCategory: firstError?.category ?? 'unexpected',
    });
    if (NOTIFYING_TRIGGERS.includes(trigger) && firstError) {
      const summaryStage = systemAudit.begin('notification', 'summary.compose', {
        correlationId,
        source: trigger,
      });
      notificationService.present(summarizeFailure(firstError.userMessage), {
        source: 'refresh',
        correlationId,
      });
      summaryStage.succeeded({ kind: 'failure' });
    }
    return;
  }

  stage.succeeded({ status, failedSections, changeCount: changes.length });
  usageAnalytics.track('refresh.completed', 'system', {
    target: trigger,
    outcome: status === 'partialSuccess' ? 'partial' : 'success',
    itemCount: changes.length,
  });

  const snapshot = snapshotBundle?.snapshot ?? useFinanceStore.getState().snapshot;
  if (NOTIFYING_TRIGGERS.includes(trigger) && snapshot) {
    const summaryStage = systemAudit.begin('notification', 'summary.compose', {
      correlationId,
      source: trigger,
    });
    const draft = summarizeRefresh({ snapshot, changes, now: clock.now() });
    const presented = notificationService.present(draft, { source: 'refresh', correlationId });
    summaryStage.succeeded({ kind: draft.category, delivered: presented !== null });
  }
};
