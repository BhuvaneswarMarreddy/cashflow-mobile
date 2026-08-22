import { httpsCallable } from '@firebase/functions';

import { AppError } from '@/errors';
import { triggerRefresh } from '@/hooks/useRefresh';
import { loggerFor } from '@/logging';
import { firebaseFunctions, isFirebaseConfigured } from '@/services/firebase';

/**
 * Decisions: merchant → category rules, created and undone from the phone.
 *
 * `applyDecision`/`undoDecision` are server callables; the server is
 * authoritative for these wire shapes. This client mirrors them, it does not
 * define them. Mobile never computes money, so a write here means "post it,
 * then refetch the server's figures" — never local math.
 */

const log = loggerFor('data');

/** What a rule matches against. Server-authoritative shape. */
export interface RuleMatch {
  field: 'merchant' | 'title' | 'description';
  op: 'contains' | 'equals';
  value: string;
  direction?: 'inflow' | 'outflow';
  accountId?: string;
  onOrAfter?: string;
}

/** What a rule sets. At least one key must be defined — the server rejects an empty set. */
export interface RuleSet {
  category?: string;
  sourceCategory?: string;
  type?: string;
  merchant?: string;
}

export interface ChangeSummary {
  decisionId: string;
  changed: {
    transactionsMatched: number;
    monthsAffected: string[];
  };
}

const callableOrThrow = () => {
  if (!isFirebaseConfigured()) {
    throw new AppError({
      category: 'service-unavailable',
      code: 'FIREBASE_NOT_CONFIGURED',
      userMessage: 'Cashflow is not connected yet.',
      technicalMessage: 'EXPO_PUBLIC_FIREBASE_* missing',
      retryable: false,
    });
  }
  return firebaseFunctions();
};

export const applyMerchantRule = async (input: {
  match: RuleMatch;
  set: RuleSet;
}): Promise<ChangeSummary> => {
  const callable = httpsCallable<
    { kind: 'merchantRule'; match: RuleMatch; set: RuleSet },
    ChangeSummary
  >(callableOrThrow(), 'applyDecision');
  try {
    const { data } = await callable({ kind: 'merchantRule', ...input });
    // Counts only. A merchant name or a category value must never reach a log line.
    log.info('decision.applied', {
      metadata: {
        transactionsMatched: data.changed.transactionsMatched,
        monthsAffected: data.changed.monthsAffected.length,
      },
    });
    triggerRefresh('tap');
    return data;
  } catch (error) {
    log.warn('decision.apply_failed', {
      metadata: { code: (error as { code?: string })?.code ?? 'unknown' },
    });
    throw new AppError({
      category: 'data',
      code: 'DECISION_WRITE_FAILED',
      userMessage: "Cashflow couldn't save that rule.",
      technicalMessage: (error as { message?: string })?.message ?? 'applyDecision failed',
      retryable: true,
      cause: error,
    });
  }
};

export const undoDecision = async (decisionId: string): Promise<void> => {
  const callable = httpsCallable<{ decisionId: string }, { ok: true }>(
    callableOrThrow(),
    'undoDecision',
  );
  try {
    await callable({ decisionId });
    log.info('decision.undone');
    triggerRefresh('tap');
  } catch (error) {
    log.warn('decision.undo_failed', {
      metadata: { code: (error as { code?: string })?.code ?? 'unknown' },
    });
    throw new AppError({
      category: 'data',
      code: 'DECISION_WRITE_FAILED',
      userMessage: "Cashflow couldn't undo that rule.",
      technicalMessage: (error as { message?: string })?.message ?? 'undoDecision failed',
      retryable: true,
      cause: error,
    });
  }
};
