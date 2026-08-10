import type { Account, AccountKind } from '@/types';

/** Kinds whose balance represents money owed rather than money held. */
const LIABILITY_KINDS: readonly AccountKind[] = ['credit-card', 'loan'];

export const isLiability = (kind: AccountKind): boolean => LIABILITY_KINDS.includes(kind);

/** Kinds that count as spendable cash today. */
const CASH_KINDS: readonly AccountKind[] = ['checking', 'cash'];

export const isCash = (kind: AccountKind): boolean => CASH_KINDS.includes(kind);

export const sumCents = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

/**
 * Signed contribution to net worth.
 *
 * Liability balances are stored positive (a $452 card balance is `45200`), so
 * the sign flip lives here rather than at each call site — the alternative is
 * one screen that forgets and quietly reports the wrong net worth.
 */
export const netWorthContribution = (account: Account): number =>
  isLiability(account.kind) ? -account.balanceCents : account.balanceCents;

export const totalByKind = (accounts: readonly Account[], kinds: readonly AccountKind[]): number =>
  sumCents(accounts.filter((a) => kinds.includes(a.kind)).map((a) => a.balanceCents));

export const totalCash = (accounts: readonly Account[]): number =>
  sumCents(accounts.filter((a) => isCash(a.kind)).map((a) => a.balanceCents));

export const totalSavings = (accounts: readonly Account[]): number =>
  totalByKind(accounts, ['savings']);

export const totalCardBalance = (accounts: readonly Account[]): number =>
  totalByKind(accounts, ['credit-card']);

export const netWorth = (accounts: readonly Account[]): number =>
  sumCents(accounts.map(netWorthContribution));
