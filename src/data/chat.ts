import { httpsCallable } from '@firebase/functions';

import { CATEGORIES } from '@/features/activity/categories';
import { AppError } from '@/errors';
import { loggerFor } from '@/logging';
import { firebaseFunctions, isFirebaseConfigured } from '@/services/firebase';
import { useFinanceStore } from '@/store/financeStore';
import type { BillFrequency } from '@/types';

import type { RuleMatch, RuleSet } from './decisions';

/**
 * Chat: the owner's single-point-of-control ask ("Ask Cashflow"), text or a
 * screenshot in, an action proposal out. `aiChat` is a server callable; this
 * client builds its request and defensively parses its response, the same
 * "server is authoritative, this client mirrors it" posture as decisions.ts.
 *
 * The response is untrusted JSON from a model, not from our own server logic —
 * `parseChatAction` is the boundary that keeps a malformed or adversarial
 * completion from ever reaching a write path or a render with unexpected
 * shape. It mirrors (a subset of) the web app's `parseChatAction` hardening.
 */

const log = loggerFor('data');

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  categories?: string[];
  merchants?: string[];
  accounts?: string[];
  recent?: { title?: string; merchant?: string; amount?: number; category?: string }[];
  /** CHAT-BILLS-001: the Bills register, so the model can answer "what are my
   *  recurring payments" and avoid proposing a `record_bill` duplicate. */
  bills?: { vendor: string; amount: number; frequency: BillFrequency }[];
  /** Projected occurrences (forecast events + the Bills register combined,
   *  server-side) — same `amount` convention as `recent` (see `buildContext`). */
  upcoming?: { name: string; dueDate: string; amount: number }[];
  summary?: object;
}

/** The four shapes mobile v1 acts on. Anything else collapses to `answer` in `parseChatAction`. */
export type ChatAction =
  | { action: 'answer'; explanation: string }
  | { action: 'create_rule'; rule: { match: RuleMatch; set: RuleSet }; explanation: string }
  | { action: 'set_monthly_spend'; amount: number; reason: string }
  | {
      action: 'record_bill';
      vendor: string;
      /** Dollars, the amount charged EACH time — never a total or a remaining balance. */
      amount: number;
      frequency: BillFrequency;
      dueDay?: number;
      /** ISO date of the NEXT payment — the only anchor a non-monthly cadence gets. */
      nextDueDate?: string;
      accountName?: string;
      /** Mutually exclusive with `installmentsRemaining` — at most one end condition. */
      endDate?: string;
      installmentsRemaining?: number;
      nonNegotiable?: boolean;
      reason: string;
    };

interface AiChatRequest {
  message?: string;
  history?: ChatMessage[];
  context?: ChatContext;
  imageBase64?: string;
  imageMimeType?: string;
}

interface AiChatResponse {
  success: true;
  result: unknown;
  fallback?: boolean;
}

const FALLBACK_TEXT = "I can't do that from the phone yet.";

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Rejects `__proto__`/`constructor`/`prototype` at any depth of an untrusted payload. */
const containsDangerousKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsDangerousKey);
  if (!isPlainObject(value)) return false;
  return Object.keys(value).some(
    (key) => DANGEROUS_KEYS.has(key) || containsDangerousKey(value[key]),
  );
};

const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => (allowed as string[]).includes(key));

const MATCH_FIELDS = ['merchant', 'title', 'description'] as const;
const MATCH_OPS = ['contains', 'equals'] as const;
const SET_KEYS = ['category', 'sourceCategory', 'type', 'merchant'] as const;

/**
 * Validates `rule` against the same wire shape `applyMerchantRule` sends.
 * v1 is deliberately narrower than `RuleMatch`/`RuleSet`'s full server
 * contract: no `direction`/`accountId`/`onOrAfter` qualifiers, mirroring
 * CategorizeSheet's own minimal match. Returns `null` on anything invalid;
 * the caller falls back to plain text rather than half-trusting the shape.
 */
