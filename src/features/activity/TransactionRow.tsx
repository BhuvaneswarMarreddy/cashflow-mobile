import { AmountText, ListRow, type IconName } from '@/components';
import type { Transaction, TransactionKind } from '@/types';
import { formatCurrency } from '@/utils/format';

const ICON_FOR: Record<TransactionKind, IconName> = {
  purchase: 'shopping-bag',
  income: 'arrow-down-circle',
  transfer: 'repeat',
  refund: 'corner-up-left',
  fee: 'alert-circle',
};

interface Props {
  transaction: Transaction;
  /** Shown when the list mixes accounts. */
  accountName?: string;
  /** Opens the "always categorize" sheet for this transaction. */
  onLongPress?: () => void;
}

export const TransactionRow = ({ transaction, accountName, onLongPress }: Props) => {
  const subtitleParts = [transaction.category, accountName].filter(Boolean) as string[];

  return (
    <ListRow
      title={transaction.merchant ?? transaction.description}
      subtitle={subtitleParts.join(' · ')}
      {...(transaction.pending ? { footnote: 'Pending' } : {})}
      leadingIcon={ICON_FOR[transaction.kind]}
      leadingTone={transaction.kind === 'fee' ? 'warning' : 'neutral'}
      {...(onLongPress ? { onLongPress } : {})}
      accessibilityLabel={[
        transaction.merchant ?? transaction.description,
        transaction.category,
        `${transaction.amountCents < 0 ? 'minus ' : 'plus '}${formatCurrency(Math.abs(transaction.amountCents), { whole: false })}`,
        transaction.pending ? 'pending' : '',
      ]
        .filter(Boolean)
        .join(', ')}
      trailing={
        <AmountText
          cents={transaction.amountCents}
          variant="amountSmall"
          tone={transaction.amountCents > 0 ? 'positive' : 'neutral'}
          precise
        />
      }
    />
  );
};
