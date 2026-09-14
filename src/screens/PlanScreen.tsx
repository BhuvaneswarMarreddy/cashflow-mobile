import { View } from 'react-native';

import {
  AmountText,
  AppScreen,
  AppText,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  MetricCard,
  ProgressBar,
  SectionHeader,
  SkeletonCard,
  StatusBanner,
} from '@/components';
import { triggerRefresh, usePullToRefresh } from '@/hooks/useRefresh';
import { useFinanceStore } from '@/store/financeStore';
import { useTheme } from '@/theme';
import { daysUntil, formatCurrency, formatDate, formatDueIn } from '@/utils/format';

/**
 * Where the money is going next.
 *
 * The product line this screen exists to serve: *don't only tell the user where
 * their money went — help them understand where it should go next.* Everything
 * here is forward-looking; the backward-looking view is Activity.
 */
export const PlanScreen = () => {
  const theme = useTheme();
  const { refreshing, onRefresh } = usePullToRefresh();

  const snapshot = useFinanceStore((state) => state.snapshot);
  const upcoming = useFinanceStore((state) => state.upcoming);
  const goals = useFinanceStore((state) => state.goals);
  const status = useFinanceStore((state) => state.status);
  const hasLoadedOnce = useFinanceStore((state) => state.hasLoadedOnce);
  const lastError = useFinanceStore((state) => state.lastError);

  if (!hasLoadedOnce && status === 'refreshing') {
    return (
      <AppScreen testID="screen-plan">
        <View style={{ gap: theme.spacing.lg }}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
        </View>
      </AppScreen>
    );
  }

  // A failed load must NOT fall through to the body. Every empty branch below
  // is phrased as a finding — "$0 due in the next 45 days", "No paycheck
  // detected", "Nothing scheduled" — so a total failure rendered as the single
  // most reassuring screen in the app: no bills, no paycheck, nothing
  // committed. StatusBanner does not cover it either: a rejected homeSnapshot
  // normalizes to 'unexpected', and the banner only reacts to 'network' and
  // 'service-unavailable'.
  if (lastError && !snapshot) {
    return (
      <AppScreen testID="screen-plan">
        <ErrorState error={lastError} onRetry={() => triggerRefresh('tap')} />
      </AppScreen>
    );
  }

  const paycheck = snapshot?.nextPaycheck ?? null;

  return (
    <AppScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      banner={<StatusBanner />}
      testID="screen-plan"
    >
      <View style={{ gap: theme.spacing.xl }}>
        {/* Not a "safe to spend" figure — the system does not compute one, and
            this client will not invent one. This is plain arithmetic on two
            numbers the snapshot already carries, and it says so. */}
        <MetricCard
          label="Left after commitments"
          size="hero"
          cents={snapshot ? snapshot.cashCents - snapshot.upcomingTotalCents : null}
          unavailableReason="Refresh to work this out."
          tone={
            snapshot && snapshot.cashCents - snapshot.upcomingTotalCents < 0
              ? 'negative'
              : 'neutral'
          }
          footnote={
            snapshot
              ? `Your cash, less the ${formatCurrency(snapshot.upcomingTotalCents)} due in the next 45 days`
              : undefined
          }
        />

        <View>
          <SectionHeader
            title="Next paycheck"
            caption={
              paycheck?.confidence === 'estimated'
                ? 'Estimated from your pay history — Cashflow has not confirmed this date.'
                : undefined
            }
          />
          {paycheck ? (
            <Card padded={false}>
              <ListRow
                title={formatCurrency(paycheck.amountCents)}
                subtitle={`${paycheck.source} · ${formatDate(paycheck.expectedDate, 'weekday')}`}
                footnote={formatDueIn(paycheck.expectedDate)}
                leadingIcon="arrow-down-circle"
                leadingTone="success"
              />
            </Card>
          ) : (
            <Card>
              <EmptyState
                kind="no-paycheck"
                icon="calendar"
                title="No paycheck detected"
                body="Cashflow needs a few pay cycles before it can predict the next one."
                compact
              />
            </Card>
          )}
        </View>

        <View>
          <SectionHeader
            title="Upcoming payments"
            caption={
              upcoming.length > 0
                ? `${formatCurrency(upcoming.reduce((total, item) => total + item.amountCents, 0))} committed`
                : undefined
            }
          />
          {upcoming.length === 0 ? (
            <Card>
              <EmptyState
                kind="no-upcoming"
                icon="calendar"
                title="Nothing scheduled"
                body="Bills and card payments Cashflow knows about will appear here."
                compact
                actionLabel="Refresh"
                onAction={() => triggerRefresh('tap')}
              />
            </Card>
          ) : (
            <Card padded={false}>
              {upcoming.map((payment, index) => {
                const days = daysUntil(payment.dueDate);
                const urgent = !payment.autopay && days <= 3;
                return (
                  <View key={payment.id}>
                    {index > 0 ? <Divider inset={theme.spacing.huge + theme.spacing.lg} /> : null}
                    <ListRow
                      title={payment.name}
                      subtitle={`${formatDate(payment.dueDate, 'short')} · ${formatDueIn(payment.dueDate)}`}
                      footnote={payment.autopay ? 'Autopay is on' : 'You need to pay this'}
                      leadingIcon={urgent ? 'alert-triangle' : payment.autopay ? 'repeat' : 'clock'}
                      leadingTone={urgent ? 'warning' : 'neutral'}
                      trailing={<AmountText cents={payment.amountCents} variant="amountSmall" />}
                    />
                  </View>
                );
              })}
            </Card>
          )}
        </View>

        <View>
          <SectionHeader title="Savings goals" />
          {goals.length === 0 ? (
            <Card>
              <EmptyState
                kind="no-goals"
                icon="target"
                title="No goals yet"
                body="A goal gives Cashflow something to aim your spare cash at."
                compact
              />
            </Card>
          ) : (
            <View style={{ gap: theme.spacing.md }}>
              {goals.map((goal) => {
                const progress = goal.targetCents > 0 ? goal.savedCents / goal.targetCents : 0;
                const complete = progress >= 1;
                return (
                  <Card key={goal.id} style={{ gap: theme.spacing.sm }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: theme.spacing.md,
                      }}
                    >
                      <AppText variant="bodyStrong" style={{ flex: 1 }}>
                        {goal.name}
                      </AppText>
                      <AmountText cents={goal.savedCents} variant="amountSmall" />
                    </View>

                    <ProgressBar
                      progress={progress}
                      label={goal.name}
                      tone={complete ? 'positive' : 'accent'}
                    />

                    <AppText variant="caption" tone={complete ? 'positive' : 'textTertiary'}>
                      {complete
                        ? 'Goal reached'
                        : `${formatCurrency(goal.targetCents - goal.savedCents)} to go of ${formatCurrency(goal.targetCents)}`}
                      {goal.targetDate && !complete
                        ? ` · by ${formatDate(goal.targetDate, 'short')}`
                        : ''}
                    </AppText>
                  </Card>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </AppScreen>
  );
};