const parseCreateRule = (raw: Record<string, unknown>): ChatAction | null => {
  if (!hasOnlyKeys(raw, ['action', 'rule', 'explanation'])) return null;
  const { rule, explanation } = raw;
  if (typeof explanation !== 'string' || explanation.length === 0) return null;
  if (!isPlainObject(rule) || !hasOnlyKeys(rule, ['match', 'set'])) return null;

  const { match, set } = rule;
  if (!isPlainObject(match) || !hasOnlyKeys(match, ['field', 'op', 'value'])) return null;
  const { field, op, value } = match;
  if (typeof field !== 'string' || !(MATCH_FIELDS as readonly string[]).includes(field)) return null;
  if (typeof op !== 'string' || !(MATCH_OPS as readonly string[]).includes(op)) return null;
  if (typeof value !== 'string' || value.trim().length === 0) return null;

  if (!isPlainObject(set) || !hasOnlyKeys(set, SET_KEYS)) return null;
  const setKeys = Object.keys(set);
  if (setKeys.length === 0) return null;
  for (const key of setKeys) {
    const v = set[key];
    if (typeof v !== 'string' || v.trim().length === 0) return null;
  }
  if (
    typeof set.category === 'string' &&
    !CATEGORIES.some((category) => category.value === set.category)
  ) {
    return null;
  }

  return {
    action: 'create_rule',
    rule: {
      match: { field, op, value } as RuleMatch,
      set: set as RuleSet,
    },
    explanation,
  };
};

/** The owner's own spend cap, mirroring `MATCH_FIELDS`/`SET_KEYS`' role for `create_rule`. */
const MAX_ASSUMED_SPEND = 1_000_000;

/**
 * Validates `{ amount, reason }` for a monthly-spend assumption. `amount` is
 * dollars, matching the wire shape the `setAssumedMonthlySpend` write and the
 * `homeSnapshot` payload both use — the cents conversion happens at the
 * Firestore/store boundary, not here.
 */
const parseSetMonthlySpend = (raw: Record<string, unknown>): ChatAction | null => {
  if (!hasOnlyKeys(raw, ['action', 'amount', 'reason'])) return null;
  const { amount, reason } = raw;
  if (typeof reason !== 'string' || reason.length === 0) return null;
  if (
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    // A whole cent is the floor: 0.001 would survive `> 0`, render as
    // "$0.00 a month" and round to a zero write the server then ignores —
    // an "applied" card that changed nothing.
    amount < 0.01 ||
    amount > MAX_ASSUMED_SPEND
  ) {
    return null;
  }
  return { action: 'set_monthly_spend', amount, reason };
};

const BILL_FREQUENCIES = [
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
] as const;

const RECORD_BILL_KEYS = [
  'action',
  'vendor',
  'amount',
  'frequency',
  'dueDay',
  'nextDueDate',
  'accountName',
  'endDate',
  'installmentsRemaining',
  'nonNegotiable',
  'reason',
] as const;

/** record_bill's own spend cap — mirrors `MAX_ASSUMED_SPEND`'s role for `set_monthly_spend`. */
const MAX_BILL_AMOUNT = 100_000;

const isIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

/**
 * Validates `record_bill` against the same wire shape the server's own
 * `parseChatAction` (cashflow-forecast's `chat-actions.ts`) sends. Mirrors its
 * bounds — the amount ceiling, dueDay/installmentsRemaining ranges, ISO dates,
 * the endDate/installmentsRemaining exclusivity — plus mobile's own extra
 * sub-cent floor on `amount` (see `parseSetMonthlySpend`'s `0.01` floor) so a
 * $0.001 "bill" can never render a card whose write rounds to a $0.00 amount
 * `firestore.rules`' `amount > 0` then rejects.
 */
