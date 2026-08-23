import { View } from 'react-native';

import { AmountText, AppText, Card, Divider, Icon, type IconName } from '@/components';
import { useTheme } from '@/theme';
import type { SnapshotChange } from '@/types';

const ICON_FOR: Record<SnapshotChange['kind'], IconName> = {
  'cash-increase': 'arrow-up-right',
  'cash-decrease': 'arrow-down-right',
  'runway-change': 'trending-up',
  'card-decrease': 'arrow-down-right',
  'card-increase': 'arrow-up-right',
  'new-transactions': 'list',
  'bill-due-soon': 'clock',
};

/**
 * "What changed since your last refresh", as a list rather than a paragraph.
 *
 * Severity is carried by an icon and by the wording, not by colour alone —
 * "one bill is due within 3 days" has to be legible as urgent in greyscale.
 */
export const ChangeList = ({
  changes,
  hasBaseline,
}: {
  changes: readonly SnapshotChange[];
  /**
   * Whether a previous snapshot existed to compare against. Balances are
   * deliberately never persisted to device storage, so the baseline is only
   * whatever THIS session already held — on a cold start there is none.
   * Without this flag an empty list says "nothing has changed", which on the
   * first open of the day is a claim the app cannot actually make.
   *
   * REQUIRED, with no default, on purpose: as an optional prop defaulting to
   * true, deleting it at the call site silently restored the bug with every
   * test still green. Now `tsc` catches that.
   */
  hasBaseline: boolean;
}) => {
  const theme = useTheme();

  if (changes.length === 0) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Icon
            name={hasBaseline ? 'check' : 'clock'}
            size={16}
            color={hasBaseline ? theme.colors.positive : theme.colors.textTertiary}
          />
          <AppText variant="secondary" tone="textSecondary" style={{ flex: 1 }}>
            {hasBaseline
              ? 'Nothing has changed since your last refresh.'
              : 'First look this session. Refresh again and changes will show up here.'}
          </AppText>
        </View>
      </Card>
    );
  }

  const colorFor = (severity: SnapshotChange['severity']) =>
    severity === 'warning'
      ? theme.colors.warning
      : severity === 'positive'
        ? theme.colors.positive
        : theme.colors.textSecondary;

  return (
    <Card padded={false}>
      {changes.map((change, index) => (
        <View key={change.id}>
          {index > 0 ? <Divider inset={theme.spacing.huge + theme.spacing.sm} /> : null}
          <View
            accessible
            accessibilityLabel={`${change.label}. ${change.detail}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.lg,
              minHeight: theme.touchTarget.min,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: theme.radius.control,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor:
                  change.severity === 'warning'
                    ? theme.colors.warningSurface
                    : theme.colors.surfaceAlt,
              }}
            >
              <Icon name={ICON_FOR[change.kind]} size={15} color={colorFor(change.severity)} />
            </View>

            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="body">{change.label}</AppText>
              <AppText variant="caption" tone="textTertiary">
                {change.detail}
              </AppText>
            </View>

            {change.amountCents !== null && change.kind !== 'bill-due-soon' ? (
              <AmountText cents={change.amountCents} variant="caption" tone="auto" signed precise />
            ) : null}
          </View>
        </View>
      ))}
    </Card>
  );
};
