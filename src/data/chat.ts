import { httpsCallable } from '@firebase/functions';

import { CATEGORIES, resolveCategories, type CategoryOption } from '@/features/activity/categories';
import { AppError, errorFacetsFor, stripFunctionsPrefix } from '@/errors';
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
  bills?: {
    vendor: string;
    amount: number;
    frequency: BillFrequency;
    nonNegotiable?: boolean;
    endDate?: string | null;
    installmentsRemaining?: number | null;
    method?: string | null;
  }[];
  /** Projected occurrences (forecast events + the Bills register combined,
   *  server-side). Dollars, like every other `amount` here (see `buildContext`). */
  upcoming?: { name: string; dueDate: string; amount: number }[];
  summary?: object;
}

/** The shapes mobile v1 acts on. Anything else collapses to `answer` in `parseChatAction`. */
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
    }
  /** cashflow-mobile#24. No model-picked `value` — the app derives a unique,
   *  collision-safe slug from `label` at Apply time (never trusting a
   *  model-picked identifier), same as the server. */
  | { action: 'add_category'; label: string; icon?: string; reason: string }
  /** `value` must already be a CUSTOM category the owner has — never one of
   *  the 13 defaults. */
  | { action: 'rename_category'; value: string; label: string; reason: string }
  /**
   * `value` must already be a CUSTOM category the owner has. `reassignTo`
   * defaults to `'other'` and must be a live, assignable category — never the
   * value being removed, never archived. Mobile has no write path to
   * reassign transactions/rules/bills (see `accountsWrite.ts`), so this
   * parses but is never silently "applied" — `ChatSheet.tsx` renders it as an
   * explanation, not a write button.
   */
  | { action: 'remove_category'; value: string; reassignTo: string; reason: string }
  /**
   * cashflow-mobile#25. A breakdown/comparison answer as a table instead of a
   * paragraph — "what did I spend this month, and on what" as rows, not a
   * wall of prose. DISPLAY ONLY: unlike every other action above, this never
   * reaches a write path and `ChatSheet.tsx` never offers it an Apply/Undo —
   * the table itself IS the whole answer, same as a plain `answer`.
   */
  | { action: 'report'; title: string; columns: string[]; rows: (string | number)[][]; note?: string };

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
 *
 * `categories` (cashflow-mobile#24) is the owner's resolved set — `set.category`
 * is checked against its ASSIGNABLE (non-archived) values only, same as the
 * server's own `create_rule` validation.
 */
const parseCreateRule = (
  raw: Record<string, unknown>,
  categories: readonly CategoryOption[],
): ChatAction | null => {
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
    !categories.some((category) => !category.archived && category.value === set.category)
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

/** firestore.rules bounds vendor at 1..200; mirror it rather than fail at the write. */
const MAX_VENDOR_LENGTH = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The server accepts an anchor date in [today-7d, today+400d]; anything outside
 * that is a hallucinated schedule, not a real next payment.
 */
const isWithinAnchorWindow = (iso: string, now = Date.now()): boolean => {
  const at = Date.parse(iso);
  return at >= now - 7 * DAY_MS && at <= now + 400 * DAY_MS;
};

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
  // 200 is firestore.rules' own isValidString bound for vendor: a longer name
  // parses and renders fine, then has its write rejected forever — a retry
  // button that can never succeed.
  if (typeof vendor !== 'string' || vendor.trim().length === 0 || vendor.length > MAX_VENDOR_LENGTH) {
    return null;
  }
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
    // Same sanity window as the server parser: a next payment date years out
    // (or long past) is a hallucination, not a schedule.
    if (!isWithinAnchorWindow(raw.nextDueDate)) return null;
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

// cashflow-mobile#24 — mirrors the server's own MAX bounds exactly
// (cashflow-forecast `src/lib/chat-actions.ts` `MAX.categoryLabel/categoryIcon/categoryValue`).
const MAX_CATEGORY_LABEL = 40;
const MAX_CATEGORY_ICON = 4;
const MAX_CATEGORY_VALUE = 32;

const ADD_CATEGORY_KEYS = ['action', 'label', 'icon', 'reason'] as const;
const RENAME_CATEGORY_KEYS = ['action', 'value', 'label', 'reason'] as const;
const REMOVE_CATEGORY_KEYS = ['action', 'value', 'reassignTo', 'reason'] as const;

/**
 * add_category: label + optional icon only — no model-picked `value`, the app
 * derives a unique slug from `label` at Apply time (`slugForCategoryLabel`,
 * `@/features/activity/categories`), never trusting a model-picked identifier.
 */
const parseAddCategory = (raw: Record<string, unknown>): ChatAction | null => {
  if (!hasOnlyKeys(raw, ADD_CATEGORY_KEYS)) return null;
  const { label, reason } = raw;
  if (typeof label !== 'string' || label.trim().length === 0 || label.length > MAX_CATEGORY_LABEL) {
    return null;
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) return null;

  let icon: string | undefined;
  if (raw.icon !== undefined) {
    if (typeof raw.icon !== 'string' || raw.icon.trim().length === 0 || raw.icon.length > MAX_CATEGORY_ICON) {
      return null; // present but empty — the model said nothing, don't pretend it did
    }
    icon = raw.icon;
  }

  return { action: 'add_category', label, ...(icon !== undefined ? { icon } : {}), reason };
};

/**
 * rename_category / remove_category both require the OWNER's resolved set to
 * check `value` against — refused outright with no categories, the same "no
 * context, no action" contract `create_rule`'s category check already has
 * (an empty `categories` array here means "nothing resolved yet", not "the
 * owner has zero categories" — every owner has at least the 13 defaults).
 */
const parseRenameCategory = (
  raw: Record<string, unknown>,
  categories: readonly CategoryOption[],
): ChatAction | null => {
  if (!hasOnlyKeys(raw, RENAME_CATEGORY_KEYS)) return null;
  const { value, label, reason } = raw;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_CATEGORY_VALUE) {
    return null;
  }
  if (typeof label !== 'string' || label.trim().length === 0 || label.length > MAX_CATEGORY_LABEL) {
    return null;
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) return null;
  // Only a CUSTOM category the owner already has can be renamed — never a
  // built-in default. Renaming one of the 13 would need a data model for
  // overriding a default, which this task deliberately does not build.
  if (CATEGORIES.some((category) => category.value === value)) return null;
  if (categories.length === 0 || !categories.some((category) => category.value === value)) return null;

  return { action: 'rename_category', value, label, reason };
};

/**
 * remove_category: `reassignTo` defaults to `'other'`, must be a live,
 * assignable category (never archived, never the value being removed).
 * Mirrors the server's validation exactly, even though mobile never writes
 * the reassignment itself (see `ChatSheet.tsx`) — a well-formed action here
 * is what lets the sheet render an honest, specific explanation instead of a
 * generic fallback.
 */
const parseRemoveCategory = (
  raw: Record<string, unknown>,
  categories: readonly CategoryOption[],
): ChatAction | null => {
  if (!hasOnlyKeys(raw, REMOVE_CATEGORY_KEYS)) return null;
  const { value, reason } = raw;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_CATEGORY_VALUE) {
    return null;
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) return null;
  if (CATEGORIES.some((category) => category.value === value)) return null;
  if (categories.length === 0 || !categories.some((category) => category.value === value)) return null;

  let reassignTo = 'other';
  if (raw.reassignTo !== undefined) {
    if (
      typeof raw.reassignTo !== 'string' ||
      raw.reassignTo.trim().length === 0 ||
      raw.reassignTo.length > MAX_CATEGORY_VALUE
    ) {
      return null;
    }
    reassignTo = raw.reassignTo;
  }
  if (reassignTo === value) return null; // can't reassign to the thing being removed
  if (!categories.some((category) => category.value === reassignTo && !category.archived)) {
    return null;
  }

  return { action: 'remove_category', value, reassignTo, reason };
};

