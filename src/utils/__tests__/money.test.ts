import type { Account } from '@/types';

import {
  isCash,
  isLiability,
  netWorth,
  netWorthContribution,
  totalCardBalance,
  totalCash,
} from '../money';

const account = (kind: Account['kind'], balanceCents: number, id = kind): Account => ({
  id,
  name: id,
  institution: 'Test Bank',
  kind,
  mask: '0000',
  balanceCents,
  availableCents: null,
  creditLimitCents: null,
  currency: 'USD',
  lastSyncedAt: null,
  status: 'ok',
});

describe('sign conventions', () => {
  it('treats cards and loans as liabilities', () => {
    expect(isLiability('credit-card')).toBe(true);
    expect(isLiability('loan')).toBe(true);
    expect(isLiability('checking')).toBe(false);
    expect(isLiability('investment')).toBe(false);
  });

  it('counts only checking and cash as spendable cash', () => {
    expect(isCash('checking')).toBe(true);
    expect(isCash('cash')).toBe(true);
    // Savings is money, but it is not "cash I can spend today".
    expect(isCash('savings')).toBe(false);
  });

  it('flips the sign of a liability exactly once', () => {
    // Card balances are stored positive; net worth must subtract them.
    expect(netWorthContribution(account('credit-card', 45_200))).toBe(-45_200);
    expect(netWorthContribution(account('checking', 230_100))).toBe(230_100);
  });
});

describe('totals', () => {
  const accounts = [
    account('checking', 230_100),
    account('savings', 102_600),
    account('credit-card', 45_200),
    account('investment', 1_284_300),
  ];

  it('sums cash without pulling in savings or investments', () => {
    expect(totalCash(accounts)).toBe(230_100);
  });

  it('sums card balances as positive amounts owed', () => {
    expect(totalCardBalance(accounts)).toBe(45_200);
  });

  it('nets assets against liabilities', () => {
    expect(netWorth(accounts)).toBe(230_100 + 102_600 - 45_200 + 1_284_300);
  });

  it('is zero for no accounts, not NaN', () => {
    expect(netWorth([])).toBe(0);
  });
});
