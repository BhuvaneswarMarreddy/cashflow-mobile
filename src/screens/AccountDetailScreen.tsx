import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import { View } from 'react-native';

import {
  AmountText,
  AppScreen,
  AppText,
  Card,
  Divider,
  EmptyState,
  LastUpdated,
  ProgressBar,
  SectionHeader,
  StatusChip,
  accountKindLabel,
  type FabAction,
} from '@/components';
import { TransactionRow } from '@/features/activity/TransactionRow';
import { triggerRefresh, usePullToRefresh } from '@/hooks/useRefresh';
import type { AccountsStackParamList } from '@/navigation/types';
import { useFinanceStore } from '@/store/financeStore';
import { useTheme } from '@/theme';
import { formatCurrency, formatMask, formatRelativeTime } from '@/utils/format';
import { isLiability } from '@/utils/money';

export const AccountDetailScreen = () => {
  const theme = useTheme();
  const route = useRoute<RouteProp<AccountsStackParamList, 'AccountDetail'>>();
  const { refreshing, onRefresh } = usePullToRefresh();

  const account = useFinanceStore((state) =>
    state.accounts.find((item) => item.id === route.params.accountId),
  );
  const transactions = useFinanceStore((state) => state.transactions);
  const lastBankSyncAt = useFinanceStore((state) => state.snapshot?.lastBankSyncAt ?? null);

  if (!account) {
    return (
      <AppScreen testID="screen-account-detail">
        <EmptyState
          kind="account-missing"
          icon="help-circle"
          title="Account not found"
          body="This account is no longer in your latest refresh."
          actionLabel="Refresh"
          onAction={() => triggerRefresh('tap')}
        />
      </AppScreen>
    );
  }

  const owed = isLiability(account.kind);
  const recent = transactions.filter((item) => item.accountId === account.id).slice(0, 8);
  const utilisation =
    account.creditLimitCents && account.creditLimitCents > 0
      ? account.balanceCents / account.creditLimitCents
      : null;

  const fabActions: FabAction[] = [
    {
      key: 'refresh-account',
      label: 'Refresh',
      icon: 'refresh-cw',
      onPress: () => triggerRefresh('tap'),
    },
  ];

  return (
    <AppScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      fabActions={fabActions}
      fabSource="account-detail"
      testID="screen-account-detail"
    >
      <View style={{ gap: theme.spacing.xl }}>
        <Card>
          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="sectionHeading" tone="textTertiary">
              {owed ? 'Balance owed' : 'Current balance'}
            </AppText>
            <AmountText cents={account.balanceCents} variant="amount" tone="neutral" precise />
            <AppText variant="secondary" tone="textSecondary">
              {account.institution} · {accountKindLabel[account.kind]} · {formatMask(account.mask)}
            </AppText>

            <View
              style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}
            >
              {account.status === 'ok' ? (
                <StatusChip label="Synced" tone="success" icon="check" />
              ) : account.status === 'stale' ? (
                <StatusChip label="Out of date" tone="warning" icon="clock" />
              ) : (
                <StatusChip label="Sync failed" tone="error" icon="alert-triangle" />
              )}
            </View>

            <View style={{ marginTop: theme.spacing.sm }}>
              <LastUpdated at={lastBankSyncAt} refreshing={refreshing} />
            </View>
          </View>
        </Card>

        <View>
          <SectionHeader title="Details" />
          <Card padded={false}>
            <DetailRow
              label={owed ? 'Available credit' : 'Available'}
              value={
                account.availableCents === null
                  ? 'Not reported'
                  : formatCurrency(account.availableCents, { whole: false })
              }
            />
            {account.creditLimitCents !== null ? (
              <>
                <Divider inset={theme.spacing.lg} />
                <DetailRow
                  label="Credit limit"
                  value={formatCurrency(account.creditLimitCents, { whole: false })}
                />
              </>
            ) : null}
            <Divider inset={theme.spacing.lg} />
            {/* The sync timestamp belongs to the Plaid run, not to this
                account — nothing stores a per-account stamp. Showing the run's
                time under a per-account label was the "never" bug. */}
            {lastBankSyncAt ? (
              <DetailRow label="Banks last synced" value={formatRelativeTime(lastBankSyncAt)} />
            ) : null}
          </Card>

          {utilisation !== null ? (
            <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.xs }}>
              <ProgressBar
                progress={utilisation}
                label="Credit used"
                tone={utilisation > 0.5 ? 'accent' : 'positive'}
              />
              <AppText variant="caption" tone="textTertiary">
                {formatCurrency(account.balanceCents)} of{' '}
                {formatCurrency(account.creditLimitCents ?? 0)} used
              </AppText>
            </View>
          ) : null}
        </View>

        <View>
          <SectionHeader title="Recent activity" />
          {recent.length === 0 ? (
            <Card>
              <EmptyState
                kind="no-account-activity"
                icon="list"
                title="No recent activity"
                body="Transactions for this account will appear here."
                compact
              />
            </Card>
          ) : (
            <Card padded={false}>
              {recent.map((transaction, index) => (
                <View key={transaction.id}>
                  {index > 0 ? <Divider inset={theme.spacing.huge + theme.spacing.lg} /> : null}
                  <TransactionRow transaction={transaction} />
                </View>
              ))}
            </Card>
          )}
        </View>
      </View>
    </AppScreen>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.spacing.lg,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        minHeight: theme.touchTarget.min,
      }}
    >
      <AppText variant="secondary" tone="textSecondary">
        {label}
      </AppText>
      <AppText variant="body">{value}</AppText>
    </View>
  );
};