const parseRecordBill = (raw: Record<string, unknown>): ChatAction | null => {
  if (!hasOnlyKeys(raw, RECORD_BILL_KEYS)) return null;

  const { vendor, amount, frequency, reason } = raw;
  if (typeof vendor !== 'string' || vendor.trim().length === 0) return null;
  if (typeof reason !== 'string' || reason.trim().length === 0) return null;
  if (
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    amount < 0.01 ||
    amount > MAX_BILL_AMOUNT
  ) {
    return null;
  }
  if (typeof frequency !== 'string' || !(BILL_FREQUENCIES as readonly string[]).includes(frequency)) {
    return null;
  }

  let dueDay: number | undefined;
  if (raw.dueDay !== undefined) {
    if (
      typeof raw.dueDay !== 'number' ||
      !Number.isInteger(raw.dueDay) ||
      raw.dueDay < 1 ||
      raw.dueDay > 31
    ) {
      return null;
    }
    dueDay = raw.dueDay;
  }

  let nextDueDate: string | undefined;
  if (raw.nextDueDate !== undefined) {
    if (typeof raw.nextDueDate !== 'string' || !isIsoDate(raw.nextDueDate)) return null;
    nextDueDate = raw.nextDueDate;
  }

  let accountName: string | undefined;
  if (raw.accountName !== undefined) {
    // present but empty — the model said nothing, don't pretend it did.
    if (typeof raw.accountName !== 'string' || raw.accountName.trim().length === 0) return null;
    accountName = raw.accountName;
  }

  let endDate: string | undefined;
  if (raw.endDate !== undefined) {
    if (typeof raw.endDate !== 'string' || !isIsoDate(raw.endDate)) return null;
    endDate = raw.endDate;
  }

  let installmentsRemaining: number | undefined;
  if (raw.installmentsRemaining !== undefined) {
    if (
      typeof raw.installmentsRemaining !== 'number' ||
      !Number.isInteger(raw.installmentsRemaining) ||
      raw.installmentsRemaining < 1 ||
      raw.installmentsRemaining > 480
    ) {
      return null;
    }
    installmentsRemaining = raw.installmentsRemaining;
  }

  // Either an end date or a payment count, never both — two answers to "when
  // does this stop" is worse than one, and the model can always ask instead.
  if (endDate !== undefined && installmentsRemaining !== undefined) return null;

  let nonNegotiable: boolean | undefined;
  if (raw.nonNegotiable !== undefined) {
    if (typeof raw.nonNegotiable !== 'boolean') return null;
    nonNegotiable = raw.nonNegotiable;
  }

  return {
    action: 'record_bill',
    vendor,
    amount,
    frequency: frequency as BillFrequency,
    ...(dueDay !== undefined ? { dueDay } : {}),
    ...(nextDueDate !== undefined ? { nextDueDate } : {}),
    ...(accountName !== undefined ? { accountName } : {}),
    ...(endDate !== undefined ? { endDate } : {}),
    ...(installmentsRemaining !== undefined ? { installmentsRemaining } : {}),
    ...(nonNegotiable !== undefined ? { nonNegotiable } : {}),
    reason,
  };
};

/**
 * Defensively parses an untrusted `aiChat` result into one of the four
 * shapes mobile v1 handles. Anything unrecognised, malformed, or carrying a
 * prototype-pollution key collapses to a plain `answer` — the model's own
 * `explanation`, when it's a safe string, still reaches the user; otherwise a
 * friendly fallback does. Never throws: an AI response is never worth a crash.
 */
export const parseChatAction = (raw: unknown): ChatAction => {
  const fallback = (): ChatAction => ({
    action: 'answer',
    explanation:
      isPlainObject(raw) && typeof raw.explanation === 'string' && raw.explanation.length > 0
        ? raw.explanation
        : FALLBACK_TEXT,
  });

  if (containsDangerousKey(raw)) return fallback();
  if (!isPlainObject(raw) || typeof raw.action !== 'string') return fallback();

  if (raw.action === 'answer') {
    if (!hasOnlyKeys(raw, ['action', 'explanation'])) return fallback();
    if (typeof raw.explanation !== 'string' || raw.explanation.length === 0) return fallback();
    return { action: 'answer', explanation: raw.explanation };
  }

  if (raw.action === 'create_rule') return parseCreateRule(raw) ?? fallback();
  if (raw.action === 'set_monthly_spend') return parseSetMonthlySpend(raw) ?? fallback();
  if (raw.action === 'record_bill') return parseRecordBill(raw) ?? fallback();

  return fallback();
};

/**
 * Defect 1 parity (cashflow-forecast's `resolveBillAnchor`, DataChatSheet.tsx):
 * without an anchor, `billUpcomingEvents` (the web's projector) silently
 * produces ZERO Upcoming events for weekly/biweekly/quarterly/semiannual/
 * annual — an autopayDay alone can never say WHICH week or WHICH month of the
 * cycle. `nextDueDate` is the only fix: it becomes `anchorDate` directly, and
 * its day-of-month becomes `autopayDay` whenever `dueDay` itself is absent.
 *
 * Returns `null` exactly when the cadence needs an anchor and nothing
 * supplies one — the card then renders words, not a broken Apply. `monthly`
 * is the one cadence that never blocks: no autopayDay at all is "varies", an
 * existing, intentional state.
 */
