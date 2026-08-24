import Feather from '@expo/vector-icons/Feather';

import { useTheme } from '@/theme';

export type IconName = keyof typeof Feather.glyphMap;

interface Props {
  name: IconName;
  size?: number;
  /** Any theme colour token, or an explicit colour for special cases. */
  color?: string;
  /**
   * Screen-reader label. Omit for icons that only decorate text that already
   * says the same thing — a labelled icon next to identical text is noise.
   */
  label?: string;
}

/**
 * One icon family (Feather) for the whole app.
 *
 * Mixing families is the fastest way to make a product look assembled rather
 * than designed, and each extra family is another font file in the bundle.
 */
export const Icon = ({ name, size = 20, color, label }: Props) => {
  const theme = useTheme();
  return (
    <Feather
      name={name}
      size={size}
      // Named after the glyph so a test can assert WHICH icon rendered. An
      // icon often carries half a message — a green check next to "first look
      // this session" reads as "all clear", which is the opposite of the truth.
      testID={`icon-${name}`}
      color={color ?? theme.colors.textSecondary}
      accessibilityElementsHidden={label === undefined}
      importantForAccessibility={label === undefined ? 'no-hide-descendants' : 'yes'}
      {...(label !== undefined ? { accessibilityRole: 'image', accessibilityLabel: label } : {})}
    />
  );
};
