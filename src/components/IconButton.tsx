import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface Props {
  icon: IconName;
  onPress: () => void;
  /** Required: an icon-only control is unusable without a spoken label. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  size?: number;
  color?: string;
  /** Small unread/count indicator, e.g. the notifications bell. */
  badgeCount?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const IconButton = ({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  size = 22,
  color,
  badgeCount,
  disabled = false,
  style,
  testID,
}: Props) => {
  const theme = useTheme();
  const showBadge = badgeCount !== undefined && badgeCount > 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={
        showBadge ? `${accessibilityLabel}, ${badgeCount} unread` : accessibilityLabel
      }
      accessibilityState={{ disabled }}
      {...(accessibilityHint !== undefined ? { accessibilityHint } : {})}
      {...(testID !== undefined ? { testID } : {})}
      // Hit slop rather than padding: padding would grow the header row and
      // push the title around; the tappable area still clears 44pt.
      hitSlop={Math.max(0, (theme.touchTarget.min - size) / 2)}
      style={({ pressed }) => [
        {
          width: theme.touchTarget.min,
          height: theme.touchTarget.min,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.pill,
          opacity: disabled ? theme.opacity.disabled : pressed ? theme.opacity.pressed : 1,
        },
        style,
      ]}
    >
      <Icon name={icon} size={size} color={color ?? theme.colors.textPrimary} />
      {showBadge ? (
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 4,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppText variant="caption" style={{ color: theme.colors.textOnAccent, fontSize: 10 }}>
            {badgeCount > 9 ? '9+' : badgeCount}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
};
