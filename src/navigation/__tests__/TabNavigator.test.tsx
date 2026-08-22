import { buildBaseDataset } from '@/mocks/dataset';
import { useFinanceStore } from '@/store/financeStore';
import { renderWithProviders } from '@/test/render';
import { resetStores } from '@/test/stores';

import { TabNavigator } from '../TabNavigator';

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

/**
 * The glass background, the magnified active icon, and the 'shift' screen
 * animation are all cosmetic layers on top of the tab bar — this guards the
 * one thing that must survive them: all five tabs still mount, with the
 * testIDs the rest of the navigation suite (and the FAB's tab-bar-height
 * wiring) depend on.
 */
describe('TabNavigator', () => {
  it('renders all five tabs with their testIDs', async () => {
    const { getByTestId } = await renderWithProviders(<TabNavigator />, {
      withNavigation: true,
    });

    for (const tab of ['Home', 'AccountsTab', 'Activity', 'Plan', 'MoreTab']) {
      expect(getByTestId(`tab-${tab}`)).toBeTruthy();
    }
  });
});
