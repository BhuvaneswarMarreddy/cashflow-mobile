import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { usageAnalytics } from '@/analytics';
import { IconButton, LogoMark } from '@/components';
import { useNotificationsStore } from '@/store/notificationsStore';

import type { RootStackParamList } from './types';

export const HeaderLogo = () => <LogoMark size={26} showWordmark />;

/** Bell with an unread count, available from every tab's header. */
export const NotificationsButton = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const unread = useNotificationsStore((state) => state.items.filter((item) => !item.read).length);

  return (
    <IconButton
      icon="bell"
      accessibilityLabel="Notifications"
      accessibilityHint="Opens your notification centre"
      badgeCount={unread}
      onPress={() => {
        usageAnalytics.track('action.selected', 'home', { target: 'open-notifications' });
        navigation.navigate('Notifications');
      }}
      testID="header-notifications"
    />
  );
};
