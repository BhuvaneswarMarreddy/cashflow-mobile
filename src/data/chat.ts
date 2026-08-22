import { httpsCallable } from '@firebase/functions';

import { CATEGORIES } from '@/features/activity/categories';
import { AppError } from '@/errors';
import { loggerFor } from '@/logging';
import { firebaseFunctions, isFirebaseConfigured } from '@/services/firebase';
import { useFinanceStore } from '@/store/financeStore';

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
  summary?: object;
}

/** The three shapes mobile v1 acts on. Anything else collapses to `answer` in `parseChatAction`. */
export type ChatAction =
  | { action: 'answer'; explanation: string }
  | { action: 'create_rule'; rule: { match: RuleMatch; set: RuleSet }; explanation: string }
  | { action: 'set_monthly_spend'; amount: number; reason: string };

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
    amount <= 0 ||
    amount > MAX_ASSUMED_SPEND
  ) {
    return null;
  }
  return { action: 'set_monthly_spend', amount, reason };
};

/**
 * Defensively parses an untrusted `aiChat` result into one of the three
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

  return fallback();
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

/** Categories list, account names, and the most recent transactions — no summary in v1. */
const buildContext = (): ChatContext => {
  const { accounts, transactions } = useFinanceStore.getState();
  return {
    categories: CATEGORIES.map((category) => category.value),
    accounts: accounts.map((account) => account.name),
    recent: transactions.slice(0, 20).map((transaction) => ({
      title: transaction.description,
      ...(transaction.merchant !== null ? { merchant: transaction.merchant } : {}),
      amount: transaction.amountCents,
      category: transaction.category,
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
