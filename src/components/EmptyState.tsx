import { View } from 'react-native';
import { useEffect } from 'react';

import { usageAnalytics } from '@/analytics';
import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

interface Props {
  icon: IconName;
  title: string;
  /** What happened and what the user can do next — never just "No data". */
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Reported to interaction telemetry so dead ends become visible. */
  kind: string;
  compact?: boolean;
}

/**
 * The empty case, treated as a designed state rather than an absence.
 *
 * Every empty state answers two questions — what happened, and what to do next
 * — and reports itself, because "which screens do users reach and find nothing
 * on?" is one of the more useful things telemetry can answer.
 */
export const EmptyState = ({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  kind,
  compact = false,
}: Props) => {
  const theme = useTheme();

  useEffect(() => {
    usageAnalytics.track('empty.encountered', 'system', { emptyKind: kind });
  }, [kind]);

  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${body}`}
      style={{
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: compact ? theme.spacing.xl : theme.spacing.huge,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: theme.radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.surfaceAlt,
        }}
      >
        <Icon name={icon} size={22} color={theme.colors.textTertiary} />
      </View>

      <AppText variant="bodyStrong" align="center">
        {title}
      </AppText>
      <AppText variant="secondary" tone="textSecondary" align="center">
        {body}
      </AppText>

      {actionLabel && onAction ? (
        <View style={{ marginTop: theme.spacing.sm }}>
          <Button label={actionLabel} onPress={onAction} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
};
