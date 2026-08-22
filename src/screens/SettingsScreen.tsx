import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { usageAnalytics } from '@/analytics';
import {
  AppScreen,
  AppText,
  BottomSheet,
  Card,
  Divider,
  Icon,
  ListRow,
  LogoMark,
  SectionHeader,
} from '@/components';
import { appConfig, developerToolsAvailable, useFeatureFlags } from '@/config';
import { SegmentedControl } from '@/features/settings/SegmentedControl';
import { SettingSwitch } from '@/features/settings/SettingSwitch';
import type { MoreStackParamList } from '@/navigation/types';
import { triggerRefresh } from '@/hooks/useRefresh';
import { setIncludePending } from '@/data/accountsWrite';
import { authenticateLocally, biometricCapability } from '@/services/biometrics';
import {
  notificationsBlocked,
  permissionState,
  requestPermission,
} from '@/services/deviceNotifications';
import { notificationService } from '@/services/notifications';
import { summarizeMorning } from '@/services/summarize';
import { SCENARIO_IDS, SCENARIOS, type ScenarioId } from '@/mocks/scenarios';
import { useDevStore } from '@/store/devStore';
import { useFinanceStore } from '@/store/financeStore';
import { useAuthStore } from '@/store/authStore';
import { usePreferences } from '@/store/preferencesStore';
import { useTheme, type ThemeMode } from '@/theme';

