import { View } from 'react-native';

import { useTheme } from '@/theme';
import { formatPercent } from '@/utils/format';

interface Props {
  /** 0–1. Values outside the range are clamped. */
  progress: number;
  label: string;
  tone?: 'accent' | 'positive';
  height?: number;
}

export const ProgressBar = ({ progress, label, tone = 'accent', height = 6 }: Props) => {
  const theme = useTheme();
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}, ${formatPercent(clamped)} complete`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{
        height,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surfaceAlt,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          borderRadius: theme.radius.pill,
          backgroundColor: tone === 'positive' ? theme.colors.positive : theme.colors.accent,
        }}
      />
    </View>
  );
};
