import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { preferenceStore, zustandStorage } from '@/services/storage';
import type { ThemeMode } from '@/theme';

export interface NotificationPreferences {
  enabled: boolean;
  financialSummary: boolean;
  bills: boolean;
  paycheck: boolean;
  warnings: boolean;
}

export interface SecurityPreferences {
  /**
   * Require Face ID / Touch ID before the figures are shown.
   *
   * A LOCK, not a login — see `services/biometrics.ts`. Off by default: turning
   * it on has to be a deliberate choice, because a user whose enrolment breaks
   * would otherwise be locked out of an app they never asked to lock.
   */
  biometricLock: boolean;
  /** Minutes in the background before the lock re-arms. 0 = every time. */
  lockAfterMinutes: number;
}

export interface PrivacyPreferences {
  /** Opt-in for behavioural telemetry. Never gates financial correctness logs. */
  analyticsEnabled: boolean;
  /** Opt-in for verbose diagnostic logging kept on the device. */
  diagnosticLoggingEnabled: boolean;
}

interface PreferencesState {
  themeMode: ThemeMode;
  notifications: NotificationPreferences;
  privacy: PrivacyPreferences;
  security: SecurityPreferences;
  /** Remembered so Accounts can restore the last thing the user looked at. */
  lastAccountId: string | null;
  onboardingComplete: boolean;

  setThemeMode: (mode: ThemeMode) => void;
  setNotificationPreference: (key: keyof NotificationPreferences, value: boolean) => void;
  setPrivacyPreference: (key: keyof PrivacyPreferences, value: boolean) => void;
  setBiometricLock: (enabled: boolean) => void;
  setLockAfterMinutes: (minutes: number) => void;
  setLastAccountId: (id: string | null) => void;
  completeOnboarding: () => void;
  reset: () => void;
}

const INITIAL = {
  themeMode: 'system' as ThemeMode,
  notifications: {
    enabled: true,
    financialSummary: true,
    bills: true,
    paycheck: true,
    warnings: true,
  },
  privacy: {
    analyticsEnabled: true,
    diagnosticLoggingEnabled: true,
  },
  security: {
    biometricLock: false,
    lockAfterMinutes: 5,
  },
  lastAccountId: null,
  onboardingComplete: false,
};

/**
 * Durable user preferences. Deliberately small: no financial data, no
 * identifiers, nothing that would matter if the device backup were read.
 */
export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...INITIAL,
      setThemeMode: (themeMode) => set({ themeMode }),
      setNotificationPreference: (key, value) =>
        set((state) => ({ notifications: { ...state.notifications, [key]: value } })),
      setPrivacyPreference: (key, value) =>
        set((state) => ({ privacy: { ...state.privacy, [key]: value } })),
      setBiometricLock: (biometricLock) =>
        set((state) => ({ security: { ...state.security, biometricLock } })),
      setLockAfterMinutes: (lockAfterMinutes) =>
        set((state) => ({ security: { ...state.security, lockAfterMinutes } })),
      setLastAccountId: (lastAccountId) => set({ lastAccountId }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      reset: () => set({ ...INITIAL }),
    }),
    {
      name: 'preferences',
      storage: createJSONStorage(() => zustandStorage(preferenceStore)),
    },
  ),
);

/**
 * True once persisted preferences have been read back.
 *
 * The app holds the splash screen until this flips, otherwise a dark-mode user
 * sees a white flash while storage resolves.
 */
export const usePreferencesHydrated = (): boolean =>
  // `useSyncExternalStore` rather than useState + useEffect: the snapshot is
  // read on every render, so there is no window in which hydration can finish
  // between the first read and the subscription. Missing that window would
  // leave the gate shut forever — a permanently blank app, not a slow one.
  useSyncExternalStore(
    (onStoreChange) => usePreferences.persist.onFinishHydration(onStoreChange),
    () => usePreferences.persist.hasHydrated(),
  );
