import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

interface Props {
  children: ReactNode;
  onPress?: () => void;
  /** Required when `onPress` is set — what the card says when read aloud. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The surface everything sits on.
 *
 * A pressable card renders as a real button (role, label, hint, press state)
 * rather than a `View` with an `onPress`, which is invisible to a screen reader
 * and gives no press feedback.
 */
export const Card = ({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  padded = true,
  style,
  testID,
}: Props) => {
  const theme = useTheme();

  const surface: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.card,
    padding: padded ? theme.spacing.lg : 0,
    ...theme.elevation(1),
  };

  if (!onPress) {
    return (
      <View style={[surface, style]} {...(testID !== undefined ? { testID } : {})}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      {...(accessibilityLabel !== undefined ? { accessibilityLabel } : {})}
      {...(accessibilityHint !== undefined ? { accessibilityHint } : {})}
      {...(testID !== undefined ? { testID } : {})}
      style={({ pressed }) => [
        surface,
        pressed
          ? { backgroundColor: theme.colors.surfaceAlt, opacity: theme.opacity.pressed }
          : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
};
