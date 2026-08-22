import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { buildBaseDataset } from '@/mocks/dataset';
import { useFinanceStore } from '@/store/financeStore';
import { fireEvent, renderWithProviders, waitFor } from '@/test/render';
import { resetStores } from '@/test/stores';

import { HomeScreen } from '../HomeScreen';

const Stack = createNativeStackNavigator();

const Harness = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Home" component={HomeScreen} />
  </Stack.Navigator>
);

const renderHome = () => renderWithProviders(<Harness />, { withNavigation: true });

const NOW = Date.parse('2026-08-09T12:00:00.000Z');
const data = buildBaseDataset(NOW);

const loaded = () =>
  useFinanceStore.setState({
    snapshot: data.snapshot,
    previousSnapshot: data.previousSnapshot,
    accounts: data.accounts,
    transactions: data.transactions,
    upcoming: data.upcoming,
    goals: data.goals,
    changes: [],
    status: 'success',
    lastRefreshedAt: new Date(NOW).toISOString(),
    hasLoadedOnce: true,
    lastError: null,
    failedSections: [],
  });

beforeEach(() => {
  resetStores();
});

describe('HomeScreen', () => {
  it('shows skeletons on the very first load', async () => {
    useFinanceStore.setState({ status: 'refreshing', hasLoadedOnce: false });
    const { getAllByLabelText, queryByText } = await renderHome();

    expect(getAllByLabelText('Loading').length).toBeGreaterThan(0);
    expect(queryByText('Runway')).toBeNull();
  });

  it('leads with runway, then the supporting figures', async () => {
    loaded();
    const { getByText, getByTestId } = await renderHome();

    expect(getByText('Runway')).toBeTruthy();
    expect(getByTestId('metric-runway-value')).toHaveTextContent('17 days');
    expect(getByTestId('metric-cash-amount')).toHaveTextContent('$2,301');
    expect(getByTestId('metric-locked-amount')).toHaveTextContent('$2,575');
    expect(getByTestId('metric-cards-amount')).toHaveTextContent('$452');
  });

  it('states when the figures were last refreshed', async () => {
    loaded();
    const { getByText } = await renderHome();
    expect(getByText(/Updated/)).toBeTruthy();
  });

  it('says nothing has changed rather than showing an empty section', async () => {
    loaded();
    const { getByText } = await renderHome();
    expect(getByText('Nothing has changed since your last refresh.')).toBeTruthy();
  });

  it('renders detected changes when there are some', async () => {
    loaded();
    useFinanceStore.setState({
      changes: [
        {
          id: 'c1',
          kind: 'cash-decrease',
          label: 'Cash decreased',
          detail: 'Down $240.00 since your last refresh',
          amountCents: -24_000,
          severity: 'informational',
        },
      ],
    });

    const { getByText } = await renderHome();
    expect(getByText('Cash decreased')).toBeTruthy();
    expect(getByText('Down $240.00 since your last refresh')).toBeTruthy();
  });

  it('shows a recoverable error with a retry, not a raw message', async () => {
    useFinanceStore.setState({
      status: 'failed',
      hasLoadedOnce: true,
      snapshot: null,
      lastError: {
        category: 'network',
        userMessage: "Cashflow can't reach the network right now.",
        retryable: true,
        correlationId: 'cf_1',
      },
    });

    const { getByText } = await renderHome();
    expect(getByText("Cashflow can't reach the network right now.")).toBeTruthy();
    expect(getByText('Try again')).toBeTruthy();
  });

  it('says nothing about an assumption when the monthly figure is measured', async () => {
    loaded();
    const { getByTestId } = await renderHome();
    expect(getByTestId('metric-runway')).not.toHaveTextContent('your assumption', { exact: false });
  });

  it("marks the monthly figure as the owner's own assumption when one is set", async () => {
    loaded();
    useFinanceStore.setState({
      snapshot: { ...data.snapshot, assumedMonthlySpendCents: 900_000 },
    });

    const { getByTestId } = await renderHome();
    expect(getByTestId('metric-runway')).toHaveTextContent('your assumption', { exact: false });
  });

  it('never prints an unmeasured runway as zero days', async () => {
    loaded();
    useFinanceStore.setState({
      snapshot: { ...data.snapshot, runway: { ...data.snapshot.runway, hasBurn: false } },
    });

    const { getByText, queryByTestId } = await renderHome();
    expect(getByText('Not measured yet')).toBeTruthy();
    expect(queryByTestId('metric-runway-value')).toBeNull();
  });

  it('opens the chat sheet from the "Ask Cashflow" quick action', async () => {
    loaded();
    const { getByLabelText, getByTestId } = await renderHome();

    await fireEvent.press(getByLabelText('Quick actions'));
    await fireEvent.press(getByTestId('fab-action-ask-ai'));

    await waitFor(() => expect(getByTestId('chat-input')).toBeTruthy());
  });

  it('surfaces accounts that failed to sync', async () => {
    loaded();
    const [first, ...rest] = data.accounts;
    useFinanceStore.setState({
      accounts: [{ ...first!, status: 'error' }, ...rest],
    });

    const { getByText } = await renderHome();
    expect(getByText('Needs attention')).toBeTruthy();
    expect(getByText("Cashflow couldn't reach this account")).toBeTruthy();
  });
});
