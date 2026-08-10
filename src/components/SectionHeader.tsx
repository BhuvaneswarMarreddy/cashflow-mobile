import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

interface Props {
  title: string;
  /** Optional trailing affordance, e.g. "See all". */
  actionLabel?: string;
  onAction?: () => void;
  /** Short line under the title when the section needs a caveat. */
  caption?: string;
}

export const SectionHeader = ({ title, actionLabel, onAction, caption }: Props) => {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xxs, marginBottom: theme.spacing.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 24,
        }}
      >
        <AppText variant="sectionHeading" tone="textTertiary" heading>
          {title}
        </AppText>

        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={`${actionLabel}, ${title}`}
            hitSlop={12}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.xxs,
              opacity: pressed ? theme.opacity.pressed : 1,
            })}
          >
            <AppText variant="caption" tone="accent">
              {actionLabel}
            </AppText>
            <Icon name="chevron-right" size={14} color={theme.colors.accent} />
          </Pressable>
        ) : null}
      </View>

      {caption ? (
        <AppText variant="caption" tone="textTertiary">
          {caption}
        </AppText>
      ) : null}
    </View>
  );
};
