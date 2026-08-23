import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';

import { usageAnalytics } from '@/analytics';
import {
  AppScreen,
  AppText,
  Card,
  EmptyState,
  ErrorState,
  LastUpdated,
  ListRow,
  MetricCard,
  SectionHeader,
  SkeletonCard,
  StatusBanner,
  type FabAction,
} from '@/components';
import { ChangeList } from '@/features/home/ChangeList';
import { RunwayHero } from '@/features/home/RunwayHero';
import { usePullToRefresh, triggerRefresh } from '@/hooks/useRefresh';
import type { RootStackParamList } from '@/navigation/types';
import { useFinanceStore } from '@/store/financeStore';
import { useTheme } from '@/theme';
import { formatCurrency, formatDate, daysUntil } from '@/utils/format';

const greeting = (now: Date): string => {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

/**
 * The daily answer screen.
 *
 * Ordered by the question it answers, not by what is easiest to compute:
 * *how long does my money last* is the hero, everything else is supporting
 * detail, and "what changed" sits above the fold because it is the reason to
 * open the app twice in one day.
 */
export const HomeScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { refreshing, onRefresh } = usePullToRefresh();

  const snapshot = useFinanceStore((state) => state.snapshot);
  const previous = useFinanceStore((state) => state.previousSnapshot);
  const changes = useFinanceStore((state) => state.changes);
  const status = useFinanceStore((state) => state.status);
  const lastError = useFinanceStore((state) => state.lastError);
  const lastRefreshedAt = useFinanceStore((state) => state.lastRefreshedAt);
  const hasLoadedOnce = useFinanceStore((state) => state.hasLoadedOnce);
  const accounts = useFinanceStore((state) => state.accounts);
  // Distinguishes "no baseline yet" from "nothing changed" — see ChangeList.
  const previousSnapshot = useFinanceStore((state) => state.previousSnapshot);

  const fabActions: FabAction[] = [
    {
      key: 'refresh',
      label: 'Refresh now',
      description: 'Pull the latest balances and activity',
      icon: 'refresh-cw',
      onPress: () => triggerRefresh('tap'),
    },
    // "Record cash" lived here with an onPress that only fired analytics —
    // a button that looked live and did nothing. Removed rather than left as a
    // false promise: chat has no verb that can create a transaction either, so
    // pointing it at Ask Cashflow would just be a different dead end.
    // Real cash entry is filed as its own piece of work.
  ];

  const delta = (current: number | undefined, before: number | undefined): number | null =>
    current === undefined || before === undefined ? null : current - before;

  return (
    <AppScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      fabActions={fabActions}
      fabSource="home"
      banner={<StatusBanner />}
      testID="screen-home"
    >
      {!hasLoadedOnce && status === 'refreshing' ? (
        <View style={{ gap: theme.spacing.lg }}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </View>
      ) : snapshot === null ? (
        lastError ? (
          <ErrorState
            error={{ ...lastError, category: lastError.category }}
            onRetry={() => triggerRefresh('tap')}
          />
        ) : (
          <EmptyState
            kind="no-snapshot"
            icon="pie-chart"
            title="Nothing to show yet"
            body="Connect an account and Cashflow will work out where you stand."
            // The button used to say "Refresh", which re-fetched the nothing
            // that was already there — it contradicted the sentence above it
            // and left a fresh install staring at a wall of $0.00 with no way
            // forward. Send them where the copy already points.
            actionLabel="Add an account"
            onAction={() =>
              navigation.navigate('Tabs', {
                screen: 'AccountsTab',
                params: { screen: 'AddAccount' },
              })
            }
          />
        )
      ) : (
        <View style={{ gap: theme.spacing.xl }}>
          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="secondary" tone="textSecondary">
              {greeting(new Date())}
            </AppText>
            <LastUpdated
              at={lastRefreshedAt}
              refreshing={refreshing}
              partial={status === 'partialSuccess'}
            />
          </View>

          <RunwayHero
            runway={snapshot.runway}
            avgMonthlySpendCents={snapshot.avgMonthlySpendCents}
            isAssumedSpend={snapshot.assumedMonthlySpendCents !== null}
            onPress={() => {
              usageAnalytics.track('card.opened', 'home', { target: 'runway' });
              navigation.navigate('Tabs', { screen: 'Plan' });
            }}
            testID="metric-runway"
          />

          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <MetricCard
                label="Cash"
                cents={snapshot.cashCents}
                icon="dollar-sign"
                deltaCents={delta(snapshot.cashCents, previous?.cashCents)}
                onPress={() => {
                  usageAnalytics.track('card.opened', 'home', { target: 'cash' });
                  navigation.navigate('Tabs', { screen: 'AccountsTab' });
                }}
                testID="metric-cash"
              />
            </View>
            <View style={{ flex: 1 }}>
              {/* Locked, not "savings": the model has no savings-account type,
                  and the number that actually constrains a spending decision is
                  the non-negotiable monthly floor. */}
              <MetricCard
                label="Locked"
                cents={snapshot.lockedMonthlyCents}
                icon="lock"
                footnote="a month, non-negotiable"
                onPress={() => {
                  usageAnalytics.track('card.opened', 'home', { target: 'locked' });
                  navigation.navigate('Tabs', { screen: 'Plan' });
                }}
                testID="metric-locked"
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <MetricCard
                label="Credit cards"
                cents={snapshot.creditCardBalanceCents}
                icon="credit-card"
                footnote="owed"
                deltaCents={delta(
                  snapshot.creditCardBalanceCents,
                  previous?.creditCardBalanceCents,
                )}
                onPress={() => {
                  usageAnalytics.track('card.opened', 'home', { target: 'cards' });
                  navigation.navigate('Tabs', { screen: 'AccountsTab' });
                }}
                testID="metric-cards"
              />
            </View>
            <View style={{ flex: 1 }}>
              <MetricCard
                label="Upcoming"
                cents={snapshot.upcomingTotalCents}
                icon="calendar"
                footnote="committed"
                onPress={() => {
                  usageAnalytics.track('card.opened', 'home', { target: 'upcoming' });
                  navigation.navigate('Tabs', { screen: 'Plan' });
                }}
                testID="metric-upcoming"
              />
            </View>
          </View>

          {snapshot.nextPaycheck ? (
            <Card padded={false}>
              <ListRow
                title={`${formatCurrency(snapshot.nextPaycheck.amountCents)} from ${snapshot.nextPaycheck.source}`}
                subtitle={`Expected ${formatDate(snapshot.nextPaycheck.expectedDate, 'weekday')}`}
                footnote={
                  snapshot.nextPaycheck.confidence === 'estimated'
                    ? 'Estimated from your pay history, not confirmed'
                    : `Confirmed · ${daysUntil(snapshot.nextPaycheck.expectedDate)} days away`
                }
                leadingIcon="arrow-down-circle"
                leadingTone="success"
                onPress={() => {
                  usageAnalytics.track('card.opened', 'home', { target: 'paycheck' });
                  navigation.navigate('Tabs', { screen: 'Plan' });
                }}
              />
            </Card>
          ) : null}

          <View>
            <SectionHeader
              title={previousSnapshot ? 'Since your last refresh' : 'Recent changes'}
              {...(changes.length > 0
                ? {
                    actionLabel: 'Activity',
                    onAction: () => navigation.navigate('Tabs', { screen: 'Activity' }),
                  }
                : {})}
            />
            <ChangeList changes={changes} hasBaseline={previousSnapshot !== null} />
          </View>

          {accounts.some((account) => account.status !== 'ok') ? (
            <View>
              <SectionHeader title="Needs attention" />
              <Card padded={false}>
                {accounts
                  .filter((account) => account.status !== 'ok')
                  .map((account) => (
                    <ListRow
                      key={account.id}
                      title={account.name}
                      subtitle={
                        account.status === 'error'
                          ? "Cashflow couldn't reach this account"
                          : 'Balance not confirmed by the bank — no opening figure on record'
                      }
                      leadingIcon="alert-triangle"
                      leadingTone="warning"
                      onPress={() =>
                        navigation.navigate('Tabs', {
                          screen: 'AccountsTab',
                          params: { screen: 'AccountDetail', params: { accountId: account.id } },
                        })
                      }
                    />
                  ))}
              </Card>
            </View>
          ) : null}
        </View>
      )}
    </AppScreen>
  );
};
