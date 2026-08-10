import {
  NavigationContainer,
  createNavigationContainerRef,
  type NavigationState,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { usageAnalytics } from '@/analytics';
import { loggerFor } from '@/logging';
import { NotificationsScreen } from '@/screens/NotificationsScreen';
import { useTheme } from '@/theme';

import { toNavigationTheme } from './navigationTheme';
import { sourceForRoute } from './screenTracking';
import { TabNavigator } from './TabNavigator';
import type { RootStackParamList } from './types';

const Root = createNativeStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const log = loggerFor('navigation');

/** One place that turns navigation state into a screen-view event. */
const recordScreen = (state: NavigationState | undefined): void => {
  if (!state) return;
  const route = navigationRef.getCurrentRoute();
  if (!route) return;
  usageAnalytics.screenViewed(route.name, sourceForRoute(route.name));
  log.debug('navigation.screen_changed', { screen: route.name });
};

export const RootNavigator = () => {
  const theme = useTheme();

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={toNavigationTheme(theme)}
      onReady={() => recordScreen(navigationRef.getRootState())}
      onStateChange={recordScreen}
    >
      <Root.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.chrome },
          headerTintColor: theme.colors.textPrimary,
          headerTitleStyle: { ...theme.typography.bodyStrong, color: theme.colors.textPrimary },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Root.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
        <Root.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: 'Notifications', presentation: 'card' }}
        />
      </Root.Navigator>
    </NavigationContainer>
  );
};
