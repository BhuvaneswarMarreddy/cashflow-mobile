import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usageAnalytics } from '@/analytics';
import { Button, Divider, EmptyState, NotificationRow } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { useNotificationsStore } from '@/store/notificationsStore';
import { useTheme } from '@/theme';
import type { AppNotification } from '@/types';

/**
 * The notification centre.
 *
 * Everything here was produced by the summariser, so the list reads as a diary
 * of what Cashflow noticed rather than a feed of individual transactions.
 */
export const NotificationsScreen = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const items = useNotificationsStore((state) => state.items);
  const markRead = useNotificationsStore((state) => state.markRead);
  const markAllRead = useNotificationsStore((state) => state.markAllRead);

  const open = (notification: AppNotification) => {
    usageAnalytics.track('notification.opened', 'notifications', {
      target: notification.category,
    });
    markRead(notification.id);
    if (notification.target?.screen === 'Home') {
      navigation.navigate('Tabs', { screen: 'Home' });
    } else if (notification.target?.screen === 'Plan') {
      navigation.navigate('Tabs', { screen: 'Plan' });
    } else if (notification.target?.screen === 'Activity') {
      navigation.navigate('Tabs', { screen: 'Activity' });
    }
  };

  const unread = items.filter((item) => !item.read).length;

  return (
    <View
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      testID="screen-notifications"
    >
      {unread > 0 ? (
        <View
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
            alignItems: 'flex-end',
          }}
        >
          <Button label="Mark all read" variant="ghost" onPress={markAllRead} />
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.xxl, flexGrow: 1 }}
        renderItem={({ item }) => <NotificationRow notification={item} onPress={open} />}
        ItemSeparatorComponent={() => <Divider inset={theme.spacing.huge + theme.spacing.lg} />}
        ListEmptyComponent={
          <EmptyState
            kind="no-notifications"
            icon="bell"
            title="No notifications"
            body="After a refresh, Cashflow summarises what changed and leaves it here."
          />
        }
      />
    </View>
  );
};
