// @testing-library/react-native v13+ registers its matchers automatically.

// Device storage. The real modules need a native runtime; tests get an
// in-memory equivalent so persistence paths are still exercised.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    isAvailableAsync: jest.fn(async () => true),
  };
});

// Without this, SafeAreaProvider renders nothing until a real onLayout event —
// which never arrives in a test — so the whole tree comes back empty.
// `.default` matters: the shipped mock is a default export, so without it every
// named import (SafeAreaProvider, useSafeAreaInsets) resolves to undefined.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true, type: 'WIFI' }),
  NetworkStateType: { WIFI: 'WIFI', CELLULAR: 'CELLULAR', NONE: 'NONE', UNKNOWN: 'UNKNOWN' },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Tests assert on behaviour, not on log noise.
jest.spyOn(console, 'log').mockImplementation(() => undefined);
jest.spyOn(console, 'debug').mockImplementation(() => undefined);
