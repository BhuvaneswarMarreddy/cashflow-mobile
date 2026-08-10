import { isEnabled } from '@/config/featureFlags';
import { loggerFor } from '@/logging';
import { usePreferences } from '@/store/preferencesStore';
import { systemClock, type Clock } from '@/utils/clock';
import { createId } from '@/utils/id';
import { createStreamStore } from '@/utils/streamStore';

import type {
  AnalyticsSink,
  InteractionEvent,
  InteractionEventName,
  InteractionProperties,
  InteractionSource,
} from './types';

export const ANALYTICS_BUFFER_SIZE = 200;

/** On-device buffer that backs the Diagnostics screen. */
export const useAnalyticsStream = createStreamStore<InteractionEvent>(ANALYTICS_BUFFER_SIZE);

const streamSink: AnalyticsSink = {
  name: 'memory',
  send: (event) => useAnalyticsStream.getState().push(event),
};

/**
 * A return to the foreground after this long counts as a new session. Shorter
 * gaps (checking a text message mid-refresh) keep the session alive, which is
 * what stops "session started" from firing a dozen times an hour.
 */
export const SESSION_GAP_MS = 5 * 60 * 1000;

export interface UsageAnalyticsOptions {
  sinks?: AnalyticsSink[];
  clock?: Clock;
  /** Overridable so tests need no flag or preference plumbing. */
  isCollectionAllowed?: () => boolean;
}

export interface UsageAnalytics {
  startSession(reason: 'launch' | 'foreground'): void;
  endSession(reason: 'background' | 'shutdown'): void;
  track(
    name: InteractionEventName,
    source: InteractionSource,
    properties?: InteractionProperties,
  ): void;
  /** Records the exit of the previous screen and the entry of this one. */
  screenViewed(screen: string, source: InteractionSource): void;
  /** Flushes the open screen timer, e.g. when the app backgrounds. */
  closeCurrentScreen(): void;
  currentSessionId(): string | null;
}

const collectionAllowedByUser = (): boolean =>
  isEnabled('ENABLE_USER_ANALYTICS') && usePreferences.getState().privacy.analyticsEnabled;

export const createUsageAnalytics = (options: UsageAnalyticsOptions = {}): UsageAnalytics => {
  const clock = options.clock ?? systemClock;
  const sinks = options.sinks ?? [streamSink];
  const allowed = options.isCollectionAllowed ?? collectionAllowedByUser;
  const log = loggerFor('app');

  let sessionId: string | null = null;
  let sessionStartedAt = 0;
  let lastBackgroundedAt = 0;
  let currentScreen: string | null = null;
  let screenEnteredAt = 0;

  const emit = (
    name: InteractionEventName,
    source: InteractionSource,
    properties: InteractionProperties = {},
  ): void => {
    if (!allowed()) return;
    const event: InteractionEvent = {
      id: createId('evt'),
      timestamp: clock.iso(),
      name,
      source,
      sessionId: sessionId ?? 'no-session',
      properties,
    };
    for (const sink of sinks) {
      try {
        sink.send(event);
      } catch (error) {
        log.warn('analytics.sink_failed', { metadata: { sink: sink.name }, error });
      }
    }
  };

  const startSession: UsageAnalytics['startSession'] = (reason) => {
    const now = clock.now();
    const resuming =
      sessionId !== null && reason === 'foreground' && now - lastBackgroundedAt < SESSION_GAP_MS;
    if (resuming) {
      emit('app.foregrounded', 'system', { durationMs: now - lastBackgroundedAt });
      return;
    }
    sessionId = createId('ses');
    sessionStartedAt = now;
    emit('session.started', 'system');
    emit(reason === 'launch' ? 'app.opened' : 'app.foregrounded', 'system');
  };

  const closeCurrentScreen: UsageAnalytics['closeCurrentScreen'] = () => {
    if (currentScreen === null) return;
    emit('screen.exited', 'system', {
      screen: currentScreen,
      durationMs: clock.now() - screenEnteredAt,
    });
    currentScreen = null;
  };

  const endSession: UsageAnalytics['endSession'] = (reason) => {
    if (sessionId === null) return;
    closeCurrentScreen();
    lastBackgroundedAt = clock.now();
    emit('app.backgrounded', 'system');
    if (reason === 'shutdown') {
      emit('session.ended', 'system', { durationMs: clock.now() - sessionStartedAt });
      sessionId = null;
    }
  };

  return {
    startSession,
    endSession,
    closeCurrentScreen,
    track: emit,
    screenViewed: (screen, source) => {
      if (currentScreen === screen) return;
      const previousScreen = currentScreen;
      if (previousScreen !== null) {
        emit('screen.exited', 'system', {
          screen: previousScreen,
          durationMs: clock.now() - screenEnteredAt,
        });
      }
      currentScreen = screen;
      screenEnteredAt = clock.now();
      emit('screen.viewed', source, {
        screen,
        ...(previousScreen !== null ? { previousScreen } : {}),
      });
    },
    currentSessionId: () => sessionId,
  };
};

export const usageAnalytics = createUsageAnalytics();
