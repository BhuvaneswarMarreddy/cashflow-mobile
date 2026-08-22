import { NavigationContainer } from '@react-navigation/native';
import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/theme';

/**
 * Test renderer with the app's providers attached.
 *
 * Note: in React Native Testing Library v14 both `render` and `fireEvent` are
 * **async** — every call site must await them, or the assertion runs against an
 * unmounted tree.
 */

/** Fixed insets so layout is deterministic and never queries a real device. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

interface Options extends Omit<RenderOptions, 'wrapper'> {
  /** Wrap in a NavigationContainer for components that call useNavigation. */
  withNavigation?: boolean;
  /**
   * Mocks the OS "Reduce Motion" answer `ThemeProvider` reads on mount, for
   * tests that assert an animation's reduced-motion path. One-shot (`Once`) so
   * it never leaks into a later test that renders without this option.
   */
  reduceMotion?: boolean;
}

export const renderWithProviders = (ui: ReactElement, options: Options = {}) => {
  const { withNavigation = false, reduceMotion, ...rest } = options;
  if (reduceMotion !== undefined) {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValueOnce(reduceMotion);
  }

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        {withNavigation ? <NavigationContainer>{children}</NavigationContainer> : children}
      </ThemeProvider>
    </SafeAreaProvider>
  );

  return render(ui, { wrapper: Wrapper, ...rest });
};

export { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
