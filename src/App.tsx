import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { ErrorBoundary, installGlobalErrorHandler } from '@/errors';
import { useInitialLoad } from '@/hooks/useRefresh';
import { loggerFor } from '@/logging';
import { RootNavigator } from '@/navigation/RootNavigator';
import { LockScreen } from '@/screens/LockScreen';
import { SignInScreen } from '@/screens/SignInScreen';
import { reportFirebaseStatus } from '@/services/firebase';
import { useAppLifecycle } from '@/services/lifecycle';
import { useAuthStore } from '@/store/authStore';
import { useLockStore } from '@/store/lockStore';
import { usePreferencesHydrated } from '@/store/preferencesStore';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/theme';

/**
 * Root composition.
 *
 * Provider order matters: safe-area and theme sit above the navigator (it needs
 * both to paint), and the error boundary is outermost so a crash inside a
 * provider still renders something rather than a white screen.
 */

/**
 * Hold the native splash until the app can render its real first frame.
 *
 * Called at module scope, before React mounts — `preventAutoHideAsync` after
 * the first render is a race the splash sometimes wins, which shows up as a
 * one-frame flash of the wrong colour.
 *
 * Note for the Expo Go loop: Expo Go paints its own splash, so the configured
 * artwork only appears in a development or production build. The hold-and-fade
 * behaviour below works in both.
 */
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 220, fade: true });

const Shell = () => {
  const theme = useTheme();
  useInitialLoad();

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </>
  );
};

/**
 * Decides what the first real frame is.
 *
 * Two things must settle first: persisted preferences (so a dark-mode user does
 * not get a white flash) and the Firebase session (so an already-signed-in user
 * never sees the sign-in screen flash past). Until both land, this renders
 * nothing and the splash stays up — which is the point of holding it.
 */
const AppContent = () => {
  const theme = useTheme();
  const hydrated = usePreferencesHydrated();
  const status = useAuthStore((state) => state.status);
  const observe = useAuthStore((state) => state.observe);
  const locked = useLockStore((state) => state.locked);
  const arm = useLockStore((state) => state.arm);

  // ABOVE the lock gate, not inside Shell. Mounted below it, every unlock
  // remounted the hook and recorded a fresh `session.started` / `app.launched`
  // — five for one continuous day of use — and the lock store's own
  // foreground/background bookkeeping went with it.
  useAppLifecycle();

  useEffect(() => observe(), [observe]);

  // Cold start arms the lock, once preferences are readable and the restored
  // session is known. A signed-out user has nothing to cover.
  useEffect(() => {
    if (hydrated && status === 'signed-in') arm();
  }, [hydrated, status, arm]);

  const ready = hydrated && status !== 'unknown';

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  if (status === 'signed-out') {
    return (
      <>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <SignInScreen />
      </>
    );
  }

  // Above the navigator on purpose: a lock rendered as a screen inside it can
  // be dismissed with a back gesture or a deep link.
  if (locked) {
    return (
      <>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <LockScreen />
      </>
    );
  }

  return <Shell />;
};

export default function App() {
  useEffect(() => {
    installGlobalErrorHandler();
    reportFirebaseStatus();
    loggerFor('app').info('app.started');
  }, []);

  return (
    <ErrorBoundary boundary="root">
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
