import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { loggerFor } from '@/logging';
import { palette } from '@/theme/palette';

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
    padding: 24,
    gap: 12,
    backgroundColor: palette.ink[900],
  },
  title: { color: '#f3f1ec', fontSize: 20, fontWeight: '700' },
  body: { color: '#a9afb7', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  button: {
    marginTop: 8,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: palette.gold.primary,
  },
  buttonLabel: { color: palette.gold.onGold, fontSize: 16, fontWeight: '600' },
});
