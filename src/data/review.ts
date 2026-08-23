import { httpsCallable } from '@firebase/functions';

import { AppError, errorFacetsFor } from '@/errors';
import { loggerFor } from '@/logging';
import { firebaseFunctions, isFirebaseConfigured } from '@/services/firebase';

/**
 * The inflow review queue.
 *
 * Every credit Cashflow cannot explain sits as `unknown_inflow` — real money,
 * deliberately not counted as income, because only an approved source or the
 * owner can make it income. Resemblance never can.
 *
 * The queue is chosen by `selectInflowReviewQueue` on the server. This client
 * shows what it is given and posts back the answer; it never decides what
 * belongs in the queue, because that decision is the ledger's rule, not a
 * display concern.
 */

const log = loggerFor('data');

export interface ReviewItem {
  transactionId: string;
  date: string;
  amountCents: number;
  title: string;
  merchant: string | null;
  accountName: string | null;
  pending: boolean;
  /** Why it is being asked, in the engine's own words. */
  reason: string;
  reasonCodes: string[];
  /** Non-empty when two or more approved sources matched — an ambiguity. */
  candidateSourceIds: string[];
}

export interface ReviewQueue {
  generatedAt: string;
  total: number;
  totalCents: number;
  sources: { id: string; name: string }[];
  items: ReviewItem[];
}

/**
 * The answers offered on the card.
 *
 * A deliberately short list from the full `FinancialMeaning` set: these are the
 * ones that actually come up on a credit. Offering all nineteen would turn a
 * two-second decision into a menu, and the queue only gets cleared if each
 * decision stays cheap.
 */
export const INFLOW_ANSWERS = [
  { meaning: 'earned_income', label: 'Income', hint: 'Pay, interest, anything earned' },
  { meaning: 'internal_transfer', label: 'My own money', hint: 'Moved from another account' },
  { meaning: 'gift_or_personal_transfer', label: 'From a person', hint: 'A gift or personal transfer' },
  { meaning: 'receivable_repayment', label: 'Paid back', hint: 'Someone repaying you' },
  { meaning: 'refund', label: 'Refund', hint: 'Money back on a purchase' },
  { meaning: 'loan_proceeds', label: 'Borrowed', hint: 'Loan or credit drawn down' },
] as const;

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

export const fetchReviewQueue = async (): Promise<ReviewQueue> => {
  const callable = httpsCallable<void, ReviewQueue>(callableOrThrow(), 'reviewQueue');
  const { data } = await callable();
  // Counts only. A title or an amount must never reach a log line.
  log.info('review.queue_loaded', { metadata: { total: data.total, shown: data.items.length } });
  return data;
};

export const resolveReview = async (input: {
  transactionId: string;
  decision: 'confirm' | 'dismiss';
  meaning?: string;
  incomeSourceId?: string;
}): Promise<void> => {
  const callable = httpsCallable<typeof input, { state: string }>(
    callableOrThrow(),
    'resolveReview',
  );
  try {
    await callable(input);
    log.info('review.resolved', { metadata: { decision: input.decision } });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    log.warn('review.resolve_failed', { metadata: { code: code ?? 'unknown' } });
    throw new AppError({
      ...errorFacetsFor(code),
      code: 'REVIEW_WRITE_FAILED',
      userMessage: "Cashflow couldn't save that decision.",
      technicalMessage: (error as { message?: string })?.message ?? 'resolveReview failed',
      cause: error,
    });
  }
};
