import { Text, type StyleProp, type TextStyle } from 'react-native';
import type { ReactNode } from 'react';

import { useTheme, type ThemeColors, type TypographyVariant } from '@/theme';

export type TextTone = Extract<
  keyof ThemeColors,
  | 'textPrimary'
  | 'textSecondary'
  | 'textTertiary'
  | 'textOnAccent'
  | 'textDisabled'
  | 'accent'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'positive'
  | 'negative'
>;

interface Props {
  children: ReactNode;
  variant?: TypographyVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  /** Marks this text as a heading for screen-reader navigation. */
  heading?: boolean;
  testID?: string;
}

/**
 * The only text component.
 *
 * Every string in the app goes through here so that the type scale, the colour
 * tokens and the per-variant cap on OS font scaling are applied in one place —
 * a raw `<Text>` is a layout that breaks at 200% text size and a colour that
 * never learned about light mode.
 */
export const AppText = ({
  children,
  variant = 'body',
  tone = 'textPrimary',
  align,
  numberOfLines,
  style,
  accessibilityLabel,
  heading = false,
  testID,
}: Props) => {
  const theme = useTheme();

  return (
    <Text
      style={[
        theme.typography[variant],
        { color: theme.colors[tone] },
        align ? { textAlign: align } : null,
        variant === 'sectionHeading' ? { textTransform: 'uppercase' } : null,
        style,
      ]}
      maxFontSizeMultiplier={theme.maxFontSizeMultiplier[variant]}
      {...(numberOfLines !== undefined ? { numberOfLines } : {})}
      {...(accessibilityLabel !== undefined ? { accessibilityLabel } : {})}
      {...(heading ? { accessibilityRole: 'header' as const } : {})}
      {...(testID !== undefined ? { testID } : {})}
    >
      {children}
    </Text>
  );
};
