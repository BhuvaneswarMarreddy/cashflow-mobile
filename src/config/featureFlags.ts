import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { preferenceStore, zustandStorage } from '@/services/storage';

import { environment, type AppEnvironment } from './env';

export const FEATURE_FLAGS = [
  'ENABLE_DEBUG_LOGGING',
  'ENABLE_USER_ANALYTICS',
  'ENABLE_SYSTEM_AUDIT',
  'ENABLE_NOTIFICATIONS',
  'ENABLE_MOCK_API',
  'ENABLE_EXPERIMENTAL_UI',
  'ENABLE_DIAGNOSTICS',
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export type FlagSet = Record<FeatureFlag, boolean>;

/**
 * Defaults per environment.
 *
 * `ENABLE_MOCK_API` is OFF everywhere except tests: the app talks to the
 * `homeSnapshot` callable, which derives the real figures with the web app's
 * own money logic (see `src/data/firebaseRepositories.ts`).
 *
 * It stays available as a developer-panel override, because the mock dataset is
 * still the only way to exercise the eleven scenarios — an empty account, a
 * failed refresh, a negative balance — that real data will not reproduce on
 * demand. Tests keep it on so no suite can ever reach the network.
 */
const DEFAULTS: Record<AppEnvironment, FlagSet> = {
  development: {
    ENABLE_DEBUG_LOGGING: true,
    ENABLE_USER_ANALYTICS: true,
    ENABLE_SYSTEM_AUDIT: true,
    ENABLE_NOTIFICATIONS: true,
    ENABLE_MOCK_API: false,
    ENABLE_EXPERIMENTAL_UI: false,
    ENABLE_DIAGNOSTICS: true,
  },
  test: {
    ENABLE_DEBUG_LOGGING: false,
    ENABLE_USER_ANALYTICS: false,
    ENABLE_SYSTEM_AUDIT: true,
    ENABLE_NOTIFICATIONS: false,
    ENABLE_MOCK_API: true,
    ENABLE_EXPERIMENTAL_UI: false,
    ENABLE_DIAGNOSTICS: false,
  },
  staging: {
    ENABLE_DEBUG_LOGGING: true,
    ENABLE_USER_ANALYTICS: true,
    ENABLE_SYSTEM_AUDIT: true,
    ENABLE_NOTIFICATIONS: true,
    ENABLE_MOCK_API: false,
    ENABLE_EXPERIMENTAL_UI: true,
    ENABLE_DIAGNOSTICS: true,
  },
  production: {
    ENABLE_DEBUG_LOGGING: false,
    ENABLE_USER_ANALYTICS: true,
    ENABLE_SYSTEM_AUDIT: true,
    ENABLE_NOTIFICATIONS: true,
    ENABLE_MOCK_API: false,
    ENABLE_EXPERIMENTAL_UI: false,
    ENABLE_DIAGNOSTICS: false,
  },
};

export const defaultFlags = (): FlagSet => ({ ...DEFAULTS[environment] });

interface FeatureFlagState {
  flags: FlagSet;
  setFlag: (flag: FeatureFlag, enabled: boolean) => void;
  resetFlags: () => void;
}

/**
 * Flags are readable outside React via `useFeatureFlags.getState()`, which is
 * how the logger, analytics and audit services gate themselves without taking a
 * dependency on the component tree.
 */
export const useFeatureFlags = create<FeatureFlagState>()(
  persist(
    (set) => ({
      flags: defaultFlags(),
      setFlag: (flag, enabled) => set((state) => ({ flags: { ...state.flags, [flag]: enabled } })),
      resetFlags: () => set({ flags: defaultFlags() }),
    }),
    {
      name: 'feature-flags',
      storage: createJSONStorage(() => zustandStorage(preferenceStore)),
      // Start from this build's defaults and layer saved overrides on top, so a
      // flag added in a later release is not missing for existing installs.
      merge: (persisted, current) => {
        const saved = (persisted as { flags?: Partial<FlagSet> } | null)?.flags ?? {};
        return { ...current, flags: { ...defaultFlags(), ...saved } };
      },
    },
  ),
);

/** Non-reactive read, for services that live outside the component tree. */
export const isEnabled = (flag: FeatureFlag): boolean => useFeatureFlags.getState().flags[flag];

/** Reactive read, for components. */
export const useFlag = (flag: FeatureFlag): boolean =>
  useFeatureFlags((state) => state.flags[flag]);
