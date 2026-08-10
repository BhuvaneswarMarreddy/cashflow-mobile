import { httpsCallable } from '@firebase/functions';

import { AppError } from '@/errors';
import { loggerFor } from '@/logging';
import { firebaseFunctions, isFirebaseConfigured } from '@/services/firebase';

/**
 * The money-flow picture, derived server-side by `buildFlowGraph`.
 *
 * Every figure here arrives finished. The phone sorts and draws; it never sums
 * a link, because a second implementation of a money reduce is a second
 * opinion — the same reason balances come from `homeSnapshot`.
 */

const log = loggerFor('data');

export type FlowRange = 'all' | 'year' | 'month';

/** Matches `FlowColorKey` in the web app's palette. */
export type FlowKind =
  | 'bank'
  | 'card'
  | 'loan'
  | 'source'
  | 'category'
  | 'person'
  | 'credit'
  | 'stub'
  | 'hub'
  | 'warning';

export interface FlowEndpoint {
  id: string;
  label: string;
  kind: FlowKind;
  cents: number;
}

export interface FlowBetween {
  from: string;
  to: string;
  moves: number;
  cents: number;
}

export interface FlowRecon {
  accountId: string;
  name: string;
  openingCents: number;
  inCents: number;
  outCents: number;
  closingCents: number;
  /** Non-zero means the stored rows do not explain the balance. Never hidden. */
  gapCents: number;
  verdict: 'opening' | 'pre-export-debt' | 'missing-rows' | 'flat';
}

export interface FlowSnapshot {
  generatedAt: string;
  period: { start?: string; end?: string; label: string };
  bounds: { minMonth: string | null; maxMonth: string | null };
  sources: FlowEndpoint[];
  sinks: FlowEndpoint[];
  /** Equal by construction — the conservation proof, worth showing. */
  totals: { sourcesCents: number; sinksCents: number };
  story: {
    earnedInCents: number;
    fromPeopleCents: number;
    moneyBackCents: number;
    spendingCents: number;
    toPeopleCents: number;
    nettedRefundCents: number;
    personExpenseCents: number;
  };
  betweenAccounts: FlowBetween[];
  reconciliation: FlowRecon[];
  nodes: { id: string; label: string; kind: FlowKind }[];
  links: { source: string; target: string; cents: number }[];
}

export const fetchFlow = async (range: FlowRange, key?: string): Promise<FlowSnapshot> => {
  if (!isFirebaseConfigured()) {
    throw new AppError({
      category: 'service-unavailable',
      code: 'FIREBASE_NOT_CONFIGURED',
      userMessage: 'Cashflow is not connected yet.',
      technicalMessage: 'EXPO_PUBLIC_FIREBASE_* missing',
      retryable: false,
    });
  }

  const callable = httpsCallable<{ range: FlowRange; key?: string }, FlowSnapshot>(
    firebaseFunctions(),
    'flowSnapshot',
  );
  const started = Date.now();
  try {
    const { data } = await callable(key ? { range, key } : { range });
    log.info('flow.fetched', {
      metadata: {
        durationMs: Date.now() - started,
        sources: data.sources.length,
        sinks: data.sinks.length,
      },
    });
    return data;
  } catch (error) {
    log.warn('flow.fetch_failed', {
      metadata: { code: (error as { code?: string })?.code ?? 'unknown' },
    });
    throw new AppError({
      category: 'data',
      code: 'FLOW_FETCH_FAILED',
      userMessage: "Cashflow couldn't work out your money flow.",
      technicalMessage: (error as { message?: string })?.message ?? 'flowSnapshot failed',
      retryable: true,
      cause: error,
    });
  }
};

export interface FlowNodeDetail {
  nodeId: string;
  label: string;
  period: { label: string };
  count: number;
  /** True when the lane is a merged group whose rows cannot be attributed. */
  folded: boolean;
  rows: {
    id: string;
    accountId: string;
    date: string;
    description: string;
    merchant: string | null;
    amountCents: number;
    category: string;
    pending: boolean;
    kind: string;
  }[];
}

/** The transactions behind one lane. Answered by the engine, not by filtering here. */
export const fetchFlowNode = async (
  nodeId: string,
  range: FlowRange,
  key?: string,
): Promise<FlowNodeDetail> => {
  const callable = httpsCallable<
    { nodeId: string; range: FlowRange; key?: string },
    FlowNodeDetail
  >(firebaseFunctions(), 'flowNodeDetail');
  const { data } = await callable(key ? { nodeId, range, key } : { nodeId, range });
  log.info('flow.node_opened', { metadata: { rows: data.rows.length, folded: data.folded } });
  return data;
};
