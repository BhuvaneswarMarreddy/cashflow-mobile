import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/theme';
import { formatRelativeTime } from '@/utils/format';

import { AppText } from './AppText';
import { Icon } from './Icon';

interface Props {
  at: string | null;
  refreshing: boolean;
  /** Set when the last refresh only partly succeeded. */
  partial?: boolean;
}

/**
 * Freshness, always on screen.
 *
 * A financial figure with no timestamp asks the user to guess whether they are
 * looking at today's money. This line exists so they never have to.
 */
export const LastUpdated = ({ at, refreshing, partial = false }: Props) => {
  const theme = useTheme();

  const text = refreshing
    ? 'Refreshing…'
    : at === null
      ? 'Not updated yet'
      : `Updated ${formatRelativeTime(at)}`;

  return (
    <View
      accessible
      accessibilityLabel={partial ? `${text}. Some information could not be refreshed.` : text}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
    >
      {refreshing ? (
        <ActivityIndicator size="small" color={theme.colors.textTertiary} />
      ) : (
        <Icon
          name={partial ? 'alert-circle' : 'clock'}
          size={12}
          color={partial ? theme.colors.warning : theme.colors.textTertiary}
        />
      )}
      <AppText variant="caption" tone={partial ? 'warning' : 'textTertiary'}>
        {text}
        {partial && !refreshing ? ' · partly' : ''}
      </AppText>
    </View>
  );
};
