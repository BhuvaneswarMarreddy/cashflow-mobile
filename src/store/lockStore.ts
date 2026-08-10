import { create } from 'zustand';

import { usePreferences } from './preferencesStore';

/**
 * Whether the figures are currently covered.
 *
 * Session state, never persisted: a lock that survives a restart is
 * indistinguishable from one that does not, because a cold start arms it
 * anyway. Keeping it in memory means there is no stored flag to tamper with.
 */
interface LockState {
  locked: boolean;
  /** `Date.now()` when the app last went to the background, or null. */
  backgroundedAt: number | null;

  /** Arms the lock if the preference is on. Called on cold start. */
  arm: () => void;
  unlock: () => void;
  noteBackgrounded: (at: number) => void;
  /** Re-arms if the app was away longer than the grace period. */
  noteForegrounded: (at: number) => void;
}

export const useLockStore = create<LockState>()((set, get) => ({
  locked: false,
  backgroundedAt: null,

  arm: () => set({ locked: usePreferences.getState().security.biometricLock }),

  unlock: () => set({ locked: false, backgroundedAt: null }),

  noteBackgrounded: (at) => set({ backgroundedAt: at }),

  noteForegrounded: (at) => {
    const { security } = usePreferences.getState();
    if (!security.biometricLock) return;

    const since = get().backgroundedAt;
    // No recorded background means the app never actually left; a permission
    // sheet or the Face ID prompt itself briefly deactivates the app, and
    // treating that as "went away" would make the lock unopenable.
    if (since === null) return;

    const awayMinutes = (at - since) / 60_000;
    if (awayMinutes >= security.lockAfterMinutes) set({ locked: true });
    set({ backgroundedAt: null });
  },
}));
