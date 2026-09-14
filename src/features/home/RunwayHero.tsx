import { View } from 'react-native';

import { AppText, Card, ProgressBar } from '@/components';
import { useTheme } from '@/theme';
import type { SnapshotRunway } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

interface Props {
  runway: SnapshotRunway;
  /** Measured monthly burn — what the runway is divided by. */
  avgMonthlySpendCents: number;
  /**
   * CHAT-SPEND-001: true when `avgMonthlySpendCents` above is the owner's own
   * stated assumption (`snapshot.assumedMonthlySpendCents`), not a measured
   * figure. The caption must say so — an assumption presented as a
   * measurement is the one thing this card cannot afford to get wrong.
   */
  isAssumedSpend: boolean;
  onPress?: () => void;
  testID?: string;
}

/**
 * The Home hero: how long the money lasts.
 *
 * Chosen over a "safe to spend" figure because the system computes this one and
 * does not compute that one — see `lib/home.ts` on the server. Serif, alone,
 * and the only large number on the screen.
 *
 * Two rules inherited from the web hero (UI-102), both load-bearing:
 *
 *  - **No burn measured, no runway.** There is nothing to divide by, so the
 *    card says so instead of rendering a confident zero.
 *  - **The nudge chases the NEXT whole month, not the 5-month target.**
 *    "6% of your reserve" is a score; "$1,400 buys your first month" is
 *    something to do this week.
 */
export const RunwayHero = ({ runway, avgMonthlySpendCents, isAssumedSpend, onPress, testID }: Props) => {
  const theme = useTheme();

  const spoken = runway.hasBurn
    ? `Runway, ${runway.label}. Your money lasts until ${formatDate(runway.date, 'medium')}.`
    : 'Runway is not measured yet.';

  return (
    <Card
      {...(onPress !== undefined ? { onPress, accessibilityLabel: spoken } : {})}
      {...(onPress !== undefined ? { accessibilityHint: 'Opens what is coming up' } : {})}
      {...(testID !== undefined ? { testID } : {})}
      style={{ gap: theme.spacing.sm }}
    >
      <AppText variant="sectionHeading" tone="textTertiary">
        Runway
      </AppText>

      {!runway.hasBurn ? (
        <>
          <AppText variant="heading" tone="textSecondary">
            Not measured yet
          </AppText>
          <AppText variant="caption" tone="textTertiary">
            Cashflow needs a few months of spending before it can say how long your money lasts.
          </AppText>
        </>
      ) : (
        <>
          <AppText variant="display" testID={testID ? `${testID}-value` : undefined}>
            {runway.label}
          </AppText>

          {/*
            "if no more money comes in" is the assumption the whole figure rests
            on, and it was unstated. Runway divides cash by burn and never reads
            income (cashflow-forecast src/lib/home.ts — `HomeSummaryInput` has no
            income field at all), so for anyone earning more than they spend the
            hero says the money runs out on a date while their own arithmetic
            says it grows. Both readings are defensible; leaving the reader to
            guess which one this is, is not. The same discipline already applies
            to the assumed-spend note on the next line.
          */}
          <AppText variant="caption" tone="textTertiary">
            Your cash lasts until {formatDate(runway.date, 'medium')} at{' '}
            {formatCurrency(avgMonthlySpendCents)} a month
            {isAssumedSpend ? ' — your assumption' : ''}, if no more money comes in
          </AppText>

          <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.xs }}>
            <ProgressBar
              progress={runway.reserveProgress}
              label={`Reserve target, ${runway.reserveTargetMonths} months`}
              tone={runway.reserveProgress >= 1 ? 'positive' : 'accent'}
            />
            <AppText
              variant="caption"
              tone={runway.reserveProgress >= 1 ? 'positive' : 'textTertiary'}
            >
              {runway.nextMonthTarget === 0
                ? `${runway.reserveTargetMonths}-month reserve reached`
                : `${formatCurrency(runway.amountToNextMonthCents)} more buys month ${runway.nextMonthTarget} of ${runway.reserveTargetMonths}`}
            </AppText>
          </View>
        </>
      )}
    </Card>
  );
};
