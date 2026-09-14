import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

interface Props {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Light haptic on press. Off by default — most taps do not warrant one. */
  haptic?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  haptic = false,
  accessibilityHint,
  style,
  testID,
}: Props) => {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const palette = {
    primary: {
      background: theme.colors.accent,
      text: theme.colors.textOnAccent,
      border: 'transparent',
    },
    secondary: {
      background: theme.colors.surfaceAlt,
      text: theme.colors.textPrimary,
      border: theme.colors.borderStrong,
    },
    ghost: { background: 'transparent', text: theme.colors.accent, border: 'transparent' },
    destructive: {
      background: theme.colors.errorSurface,
      text: theme.colors.error,
      border: theme.colors.error,
    },
  }[variant];

  const handlePress = () => {
    if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      {...(accessibilityHint !== undefined ? { accessibilityHint } : {})}
      {...(testID !== undefined ? { testID } : {})}
      style={({ pressed }) => [
        {
          minHeight: theme.touchTarget.comfortable,
          paddingHorizontal: theme.spacing.xl,
          borderRadius: theme.radius.control,
          backgroundColor: palette.background,
          borderWidth:
            variant === 'secondary' || variant === 'destructive' ? theme.borderWidth.hairline : 0,
          borderColor: palette.border,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? theme.opacity.disabled : pressed ? theme.opacity.pressed : 1,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.text} />
        ) : icon ? (
          <Icon name={icon} size={18} color={palette.text} />
        ) : null}
        <AppText variant="button" style={{ color: palette.text }}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
};
