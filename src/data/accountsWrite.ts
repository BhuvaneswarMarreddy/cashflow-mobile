import { collection, doc, serverTimestamp, setDoc } from '@firebase/firestore';

import { AppError } from '@/errors';
import { triggerRefresh } from '@/hooks/useRefresh';
import { loggerFor } from '@/logging';
import { firebaseAuth, firestore, isFirebaseConfigured } from '@/services/firebase';
import { useFinanceStore } from '@/store/financeStore';
import type { Account, AccountKind, BillFrequency } from '@/types';

/**
 * Creating an account, from the phone.
 *
 * Written straight to Firestore rather than through a callable, and that is a
 * deliberate line: *deriving* figures belongs on the server (see
 * `firebaseRepositories.ts`), but *entering* a document is not a derivation.
 * `firestore.rules` already permits the owner to create accounts and validates
 * the required fields, so a function here would add a hop and no safety.
 *
 * UNITS: the web model stores DOLLARS on `PaymentAccount.openingBalance`. This
 * app is integer cents everywhere. The conversion happens here, once, in the
 * same place as the write — the mirror image of the server's `cents()`.
 */

const log = loggerFor('data');

/** The five values `AccountType` allows; the rules reject anything else. */
const WEB_TYPE: Record<Exclude<AccountKind, 'savings' | 'investment'>, string> = {
  checking: 'bank_account',
  cash: 'cash',
  'credit-card': 'credit_card',
  loan: 'personal_loan',
};

export type NewAccountKind = keyof typeof WEB_TYPE;

export type Provider =
  | 'amex'
  | 'chase'
  | 'discover'
  | 'apple'
  | 'visa'
  | 'mastercard'
  | 'cash'
  | 'bank-transfer'
  | 'other';

export interface NewAccount {
  name: string;
  kind: NewAccountKind;
  provider: Provider;
  lastFourDigits?: string;
  /**
   * `null` means the owner asserted NOTHING about the balance — not zero.
   *
   * This distinction is the whole correctness of a new account, and it is
   * `openingAnchor()` in `cashflow-forecast/src/lib/accounts.ts` (issue #83):
   *
   *   - A number is a claim that the balance was this AS OF TODAY, so an
   *     `openingDate` is stamped and only rows from today forward move it.
   *   - `null` writes no `openingDate` at all, so `openingKey` falls back to
   *     '0000-00-00' and the account's WHOLE imported history counts.
   *
   * Defaulting a blank field to 0-anchored-today is precisely the bug that
   * hid every pre-existing row behind a $0 opening balance.
   */
  openingBalanceCents: number | null;
  creditLimitCents?: number | null;
  /** Day of month, for cards. */
  dueDate?: number | null;
}

const toDollars = (cents: number): number => Math.round(cents) / 100;

