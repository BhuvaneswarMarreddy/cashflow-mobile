import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { buildBaseDataset } from '@/mocks/dataset';
import { useFinanceStore } from '@/store/financeStore';
import { renderWithProviders } from '@/test/render';
import { resetStores } from '@/test/stores';

import { PlanScreen } from '../PlanScreen';

const Stack = createNativeStackNavigator();
const Harness = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Plan" component={PlanScreen} />
  </Stack.Navigator>
);
const renderPlan = () => renderWithProviders(<Harness />, { withNavigation: true });

const NOW = Date.parse('2026-08-09T12:00:00.000Z');

beforeEach(() => resetStores());

/**
 * Every empty branch on Plan is phrased as a FINDING — "$0 due in the next 45
 * days", "No paycheck detected", "Nothing scheduled". The screen read neither
 * `lastError` nor `failedSections`, so a failed load fell straight through and
 * rendered as the single most reassuring screen in the app: no bills, no
 * paycheck, nothing committed.
 *
 * StatusBanner does not cover it either — a rejected `homeSnapshot` normalizes
 * to 'unexpected', and the banner only reacts to 'network' and
 * 'service-unavailable'.
 */
describe('PlanScreen when the load failed', () => {
  it('says the load failed instead of reporting an empty, reassuring plan', async () => {
    useFinanceStore.setState({
      hasLoadedOnce: true,
      status: 'failed',
      snapshot: null,
      upcoming: [],
      goals: [],
      lastError: {
        category: 'unexpected',
        userMessage: 'Something went wrong.',
        retryable: true,
        correlationId: null,
      },
    });

    const view = await renderPlan();

    expect(view.queryByText(/nothing scheduled/i)).toBeNull();
    expect(view.queryByText(/no paycheck detected/i)).toBeNull();
    expect(view.queryByText(/\$0 due in the next 45 days/i)).toBeNull();
    expect(view.getByText(/something went wrong/i)).toBeTruthy();
  });

  it('still renders the plan normally when the load succeeded', async () => {
    const data = buildBaseDataset(NOW);
    useFinanceStore.setState({
      hasLoadedOnce: true,
      status: 'success',
      snapshot: data.snapshot,
      upcoming: data.upcoming,
      goals: data.goals,
      lastError: null,
    });

    const view = await renderPlan();
    expect(view.queryByText(/something went wrong/i)).toBeNull();
  });
});
