import { useEffect, useState } from 'react';
import { Animated, Easing, View, type DimensionValue } from 'react-native';

import { useTheme } from '@/theme';

interface Props {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}

/**
 * Placeholder block.
 *
 * Pulses rather than shimmers — a shimmer needs a gradient dependency and a
 * masked animation, and on a financial screen the quieter option is also the
 * more appropriate one. Honours reduced motion by holding still.
 */
export const Skeleton = ({ width = '100%', height = 16, radius }: Props) => {
  const theme = useTheme();
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (theme.reduceMotion) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, theme.reduceMotion]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width,
        height,
        borderRadius: radius ?? theme.radius.control,
        backgroundColor: theme.colors.skeleton,
        opacity: theme.reduceMotion
          ? 1
          : pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
      }}
    />
  );
};

/** A card-shaped group of skeleton lines, for initial screen loads. */
export const SkeletonCard = ({ lines = 3 }: { lines?: number }) => {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.card,
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
        ...theme.elevation(1),
      }}
    >
      <Skeleton width="45%" height={12} />
      <Skeleton width="70%" height={28} />
      {Array.from({ length: Math.max(0, lines - 2) }, (_, index) => (
        <Skeleton key={index} width={index % 2 === 0 ? '90%' : '60%'} height={12} />
      ))}
    </View>
  );
};
