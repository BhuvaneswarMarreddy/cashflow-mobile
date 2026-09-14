import { fireEvent, renderWithProviders } from '@/test/render';

import { ListRow } from '../ListRow';

/**
 * Task 8 adds `onLongPress` on top of the existing `onPress`-only Pressable
 * rule. The "no handlers" case is pinned here because it is the row every
 * other screen already relies on (Accounts, Settings, …) — it must not
 * silently become pressable just because this file exists.
 */
describe('ListRow', () => {
  it('is not pressable when neither onPress nor onLongPress is given', async () => {
    const { queryByRole } = await renderWithProviders(<ListRow title="Everyday Checking" />);
    expect(queryByRole('button')).toBeNull();
  });

  it('becomes pressable and fires onLongPress when only onLongPress is given', async () => {
    const onLongPress = jest.fn();
    const { getByRole } = await renderWithProviders(
      <ListRow title="Starbucks" onLongPress={onLongPress} />,
    );

    const row = getByRole('button');
    await fireEvent(row, 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('adds a discoverable hint when long-press is the only affordance', async () => {
    const { getByRole } = await renderWithProviders(
      <ListRow title="Starbucks" onLongPress={jest.fn()} />,
    );
    expect(getByRole('button').props.accessibilityHint).toBe('Long press for options');
  });

  it('does not override an explicit accessibilityHint', async () => {
    const { getByRole } = await renderWithProviders(
      <ListRow title="Starbucks" onLongPress={jest.fn()} accessibilityHint="Custom hint" />,
    );
    expect(getByRole('button').props.accessibilityHint).toBe('Custom hint');
  });

  it('still fires onPress when both handlers are present', async () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const { getByRole } = await renderWithProviders(
      <ListRow title="Starbucks" onPress={onPress} onLongPress={onLongPress} />,
    );

    await fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
