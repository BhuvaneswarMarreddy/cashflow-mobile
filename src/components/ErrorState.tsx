import { View } from 'react-native';

import { isDevelopment } from '@/config/env';
import type { AppError } from '@/errors';
import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';

interface Props {
  error: Pick<AppError, 'userMessage' | 'retryable' | 'category'> & {
    code?: string;
    correlationId?: string | null | undefined;
    technicalMessage?: string;
  };
  onRetry?: () => void;
  compact?: boolean;
}

/**
 * The error case.
 *
 * Shows `userMessage` and nothing else in a release build. The technical
 * message and correlation ID appear only in development, where they save a trip
 * to the terminal — in production they are noise at best and a disclosure at
 * worst.
 */
export const ErrorState = ({ error, onRetry, compact = false }: Props) => {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={error.userMessage}
      style={{
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: compact ? theme.spacing.xl : theme.spacing.xxxl,
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
          backgroundColor: theme.colors.errorSurface,
        }}
      >
        <Icon name="alert-circle" size={22} color={theme.colors.error} />
      </View>

      <AppText variant="bodyStrong" align="center">
        {error.userMessage}
      </AppText>

      {isDevelopment && error.technicalMessage ? (
        <AppText variant="mono" tone="textTertiary" align="center">
          {error.code ?? error.category}
          {error.correlationId ? ` · ${error.correlationId}` : ''}
          {'\n'}
          {error.technicalMessage}
        </AppText>
      ) : null}

      {error.retryable && onRetry ? (
        <View style={{ marginTop: theme.spacing.sm }}>
          <Button label="Try again" icon="refresh-cw" onPress={onRetry} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
};
