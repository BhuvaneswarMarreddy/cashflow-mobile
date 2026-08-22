import { Animated } from 'react-native';
import * as Haptics from 'expo-haptics';

import { fireEvent, renderWithProviders } from '@/test/render';

import { FAB, type FabAction } from '../FAB';

const action = (overrides: Partial<FabAction> = {}): FabAction => ({
  key: 'ask-ai',
  label: 'Ask Cashflow',
  icon: 'message-circle',
  onPress: jest.fn(),
  ...overrides,
});

/**
 * Classic speed-dial: tap the FAB and mini action buttons fan out vertically
 * above it, rather than opening the old quick-actions sheet. `renderWithProviders`
 * feeds a real `ThemeProvider`, so `reduceMotion` comes from the OS setting —
 * mocked per-test below, same seam `theme.test.ts` exercises for `createTheme`.
 */
describe('FAB', () => {
  it('renders nothing when there are no actions', async () => {
    const { queryByLabelText } = await renderWithProviders(<FAB actions={[]} source="home" />);
    expect(queryByLabelText('Quick actions')).toBeNull();
  });

  it('opens to reveal a mini button per action, each with its own testID', async () => {
    const actions = [action({ key: 'refresh', label: 'Refresh now' }), action()];
    const { getByLabelText, getByTestId } = await renderWithProviders(
      <FAB actions={actions} source="home" />,
    );

    await fireEvent.press(getByLabelText('Quick actions'));

    expect(getByTestId('fab-action-refresh')).toBeTruthy();
    expect(getByTestId('fab-action-ask-ai')).toBeTruthy();
  });

  it('fans out a single mini button even for a single action — no direct-fire shortcut', async () => {
    const onPress = jest.fn();
    const { getByLabelText, getByTestId } = await renderWithProviders(
      <FAB actions={[action({ onPress })]} source="activity" />,
    );

    await fireEvent.press(getByLabelText('Quick actions'));

    // Toggling alone never fires it — the mini button, once fanned out, does.
    expect(getByTestId('fab-action-ask-ai')).toBeTruthy();
    expect(onPress).not.toHaveBeenCalled();

    await fireEvent.press(getByTestId('fab-action-ask-ai'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('selecting a mini button fires its onPress, closes the fan, and haptics', async () => {
    const onPress = jest.fn();
    const actions = [action({ key: 'refresh', label: 'Refresh now' }), action({ onPress })];
    const { getByLabelText, getByTestId, queryByTestId } = await renderWithProviders(
      <FAB actions={actions} source="home" />,
    );

    await fireEvent.press(getByLabelText('Quick actions'));
    await fireEvent.press(getByTestId('fab-action-ask-ai'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    // Closed again: the other mini button is gone.
    expect(queryByTestId('fab-action-refresh')).toBeNull();
  });

  it('tapping the backdrop closes the fan without firing any action', async () => {
    const onPress = jest.fn();
    const { getByLabelText, getByTestId, queryByTestId } = await renderWithProviders(
      <FAB actions={[action({ onPress })]} source="home" />,
    );

    await fireEvent.press(getByLabelText('Quick actions'));
    expect(getByTestId('fab-action-ask-ai')).toBeTruthy();

    await fireEvent.press(getByTestId('fab-backdrop'));

    expect(onPress).not.toHaveBeenCalled();
    expect(queryByTestId('fab-action-ask-ai')).toBeNull();
  });

  it('communicates the open state via accessibilityState', async () => {
    const { getByLabelText } = await renderWithProviders(
      <FAB actions={[action()]} source="home" />,
    );

    const toggle = getByLabelText('Quick actions');
    expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));

    await fireEvent.press(toggle);
    expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({ expanded: true }));
  });

  it('animates the toggle rotation with a spring when motion is not reduced', async () => {
    const spy = jest.spyOn(Animated, 'spring');
    const { getByLabelText } = await renderWithProviders(
      <FAB actions={[action()]} source="home" />,
    );

    await fireEvent.press(getByLabelText('Quick actions'));

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('under reduced motion, snaps the toggle open with no spring call', async () => {
    const spy = jest.spyOn(Animated, 'spring');
    const { getByLabelText } = await renderWithProviders(
      <FAB actions={[action()]} source="home" />,
      {
        reduceMotion: true,
      },
    );
    // Drops the one spring call from the mount effect that ran before
    // ThemeProvider's async AccessibilityInfo lookup resolved — the same
    // startup race TabIcon has. What this test actually asserts is that once
    // reduced motion is known, the open transition itself never springs.
    spy.mockClear();

    await fireEvent.press(getByLabelText('Quick actions'));

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
