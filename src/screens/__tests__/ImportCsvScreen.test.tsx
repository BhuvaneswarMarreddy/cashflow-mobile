import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { usageAnalytics } from '@/analytics';
import { fireEvent, renderWithProviders } from '@/test/render';
import { resetStores } from '@/test/stores';

import { ImportCsvScreen } from '../ImportCsvScreen';

const Stack = createNativeStackNavigator();

const Harness = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ImportCsv" component={ImportCsvScreen} />
  </Stack.Navigator>
);

const renderScreen = () => renderWithProviders(<Harness />, { withNavigation: true });

beforeEach(() => {
  resetStores();
});

/**
 * ImportCsv rendered through `AppScreen` without a `fabSource` for a while —
 * its FAB events were silently attributed to "home" (AppScreen's default).
 * See fab-report.md FIX 2.
 */
describe('ImportCsvScreen', () => {
  it('tags its FAB events with the accounts source', async () => {
    const spy = jest.spyOn(usageAnalytics, 'track');
    const { getByLabelText } = await renderScreen();

    await fireEvent.press(getByLabelText('Quick actions'));

    expect(spy).toHaveBeenCalledWith(
      'fab.selected',
      'accounts',
      expect.objectContaining({ target: 'open-menu' }),
    );
    spy.mockRestore();
  });
});
