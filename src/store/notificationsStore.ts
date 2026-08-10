import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { preferenceStore, zustandStorage } from '@/services/storage';
import type { AppNotification } from '@/types';

/**
 * The notification centre.
 *
 * Client-owned today because notifications are generated on the device from
 * refresh results; there is no server resource to fetch, so there is no
 * repository. When the backend starts producing them this becomes a cache in
 * front of `/notifications` and gains one.
 *
 * Persisted, capped, and free of amounts-as-truth: the stored copy is text the
 * app already decided to show, not a second source of financial figures.
 */
const MAX_STORED = 50;

interface NotificationsState {
  items: AppNotification[];
  add: (notification: AppNotification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      items: [],
      add: (notification) =>
        set((state) => ({ items: [notification, ...state.items].slice(0, MAX_STORED) })),
      markRead: (id) =>
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
        })),
      markAllRead: () =>
        set((state) => ({ items: state.items.map((item) => ({ ...item, read: true })) })),
      remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'notifications',
      storage: createJSONStorage(() => zustandStorage(preferenceStore)),
    },
  ),
);

export const selectUnreadCount = (state: NotificationsState): number =>
  state.items.reduce((count, item) => (item.read ? count : count + 1), 0);
