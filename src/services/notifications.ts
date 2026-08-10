import { isEnabled } from '@/config/featureFlags';
import { loggerFor } from '@/logging';
import { useNotificationsStore } from '@/store/notificationsStore';
import { usePreferences, type NotificationPreferences } from '@/store/preferencesStore';
import type { AppNotification, NotificationCategory } from '@/types';
import { systemClock, type Clock } from '@/utils/clock';

import { toNotification, type SummaryDraft } from './summarize';

/**
 * Notifications, as a seam.
 *
 * Expo Go cannot deliver remote push, and requiring a development build to see
 * a notification would break the refresh-on-the-phone loop this project is
 * built around. So the default implementation delivers into the in-app
 * notification centre and the log, which is enough to design and test the
 * *content* — the part that actually matters, since the rule here is "summarise,
 * never itemise".
 *
 * To add real delivery later: `npx expo install expo-notifications`, implement
 * this interface over `scheduleNotificationAsync`, and register it in
 * `notificationService`. Nothing else changes. Local notifications work in Expo
 * Go; remote push needs a development build and a project ID.
 */
export interface NotificationService {
  /** Whether the user has enabled this category in Settings. */
  isAllowed(category: NotificationCategory): boolean;
  /** Delivers now. Returns the stored notification, or null if suppressed. */
  present(
    draft: SummaryDraft,
    options: { source: string; correlationId?: string | null },
  ): AppNotification | null;
  /** Placeholder for scheduled delivery; records intent so the flow is testable. */
  schedule(draft: SummaryDraft, atEpochMs: number, options: { source: string }): string | null;
  cancelAll(): void;
}

/** Which preference toggle governs which category of notification. */
const PREFERENCE_FOR: Record<NotificationCategory, keyof NotificationPreferences> = {
  insight: 'financialSummary',
  success: 'financialSummary',
  warning: 'warnings',
  reminder: 'bills',
  system: 'financialSummary',
};

export interface NotificationServiceOptions {
  clock?: Clock;
}

export const createNotificationService = (
  options: NotificationServiceOptions = {},
): NotificationService => {
  const clock = options.clock ?? systemClock;
  const log = loggerFor('notifications');
  const scheduled = new Map<string, { draft: SummaryDraft; at: number }>();

  const isAllowed: NotificationService['isAllowed'] = (category) => {
    if (!isEnabled('ENABLE_NOTIFICATIONS')) return false;
    const preferences = usePreferences.getState().notifications;
    if (!preferences.enabled) return false;
    return preferences[PREFERENCE_FOR[category]];
  };

  return {
    isAllowed,

    present: (draft, opts) => {
      if (!isAllowed(draft.category)) {
        log.debug('notification.suppressed', {
          metadata: { category: draft.category, source: opts.source },
        });
        return null;
      }
      const notification = toNotification(draft, {
        source: opts.source,
        correlationId: opts.correlationId ?? null,
        now: clock.now(),
      });
      useNotificationsStore.getState().add(notification);
      log.info('notification.presented', {
        ...(notification.correlationId !== null
          ? { correlationId: notification.correlationId }
          : {}),
        metadata: {
          category: notification.category,
          severity: notification.severity,
          source: notification.source,
        },
      });
      return notification;
    },

    schedule: (draft, atEpochMs, opts) => {
      if (!isAllowed(draft.category)) return null;
      const id = `sched_${atEpochMs}_${opts.source}`;
      scheduled.set(id, { draft, at: atEpochMs });
      log.info('notification.scheduled', {
        metadata: { id, inMs: atEpochMs - clock.now(), source: opts.source },
      });
      return id;
    },

    cancelAll: () => {
      scheduled.clear();
      log.info('notification.all_cancelled');
    },
  };
};

export const notificationService = createNotificationService();
