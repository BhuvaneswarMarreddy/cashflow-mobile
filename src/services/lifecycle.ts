import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { usageAnalytics } from '@/analytics';
import { loggerFor } from '@/logging';
import { useLockStore } from '@/store/lockStore';

import { refreshFinancialData } from './refresh';

/**
 * App lifecycle.
 *
 * Session boundaries are decided here and nowhere else, which is what stops
 * duplicate `session.started` events: React Native fires `active` on mount and
 * again after any transient interruption, so the transition — not the state —
 * is what gets recorded.
 */

/** Data older than this is worth re-fetching when the app comes back. */
export const STALE_AFTER_MS = 5 * 60 * 1000;

export const useAppLifecycle = (): void => {
  const previous = useRef<AppStateStatus>(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    const log = loggerFor('app');
    usageAnalytics.startSession('launch');
    log.info('app.launched');

    const subscription = AppState.addEventListener('change', (next) => {
      const from = previous.current;
      previous.current = next;

      if (from.match(/inactive|background/) && next === 'active') {
        const away = backgroundedAt.current === null ? 0 : Date.now() - backgroundedAt.current;
        usageAnalytics.startSession('foreground');
        log.info('app.foregrounded', { metadata: { awayMs: away } });
        // Re-arm before anything renders. The store decides whether the time
        // away was long enough; this only reports the transition.
        useLockStore.getState().noteForegrounded(Date.now());
        if (away > STALE_AFTER_MS) {
          void refreshFinancialData('foreground');
        }
        return;
      }

      if (from === 'active' && next.match(/inactive|background/)) {
        backgroundedAt.current = Date.now();
        useLockStore.getState().noteBackgrounded(Date.now());
        usageAnalytics.endSession('background');
        log.info('app.backgrounded');
      }
    });

    return () => {
      subscription.remove();
      usageAnalytics.endSession('shutdown');
    };
  }, []);
};
