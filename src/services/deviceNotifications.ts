import * as Notifications from 'expo-notifications';

import { loggerFor } from '@/logging';
import type { NotificationCategory } from '@/types';

/**
 * Real iOS notifications — the part that actually leaves the app.
 *
 * **Local, not remote.** A local notification is scheduled by the device and
 * fires whether or not the app is open; remote push needs APNs credentials and
 * a server that decides when to wake someone up. Everything this app wants to
 * say is already known at refresh time — your runway, a bill due on Thursday —
 * so scheduling it locally delivers the same value with no push infrastructure
 * and no financial data leaving the device to a notification server.
 *
 * That last part is the real argument. A remote push carrying "You have 17 days
 * of runway" means that sentence exists on Apple's servers. A local one never
 * leaves the phone.
 */

const log = loggerFor('notifications');

/**
 * Show a banner even when the app is in the foreground.
 *
 * Without this iOS silently swallows a notification that fires while you are
 * looking at the app, which makes every test look like a failure.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export const permissionState = async (): Promise<PermissionState> => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'undetermined';
  }
};

/**
 * Asks, once.
 *
 * iOS only ever shows the system prompt on the FIRST request; every later call
 * returns the previous answer silently. So a caller that treats a `denied` here
 * as "the user just said no" is wrong — they may have said no months ago, and
 * the only route back is Settings. `notificationsBlocked` below is how a screen
 * tells those apart.
 */
export const requestPermission = async (): Promise<PermissionState> => {
  try {
    const existing = await permissionState();
    if (existing === 'granted') return 'granted';

    const { status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: false, allowBadge: true },
    });
    const next = status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
    log.info('notifications.permission', { metadata: { state: next } });
    return next;
  } catch {
    return 'undetermined';
  }
};

/** True when the OS will refuse, and the only fix is the iOS Settings app. */
export const notificationsBlocked = async (): Promise<boolean> =>
  (await permissionState()) === 'denied';

interface Payload {
  title: string;
  body: string;
  category: NotificationCategory;
}

/**
 * Fire now.
 *
 * `trigger: null` means "as soon as possible", which iOS delivers immediately.
 * The category rides in `data` so a future tap-handler can route to the right
 * screen; nothing financial goes in there — a notification payload is readable
 * from the lock screen.
 */
export const presentNow = async (payload: Payload): Promise<string | null> => {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: payload.title, body: payload.body, data: { category: payload.category } },
      trigger: null,
    });
  } catch (error) {
    log.warn('notifications.present_failed', {
      metadata: { code: (error as { code?: string })?.code ?? 'unknown' },
    });
    return null;
  }
};

/** Fire at a wall-clock instant. Anything already past fires immediately. */
export const scheduleAt = async (payload: Payload, atEpochMs: number): Promise<string | null> => {
  try {
    const seconds = Math.max(1, Math.round((atEpochMs - Date.now()) / 1000));
    return await Notifications.scheduleNotificationAsync({
      content: { title: payload.title, body: payload.body, data: { category: payload.category } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
    });
  } catch (error) {
    log.warn('notifications.schedule_failed', {
      metadata: { code: (error as { code?: string })?.code ?? 'unknown' },
    });
    return null;
  }
};

export const cancelAllScheduled = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Nothing scheduled, or no permission. Either way there is nothing to undo.
  }
};