// cashflow-mobile#25 — mirrors the server's own MAX bounds exactly
// (cashflow-forecast `src/lib/chat-actions.ts` MAX.report*). Rejected when
// oversized, never silently truncated: a chopped column header or dollar
// figure is a WRONG table, not a smaller one.
const MAX_REPORT_TITLE = 80;
const MAX_REPORT_COLUMNS = 6;
const MAX_REPORT_COLUMN_LABEL = 24;
const MAX_REPORT_ROWS = 30;
const MAX_REPORT_CELL = 40;
const MAX_REPORT_NOTE = 200;

const REPORT_KEYS = ['action', 'title', 'columns', 'rows', 'note'] as const;

/**
 * A trimmed string whose length falls inside [min, max], or null — REJECTED,
 * never clipped (see the MAX_REPORT_* comment above). Mirrors the server's
 * own `boundedStr`. `min` of 0 is how a report cell allows an empty string
 * (present but says nothing) while title/columns/note still require content.
 */
const boundedStr = (value: unknown, min: number, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
};

/**
 * report (cashflow-mobile#25). Mirrors the server's own `report` branch
 * (cashflow-forecast `src/lib/chat-actions.ts`) exactly — a mismatch here
 * means the phone silently refuses a table the web app shows.
 */
const parseReport = (raw: Record<string, unknown>): ChatAction | null => {
  if (!hasOnlyKeys(raw, REPORT_KEYS)) return null;

  const title = boundedStr(raw.title, 1, MAX_REPORT_TITLE);
  if (!title) return null;

  if (!Array.isArray(raw.columns) || raw.columns.length === 0 || raw.columns.length > MAX_REPORT_COLUMNS) {
    return null;
  }
  const columns: string[] = [];
  for (const c of raw.columns) {
    const label = boundedStr(c, 1, MAX_REPORT_COLUMN_LABEL);
    if (!label) return null;
    columns.push(label);
  }

  if (!Array.isArray(raw.rows) || raw.rows.length > MAX_REPORT_ROWS) return null;
  const rows: (string | number)[][] = [];
  for (const r of raw.rows) {
    if (!Array.isArray(r) || r.length !== columns.length) return null;
    const row: (string | number)[] = [];
    for (const cell of r) {
      if (typeof cell === 'number') {
        if (!Number.isFinite(cell)) return null;
        row.push(cell);
      } else {
        const s = boundedStr(cell, 0, MAX_REPORT_CELL);
        if (s === null) return null;
        row.push(s);
      }
    }
    rows.push(row);
  }

  let note: string | undefined;
  if (raw.note !== undefined) {
    const n = boundedStr(raw.note, 1, MAX_REPORT_NOTE);
    if (!n) return null;
    note = n;
  }

  return { action: 'report', title, columns, rows, ...(note !== undefined ? { note } : {}) };
};

