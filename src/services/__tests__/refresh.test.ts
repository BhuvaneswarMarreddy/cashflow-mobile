import { useAuditStream } from '@/audit';
import { defaultFlags, useFeatureFlags } from '@/config';
import { useDevStore } from '@/store/devStore';
import { useFinanceStore } from '@/store/financeStore';
import { useNotificationsStore } from '@/store/notificationsStore';
import { usePreferences } from '@/store/preferencesStore';
import { resetStores } from '@/test/stores';

import { refreshFinancialData } from '../refresh';

/**
 * End-to-end over the mock backend: repositories → store → change detection →
 * audit → notification. This is the path every screen depends on.
 */
beforeEach(() => {
  resetStores();
  useAuditStream.getState().clear();
  // Notifications are off by default in the test environment; the summary path
  // is part of what this suite is asserting, so opt in explicitly.
  useFeatureFlags.setState({ flags: { ...defaultFlags(), ENABLE_NOTIFICATIONS: true } });
  usePreferences.setState({
    notifications: {
      enabled: true,
      financialSummary: true,
      bills: true,
      paycheck: true,
      warnings: true,
    },
  });
});

describe('refreshFinancialData', () => {
  it('populates the store and marks the refresh successful', async () => {
    await refreshFinancialData('pull');
    const state = useFinanceStore.getState();

    expect(state.status).toBe('success');
    expect(state.accounts).toHaveLength(4);
    expect(state.snapshot?.cashCents).toBe(230_100);
    expect(state.lastRefreshedAt).not.toBeNull();
    expect(state.hasLoadedOnce).toBe(true);
    expect(state.lastError).toBeNull();
  });

  it('detects what changed against the previous snapshot', async () => {
    await refreshFinancialData('pull');
    const kinds = useFinanceStore.getState().changes.map((change) => change.kind);

    // The base dataset moves cash down $240, card down $300, and costs a day of runway.
    expect(kinds).toEqual(
      expect.arrayContaining(['cash-decrease', 'runway-change', 'card-decrease']),
    );
  });

  it('writes an audit trail that shares one correlation ID', async () => {
    await refreshFinancialData('pull');
    const entries = useAuditStream.getState().entries;

    const refreshEntries = entries.filter((entry) => entry.stage === 'refresh');
    expect(refreshEntries.map((entry) => entry.outcome)).toEqual(
      expect.arrayContaining(['started', 'succeeded']),
    );

    const ids = new Set(entries.map((entry) => entry.correlationId));
    expect(ids.size).toBe(1);
  });

  it('summarises the refresh into exactly one notification', async () => {
    await refreshFinancialData('pull');
    const notifications = useNotificationsStore.getState().items;

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.summary).toContain('runway');
    // Summaries never itemise transactions.
    expect(notifications[0]?.summary).not.toContain('Amazon');
  });

  it('does not notify for a refresh the user did not ask for', async () => {
    await refreshFinancialData('launch');
    expect(useNotificationsStore.getState().items).toHaveLength(0);
  });

  it('keeps existing figures visible when everything fails', async () => {
    await refreshFinancialData('launch');
    const before = useFinanceStore.getState().snapshot;

    useDevStore.setState({ simulateFailure: true });
    await refreshFinancialData('pull');
    const after = useFinanceStore.getState();

    expect(after.status).toBe('failed');
    expect(after.snapshot).toEqual(before);
    expect(after.lastError?.retryable).toBe(true);
  });

  it('reports a partial success when only one section fails', async () => {
    useDevStore.setState({ scenario: 'partial-sync' });
    await refreshFinancialData('pull');
    const state = useFinanceStore.getState();

    expect(state.status).toBe('partialSuccess');
    expect(state.failedSections).toEqual(['activity']);
    expect(state.accounts.length).toBeGreaterThan(0);
  });

  it('classifies an offline failure as a network problem', async () => {
    useDevStore.setState({ simulateOffline: true });
    await refreshFinancialData('pull');

    expect(useFinanceStore.getState().lastError?.category).toBe('network');
  });

  it('ignores a second refresh while one is already running', async () => {
    const first = refreshFinancialData('pull');
    const second = refreshFinancialData('tap');
    await Promise.all([first, second]);

    // One refresh means one summary, not two.
    expect(useNotificationsStore.getState().items).toHaveLength(1);
  });
});
