import { useFeatureFlags, defaultFlags } from '@/config';
import { useDevStore } from '@/store/devStore';
import { useFinanceStore } from '@/store/financeStore';
import { useNotificationsStore } from '@/store/notificationsStore';
import { usePreferences } from '@/store/preferencesStore';

/**
 * Puts every store back to a known state.
 *
 * Zustand stores are module singletons, so without this one test's "low cash"
 * scenario silently becomes the next test's starting position.
 */
export const resetStores = (): void => {
  useFinanceStore.getState().reset();
  useNotificationsStore.getState().clear();
  useDevStore.getState().reset();
  usePreferences.getState().reset();
  useFeatureFlags.setState({ flags: defaultFlags() });
};
