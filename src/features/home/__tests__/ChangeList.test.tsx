import { renderWithProviders } from '@/test/render';

import { ChangeList } from '../ChangeList';

/**
 * Balances are deliberately never written to device storage, so the comparison
 * baseline is only whatever the current session already fetched. On a cold
 * start there is none — and an empty change list then meant the app said
 * "nothing has changed", which is a claim it cannot make. For someone who
 * opens the app for thirty seconds and closes it, that was most opens.
 */
describe('ChangeList with no changes', () => {
  it('does not claim nothing changed when there is no baseline', async () => {
    const view = await renderWithProviders(<ChangeList changes={[]} hasBaseline={false} />);

    expect(view.queryByText(/nothing has changed/i)).toBeNull();
    expect(view.getByText(/first look this session/i)).toBeTruthy();
  });

  it('says nothing changed only when it actually compared against something', async () => {
    const view = await renderWithProviders(<ChangeList changes={[]} hasBaseline />);

    expect(view.getByText(/nothing has changed since your last refresh/i)).toBeTruthy();
  });
});
