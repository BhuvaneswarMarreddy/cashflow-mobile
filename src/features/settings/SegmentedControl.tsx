import { Pressable, View } from 'react-native';

import { AppText } from '@/components';
import { useTheme } from '@/theme';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers, e.g. "Appearance". */
  label: string;
}

/**
 * A small set of mutually exclusive choices.
 *
 * Exposed as radios rather than buttons so a screen reader announces "selected"
 * and reads the group as one control instead of three unrelated taps.
 */
export const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
  label,
}: Props<T>) => {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        gap: theme.spacing.xs,
        padding: theme.spacing.xs,
        marginHorizontal: theme.spacing.lg,
        marginVertical: theme.spacing.sm,
        borderRadius: theme.radius.control,
        backgroundColor: theme.colors.surfaceAlt,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={option.label}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: theme.touchTarget.min - 8,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.control,
              backgroundColor: selected ? theme.colors.surface : 'transparent',
              opacity: pressed ? theme.opacity.pressed : 1,
              ...(selected ? theme.elevation(1) : {}),
            })}
          >
            <AppText variant="secondary" tone={selected ? 'textPrimary' : 'textSecondary'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
};
