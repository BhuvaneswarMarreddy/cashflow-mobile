import type { Persistence } from '@firebase/auth';

/**
 * `getReactNativePersistence` exists, but TypeScript cannot see it.
 *
 * `@firebase/auth`'s exports map lists `"types"` *before* `"react-native"`,
 * and conditions match in declaration order — so TypeScript resolves the
 * generic `auth-public.d.ts` and never reaches the React Native typings that
 * declare this function. Metro has no `types` condition, so at runtime it does
 * reach `"react-native"` and loads `dist/rn/index.js`, where the function is
 * real.
 *
 * This augmentation states the signature TypeScript is missing. `firebase.ts`
 * additionally checks the symbol at runtime, so if a future SDK version changes
 * the resolution the app fails with a clear message instead of a confusing
 * "persistence is undefined" crash.
 */
declare module '@firebase/auth' {
  interface ReactNativeAsyncStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }

  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
