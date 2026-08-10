import { collection, doc, serverTimestamp, setDoc } from '@firebase/firestore';

import { AppError } from '@/errors';
import { loggerFor } from '@/logging';
import { firebaseAuth, firestore, isFirebaseConfigured } from '@/services/firebase';
import type { AccountKind } from '@/types';

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