export const resolveBillAnchor = (proposal: {
  frequency: BillFrequency;
  dueDay?: number;
  nextDueDate?: string;
}): { autopayDay?: number; anchorDate?: string } | null => {
  const dayFromNextDueDate = proposal.nextDueDate
    ? Number(proposal.nextDueDate.slice(8, 10))
    : undefined;
  const autopayDay = proposal.dueDay ?? dayFromNextDueDate;

  if (proposal.frequency === 'weekly' || proposal.frequency === 'biweekly') {
    return proposal.nextDueDate ? { anchorDate: proposal.nextDueDate } : null;
  }
  if (proposal.frequency === 'monthly') {
    return { autopayDay };
  }
  // quarterly/semiannual/annual: nextDueDate is the ONLY source of anchorDate.
  return proposal.nextDueDate ? { autopayDay, anchorDate: proposal.nextDueDate } : null;
};

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

// Caps mirror `recent`'s 20 — compact context, not the whole register.
const CONTEXT_BILLS_CAP = 30;
const CONTEXT_UPCOMING_CAP = 30;

/**
 * Categories list, account names, recent transactions, the Bills register and
 * upcoming occurrences — no summary in v1. `bills`/`upcoming` let the model
 * answer "what are my recurring payments" and avoid proposing a `record_bill`
 * duplicate (CHAT-BILLS-001). `amount` on every list here is cents, same
 * (pre-existing) convention as `recent.amount` above — the model reasons over
 * these numbers as text, it does not round-trip them through a write.
 */
const buildContext = (): ChatContext => {
  const { accounts, transactions, bills, upcoming } = useFinanceStore.getState();
  return {
    categories: CATEGORIES.map((category) => category.value),
    accounts: accounts.map((account) => account.name),
    recent: transactions.slice(0, 20).map((transaction) => ({
      title: transaction.description,
      ...(transaction.merchant !== null ? { merchant: transaction.merchant } : {}),
      amount: transaction.amountCents,
      category: transaction.category,
    })),
    bills: bills.slice(0, CONTEXT_BILLS_CAP).map((bill) => ({
      vendor: bill.vendor,
      amount: bill.amountCents,
      frequency: bill.frequency,
    })),
    upcoming: upcoming.slice(0, CONTEXT_UPCOMING_CAP).map((payment) => ({
      name: payment.name,
      dueDate: payment.dueDate,
      amount: payment.amountCents,
    })),
  };
};

const mapChatError = (error: unknown): AppError => {
  const code = (error as { code?: string })?.code ?? 'unknown';
  const technicalMessage = (error as { message?: string })?.message ?? code;

  if (code === 'resource-exhausted') {
    return new AppError({
      category: 'service-unavailable',
      code: 'AI_LIMIT_REACHED',
      userMessage: 'Daily AI limit reached — try again tomorrow.',
      technicalMessage,
      retryable: false,
      cause: error,
    });
  }
  if (code === 'unavailable') {
    return new AppError({
      category: 'service-unavailable',
      code: 'AI_NOT_CONFIGURED',
      userMessage: 'AI is not configured.',
      technicalMessage,
      retryable: false,
      cause: error,
    });
  }
  if (code === 'unauthenticated') {
    return new AppError({
      category: 'authentication',
      code: 'AI_UNAUTHENTICATED',
      technicalMessage,
      retryable: false,
      cause: error,
    });
  }
  return new AppError({
    category: 'data',
    code: 'CHAT_FAILED',
    userMessage: "Cashflow couldn't reach the AI. Try again.",
    technicalMessage,
    retryable: true,
    cause: error,
  });
};

export const sendChatTurn = async (input: {
  message: string;
  history: ChatMessage[];
  image?: { base64: string; mimeType: string };
}): Promise<ChatAction> => {
  const callable = httpsCallable<AiChatRequest, AiChatResponse>(callableOrThrow(), 'aiChat');

  try {
    const { data } = await callable({
      message: input.message,
      history: input.history,
      context: buildContext(),
      ...(input.image
        ? { imageBase64: input.image.base64, imageMimeType: input.image.mimeType }
        : {}),
    });
    const parsed = parseChatAction(data.result);
    // The action TYPE only — never the untrusted result itself, which can
    // carry a merchant string or a category. No figures or merchant text in logs.
    log.info('chat.responded', {
      metadata: { action: parsed.action, fallback: data.fallback === true },
    });
    return parsed;
  } catch (error) {
    log.warn('chat.failed', {
      metadata: { code: (error as { code?: string })?.code ?? 'unknown' },
    });
    throw mapChatError(error);
  }
};
