import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { usageAnalytics } from '@/analytics';
import { fireEvent, renderWithProviders } from '@/test/render';
import { resetStores } from '@/test/stores';

import { ReviewScreen } from '../ReviewScreen';

const Stack = createNativeStackNavigator();

const Harness = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Review" component={ReviewScreen} />
  </Stack.Navigator>
);

const renderScreen = () => renderWithProviders(<Harness />, { withNavigation: true });

beforeEach(() => {
  resetStores();
});

/**
 * Review rendered through `AppScreen` without a `fabSource` for a while — its
 * FAB events were silently attributed to "home" (AppScreen's default), on
 * every one of its four `AppScreen` usages (loading/error/empty/queue). See
 * fab-report.md FIX 2.
 */
describe('ReviewScreen', () => {
  it('tags its FAB events with the more source', async () => {
    const spy = jest.spyOn(usageAnalytics, 'track');
    const { getByLabelText } = await renderScreen();

    await fireEvent.press(getByLabelText('Quick actions'));

    expect(spy).toHaveBeenCalledWith(
      'fab.selected',
      'more',
      expect.objectContaining({ target: 'open-menu' }),
    );
    spy.mockRestore();
  });
});
