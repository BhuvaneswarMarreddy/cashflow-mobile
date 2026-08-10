import { View } from 'react-native';

import { useTheme } from '@/theme';
import { formatCurrency } from '@/utils/format';

import { AmountText, type AmountTone } from './AmountText';
import { AppText } from './AppText';
import { Card } from './Card';
import { Icon, type IconName } from './Icon';

interface Props {
  label: string;
  /**
   * `null` means Cashflow cannot back this number. It renders as an explicit
   * "not available" with the reason — never as `$0`, which reads as a measured
   * fact and is the single most expensive lie a money app can tell.
   */
  cents: number | null;
  unavailableReason?: string | null;
  size?: 'hero' | 'compact';
  tone?: AmountTone;
  icon?: IconName;
  /** One short line under the number: context, not a second metric. */
  footnote?: string;
  /** Change since the previous snapshot, in cents. */
  deltaCents?: number | null;
  onPress?: () => void;
  testID?: string;
}

export const MetricCard = ({
  label,
  cents,
  unavailableReason,
  size = 'compact',
  tone = 'neutral',
  icon,
  footnote,
  deltaCents,
  onPress,
  testID,
}: Props) => {
  const theme = useTheme();
  const hero = size === 'hero';

  const spoken =
    cents === null
      ? `${label}, not available. ${unavailableReason ?? ''}`.trim()
      : `${label}, ${cents < 0 ? 'minus ' : ''}${formatCurrency(Math.abs(cents))}${footnote ? `. ${footnote}` : ''}`;

  return (
    <Card
      {...(onPress !== undefined ? { onPress, accessibilityLabel: spoken } : {})}
      {...(onPress !== undefined ? { accessibilityHint: 'Opens the detail view' } : {})}
      {...(testID !== undefined ? { testID } : {})}
      style={{ gap: theme.spacing.xs }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        {icon ? <Icon name={icon} size={14} color={theme.colors.textTertiary} /> : null}
        <AppText variant="sectionHeading" tone="textTertiary">
          {label}
        </AppText>
      </View>

      {cents === null ? (
        <>
          <AppText variant={hero ? 'heading' : 'bodyStrong'} tone="textSecondary">
            Not available
          </AppText>
          {unavailableReason ? (
            <AppText variant="caption" tone="textTertiary">
              {unavailableReason}
            </AppText>
          ) : null}
        </>
      ) : (
        <>
          <AmountText
            cents={cents}
            variant={hero ? 'amount' : 'amountSmall'}
            tone={tone}
            testID={testID ? `${testID}-amount` : undefined}
          />

          {deltaCents !== null && deltaCents !== undefined && deltaCents !== 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
              <Icon
                name={deltaCents > 0 ? 'arrow-up-right' : 'arrow-down-right'}
                size={13}
                color={deltaCents > 0 ? theme.colors.positive : theme.colors.negative}
              />
              <AmountText cents={deltaCents} variant="caption" tone="auto" signed precise />
              <AppText variant="caption" tone="textTertiary">
                since your last refresh
              </AppText>
            </View>
          ) : null}

          {footnote ? (
            <AppText variant="caption" tone="textTertiary">
              {footnote}
            </AppText>
          ) : null}
        </>
      )}
    </Card>
  );
};
