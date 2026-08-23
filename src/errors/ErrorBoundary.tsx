import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { loggerFor } from '@/logging';
import { palette } from '@/theme/palette';
// Plain module exports, not hook-gated — safe here even though `useTheme()` is
// not, since a provider crash is exactly what this boundary catches.
import { radius, spacing, touchTarget } from '@/theme/tokens';

import { normalizeError, type AppError } from './AppError';

interface Props {
  children: ReactNode;
  /** Where this boundary sits, for the log entry: `root`, `screen:Home`. */
  boundary: string;
  /** Screens pass the themed <ErrorState>. Omit for the bare fallback. */
  fallback?: (error: AppError, retry: () => void) => ReactNode;
}

interface State {
  error: AppError | null;
}

/**
 * Catches render-time crashes.
 *
 * The default fallback is deliberately theme-independent: if a boundary is
 * catching an error thrown *by* the theme or a provider, a fallback that calls
 * `useTheme()` would throw inside the fallback and produce a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: normalizeError(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    const appError = normalizeError(error);
    loggerFor('ui').critical('ui.render_crashed', {
      message: appError.userMessage,
      metadata: {
        ...appError.toLogPayload(),
        boundary: this.props.boundary,
        componentStack: info.componentStack?.split('\n').slice(0, 6).join('\n'),
      },
    });
  }

  private readonly retry = (): void => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.retry);

    return (
      <View style={styles.container} accessibilityRole="alert">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>{error.userMessage}</Text>
        <Pressable
          onPress={this.retry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={styles.button}
        >
          <Text style={styles.buttonLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
    backgroundColor: palette.ink[900],
  },
  title: { color: palette.text.onInk, fontSize: 20, fontWeight: '700' },
  body: { color: palette.text.onInkSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  button: {
    marginTop: spacing.sm,
    minHeight: touchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radius.control,
    backgroundColor: palette.gold.primary,
  },
  buttonLabel: { color: palette.gold.onGold, fontSize: 16, fontWeight: '600' },
});
