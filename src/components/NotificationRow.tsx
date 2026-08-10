import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';
import type { AppNotification, NotificationCategory } from '@/types';
import { formatRelativeTime } from '@/utils/format';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

const ICON_FOR: Record<NotificationCategory, IconName> = {
  insight: 'trending-up',
  warning: 'alert-triangle',
  reminder: 'clock',
  success: 'check-circle',
  system: 'settings',
};

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  insight: 'Insight',
  warning: 'Warning',
  reminder: 'Reminder',
  success: 'Update',
  system: 'System',
};

interface Props {
  notification: AppNotification;
  onPress: (notification: AppNotification) => void;
}

export const NotificationRow = ({ notification, onPress }: Props) => {
  const theme = useTheme();

  const tone =
    notification.category === 'warning'
      ? theme.colors.warning
      : notification.category === 'success'
        ? theme.colors.positive
        : theme.colors.accent;

  return (
    <Pressable
      onPress={() => onPress(notification)}
      accessibilityRole="button"
      accessibilityLabel={[
        notification.read ? '' : 'Unread',
        CATEGORY_LABEL[notification.category],
        notification.title,
        notification.summary,
        formatRelativeTime(notification.timestamp),
      ]
        .filter(Boolean)
        .join('. ')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.lg,
        paddingHorizontal: theme.spacing.lg,
        minHeight: theme.touchTarget.min,
        backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: theme.radius.control,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            notification.category === 'warning'
              ? theme.colors.warningSurface
              : theme.colors.accentSurface,
        }}
      >
        <Icon name={ICON_FOR[notification.category]} size={17} color={tone} />
      </View>

      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
            {notification.title}
          </AppText>
          {/* Unread is marked by a word as well as a dot — a dot alone is
              invisible to a screen reader and to anyone who cannot see it. */}
          {notification.read ? null : (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.accent,
              }}
            />
          )}
        </View>

        <AppText variant="secondary" tone="textSecondary">
          {notification.summary}
        </AppText>

        <AppText variant="caption" tone="textTertiary">
          {CATEGORY_LABEL[notification.category]} · {formatRelativeTime(notification.timestamp)}
          {notification.read ? '' : ' · Unread'}
        </AppText>
      </View>
    </Pressable>
  );
};
