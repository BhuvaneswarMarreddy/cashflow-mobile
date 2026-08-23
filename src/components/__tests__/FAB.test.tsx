import { Animated, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

import { borderWidth, colorsFor, spacing } from '@/theme/tokens';
import { fireEvent, renderWithProviders } from '@/test/render';

import { FAB, type FabAction } from '../FAB';

/** Either scheme's overlay is a valid scrim — which one is active is the
 *  ThemeProvider's call, not this suite's. */
const OVERLAY_COLORS = [colorsFor('light').overlay, colorsFor('dark').overlay];

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

  it('traps VoiceOver focus to the fan and gives the backdrop a real scrim', async () => {
    const { getByLabelText, getByTestId } = await renderWithProviders(
      <FAB actions={[action()]} source="home" />,
    );

    await fireEvent.press(getByLabelText('Quick actions'));

    expect(getByTestId('fab-fan').props.accessibilityViewIsModal).toBe(true);
    // RNTL treats the backdrop as accessibility-hidden by default once a
    // sibling carries accessibilityViewIsModal — correctly: that IS the trap
    // working, the same reason VoiceOver can't swipe to it either. `hidden`
    // opts back in, the same way a sighted tap still reaches it.
    const backdrop = getByTestId('fab-backdrop', { hidden: true });
    const backdropStyle = StyleSheet.flatten(backdrop.props.style);
    expect(OVERLAY_COLORS).toContain(backdropStyle.backgroundColor);
  });

  it('surfaces a mini action\'s description as its accessibilityHint', async () => {
    const { getByLabelText, getByTestId } = await renderWithProviders(
      <FAB
        actions={[action({ key: 'refresh', label: 'Refresh now', description: 'Pull the latest data' })]}
        source="home"
      />,
    );

    await fireEvent.press(getByLabelText('Quick actions'));

    expect(getByTestId('fab-action-refresh').props.accessibilityHint).toBe('Pull the latest data');
  });

  it('tapping the backdrop closes the fan without firing any action', async () => {
    const onPress = jest.fn();
    const { getByLabelText, getByTestId, queryByTestId } = await renderWithProviders(
      <FAB actions={[action({ onPress })]} source="home" />,
    );

    await fireEvent.press(getByLabelText('Quick actions'));
    expect(getByTestId('fab-action-ask-ai')).toBeTruthy();

    // See the a11y-trap test above: the backdrop is deliberately outside the
    // accessibilityViewIsModal boundary, so it is accessibility-hidden by
    // RNTL's default query. `hidden` finds it anyway — a sighted/mouse tap
    // reaches it exactly the same way.
    await fireEvent.press(getByTestId('fab-backdrop', { hidden: true }));

    expect(onPress).not.toHaveBeenCalled();
    expect(queryByTestId('fab-action-ask-ai')).toBeNull();
  });

  it("positions the fan row on the toggle's own right offset — not a measured origin", async () => {
    const { getByLabelText, getByTestId } = await renderWithProviders(
      <FAB actions={[action()]} source="home" />,
    );

    await fireEvent.press(getByLabelText('Quick actions'));

    const rowStyle = StyleSheet.flatten(getByTestId('fab-action-row-ask-ai').props.style);
    // Same literal expression the toggle itself is positioned with (see the
    // FAB.tsx doc comment) — a `measureInWindow`-derived origin previously
    // put the button's hit area somewhere other than its visual paint;
    // reusing the identical number rules that class of bug out entirely.
    expect(rowStyle.right).toBe(spacing.lg);
    expect(rowStyle.alignSelf).toBe('flex-end');
    expect(rowStyle.flexDirection).toBe('row');
  });

  it('caps the label chip and never moves the button, even for the longest current label', async () => {
    const short = action({ label: 'Ask Cashflow' });
    // Longest label among today's real fabActions call sites (Accounts'
    // "Refresh from banks" / "Import a statement" are the same length class).
    const long = action({ label: 'Refresh from banks' });

    const shortRender = await renderWithProviders(<FAB actions={[short]} source="home" />);
    await fireEvent.press(shortRender.getByLabelText('Quick actions'));
    const shortRow = StyleSheet.flatten(
      shortRender.getByTestId(`fab-action-row-${short.key}`).props.style,
    );
    const shortChip = StyleSheet.flatten(
      shortRender.getByTestId(`fab-chip-${short.key}`).props.style,
    );

    const longRender = await renderWithProviders(<FAB actions={[long]} source="home" />);
    await fireEvent.press(longRender.getByLabelText('Quick actions'));
    const longRow = StyleSheet.flatten(
      longRender.getByTestId(`fab-action-row-${long.key}`).props.style,
    );
    const longChip = StyleSheet.flatten(
      longRender.getByTestId(`fab-chip-${long.key}`).props.style,
    );

    // The row's anchor — and so the button's position, last in row order —
    // never depends on label length: a longer chip can only grow further
    // to its own left.
    expect(longRow.right).toBe(shortRow.right);
    // The cap itself is derived from the window, not the text, so it does
    // not grow with content either.
    expect(longChip.maxWidth).toBe(shortChip.maxWidth);
    expect(longChip.maxWidth).toBeGreaterThan(0);
  });

  it('gives the mini button a solid surface with a hairline border for contrast against the scrim', async () => {
    const { getByLabelText, getByTestId } = await renderWithProviders(
      <FAB actions={[action()]} source="home" />,
    );

    await fireEvent.press(getByLabelText('Quick actions'));

    const buttonStyle = StyleSheet.flatten(getByTestId('fab-action-ask-ai').props.style);
    expect(buttonStyle.backgroundColor).not.toBe('transparent');
    // Width comes from elevation(2) in dark and from this literal in light, so
    // the meaningful assertion is the TOKEN, not a number: `border` scored
    // 1.42:1 against the scrim, under the 3:1 boundary floor. That is what
    // made the fan invisible.
    expect(buttonStyle.borderWidth).toBeGreaterThanOrEqual(borderWidth.hairline);
    expect(buttonStyle.borderColor).toBe(colorsFor('light').borderStrong);

    const chipStyle = StyleSheet.flatten(getByTestId('fab-chip-ask-ai').props.style);
    expect(chipStyle.backgroundColor).not.toBe('transparent');
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
