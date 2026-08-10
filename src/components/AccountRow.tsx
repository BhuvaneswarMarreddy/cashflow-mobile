import { View } from 'react-native';

import type { Account, AccountKind } from '@/types';
import { formatCurrency, formatMask, formatRelativeTime } from '@/utils/format';
import { isLiability } from '@/utils/money';

import { AmountText } from './AmountText';
import { AppText } from './AppText';
import type { IconName } from './Icon';
import { ListRow } from './ListRow';

export const accountIcon: Record<AccountKind, IconName> = {
  checking: 'credit-card',
  savings: 'shield',
  'credit-card': 'credit-card',
  investment: 'trending-up',
  loan: 'file-text',
  cash: 'dollar-sign',
};

/** Kept next to the row so the list and the detail screen always agree. */
export const accountKindLabel: Record<AccountKind, string> = {
  checking: 'Checking',
  savings: 'Savings',
  'credit-card': 'Credit card',
  investment: 'Investment',
  loan: 'Loan',
  cash: 'Cash',
};

interface Props {
  account: Account;
  onPress?: (account: Account) => void;
}

export const AccountRow = ({ account, onPress }: Props) => {
  const owed = isLiability(account.kind);
  const needsAttention = account.status !== 'ok';

  const statusLine =
    account.status === 'error'
      ? "Couldn't sync"
      : account.status === 'stale'
        ? `Updated ${formatRelativeTime(account.lastSyncedAt)}`
        : null;

  return (
    <ListRow
      title={account.name}
      subtitle={`${account.institution} · ${formatMask(account.mask)}`}
      {...(statusLine !== null ? { footnote: statusLine } : {})}
      leadingIcon={accountIcon[account.kind]}
      leadingTone={needsAttention ? 'warning' : 'neutral'}
      {...(onPress !== undefined ? { onPress: () => onPress(account) } : {})}
      accessibilityLabel={[
        account.name,
        account.institution,
        `${owed ? 'owing' : 'balance'} ${formatCurrency(account.balanceCents)}`,
        statusLine,
      ]
        .filter(Boolean)
        .join(', ')}
      trailing={
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <AmountText cents={account.balanceCents} variant="amountSmall" tone="neutral" />
          {owed ? (
            <AppText variant="caption" tone="textTertiary">
              owed
            </AppText>
          ) : account.availableCents !== null && account.availableCents !== account.balanceCents ? (
            <AppText variant="caption" tone="textTertiary">
              {formatCurrency(account.availableCents)} available
            </AppText>
          ) : null}
        </View>
      }
      testID={`account-row-${account.id}`}
    />
  );
};
