import { Switch, View } from 'react-native';

import { AppText } from '@/components';
import { useTheme } from '@/theme';

interface Props {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

export const SettingSwitch = ({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  testID,
}: Props) => {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.lg,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        minHeight: theme.touchTarget.comfortable,
        opacity: disabled ? theme.opacity.disabled : 1,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body">{label}</AppText>
        {description ? (
          <AppText variant="caption" tone="textTertiary">
            {description}
          </AppText>
        ) : null}
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={label}
        {...(description !== undefined ? { accessibilityHint: description } : {})}
        trackColor={{ false: theme.colors.surfaceAlt, true: theme.colors.accentMuted }}
        thumbColor={value ? theme.colors.accent : theme.colors.textTertiary}
        ios_backgroundColor={theme.colors.surfaceAlt}
        {...(testID !== undefined ? { testID } : {})}
      />
    </View>
  );
};
