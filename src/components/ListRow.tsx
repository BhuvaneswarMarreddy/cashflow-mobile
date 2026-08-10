import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface Props {
  title: string;
  subtitle?: string;
  /** Small third line, e.g. a due date or a sync time. */
  footnote?: string;
  leadingIcon?: IconName;
  leadingTone?: 'neutral' | 'accent' | 'success' | 'warning' | 'error';
  /** Right-hand content, usually an AmountText. */
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

export const ListRow = ({
  title,
  subtitle,
  footnote,
  leadingIcon,
  leadingTone = 'neutral',
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: Props) => {
  const theme = useTheme();

  const iconColor = {
    neutral: theme.colors.textSecondary,
    accent: theme.colors.accent,
    success: theme.colors.positive,
    warning: theme.colors.warning,
    error: theme.colors.error,
  }[leadingTone];

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: theme.touchTarget.min,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      {leadingIcon ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: theme.radius.control,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.surfaceAlt,
          }}
        >
          <Icon name={leadingIcon} size={17} color={iconColor} />
        </View>
      ) : null}

      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="secondary" tone="textSecondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
        {footnote ? (
          <AppText variant="caption" tone="textTertiary" numberOfLines={1}>
            {footnote}
          </AppText>
        ) : null}
      </View>

      {trailing ? <View style={{ alignItems: 'flex-end' }}>{trailing}</View> : null}

      {onPress ? <Icon name="chevron-right" size={18} color={theme.colors.textTertiary} /> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? [title, subtitle, footnote].filter(Boolean).join(', ')
      }
      {...(accessibilityHint !== undefined ? { accessibilityHint } : {})}
      {...(testID !== undefined ? { testID } : {})}
      style={({ pressed }) => (pressed ? { backgroundColor: theme.colors.surfaceAlt } : null)}
    >
      {content}
    </Pressable>
  );
};
