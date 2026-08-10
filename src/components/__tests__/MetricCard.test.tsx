import { fireEvent, renderWithProviders } from '@/test/render';

import { MetricCard } from '../MetricCard';

describe('MetricCard', () => {
  it('renders a figure with its label', async () => {
    const { getByText } = await renderWithProviders(<MetricCard label="Cash" cents={230_100} />);
    expect(getByText('Cash')).toBeTruthy();
    expect(getByText('$2,301')).toBeTruthy();
  });

  /**
   * The most important test in this file. A `null` figure means Cashflow cannot
   * back the number; rendering `$0` would present a guess as a measurement.
   */
  it('says "Not available" with a reason instead of showing zero', async () => {
    const { getByText, queryByText } = await renderWithProviders(
      <MetricCard
        label="Safe to spend"
        cents={null}
        unavailableReason="Connect an account so Cashflow can work this out."
      />,
    );

    expect(getByText('Not available')).toBeTruthy();
    expect(getByText('Connect an account so Cashflow can work this out.')).toBeTruthy();
    expect(queryByText('$0')).toBeNull();
  });

  it('distinguishes a real zero from an unknown value', async () => {
    const { getByText, queryByText } = await renderWithProviders(
      <MetricCard label="Credit cards" cents={0} />,
    );
    expect(getByText('$0')).toBeTruthy();
    expect(queryByText('Not available')).toBeNull();
  });

  it('shows a delta against yesterday when there is one', async () => {
    const { getByText } = await renderWithProviders(
      <MetricCard label="Cash" cents={230_100} deltaCents={-24_000} />,
    );
    expect(getByText('−$240.00')).toBeTruthy();
    expect(getByText('since your last refresh')).toBeTruthy();
  });

  it('hides the delta when nothing moved', async () => {
    const { queryByText } = await renderWithProviders(
      <MetricCard label="Cash" cents={230_100} deltaCents={0} />,
    );
    expect(queryByText('since your last refresh')).toBeNull();
  });

  it('is a button, with a spoken label, when it navigates', async () => {
    const onPress = jest.fn();
    const { getByRole } = await renderWithProviders(
      <MetricCard label="Cash" cents={230_100} onPress={onPress} />,
    );

    await fireEvent.press(getByRole('button', { name: 'Cash, $2,301' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('is not a button when it does not navigate', async () => {
    const { queryByRole } = await renderWithProviders(<MetricCard label="Cash" cents={230_100} />);
    expect(queryByRole('button')).toBeNull();
  });
});
