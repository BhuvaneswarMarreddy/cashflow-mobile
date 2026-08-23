import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';

import { usageAnalytics } from '@/analytics';
import {
  AccountRow,
  AmountText,
  AppScreen,
  AppText,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  LastUpdated,
  SectionHeader,
  SkeletonCard,
  StatusBanner,
  accountKindLabel,
  type FabAction,
} from '@/components';
import { triggerRefresh, usePullToRefresh } from '@/hooks/useRefresh';
import type { AccountsStackParamList } from '@/navigation/types';
import { useFinanceStore } from '@/store/financeStore';
import { usePreferences } from '@/store/preferencesStore';
import { useTheme } from '@/theme';
import type { Account, AccountKind } from '@/types';
import { netWorth } from '@/utils/money';

/** Assets before liabilities, and within a group the biggest first. */
const GROUP_ORDER: AccountKind[] = [
  'checking',
  'cash',
  'savings',
  'investment',
  'credit-card',
  'loan',
];

const groupAccounts = (accounts: readonly Account[]): [AccountKind, Account[]][] =>
  GROUP_ORDER.map(
    (kind) => [kind, accounts.filter((a) => a.kind === kind)] as [AccountKind, Account[]],
  ).filter(([, group]) => group.length > 0);

export const AccountsScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AccountsStackParamList>>();
  const { refreshing, onRefresh } = usePullToRefresh();

  const accounts = useFinanceStore((state) => state.accounts);
  const status = useFinanceStore((state) => state.status);
  const lastError = useFinanceStore((state) => state.lastError);
  const lastRefreshedAt = useFinanceStore((state) => state.lastRefreshedAt);
  const hasLoadedOnce = useFinanceStore((state) => state.hasLoadedOnce);
  const setLastAccountId = usePreferences((state) => state.setLastAccountId);

  const open = (account: Account) => {
    usageAnalytics.track('action.selected', 'accounts', { target: 'open-account' });
    setLastAccountId(account.id);
    navigation.navigate('AccountDetail', { accountId: account.id });
  };

  // The path for everything Plaid cannot reach — an Apple Card, a Synchrony
  // store card, a private loan. Living on Accounts rather than in Settings
  // because that is where someone notices the account is missing.
  const fabActions: FabAction[] = [
    {
      key: 'add-account',
      label: 'Add account',
      description: 'For anything your bank feed does not cover',
      icon: 'plus',
      onPress: () => navigation.navigate('AddAccount'),
    },
    {
      key: 'import-csv',
      label: 'Import a statement',
      description: 'CSV, for Apple Card and store cards',
      icon: 'upload',
      onPress: () => navigation.navigate('ImportCsv'),
    },
    {
      key: 'refresh',
      label: 'Refresh from banks',
      description: 'Pull new transactions, then recalculate',
      icon: 'refresh-cw',
      onPress: () => triggerRefresh('tap'),
    },
  ];

  return (
    <AppScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      fabActions={fabActions}
      fabSource="accounts"
      banner={<StatusBanner />}
      testID="screen-accounts"
    >
      {!hasLoadedOnce && status === 'refreshing' ? (
        <View style={{ gap: theme.spacing.lg }}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </View>
      ) : accounts.length === 0 ? (
        lastError ? (
          <ErrorState error={lastError} onRetry={() => triggerRefresh('tap')} />
        ) : (
          <EmptyState
            kind="no-accounts"
            icon="credit-card"
            title="No accounts connected"
            body="Once an account is linked, its balance and activity appear here."
            actionLabel="Refresh"
            onAction={() => triggerRefresh('tap')}
          />
        )
      ) : (
        <View style={{ gap: theme.spacing.xl }}>
          <Card>
            <AppText variant="sectionHeading" tone="textTertiary">
              Net worth
            </AppText>
            <AmountText cents={netWorth(accounts)} variant="heroNumber" tone="neutral" />
            <View style={{ marginTop: theme.spacing.xs }}>
              <LastUpdated
                at={lastRefreshedAt}
                refreshing={refreshing}
                partial={status === 'partialSuccess'}
              />
            </View>
          </Card>

          {groupAccounts(accounts).map(([kind, group]) => (
            <View key={kind}>
              <SectionHeader title={accountKindLabel[kind]} />
              <Card padded={false}>
                {group.map((account, index) => (
                  <View key={account.id}>
                    {index > 0 ? <Divider inset={theme.spacing.huge + theme.spacing.lg} /> : null}
                    <AccountRow account={account} onPress={open} />
                  </View>
                ))}
              </Card>
            </View>
          ))}
        </View>
      )}
    </AppScreen>
  );
};
