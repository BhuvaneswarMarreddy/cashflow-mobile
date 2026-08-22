import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { buildBaseDataset } from '@/mocks/dataset';
import { useFinanceStore } from '@/store/financeStore';
import { fireEvent, renderWithProviders, waitFor } from '@/test/render';
import { resetStores } from '@/test/stores';

import { ActivityScreen } from '../ActivityScreen';

const Stack = createNativeStackNavigator();

const Harness = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Activity" component={ActivityScreen} />
  </Stack.Navigator>
);

const renderActivity = () => renderWithProviders(<Harness />, { withNavigation: true });

const NOW = Date.parse('2026-08-09T12:00:00.000Z');
const data = buildBaseDataset(NOW);

beforeEach(() => {
  resetStores();
  useFinanceStore.setState({
    accounts: data.accounts,
    transactions: data.transactions,
    status: 'success',
    hasLoadedOnce: true,
    lastRefreshedAt: new Date(NOW).toISOString(),
  });
});

/**
 * Activity's FAB carries exactly one action ("Ask Cashflow"), so — unlike
 * HomeScreen's three-action FAB — it fires directly on press rather than
 * opening the "Quick actions" picker sheet first (see FAB.tsx: `single`).
 * This is the untested path the review flagged: prove the direct-fire wiring
 * actually opens ChatSheet, not just that the button renders.
 */
describe('ActivityScreen', () => {
  it('renders with the "Ask Cashflow" FAB present', async () => {
    const { getByLabelText } = await renderActivity();
    expect(getByLabelText('Ask Cashflow')).toBeTruthy();
  });

  it('pressing the FAB opens the chat sheet directly, no picker sheet', async () => {
    const { getByLabelText, getByTestId, queryByText } = await renderActivity();

    await fireEvent.press(getByLabelText('Ask Cashflow'));

    await waitFor(() => expect(getByTestId('chat-input')).toBeTruthy());
    // Direct fire, not the multi-action picker: "Quick actions" never appears.
    expect(queryByText('Quick actions')).toBeNull();
  });
});
