import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { usageAnalytics } from '@/analytics';
import { IconButton, LogoMark } from '@/components';
import { useNotificationsStore } from '@/store/notificationsStore';

import type { RootStackParamList } from './types';

export const HeaderLogo = () => <LogoMark size={26} showWordmark />;

/**
 * Bell with an unread count.
 *
 * Earns its place now that notifications actually leave the app: the banner is
 * the interruption, and this is the LOG of what was said. A banner is gone the
 * moment it is dismissed, and a finance app that tells you something once and
 * then cannot show it to you again has told you nothing.
 */
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
