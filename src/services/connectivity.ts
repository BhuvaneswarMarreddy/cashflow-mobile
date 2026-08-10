import { useNetworkState } from 'expo-network';

import { useDevStore } from '@/store/devStore';
import { useFinanceStore } from '@/store/financeStore';

/**
 * Connectivity, as the app needs to talk about it.
 *
 * Four states rather than a boolean, because "the phone has wifi" and "Cashflow
 * can get an answer" are different questions and the user-facing copy differs:
 *
 *  - `online`              everything works
 *  - `offline`             no route to the network at all
 *  - `degraded`            connected, but the internet is not reachable
 *  - `service-unavailable` reachable, but the last refresh failed on the server
 */
export type ConnectivityStatus = 'online' | 'offline' | 'degraded' | 'service-unavailable';

export const useConnectivity = (): ConnectivityStatus => {
  const network = useNetworkState();
  const simulateOffline = useDevStore((state) => state.simulateOffline);
  const lastError = useFinanceStore((state) => state.lastError);

  if (simulateOffline) return 'offline';
  if (network.isConnected === false) return 'offline';
  if (network.isInternetReachable === false) return 'degraded';
  if (lastError?.category === 'service-unavailable') return 'service-unavailable';
  if (lastError?.category === 'network') return 'degraded';
  return 'online';
};

export const CONNECTIVITY_MESSAGE: Record<ConnectivityStatus, string | null> = {
  online: null,
  offline: "You're offline. These are the last figures Cashflow confirmed.",
  degraded: "Cashflow can't reach the network. Showing the last confirmed figures.",
  'service-unavailable': 'Cashflow is temporarily unavailable. Showing your last update.',
};
