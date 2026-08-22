import { isEnabled } from '@/config/featureFlags';
import { loggerFor } from '@/logging';
import { useNotificationsStore } from '@/store/notificationsStore';
import { usePreferences, type NotificationPreferences } from '@/store/preferencesStore';
import type { AppNotification, NotificationCategory } from '@/types';
import { systemClock, type Clock } from '@/utils/clock';

import { cancelAllScheduled, presentNow, scheduleAt } from './deviceNotifications';
import { toNotification, type SummaryDraft } from './summarize';

/**
 * Notifications.
 *
 * Every delivery does two things: it posts a real iOS notification (see
 * `deviceNotifications.ts`) and it appends to the in-app centre. The centre is
 * the LOG — what was said and when — which a banner cannot be, because a banner
 * is gone the moment it is dismissed and there is no way back to the sentence.
 *
 * Delivery is LOCAL. Everything worth saying is already known at refresh time,
 * so scheduling it on the device costs no push infrastructure and, more
 * importantly, means a sentence like "17 days of runway" never exists on a
 * notification server. Remote push would put the owner's figures on Apple's
 * infrastructure to say something the phone already knew.
 *
 * The rule the content follows — summarise, never itemise — lives in
 * `summarize.ts`, and is the reason this file only ever handles a `SummaryDraft`
 * rather than a list of transactions.
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
      // Fire-and-forget: the in-app record is the source of truth and must not
      // depend on the OS accepting the banner. A revoked permission suppresses
      // the banner and leaves the log intact, which is the correct order of
      // precedence — the owner can always find what was said.
      void presentNow({ title: draft.title, body: draft.summary, category: draft.category });
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
      void scheduleAt({ title: draft.title, body: draft.summary, category: draft.category }, atEpochMs);
      log.info('notification.scheduled', {
        metadata: { id, inMs: atEpochMs - clock.now(), source: opts.source },
      });
      return id;
    },

    cancelAll: () => {
      scheduled.clear();
      void cancelAllScheduled();
      log.info('notification.all_cancelled');
    },
  };
};

export const notificationService = createNotificationService();