/**
 * Defensively parses an untrusted `aiChat` result into one of the shapes
 * mobile handles. Anything unrecognised, malformed, or carrying a
 * prototype-pollution key collapses to a plain `answer` — the model's own
 * `explanation`, when it's a safe string, still reaches the user; otherwise a
 * friendly fallback does. Never throws: an AI response is never worth a crash.
 *
 * `categories` (cashflow-mobile#24) is the owner's resolved set, used to
 * validate `create_rule`'s `set.category` and the three category verbs.
 * Defaults to the 13 built-ins, so every existing call site (and every
 * existing test) keeps working exactly as before.
 */
export const parseChatAction = (
  raw: unknown,
  categories: readonly CategoryOption[] = CATEGORIES,
): ChatAction => {
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

  if (raw.action === 'create_rule') return parseCreateRule(raw, categories) ?? fallback();
  if (raw.action === 'set_monthly_spend') return parseSetMonthlySpend(raw) ?? fallback();
  if (raw.action === 'record_bill') return parseRecordBill(raw) ?? fallback();
  if (raw.action === 'add_category') return parseAddCategory(raw) ?? fallback();
  if (raw.action === 'rename_category') return parseRenameCategory(raw, categories) ?? fallback();
  if (raw.action === 'remove_category') return parseRemoveCategory(raw, categories) ?? fallback();
  if (raw.action === 'report') return parseReport(raw) ?? fallback();

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
 * duplicate (CHAT-BILLS-001).
 *
 * UNITS: every `amount` here is DOLLARS, because the server renders them with
 * `money()` = `toFixed(2)` (functions/src/prompts.ts) and prints the number it
 * is given. Sending this app's native cents made the model read $45.79 as
 * "$4579.00" — a 100× lie in every figure it quoted back. The conversion
 * happens here, once, at the wire boundary, exactly like the snapshot payload's
 * dollars→cents conversion happens once on the way in.
 */
const toDollars = (cents: number): number => Math.round(cents) / 100;
const buildContext = (): ChatContext => {
  const { accounts, transactions, bills, upcoming, categories: storeCategories } =
    useFinanceStore.getState();
  return {
    // cashflow-mobile#24: the owner's resolved set, ASSIGNABLE only — an
    // archived category must never appear in what the model is told it can
    // propose filing a new row (or a new rule) under.
    categories: resolveCategories(storeCategories)
      .filter((category) => !category.archived)
      .map((category) => category.value),
    accounts: accounts.map((account) => account.name),
    recent: transactions.slice(0, 20).map((transaction) => ({
      title: transaction.description,
      ...(transaction.merchant !== null ? { merchant: transaction.merchant } : {}),
      amount: toDollars(transaction.amountCents),
      category: transaction.category,
    })),
    bills: bills.slice(0, CONTEXT_BILLS_CAP).map((bill) => ({
      vendor: bill.vendor,
      amount: toDollars(bill.amountCents),
      frequency: bill.frequency,
      nonNegotiable: bill.nonNegotiable,
      endDate: bill.endDate,
      installmentsRemaining: bill.installmentsRemaining,
      method: bill.method,
    })),
    upcoming: upcoming.slice(0, CONTEXT_UPCOMING_CAP).map((payment) => ({
      name: payment.name,
      dueDate: payment.dueDate,
      amount: toDollars(payment.amountCents),
    })),
  };
};

/**
 * `@firebase/functions` ALWAYS prefixes `error.code` with `functions/` (see
 * `errorFacetsFor`'s own comment) — the real value on an `aiChat` rejection is
 * `'functions/resource-exhausted'`, never the bare `'resource-exhausted'`.
 * The prefix is stripped ONCE, here, rather than hand-prefixing each literal
 * below: that is what keeps the next code added to this switch from falling
 * into the same trap. `category`/`retryable` come from the same
 * `errorFacetsFor` the eight write sites use, so chat and every write agree
 * on when a Try Again button is honest; only the chat-specific wording and
 * machine `code` differ per branch.
 */
const mapChatError = (error: unknown): AppError => {
  const rawCode = (error as { code?: string })?.code;
  const code = stripFunctionsPrefix(rawCode ?? 'unknown');
  const technicalMessage = (error as { message?: string })?.message ?? rawCode ?? 'unknown';
  const { category, retryable } = errorFacetsFor(rawCode);

  if (code === 'resource-exhausted') {
    return new AppError({
      category,
      code: 'AI_LIMIT_REACHED',
      userMessage: 'Daily AI limit reached — try again tomorrow.',
      technicalMessage,
      retryable,
      cause: error,
    });
  }
  if (code === 'unavailable') {
    return new AppError({
      category,
      code: 'AI_NOT_CONFIGURED',
      userMessage: 'AI is not configured.',
      technicalMessage,
      retryable,
      cause: error,
    });
  }
  if (code === 'unauthenticated') {
    return new AppError({
      category,
      code: 'AI_UNAUTHENTICATED',
      technicalMessage,
      retryable,
      cause: error,
    });
  }
  return new AppError({
    category,
    code: 'CHAT_FAILED',
    userMessage: "Cashflow couldn't reach the AI. Try again.",
    technicalMessage,
    retryable,
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
    const parsed = parseChatAction(
      data.result,
      resolveCategories(useFinanceStore.getState().categories),
    );
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