/** Today as `yyyy-MM-dd` in LOCAL time — an anchor is a calendar claim. */
const todayIso = (now = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** The document body, separated from the write so it can be tested directly. */
export const accountDocument = (
  input: NewAccount,
  sortIndex: number,
  now = new Date(),
): Record<string, unknown> => {
  const opening = input.openingBalanceCents;
  const anchored = opening !== null;

  return {
    name: input.name.trim(),
    type: WEB_TYPE[input.kind],
    provider: input.provider,
    // Required by `PaymentAccount`; the mobile client renders by kind and never
    // reads this, but the web account cards do.
    color: '#D9A521',
    isActive: true,
    sortIndex,
    openingBalance: anchored ? toDollars(opening) : 0,
    ...(anchored ? { openingDate: todayIso(now) } : {}),
    ...(input.lastFourDigits ? { lastFourDigits: input.lastFourDigits } : {}),
    ...(input.creditLimitCents != null ? { creditLimit: toDollars(input.creditLimitCents) } : {}),
    ...(input.dueDate != null ? { dueDate: input.dueDate } : {}),
  };
};

export const createAccount = async (input: NewAccount, sortIndex: number): Promise<string> => {
  if (!isFirebaseConfigured()) {
    throw new AppError({
      category: 'service-unavailable',
      code: 'FIREBASE_NOT_CONFIGURED',
      userMessage: 'Cashflow is not connected yet.',
      technicalMessage: 'EXPO_PUBLIC_FIREBASE_* missing',
      retryable: false,
    });
  }

  const uid = firebaseAuth().currentUser?.uid;
  if (!uid) {
    throw new AppError({
      category: 'authentication',
      code: 'NOT_SIGNED_IN',
      userMessage: 'Sign in again to add an account.',
      technicalMessage: 'createAccount called with no Firebase user',
      retryable: false,
    });
  }

  const accounts = collection(firestore(), 'users', uid, 'accounts');
  const ref = doc(accounts);

  try {
    await setDoc(ref, {
      ...accountDocument(input, sortIndex),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // The SHAPE of the write, never the values — same posture as the web's
    // `addAccount` span. A balance must not reach a log.
    log.info('account.created', {
      metadata: { kind: input.kind, anchored: input.openingBalanceCents !== null },
    });
    return ref.id;
  } catch (error) {
    log.warn('account.create_failed', {
      metadata: { code: (error as { code?: string })?.code ?? 'unknown' },
    });
    throw new AppError({
      category: 'data',
      code: 'ACCOUNT_CREATE_FAILED',
      userMessage: "Cashflow couldn't save that account.",
      technicalMessage: (error as { message?: string })?.message ?? 'setDoc failed',
      retryable: true,
      cause: error,
    });
  }
};

/**
 * FIN-PENDING-001 — treat provider holds as effective financial activity.
 *
 * A READ-TIME policy, not a data change: nothing ever writes `pending: false`,
 * so this flips back losslessly and the audit trail survives. It is stored on
 * the user document because every surface honours it — balances, income,
 * spending, Flow and the forecast baseline — and the web app reads the same
 * field. Two clients with two copies of this would disagree about every figure.
 *
 * Written straight to Firestore: `firestore.rules` permits the owner to update
 * their own document, and this is one boolean, not a derivation.
 */
export const setIncludePending = async (include: boolean): Promise<void> => {
  const uid = firebaseAuth().currentUser?.uid;
  if (!uid) {
    throw new AppError({
      category: 'authentication',
      code: 'NOT_SIGNED_IN',
      userMessage: 'Sign in again to change this.',
      technicalMessage: 'setIncludePending called with no Firebase user',
      retryable: false,
    });
  }

  try {
    await setDoc(
      doc(firestore(), 'users', uid),
      { settings: { includePendingInCalculations: include } },
      { merge: true },
    );
    log.info('settings.pending_policy_changed', { metadata: { include } });
  } catch (error) {
    log.warn('settings.pending_policy_failed', {
      metadata: { code: (error as { code?: string })?.code ?? 'unknown' },
    });
    throw new AppError({
      category: 'data',
      code: 'PENDING_POLICY_WRITE_FAILED',
      userMessage: "Cashflow couldn't save that setting.",
      technicalMessage: (error as { message?: string })?.message ?? 'setDoc failed',
      retryable: true,
      cause: error,
    });
  }
};

/**
 * CHAT-SPEND-001 — the owner's stated monthly-spend assumption, for runway.
 *
 * Same shape and posture as `setIncludePending`: one field, merge-written,
 * `firestore.rules` already covers the owner's own user document. `null`
 * clears the override — chosen over `deleteField()` because the server reads
 * this field as "absent or null means no override" either way, and a plain
 * `null` is one fewer import. DOLLARS, matching how the web app stores it;
 * the phone's cents convention only starts at the snapshot read boundary
 * (`firebaseRepositories.ts`).
 *
 * Unlike `setIncludePending` (whose caller decides when to refresh), this
 * calls `triggerRefresh` itself — the same posture as `decisions.ts`, because
 * chat is a fire-and-forget write with no screen-level refresh of its own.
 */
export const setAssumedMonthlySpend = async (dollars: number | null): Promise<void> => {
  const uid = firebaseAuth().currentUser?.uid;
  if (!uid) {
    throw new AppError({
      category: 'authentication',
      code: 'NOT_SIGNED_IN',
      userMessage: 'Sign in again to change this.',
      technicalMessage: 'setAssumedMonthlySpend called with no Firebase user',
      retryable: false,
    });
  }

  try {
    await setDoc(
      doc(firestore(), 'users', uid),
      { settings: { assumedMonthlySpend: dollars } },
      { merge: true },
    );
    // Whether an assumption is set, never the figure — a spend amount must not reach a log.
    log.info('settings.assumed_monthly_spend_changed', { metadata: { set: dollars !== null } });
    triggerRefresh('tap');
  } catch (error) {
    log.warn('settings.assumed_monthly_spend_failed', {
      metadata: { code: (error as { code?: string })?.code ?? 'unknown' },
    });
    throw new AppError({
      category: 'data',
      code: 'ASSUMED_SPEND_WRITE_FAILED',
      userMessage: "Cashflow couldn't save that assumption.",
      technicalMessage: (error as { message?: string })?.message ?? 'setDoc failed',
      retryable: true,
      cause: error,
    });
  }
};

/**
 * CHAT-BILLS-001 — recording a Bill from chat's `record_bill` proposal.
 *
 * Mobile has no Bills tab of its own (BILLS-001+ is a web-only surface); this
 * is the phone's only write path into `users/{uid}/bills`. The document shape
 * mirrors the web's `addBill` (cashflow-forecast/src/lib/firestore.ts) EXACTLY
 * — `firestore.rules` requires vendor/amount/frequency/paymentMethodId/
 * migrationStatus/lifecycleStatus, and a shape mismatch is silently rejected,
 * not a validation error the owner would ever see. `migrationStatus:
 * 'to-review'` / `lifecycleStatus: 'active'` mirror the web's own record_bill
 * card defaults (a manually recorded row, not an audited-migration one) — see
 * `DataChatSheet.tsx`'s `applyBill`.
 *
 * `autopayDay`/`anchorDate` arrive PRE-RESOLVED (see `resolveBillAnchor` in
 * `chat.ts`) — this function never re-derives them, only assembles the
 * document. Calling with a non-monthly frequency and no `anchorDate` still
 * writes (rules allow it); the card is what refuses to offer Apply without
 * one, exactly like the web's BillProposalCard.
 */
export interface NewBill {
  vendor: string;
  amountCents: number;
  frequency: BillFrequency;
  /** As the model said it — resolved against the store's accounts below. */
  accountName?: string;
  autopayDay?: number;
  anchorDate?: string;
  endDate?: string;
  installmentsRemaining?: number;
  nonNegotiable?: boolean;
}

/**
 * `accountName` -> a `paymentMethodId`. Mobile has no bundled payment-method
 * registry like the web's `PAYMENT_METHODS` (that is dad's manually curated
 * institution list) — the closest equivalent here is the owner's own linked
 * accounts, so a resolved name becomes that account's id. Exact match first,
 * then a unique substring match (same algorithm as the web's `resolveAccount`
 * family); anything else — no name given, no match, or an ambiguous one —
 * falls back to 'manual' rather than blocking the whole proposal, per spec.
 */
export const resolvePaymentMethodId = (
  accountName: string | undefined,
  accounts: readonly Account[],
): string => {
  const needle = accountName?.trim().toLowerCase();
  if (!needle) return 'manual';
  const exact = accounts.filter((account) => account.name.trim().toLowerCase() === needle);
  if (exact.length === 1) return exact[0].id;
  const contains = accounts.filter((account) => account.name.toLowerCase().includes(needle));
  return contains.length === 1 ? contains[0].id : 'manual';
};

/** The document body, separated from the write so it can be tested directly. */
export const billDocument = (input: NewBill, paymentMethodId: string): Record<string, unknown> => ({
  vendor: input.vendor.trim(),
  amount: toDollars(input.amountCents),
  frequency: input.frequency,
  paymentMethodId,
  migrationStatus: 'to-review',
  lifecycleStatus: 'active',
  ...(input.autopayDay != null ? { autopayDay: input.autopayDay } : {}),
  ...(input.anchorDate ? { anchorDate: input.anchorDate } : {}),
  ...(input.endDate ? { endDate: input.endDate } : {}),
  ...(input.installmentsRemaining != null ? { installmentsRemaining: input.installmentsRemaining } : {}),
  ...(input.nonNegotiable != null ? { nonNegotiable: input.nonNegotiable } : {}),
});

export const createBill = async (input: NewBill): Promise<string> => {
  if (!isFirebaseConfigured()) {
    throw new AppError({
      category: 'service-unavailable',
      code: 'FIREBASE_NOT_CONFIGURED',
      userMessage: 'Cashflow is not connected yet.',
      technicalMessage: 'EXPO_PUBLIC_FIREBASE_* missing',
      retryable: false,
    });
  }

  const uid = firebaseAuth().currentUser?.uid;
  if (!uid) {
    throw new AppError({
      category: 'authentication',
      code: 'NOT_SIGNED_IN',
      userMessage: 'Sign in again to record a bill.',
      technicalMessage: 'createBill called with no Firebase user',
      retryable: false,
    });
  }

  const paymentMethodId = resolvePaymentMethodId(
    input.accountName,
    useFinanceStore.getState().accounts,
  );
  const bills = collection(firestore(), 'users', uid, 'bills');
  const ref = doc(bills);

  try {
    await setDoc(ref, {
      ...billDocument(input, paymentMethodId),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // The SHAPE only, never vendor/amount — same posture as `account.created`.
    log.info('bill.created', {
      metadata: { frequency: input.frequency, resolvedAccount: paymentMethodId !== 'manual' },
    });
    // Chat is a fire-and-forget write with no screen-level refresh of its own
    // — same posture as `setAssumedMonthlySpend`.
    triggerRefresh('tap');
    return ref.id;
  } catch (error) {
    log.warn('bill.create_failed', {
      metadata: { code: (error as { code?: string })?.code ?? 'unknown' },
    });
    throw new AppError({
      category: 'data',
      code: 'BILL_CREATE_FAILED',
      userMessage: "Cashflow couldn't save that bill.",
      technicalMessage: (error as { message?: string })?.message ?? 'setDoc failed',
      retryable: true,
      cause: error,
    });
  }
};
