import { SCENARIOS } from '@/mocks/scenarios';
import { useDevStore } from '@/store/devStore';

import { mockRepositories } from '../mockRepositories';

beforeEach(() => {
  useDevStore.setState({
    scenario: 'healthy',
    simulateFailure: false,
    simulateOffline: false,
    simulateSlowNetwork: false,
  });
});

describe('mock repositories', () => {
  it('returns the healthy dataset by default', async () => {
    const accounts = await mockRepositories.accounts.list();
    expect(accounts.map((account) => account.id)).toEqual([
      'acc_checking',
      'acc_savings',
      'acc_card',
      'acc_brokerage',
    ]);
  });

  it('reflects the selected scenario', async () => {
    useDevStore.setState({ scenario: 'low-cash' });
    const { snapshot } = await mockRepositories.snapshot.current();

    expect(snapshot.cashCents).toBe(8_420);
    // Committed spending exceeds available cash and the runway is down to a day.
    expect(snapshot.cashCents - snapshot.upcomingTotalCents).toBeLessThan(0);
    expect(snapshot.runway.days).toBe(1);
  });

  it('reports no runway at all when nothing is connected', async () => {
    useDevStore.setState({ scenario: 'no-accounts' });
    const { snapshot } = await mockRepositories.snapshot.current();

    // Not "0 days" — there is no burn to divide by, and a zero would read as a
    // measured fact.
    expect(snapshot.runway.hasBurn).toBe(false);
    expect(snapshot.runway.label).toBe('Not measured yet');
  });

  it('fails everything under the refresh-failed scenario', async () => {
    useDevStore.setState({ scenario: 'refresh-failed' });
    await expect(mockRepositories.accounts.list()).rejects.toMatchObject({ code: 'MOCK_FAILURE' });
  });

  it('fails only activity under partial sync', async () => {
    useDevStore.setState({ scenario: 'partial-sync' });

    await expect(mockRepositories.accounts.list()).resolves.toBeDefined();
    await expect(mockRepositories.activity.list()).rejects.toBeDefined();
  });

  it('reports an offline error, not a server error, when offline', async () => {
    useDevStore.setState({ simulateOffline: true });
    await expect(mockRepositories.snapshot.current()).rejects.toMatchObject({
      code: 'OFFLINE',
      category: 'network',
    });
  });

  it('sorts activity newest first and honours the limit', async () => {
    const transactions = await mockRepositories.activity.list({ limit: 3 });
    expect(transactions).toHaveLength(3);
    const dates = transactions.map((transaction) => transaction.date);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });

  it('filters activity by account', async () => {
    const transactions = await mockRepositories.activity.list({ accountId: 'acc_card' });
    expect(transactions.every((transaction) => transaction.accountId === 'acc_card')).toBe(true);
    expect(transactions.length).toBeGreaterThan(0);
  });

  it('sorts upcoming payments by due date', async () => {
    const upcoming = await mockRepositories.plan.upcoming();
    const dates = upcoming.map((payment) => payment.dueDate);
    expect([...dates].sort()).toEqual(dates);
  });

  it('offers a scenario for every condition the UI has to handle', () => {
    // A missing scenario means a screen state nobody can reach on a phone.
    expect(Object.keys(SCENARIOS)).toEqual(
      expect.arrayContaining([
        'healthy',
        'credit-heavy',
        'low-cash',
        'upcoming-bill',
        'paycheck-arriving',
        'refresh-failed',
        'partial-sync',
        'no-accounts',
        'offline',
        'large-change',
        'savings-milestone',
      ]),
    );
  });
});