const THEME_OPTIONS: readonly { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Settings — and the "More" tab itself.
 *
 * The developer section only renders outside production. It is the control
 * panel for the whole development loop: pick a scenario, break the network,
 * fire a notification, then look at Diagnostics to see exactly what happened.
 */
export const SettingsScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const [scenarioSheet, setScenarioSheet] = useState(false);

  const includePending = useFinanceStore((state) => state.snapshot?.includePending ?? false);
  const [pendingBusy, setPendingBusy] = useState(false);

  /**
   * FIN-PENDING-001, the one setting that moves every number in the app.
   *
   * Written to the SAME user document the web app reads, then a refresh — the
   * figures on screen were derived under the old policy and are wrong the
   * instant this flips, so re-deriving is part of the change, not a nicety.
   */
  const togglePending = (value: boolean) => {
    setPendingBusy(true);
    void setIncludePending(value)
      .then(() => {
        changeSetting('money.include_pending', () => undefined);
        void triggerRefresh('tap');
      })
      .finally(() => setPendingBusy(false));
  };

  // Whether iOS will actually deliver. A preference switch that says "on" while
  // the OS refuses is the same lie as a figure with no data behind it.
  const [notificationsAllowed, setNotificationsAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void permissionState().then((state) => {
      if (alive) setNotificationsAllowed(state === 'granted');
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Turning notifications ON asks iOS first.
   *
   * iOS shows its prompt only on the FIRST request ever; after that
   * `requestPermissionsAsync` returns the previous answer with no UI. So a
   * refusal here needs different words depending on whether the owner just
   * declined or declined months ago — the second case is only fixable in the
   * iOS Settings app, and saying "allow notifications" again would be useless.
   */
  const toggleNotifications = (value: boolean) => {
    if (!value) {
      changeSetting('notifications.enabled', () => setNotificationPreference('enabled', false));
      return;
    }
    void requestPermission().then(async (state) => {
      if (state === 'granted') {
        setNotificationsAllowed(true);
        changeSetting('notifications.enabled', () => setNotificationPreference('enabled', true));
        return;
      }
      setNotificationsAllowed(false);
      const blocked = await notificationsBlocked();
      Alert.alert(
        'iOS is not allowing notifications',
        blocked
          ? 'Notifications were turned off for Cashflow earlier. Turn them back on in iOS Settings → Notifications → Cashflow.'
          : 'Cashflow needs permission before it can send anything.',
      );
    });
  };

  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  // Confirmed, because the way back in is a password or a Google round-trip —
  // not something to trigger by brushing a row on the way to Appearance.
  const confirmSignOut = () =>
    Alert.alert('Sign out of Cashflow?', 'Your data stays on the server. Nothing is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          usageAnalytics.track('action.selected', 'settings', { target: 'sign-out' });
          void signOut();
        },
      },
    ]);

  const themeMode = usePreferences((state) => state.themeMode);
  const setThemeMode = usePreferences((state) => state.setThemeMode);
  const notifications = usePreferences((state) => state.notifications);
  const setNotificationPreference = usePreferences((state) => state.setNotificationPreference);
  const security = usePreferences((state) => state.security);
  const setBiometricLock = usePreferences((state) => state.setBiometricLock);
  const privacy = usePreferences((state) => state.privacy);
  const setPrivacyPreference = usePreferences((state) => state.setPrivacyPreference);

  // What this device can actually do. Resolved once — offering a Face ID toggle
  // on a phone with nothing enrolled produces a prompt that can never succeed.
  const [biometrics, setBiometrics] = useState({ available: false, label: 'Face ID' });
  useEffect(() => {
    let alive = true;
    void biometricCapability().then((capability) => {
      if (alive) setBiometrics({ available: capability.available, label: capability.label });
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggleBiometricLock = (value: boolean) => {
    // Turning it ON must prove the lock works before it is armed; turning it
    // OFF must prove the person holding the phone is allowed to. Both need the
    // prompt, and neither preference is written unless it succeeds.
    void authenticateLocally(
      value ? `Turn on ${biometrics.label} for Cashflow` : 'Turn off the Cashflow lock',
    ).then((ok) => {
      if (ok) changeSetting('security.biometric_lock', () => setBiometricLock(value));
    });
  };

  const flags = useFeatureFlags((state) => state.flags);
  const setFlag = useFeatureFlags((state) => state.setFlag);

  const dev = useDevStore();
  const snapshot = useFinanceStore((state) => state.snapshot);

  const changeSetting = (key: string, apply: () => void) => {
    usageAnalytics.track('settings.changed', 'settings', { settingKey: key });
    apply();
  };

  return (
    <AppScreen testID="screen-settings">
      <View style={{ gap: theme.spacing.xl }}>
        <View
          style={{ alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.md }}
        >
          <LogoMark size={44} showWordmark />
          <AppText variant="caption" tone="textTertiary">
            {appConfig.appVersion}
          </AppText>
        </View>

        <View>
          <SectionHeader title="Account" />
          <Card padded={false}>
            <ListRow
              title={user?.displayName ?? user?.email ?? 'Signed in'}
              {...(user?.displayName && user?.email ? { subtitle: user.email } : {})}
              footnote="The same account as the web app"
              leadingIcon="user"
            />
            <Divider inset={theme.spacing.lg} />
            <ListRow
              title="Sign out"
              subtitle="You will need your password or Google to come back"
              leadingIcon="log-out"
              leadingTone="warning"
              onPress={confirmSignOut}
              testID="row-sign-out"
            />
          </Card>
        </View>

        <View>
          <SectionHeader title="Appearance" />
          <Card padded={false}>
            <SegmentedControl
              label="Appearance"
              options={THEME_OPTIONS}
              value={themeMode}
              onChange={(mode) => changeSetting('themeMode', () => setThemeMode(mode))}
            />
          </Card>
        </View>

        <View>
          <SectionHeader
            title="Accessibility"
            caption="Text size and reduced motion follow your device settings; Cashflow adapts automatically."
          />
          <Card padded={false}>
            <ListRow
              title="Reduce motion"
              subtitle={theme.reduceMotion ? 'On, from device settings' : 'Off'}
              leadingIcon="wind"
            />
            <Divider inset={theme.spacing.huge + theme.spacing.lg} />
            <ListRow
              title="Text size"
              subtitle="Set in your device's display settings"
              leadingIcon="type"
            />
          </Card>
        </View>

        <View>
          <SectionHeader title="Notifications" />
          <Card padded={false}>
            <SettingSwitch
              label="Allow notifications"
              description={
                notificationsAllowed === false && notifications.enabled
                  ? 'iOS is blocking these — turn them on in iOS Settings'
                  : 'Cashflow will ask iOS the first time'
              }
              value={notifications.enabled && notificationsAllowed !== false}
              onValueChange={toggleNotifications}
              testID="switch-notifications"
            />
            <Divider inset={theme.spacing.lg} />
            <SettingSwitch
              label="Financial summaries"
              description="One summary after each refresh"
              value={notifications.financialSummary}
              disabled={!notifications.enabled}
              onValueChange={(value) =>
                changeSetting('notifications.summary', () =>
                  setNotificationPreference('financialSummary', value),
                )
              }
            />
            <Divider inset={theme.spacing.lg} />
            <SettingSwitch
              label="Bill reminders"
              value={notifications.bills}
              disabled={!notifications.enabled}
              onValueChange={(value) =>
                changeSetting('notifications.bills', () =>
                  setNotificationPreference('bills', value),
                )
              }
            />
            <Divider inset={theme.spacing.lg} />
            <SettingSwitch
              label="Paycheck reminders"
              value={notifications.paycheck}
              disabled={!notifications.enabled}
              onValueChange={(value) =>
                changeSetting('notifications.paycheck', () =>
                  setNotificationPreference('paycheck', value),
                )
              }
            />
            <Divider inset={theme.spacing.lg} />
            <SettingSwitch
              label="Warnings"
              description="Refresh failures and anything that needs attention"
              value={notifications.warnings}
              disabled={!notifications.enabled}
              onValueChange={(value) =>
                changeSetting('notifications.warnings', () =>
                  setNotificationPreference('warnings', value),
                )
              }
            />
          </Card>
        </View>

        <View>
          <SectionHeader
            title="Money"
            caption="Changes here move every figure in the app, on this phone and on the web."
          />
          <Card padded={false}>
            <ListRow
              title="Review unexplained credits"
              subtitle="Money Cashflow will not call income until you say so"
              leadingIcon="help-circle"
              leadingTone="warning"
              onPress={() => navigation.navigate('Review')}
              testID="row-review-credits"
            />
            <Divider inset={theme.spacing.lg} />
            <SettingSwitch
              label="Count pending transactions"
              description="Include holds your bank has not settled yet"
              value={includePending}
              disabled={pendingBusy}
              onValueChange={togglePending}
              testID="switch-include-pending"
            />
          </Card>
        </View>

        <View>
          <SectionHeader
            title="Security"
            caption={
              biometrics.available
                ? 'Your session stays signed in; the lock only covers the figures.'
                : `Set up ${biometrics.label} in iOS Settings to use a lock here.`
            }
          />
          <Card padded={false}>
            <SettingSwitch
              label={`Require ${biometrics.label}`}
              description="Asked on launch, and after 5 minutes away"
              value={security.biometricLock}
              disabled={!biometrics.available}
              onValueChange={toggleBiometricLock}
              testID="switch-biometric-lock"
            />
          </Card>
        </View>

        <View>
          <SectionHeader
            title="Privacy"
            caption="Behaviour analytics never carry balances, amounts or merchants."
          />
          <Card padded={false}>
            <SettingSwitch
              label="Usage analytics"
              description="Which screens are used, how long, where errors happen"
              value={privacy.analyticsEnabled}
              onValueChange={(value) =>
                changeSetting('privacy.analytics', () =>
                  setPrivacyPreference('analyticsEnabled', value),
                )
              }
              testID="switch-analytics"
            />
            <Divider inset={theme.spacing.lg} />
            <SettingSwitch
              label="Diagnostic logging"
              description="Kept on this device only"
              value={privacy.diagnosticLoggingEnabled}
              onValueChange={(value) =>
                changeSetting('privacy.diagnostics', () =>
                  setPrivacyPreference('diagnosticLoggingEnabled', value),
                )
              }
            />
            <Divider inset={theme.spacing.lg} />
            <ListRow
              title="What Cashflow stores"
              subtitle="Preferences on this device; balances are never written to storage"
              leadingIcon="lock"
            />
          </Card>
        </View>

        <View>
          <SectionHeader title="Application" />
          <Card padded={false}>
            <ListRow title="Version" subtitle={appConfig.appVersion} leadingIcon="info" />
          </Card>
        </View>

        {developerToolsAvailable ? (
          <View>
            <SectionHeader title="Developer" caption="Not present in a production build." />

            <Card padded={false}>
              <ListRow
                title="Scenario"
                subtitle={SCENARIOS[dev.scenario].label}
                footnote={SCENARIOS[dev.scenario].description}
                leadingIcon="layers"
                leadingTone="accent"
                onPress={() => setScenarioSheet(true)}
                testID="row-scenario"
              />
              <Divider inset={theme.spacing.huge + theme.spacing.lg} />
              <SettingSwitch
                label="Simulate request failure"
                value={dev.simulateFailure}
                onValueChange={dev.setSimulateFailure}
                testID="switch-simulate-failure"
              />
              <Divider inset={theme.spacing.lg} />
              <SettingSwitch
                label="Simulate offline"
                value={dev.simulateOffline}
                onValueChange={dev.setSimulateOffline}
              />
              <Divider inset={theme.spacing.lg} />
              <SettingSwitch
                label="Simulate slow network"
                description="Adds ~2.6s to every request"
                value={dev.simulateSlowNetwork}
                onValueChange={dev.setSimulateSlowNetwork}
              />
            </Card>

            <View style={{ height: theme.spacing.md }} />

            <Card padded={false}>
              <SettingSwitch
                label="Debug logging"
                value={flags.ENABLE_DEBUG_LOGGING}
                onValueChange={(value) => setFlag('ENABLE_DEBUG_LOGGING', value)}
              />
              <Divider inset={theme.spacing.lg} />
              <SettingSwitch
                label="Interaction analytics"
                value={flags.ENABLE_USER_ANALYTICS}
                onValueChange={(value) => setFlag('ENABLE_USER_ANALYTICS', value)}
              />
              <Divider inset={theme.spacing.lg} />
              <SettingSwitch
                label="System audit"
                value={flags.ENABLE_SYSTEM_AUDIT}
                onValueChange={(value) => setFlag('ENABLE_SYSTEM_AUDIT', value)}
              />
              <Divider inset={theme.spacing.lg} />
              <SettingSwitch
                label="Mock API"
                description="Off points the app at the real (not yet existing) backend"
                value={flags.ENABLE_MOCK_API}
                onValueChange={(value) => setFlag('ENABLE_MOCK_API', value)}
              />
            </Card>

            <View style={{ height: theme.spacing.md }} />

            <Card padded={false}>
              <ListRow
                title="Trigger a refresh"
                leadingIcon="refresh-cw"
                leadingTone="accent"
                onPress={() => triggerRefresh('tap')}
              />
              <Divider inset={theme.spacing.huge + theme.spacing.lg} />
              <ListRow
                title="Trigger a morning summary"
                subtitle="Writes one notification using the current snapshot"
                leadingIcon="bell"
                leadingTone="accent"
                onPress={() => {
                  if (!snapshot) return;
                  notificationService.present(
                    summarizeMorning({ snapshot, changes: [], now: Date.now() }),
                    { source: 'developer' },
                  );
                }}
                testID="row-trigger-notification"
              />
              <Divider inset={theme.spacing.huge + theme.spacing.lg} />
              <ListRow
                title="Diagnostics"
                subtitle="Logs, interaction events, system audit, API calls"
                leadingIcon="activity"
                leadingTone="accent"
                onPress={() => navigation.navigate('Diagnostics')}
                testID="row-diagnostics"
              />
            </Card>
          </View>
        ) : null}

        <View
          style={{ alignItems: 'center', paddingVertical: theme.spacing.xl, gap: theme.spacing.xs }}
        >
          <Icon name="shield" size={16} />
          <AppText variant="caption" tone="textTertiary" align="center">
            Cashflow keeps your figures on your device and your accounts out of its logs.
          </AppText>
        </View>
      </View>

      <BottomSheet
        visible={scenarioSheet}
        onClose={() => setScenarioSheet(false)}
        title="Development scenario"
      >
        {SCENARIO_IDS.map((id: ScenarioId, index) => (
          <View key={id}>
            {index > 0 ? <Divider inset={theme.spacing.lg} /> : null}
            <ListRow
              title={SCENARIOS[id].label}
              subtitle={SCENARIOS[id].description}
              leadingIcon={id === dev.scenario ? 'check-circle' : 'circle'}
              leadingTone={id === dev.scenario ? 'accent' : 'neutral'}
              onPress={() => {
                dev.setScenario(id);
                setScenarioSheet(false);
              }}
              testID={`scenario-${id}`}
            />
          </View>
        ))}
      </BottomSheet>
    </AppScreen>
  );
};
