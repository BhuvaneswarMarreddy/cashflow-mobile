import { buildBaseDataset } from '@/mocks/dataset';
import { useFinanceStore } from '@/store/financeStore';
import { fireEvent, renderWithProviders, waitFor } from '@/test/render';
import { resetStores } from '@/test/stores';

import { RootNavigator } from '../RootNavigator';

const NOW = Date.parse('2026-08-09T12:00:00.000Z');
const data = buildBaseDataset(NOW);

beforeEach(() => {
  resetStores();
  useFinanceStore.setState({
    snapshot: data.snapshot,
    previousSnapshot: data.previousSnapshot,
    accounts: data.accounts,
    transactions: data.transactions,
    upcoming: data.upcoming,
    goals: data.goals,
    status: 'success',
    hasLoadedOnce: true,
    lastRefreshedAt: new Date(NOW).toISOString(),
  });
});

describe('RootNavigator', () => {
  it('opens on Home with all five tabs present', async () => {
    const { getByTestId } = await renderWithProviders(<RootNavigator />);

    expect(getByTestId('screen-home')).toBeTruthy();
    for (const tab of ['Home', 'AccountsTab', 'Activity', 'Plan', 'MoreTab']) {
      expect(getByTestId(`tab-${tab}`)).toBeTruthy();
    }
  });

  it('navigates from Home to Accounts and back', async () => {
    const { getByTestId } = await renderWithProviders(<RootNavigator />);

    await fireEvent.press(getByTestId('tab-AccountsTab'));
    await waitFor(() => expect(getByTestId('screen-accounts')).toBeTruthy());

    await fireEvent.press(getByTestId('tab-Home'));
    await waitFor(() => expect(getByTestId('screen-home')).toBeTruthy());
  });

  it('drills into an account and shows its detail screen', async () => {
    const { getByTestId } = await renderWithProviders(<RootNavigator />);

    await fireEvent.press(getByTestId('tab-AccountsTab'));
    await waitFor(() => expect(getByTestId('screen-accounts')).toBeTruthy());

    await fireEvent.press(getByTestId('account-row-acc_checking'));
    await waitFor(() => expect(getByTestId('screen-account-detail')).toBeTruthy());
  });

  it('opens the notification centre from the header', async () => {
    const { getByTestId } = await renderWithProviders(<RootNavigator />);

    await fireEvent.press(getByTestId('header-notifications'));
    await waitFor(() => expect(getByTestId('screen-notifications')).toBeTruthy());
  });

  it('reaches Settings and, from there, Diagnostics', async () => {
    const { getByTestId } = await renderWithProviders(<RootNavigator />);

    await fireEvent.press(getByTestId('tab-MoreTab'));
    await waitFor(() => expect(getByTestId('screen-settings')).toBeTruthy());

    await fireEvent.press(getByTestId('row-diagnostics'));
    await waitFor(() => expect(getByTestId('screen-diagnostics')).toBeTruthy());
  });

  it('reaches Plan and Activity', async () => {
    const { getByTestId } = await renderWithProviders(<RootNavigator />);

    await fireEvent.press(getByTestId('tab-Plan'));
    await waitFor(() => expect(getByTestId('screen-plan')).toBeTruthy());

    await fireEvent.press(getByTestId('tab-Activity'));
    await waitFor(() => expect(getByTestId('screen-activity')).toBeTruthy());
  });
});
