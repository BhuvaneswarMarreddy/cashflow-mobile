import { AccountRow } from '../AccountRow';
import type { Account } from '@/types';
import { renderWithProviders } from '@/test/render';

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'acct-1',
  name: 'Everyday Checking',
  institution: 'Bank of America',
  kind: 'checking',
  mask: '4821',
  balanceCents: 230_100,
  availableCents: null,
  creditLimitCents: null,
  currency: 'USD',
  // ALWAYS null in production: the server sends no per-account sync stamp,
  // because none is stored (functions/src/snapshot.ts).
  lastSyncedAt: null,
  status: 'ok',
  ...overrides,
});

/**
 * The server sets `status: 'stale'` from `isUnanchored()` alone, and always
 * sends `lastSyncedAt: null` — no per-account sync stamp exists anywhere in the
 * system. The row rendered that as "Updated never", a plain falsehood about an
 * account Plaid may have refreshed sixty seconds ago, and the kind of statement
 * the owner can catch himself — which is how an app loses trust in every other
 * number on the screen.
 *
 * What is genuinely unknown is the BALANCE: with no opening anchor it is net
 * movement over the rows on record, not a figure any bank confirmed.
 */
describe('an unanchored account', () => {
  it('does not claim anything about syncing', async () => {
    const view = await renderWithProviders(<AccountRow account={account({ status: 'stale' })} />);

    expect(view.queryByText(/updated/i)).toBeNull();
    expect(view.queryByText(/never/i)).toBeNull();
    expect(view.getByText(/balance not confirmed by the bank/i)).toBeTruthy();
  });

  it('says nothing at all for a healthy account', async () => {
    const view = await renderWithProviders(<AccountRow account={account()} />);

    expect(view.queryByText(/balance not confirmed/i)).toBeNull();
    expect(view.queryByText(/updated/i)).toBeNull();
  });
});
