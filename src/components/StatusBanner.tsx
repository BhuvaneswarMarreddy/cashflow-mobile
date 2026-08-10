import { View } from 'react-native';

import { CONNECTIVITY_MESSAGE, useConnectivity } from '@/services/connectivity';
import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

/**
 * Connectivity, stated once and quietly.
 *
 * Offline is a status, not an error: the figures already on screen stay
 * readable and the app does not throw a blocking dialog every time a request
 * fails. This strip is the whole of the interruption.
 */
export const StatusBanner = () => {
  const theme = useTheme();
  const status = useConnectivity();
  const message = CONNECTIVITY_MESSAGE[status];

  if (message === null) return null;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
        backgroundColor: theme.colors.warningSurface,
      }}
    >
      <Icon name="cloud-off" size={14} color={theme.colors.warning} />
      <AppText variant="caption" tone="warning" style={{ flex: 1 }}>
        {message}
      </AppText>
    </View>
  );
};
