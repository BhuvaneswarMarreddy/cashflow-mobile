import { View } from 'react-native';

import { useTheme, type ThemeColors } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info';

interface Props {
  label: string;
  tone?: ChipTone;
  icon?: IconName;
}

const SURFACE: Record<ChipTone, keyof ThemeColors> = {
  neutral: 'surfaceAlt',
  accent: 'accentSurface',
  success: 'positiveSurface',
  warning: 'warningSurface',
  error: 'errorSurface',
  info: 'infoSurface',
};

const FOREGROUND: Record<ChipTone, keyof ThemeColors> = {
  neutral: 'textSecondary',
  accent: 'accent',
  success: 'positive',
  warning: 'warning',
  error: 'error',
  info: 'info',
};

/**
 * Small status marker.
 *
 * Always carries a word, never a bare coloured dot: "is this account fine?" has
 * to be answerable without seeing colour.
 */
export const StatusChip = ({ label, tone = 'neutral', icon }: Props) => {
  const theme = useTheme();
  const foreground = theme.colors[FOREGROUND[tone]];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        alignSelf: 'flex-start',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.control,
        backgroundColor: theme.colors[SURFACE[tone]],
      }}
    >
      {icon ? <Icon name={icon} size={12} color={foreground} /> : null}
      <AppText variant="caption" style={{ color: foreground }}>
        {label}
      </AppText>
    </View>
  );
};
