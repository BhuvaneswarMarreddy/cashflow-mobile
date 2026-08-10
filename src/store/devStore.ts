import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_SCENARIO, type ScenarioId } from '@/mocks/scenarios';
import { preferenceStore, zustandStorage } from '@/services/storage';

/**
 * Development-only switches, surfaced in Settings → Developer.
 *
 * Persisted so a scenario survives a Metro reload — losing "low cash" every
 * time the bundle refreshes is exactly the friction this is meant to remove.
 * The developer panel is unreachable in production (`developerToolsAvailable`),
 * so these values simply sit at their defaults there.
 */
interface DevState {
  scenario: ScenarioId;
  simulateFailure: boolean;
  simulateOffline: boolean;
  simulateSlowNetwork: boolean;

  setScenario: (scenario: ScenarioId) => void;
  setSimulateFailure: (value: boolean) => void;
  setSimulateOffline: (value: boolean) => void;
  setSimulateSlowNetwork: (value: boolean) => void;
  reset: () => void;
}

const INITIAL = {
  scenario: DEFAULT_SCENARIO,
  simulateFailure: false,
  simulateOffline: false,
  simulateSlowNetwork: false,
};

export const useDevStore = create<DevState>()(
  persist(
    (set) => ({
      ...INITIAL,
      setScenario: (scenario) => set({ scenario }),
      setSimulateFailure: (simulateFailure) => set({ simulateFailure }),
      setSimulateOffline: (simulateOffline) => set({ simulateOffline }),
      setSimulateSlowNetwork: (simulateSlowNetwork) => set({ simulateSlowNetwork }),
      reset: () => set({ ...INITIAL }),
    }),
    {
      name: 'dev-settings',
      storage: createJSONStorage(() => zustandStorage(preferenceStore)),
    },
  ),
);
