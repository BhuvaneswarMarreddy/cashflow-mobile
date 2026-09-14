import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { usageAnalytics } from '@/analytics';
import { Icon, type IconName } from '@/components';
import { developerToolsAvailable } from '@/config';
import { AccountDetailScreen } from '@/screens/AccountDetailScreen';
import { AddAccountScreen } from '@/screens/AddAccountScreen';
import { ImportCsvScreen } from '@/screens/ImportCsvScreen';
import { ReviewScreen } from '@/screens/ReviewScreen';
import { AccountsScreen } from '@/screens/AccountsScreen';
import { ActivityScreen } from '@/screens/ActivityScreen';
import { DiagnosticsScreen } from '@/screens/DiagnosticsScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { PlanScreen } from '@/screens/PlanScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useFinanceStore } from '@/store/financeStore';
import { useTheme } from '@/theme';

import { HeaderLogo, NotificationsButton } from './HeaderActions';
import type { AccountsStackParamList, MoreStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const AccountsStack = createNativeStackNavigator<AccountsStackParamList>();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

/**
 * Shared header styling, so a stack header and a tab header look identical.
 *
 * Left unannotated on purpose: stack and tab navigators have different (and
 * incompatible) option types, and only the inferred literal is assignable to
 * both.
 */
const useChromeOptions = () => {
  const theme = useTheme();
  return {
    headerStyle: { backgroundColor: theme.colors.chrome },
    headerTintColor: theme.colors.textPrimary,
    headerTitleStyle: { ...theme.typography.bodyStrong, color: theme.colors.textPrimary },
    headerShadowVisible: false,
  };
};

const useStackOptions = (): NativeStackNavigationOptions => {
  const theme = useTheme();
  return { ...useChromeOptions(), contentStyle: { backgroundColor: theme.colors.background } };
};

const AccountsNavigator = () => {
  const headerOptions = useStackOptions();
  return (
    <AccountsStack.Navigator screenOptions={headerOptions}>
      <AccountsStack.Screen
        name="Accounts"
        component={AccountsScreen}
        options={{ title: 'Accounts', headerRight: () => <NotificationsButton /> }}
      />
      <AccountsStack.Screen
        name="AccountDetail"
        component={AccountDetailScreen}
        options={({ route }) => ({
          // Read once at push time; the header should not re-render on every
          // store update just to keep a title that will not change.
          title:
            useFinanceStore.getState().accounts.find((a) => a.id === route.params.accountId)
              ?.name ?? 'Account',
        })}
      />
      <AccountsStack.Screen
        name="AddAccount"
        component={AddAccountScreen}
        options={{ title: 'Add account', presentation: 'modal' }}
      />
      <AccountsStack.Screen
        name="ImportCsv"
        component={ImportCsvScreen}
        options={{ title: 'Import statement', presentation: 'modal' }}
      />
    </AccountsStack.Navigator>
  );
};

const MoreNavigator = () => {
  const headerOptions = useStackOptions();
  return (
    <MoreStack.Navigator screenOptions={headerOptions}>
      <MoreStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'More' }} />
      {developerToolsAvailable ? (
        <MoreStack.Screen
          name="Diagnostics"
          component={DiagnosticsScreen}
          options={{ title: 'Diagnostics' }}
        />
      ) : null}
      {/* Outside the developer gate: reviewing credits is the product, not a
          diagnostic. */}
      <MoreStack.Screen
        name="Review"
        component={ReviewScreen}
        options={{ title: 'Review credits' }}
      />
    </MoreStack.Navigator>
  );
};

const TAB_ICON: Record<keyof TabParamList, IconName> = {
  Home: 'home',
  AccountsTab: 'credit-card',
  Activity: 'list',
  Plan: 'compass',
  MoreTab: 'more-horizontal',
};

/**
 * Glass tab bar background.
 *
 * `tabBarBackground` renders behind the bar's content, filling whatever the
 * bar's own layout occupies — the blur, plus a translucent chrome tint on top
 * so text and the gold active icon keep their contrast over whatever content
 * is scrolling underneath.
 */
const TabBarBackground = () => {
  const theme = useTheme();
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        tint={theme.scheme === 'dark' ? 'dark' : 'light'}
        intensity={theme.scheme === 'dark' ? 40 : 60}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.chromeGlass }]} />
    </View>
  );
};

/** Springs the active tab's icon up to draw the eye, without reanimated. */
const TabIcon = ({
  name,
  size,
  color,
  focused,
}: {
  name: IconName;
  size: number;
  color: string;
  focused: boolean;
}) => {
  const theme = useTheme();
  const [scale] = useState(() => new Animated.Value(focused ? 1.2 : 1));

  useEffect(() => {
    const toValue = focused ? 1.2 : 1;
    if (theme.reduceMotion) {
      scale.setValue(toValue);
      return;
    }
    Animated.spring(scale, {
      toValue,
      friction: 6,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, [focused, scale, theme.reduceMotion]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Icon name={name} size={size} color={color} />
    </Animated.View>
  );
};

export const TabNavigator = () => {
  const theme = useTheme();
  const chromeOptions = useChromeOptions();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...chromeOptions,
        // 'shift' is the v7 built-in screen transition — no hand-rolled
        // Animated wiring needed for switching tabs.
        animation: 'shift',
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        // Absolute so the glass bar floats over content instead of reserving
        // its own opaque strip; screens add matching bottom padding via
        // useBottomTabBarHeight (see AppScreen, TransactionsList, FAB).
        tabBarStyle: {
          position: 'absolute',
          borderTopColor: theme.colors.borderStrong,
        },
        tabBarBackground: () => <TabBarBackground />,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarButtonTestID: `tab-${route.name}`,
        tabBarIcon: ({ color, size, focused }) => (
          <TabIcon name={TAB_ICON[route.name]} size={size - 2} color={color} focused={focused} />
        ),
      })}
      screenListeners={{
        tabPress: (event) => {
          const target = event.target?.split('-')[0];
          if (target) usageAnalytics.track('tab.selected', 'system', { target });
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Home',
          headerTitle: () => <HeaderLogo />,
          headerRight: () => <NotificationsButton />,
        }}
      />
      <Tab.Screen
        name="AccountsTab"
        component={AccountsNavigator}
        options={{ title: 'Accounts', headerShown: false }}
      />
      <Tab.Screen
        name="Activity"
        component={ActivityScreen}
        options={{ title: 'Activity', headerRight: () => <NotificationsButton /> }}
      />
      <Tab.Screen
        name="Plan"
        component={PlanScreen}
        options={{ title: 'Plan', headerRight: () => <NotificationsButton /> }}
      />
      <Tab.Screen
        name="MoreTab"
        component={MoreNavigator}
        options={{ title: 'More', headerShown: false }}
      />
    </Tab.Navigator>
  );
};
