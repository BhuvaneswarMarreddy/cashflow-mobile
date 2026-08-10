import { render, waitFor } from '@testing-library/react-native';

import { useAuthStore } from '@/store/authStore';
import { useFinanceStore } from '@/store/financeStore';
import { resetStores } from '@/test/stores';

import App from '../App';

/**
 * Boot smoke test — the closest automated proxy to "it opens on the phone".
 *
 * Renders the real root: error boundary, safe-area, theme, the splash hold, the
 * session gate, lifecycle wiring and the launch refresh.
 *
 * Firebase is unconfigured under test (no EXPO_PUBLIC_* values), so the session
 * resolves to signed-out deterministically — which is exactly the first case
 * worth asserting.
 */
beforeEach(() => {
  resetStores();
  useAuthStore.setState({ status: 'unknown', user: null, error: null, submitting: false });
});

describe('App', () => {
  it('boots to sign-in when there is no session', async () => {
    const { getByTestId } = await render(<App />);
    await waitFor(() => expect(getByTestId('screen-sign-in')).toBeTruthy());
  });

  it('does not offer Google sign-in without the native module', async () => {
    // In Expo Go and under test the module is absent; offering the button would
    // be a promise the app cannot keep.
    const { queryByTestId, getByTestId } = await render(<App />);
    await waitFor(() => expect(getByTestId('screen-sign-in')).toBeTruthy());
    expect(queryByTestId('button-google')).toBeNull();
  });

  it('boots to Home and loads data once signed in', async () => {
    const { getByTestId } = await render(<App />);
    await waitFor(() => expect(getByTestId('screen-sign-in')).toBeTruthy());

    useAuthStore.setState({
      status: 'signed-in',
      user: { uid: 'owner', email: 'owner@example.com', displayName: null },
    });

    await waitFor(() => expect(getByTestId('screen-home')).toBeTruthy());
    await waitFor(() => expect(useFinanceStore.getState().status).toBe('success'), {
      timeout: 5_000,
    });

    expect(useFinanceStore.getState().accounts).toHaveLength(4);
    expect(getByTestId('metric-runway-value')).toHaveTextContent('17 days');
  });

  it('renders without an uncaught error reaching the root boundary', async () => {
    const { queryByText } = await render(<App />);
    await waitFor(() => expect(queryByText('Something went wrong')).toBeNull());
  });
});
