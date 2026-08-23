import type { StyleProp, TextStyle } from 'react-native';

import type { TypographyVariant } from '@/theme';
import { formatCurrency } from '@/utils/format';

import { AppText, type TextTone } from './AppText';

export type AmountTone = 'auto' | 'neutral' | 'positive' | 'negative' | 'muted';

interface Props {
  cents: number;
  variant?: Extract<
    TypographyVariant,
    'heroNumber' | 'amount' | 'amountSmall' | 'body' | 'bodyStrong' | 'caption'
  >;
  /** `auto` colours by sign. `neutral` is right for balances, where a large
   * number is not inherently good or bad. */
  tone?: AmountTone;
  /** Show an explicit + for positive values — required for deltas. */
  signed?: boolean;
  /** Include cents. Off by default; dashboards read better without `.00`. */
  precise?: boolean;
  compact?: boolean;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

const toneFor = (tone: AmountTone, cents: number): TextTone => {
  switch (tone) {
    case 'positive':
      return 'positive';
    case 'negative':
      return 'negative';
    case 'muted':
      return 'textSecondary';
    case 'auto':
      if (cents > 0) return 'positive';
      if (cents < 0) return 'negative';
      return 'textPrimary';
    default:
      return 'textPrimary';
  }
};

/**
 * Money on screen.
 *
 * Two accessibility properties this buys, both of which are easy to lose when
 * amounts are formatted inline:
 *
 *  - **Sign is never colour-only.** A negative amount always carries a minus
 *    glyph, so the meaning survives colour blindness and greyscale.
 *  - **It reads correctly aloud.** The typographic minus (−) is not the ASCII
 *    hyphen and screen readers treat the two differently, so the spoken label
 *    is built separately from the displayed string.
 */
export const AmountText = ({
  cents,
  variant = 'amountSmall',
  tone = 'neutral',
  signed = false,
  precise = false,
  compact = false,
  style,
  testID,
}: Props) => {
  const display = formatCurrency(cents, { signed, whole: !precise, compact });
  const spokenPrefix = cents < 0 ? 'minus ' : signed && cents > 0 ? 'plus ' : '';
  const spoken = `${spokenPrefix}${formatCurrency(Math.abs(cents), { whole: !precise })}`;

  return (
    <AppText
      variant={variant}
      tone={toneFor(tone, cents)}
      accessibilityLabel={spoken}
      {...(style !== undefined ? { style } : {})}
      {...(testID !== undefined ? { testID } : {})}
    >
      {display}
    </AppText>
  );
};
