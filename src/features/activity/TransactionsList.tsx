import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext, useState } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Divider, EmptyState, ErrorState, SkeletonCard, StatusBanner } from '@/components';
import { CategorizeSheet } from '@/features/activity/CategorizeSheet';
import { TransactionRow } from '@/features/activity/TransactionRow';
import { triggerRefresh, usePullToRefresh } from '@/hooks/useRefresh';
import { useFinanceStore } from '@/store/financeStore';
import { useTheme } from '@/theme';
import type { Transaction } from '@/types';
import { formatDate } from '@/utils/format';

interface Section {
  title: string;
  data: Transaction[];
}

const groupByDate = (transactions: readonly Transaction[]): Section[] => {
  const buckets = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const existing = buckets.get(transaction.date);
    if (existing) existing.push(transaction);
    else buckets.set(transaction.date, [transaction]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, data]) => ({ title: date, data }));
};

/**
 * The transaction timeline.
 *
 * A `SectionList` rather than a mapped ScrollView: this is the one list in the
 * app that grows without bound, and virtualisation is the difference between a
 * smooth scroll and a stutter at a few hundred rows.
 *
 * Split out of `ActivityScreen` ahead of Activity gaining a second view (Flow).
 * It keeps its own `StatusBanner` and pull-to-refresh because it is still a full
 * screen's worth of content, not a panel — and it keeps the `screen-activity`
 * testID, because from the navigator's point of view this IS the Activity
 * screen until the tab host has two things to switch between.
 */
export const TransactionsList = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // The tab bar floats over content (glass effect); its real height, not just
  // the safe-area inset, is what keeps the last row clear of it. Same source
  // AppScreen and the FAB use, so all three stay in sync.
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const { refreshing, onRefresh } = usePullToRefresh();

  // Owned here, not in CategorizeSheet: this is the one screen that knows
  // which row was long-pressed, and the sheet itself works from whatever
  // transaction (or null) it is handed.
  const [categorizing, setCategorizing] = useState<Transaction | null>(null);

  const transactions = useFinanceStore((state) => state.transactions);
  const accounts = useFinanceStore((state) => state.accounts);
  const status = useFinanceStore((state) => state.status);
  const lastError = useFinanceStore((state) => state.lastError);
  const failedSections = useFinanceStore((state) => state.failedSections);
  const hasLoadedOnce = useFinanceStore((state) => state.hasLoadedOnce);

  const nameFor = (accountId: string) => accounts.find((a) => a.id === accountId)?.name;
  const sections = groupByDate(transactions);
  const activityFailed = failedSections.includes('activity');

  if (!hasLoadedOnce && status === 'refreshing') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
        }}
      >
        <SkeletonCard lines={5} />
        <SkeletonCard lines={5} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }} testID="screen-activity">
      <StatusBanner />

      {activityFailed && transactions.length > 0 ? (
        <View
          accessibilityRole="alert"
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
            backgroundColor: theme.colors.warningSurface,
          }}
        >
          <AppText variant="caption" tone="warning">
            Activity didn&apos;t refresh. These are the last transactions Cashflow confirmed.
          </AppText>
        </View>
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          paddingBottom: (tabBarHeight > 0 ? tabBarHeight : insets.bottom) + theme.spacing.huge,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
          />
        }
        renderSectionHeader={({ section }) => (
          <View
            style={{
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.xl,
              paddingBottom: theme.spacing.xs,
              backgroundColor: theme.colors.background,
            }}
          >
            <AppText variant="sectionHeading" tone="textTertiary" heading>
              {formatDate(section.title, 'weekday')}
            </AppText>
          </View>
        )}
        renderItem={({ item }) => (
          <TransactionRow
            transaction={item}
            {...(nameFor(item.accountId) !== undefined
              ? { accountName: nameFor(item.accountId) as string }
              : {})}
            onLongPress={() => setCategorizing(item)}
          />
        )}
        ItemSeparatorComponent={() => <Divider inset={theme.spacing.huge + theme.spacing.lg} />}
        ListEmptyComponent={
          activityFailed && lastError ? (
            <ErrorState error={lastError} onRetry={() => triggerRefresh('tap')} />
          ) : (
            <EmptyState
              kind="no-transactions"
              icon="list"
              title="No activity yet"
              body="Transactions appear here as soon as your accounts report them."
              actionLabel="Refresh"
              onAction={() => triggerRefresh('tap')}
            />
          )
        }
      />

      <CategorizeSheet transaction={categorizing} onClose={() => setCategorizing(null)} />
    </View>
  );
};
