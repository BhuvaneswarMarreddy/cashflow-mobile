import { Text } from 'react-native';

import { fireEvent, renderWithProviders, waitFor } from '@/test/render';

import { AppScreen } from '../AppScreen';
import type { FabAction } from '../FAB';

/**
 * "Ask Cashflow" everywhere: AppScreen is the one place the standing chat
 * action and its single ChatSheet instance live, so every screen that renders
 * through it gets the FAB with chat for free — see fab-speeddial-brief.md.
 */
describe('AppScreen', () => {
  it('gets the FAB with just the chat action when the screen passes none', async () => {
    const { getByLabelText, getByTestId } = await renderWithProviders(
      <AppScreen>
        <Text>content</Text>
      </AppScreen>,
    );

    await fireEvent.press(getByLabelText('Quick actions'));
    expect(getByTestId('fab-action-ask-ai')).toBeTruthy();
  });

  it('appends the chat action after whatever fabActions the screen passed', async () => {
    const refresh: FabAction = {
      key: 'refresh',
      label: 'Refresh now',
      icon: 'refresh-cw',
      onPress: jest.fn(),
    };
    const { getByLabelText, getByTestId } = await renderWithProviders(
      <AppScreen fabActions={[refresh]}>
        <Text>content</Text>
      </AppScreen>,
    );

    await fireEvent.press(getByLabelText('Quick actions'));
    expect(getByTestId('fab-action-refresh')).toBeTruthy();
    expect(getByTestId('fab-action-ask-ai')).toBeTruthy();
  });

  it('opens the one hosted ChatSheet from the chat mini button', async () => {
    const { getByLabelText, getByTestId } = await renderWithProviders(
      <AppScreen>
        <Text>content</Text>
      </AppScreen>,
    );

    await fireEvent.press(getByLabelText('Quick actions'));
    await fireEvent.press(getByTestId('fab-action-ask-ai'));

    await waitFor(() => expect(getByTestId('chat-input')).toBeTruthy());
  });
});
