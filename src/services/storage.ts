import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Local persistence, behind one interface.
 *
 * Two implementations exist for a reason: `preferenceStore` is plain, readable
 * device storage for things that are boring if leaked (theme, tab order), and
 * `secretStore` is the Keychain/Keystore-backed one for anything that would be
 * damaging if leaked (auth tokens). Nothing financial is persisted by either —
 * see docs/architecture.md, "What we deliberately do not store".
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const NAMESPACE = 'cashflow';
const namespaced = (key: string) => `${NAMESPACE}:${key}`;

/** Unencrypted device storage. Preferences and UI state only. */
export const preferenceStore: KeyValueStore = {
  get: (key) => AsyncStorage.getItem(namespaced(key)),
  set: (key, value) => AsyncStorage.setItem(namespaced(key), value),
  remove: (key) => AsyncStorage.removeItem(namespaced(key)),
};

/**
 * Keychain (iOS) / Keystore (Android) backed storage.
 *
 * SecureStore keys must be alphanumeric plus `.-_`, so the namespace separator
 * is a dot rather than a colon.
 */
const secureKey = (key: string) => `${NAMESPACE}.${key}`.replace(/[^A-Za-z0-9._-]/g, '_');

export const secretStore: KeyValueStore = {
  get: (key) => SecureStore.getItemAsync(secureKey(key)),
  set: (key, value) => SecureStore.setItemAsync(secureKey(key), value),
  remove: (key) => SecureStore.deleteItemAsync(secureKey(key)),
};

/** Used by tests and by the in-memory fallback when storage is unavailable. */
export const createMemoryStore = (): KeyValueStore => {
  const map = new Map<string, string>();
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => {
      map.set(key, value);
    },
    remove: async (key) => {
      map.delete(key);
    },
  };
};

/**
 * Adapter so zustand's `persist` middleware can write through a KeyValueStore
 * instead of importing AsyncStorage directly at every call site.
 */
export const zustandStorage = (store: KeyValueStore) => ({
  getItem: (name: string) => store.get(name),
  setItem: (name: string, value: string) => store.set(name, value),
  removeItem: (name: string) => store.remove(name),
});
