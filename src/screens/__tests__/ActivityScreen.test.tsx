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
 * Activity has no actions of its own — its FAB carries only the standing
 * "Ask Cashflow" action AppScreen appends (see AppScreen.tsx, FAB.tsx). Even
 * one action still fans out from the "Quick actions" toggle rather than
 * firing directly — the speed-dial's one gesture, everywhere.
 */
describe('ActivityScreen', () => {
  it('renders with the FAB toggle present', async () => {
    const { getByLabelText } = await renderActivity();
    expect(getByLabelText('Quick actions')).toBeTruthy();
  });

  it('opens the chat sheet from the fanned-out "Ask Cashflow" mini button', async () => {
    const { getByLabelText, getByTestId } = await renderActivity();

    await fireEvent.press(getByLabelText('Quick actions'));
    await fireEvent.press(getByTestId('fab-action-ask-ai'));

    await waitFor(() => expect(getByTestId('chat-input')).toBeTruthy());
  });
});
