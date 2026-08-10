import { useCallback, useEffect } from 'react';

import { refreshFinancialData, type RefreshTrigger } from '@/services/refresh';
import { useDevStore } from '@/store/devStore';
import { useFinanceStore } from '@/store/financeStore';

/** Wiring for `<AppScreen onRefresh>`. */
export const usePullToRefresh = (): { refreshing: boolean; onRefresh: () => void } => {
  const status = useFinanceStore((state) => state.status);
  const onRefresh = useCallback(() => {
    void refreshFinancialData('pull');
  }, []);
  return { refreshing: status === 'refreshing', onRefresh };
};

export const triggerRefresh = (trigger: RefreshTrigger = 'tap'): void => {
  void refreshFinancialData(trigger);
};

/**
 * Loads once at startup, and re-loads whenever the development scenario
 * changes — switching to "Low cash" and still seeing healthy numbers would make
 * the scenario switcher useless.
 */
export const useInitialLoad = (): void => {
  useEffect(() => {
    if (useFinanceStore.getState().status === 'idle') void refreshFinancialData('launch');
    return useDevStore.subscribe((state, previous) => {
      if (state.scenario !== previous.scenario) {
        useFinanceStore.getState().reset();
        void refreshFinancialData('tap');
      }
    });
  }, []);
};
