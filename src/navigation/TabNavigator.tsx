import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

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

/** Shared with the active pill below, so both settle in the same beat. */
const TAB_SPRING = { friction: 6, tension: 60 } as const;

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
    Animated.spring(scale, { toValue, useNativeDriver: true, ...TAB_SPRING }).start();
  }, [focused, scale, theme.reduceMotion]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Icon name={name} size={size} color={color} />
    </Animated.View>
  );
};

/**
 * Highlight pill behind the focused tab's icon+label — the Camera app's
 * "PHOTO" mode pill, translated to a vertical icon-over-label tab.
 *
 * A custom `tabBarButton` rather than a custom `tabBarIcon`/`tabBarLabel`:
 * the pill has to sit behind *both*, and those two are rendered as separate
 * elements by the default item — only the button wraps them together. Still
 * the library's own `PlatformPressable` underneath, so press feedback,
 * ripple, and accessibility stay exactly what react-navigation ships.
 *
 * Sized off a real `onLayout` measurement of the icon+label, not a guess —
 * "Home" and "Accounts" need different pill widths, and a fixed size would
 * either clip the long labels or float loose around the short ones. The pill
 * itself is `position: absolute` behind that measured content, so it never
 * touches the row's own flex layout — neighbouring tabs cannot shift.
 */
const TabBarButton = ({ children, style, ...props }: BottomTabBarButtonProps) => {
  const theme = useTheme();
  const focused = props['aria-selected'] === true;
  const [content, setContent] = useState({ width: 0, height: 0 });
  const [progress] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    const toValue = focused ? 1 : 0;
    if (theme.reduceMotion) {
      progress.setValue(toValue);
      return;
    }
    Animated.spring(progress, { toValue, useNativeDriver: true, ...TAB_SPRING }).start();
  }, [focused, progress, theme.reduceMotion]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContent({ width, height });
  };

  return (
    <PlatformPressable {...props} style={style}>
      <View onLayout={onLayout} style={{ alignItems: 'center' }}>
        {content.width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -theme.spacing.xs,
              left: -theme.spacing.md,
              width: content.width + theme.spacing.md * 2,
              height: content.height + theme.spacing.xs * 2,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.tabPill,
              opacity: progress,
              transform: [
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
              ],
            }}
          />
        ) : null}
        {children}
      </View>
    </PlatformPressable>
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
          borderTopColor: theme.colors.border,
        },
        tabBarBackground: () => <TabBarBackground />,
        tabBarButton: (props) => <TabBarButton {...props} />,
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
