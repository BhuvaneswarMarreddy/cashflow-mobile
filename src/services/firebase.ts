import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from '@firebase/app';
import { getReactNativePersistence, initializeAuth, type Auth } from '@firebase/auth';
import { initializeFirestore, type Firestore } from '@firebase/firestore';
import { getFunctions, type Functions } from '@firebase/functions';

import { loggerFor } from '@/logging';

/**
 * Firebase, for React Native.
 *
 * The **JS SDK**, not `@react-native-firebase/*`, and that is the load-bearing
 * choice: the JS SDK is pure JavaScript, so it runs in Expo Go, while the
 * native modules would force a development build and end the reload-on-phone
 * loop this project is built around. It is also the same SDK the web app uses,
 * so both clients read the same documents through the same query semantics.
 *
 * **Imports come from `@firebase/*`, never `firebase/*`.** The umbrella
 * `firebase/auth` and `firebase/firestore` entry points declare only `node`,
 * `browser` and `default` conditions, so React Native falls through to the
 * browser build: `getReactNativePersistence` would be `undefined` at runtime
 * (not merely untyped) and Firestore would use the browser transport. The
 * scoped packages carry a real `react-native` condition. Keep every Firebase
 * import in this project scoped, or two copies of the SDK end up loaded.
 *
 * Project: `marreddy-cashflow`, app "Cashflow Mobile" (registered separately
 * from the web app so the two can be told apart in Firebase analytics and
 * revoked independently).
 */

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

/**
 * True when a project is configured. Read this before touching `auth`/`db` so
 * a missing `.env` produces a clear message instead of an SDK stack trace.
 */
export const isFirebaseConfigured = (): boolean =>
  config.apiKey.length > 0 && config.projectId.length > 0;

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let functionsInstance: Functions | null = null;

/** Matches `firebase.json`'s `frameworksBackend.region` for the api codebase. */
const FUNCTIONS_REGION = 'us-central1';

const ensureApp = (): FirebaseApp => {
  if (app) return app;
  app = getApps().length === 0 ? initializeApp(config) : getApp();
  return app;
};

/**
 * Auth with AsyncStorage persistence.
 *
 * `initializeAuth` + `getReactNativePersistence`, never plain `getAuth`: on
 * React Native `getAuth` defaults to in-memory persistence, which signs the
 * user out every time the app is killed. The SDK warns about this in a console
 * message that is easy to miss.
 */
export const firebaseAuth = (): Auth => {
  if (authInstance) return authInstance;

  // Guards the resolution described above: if the bundler ever hands us the
  // browser build, this is undefined and the session would silently vanish on
  // every app restart. Better to fail loudly at startup.
  if (typeof getReactNativePersistence !== 'function') {
    throw new Error(
      'Firebase resolved its browser build — auth would not persist. Check that ' +
        'imports use @firebase/auth (scoped), not firebase/auth.',
    );
  }

  authInstance = initializeAuth(ensureApp(), {
    persistence: getReactNativePersistence(AsyncStorage),
  });
  return authInstance;
};

/**
 * Firestore.
 *
 * No `persistentLocalCache` here — it is IndexedDB-backed and unavailable in
 * React Native, so the web app's offline cache has no equivalent on this
 * client. Reads go to the network; `financeStore` holds them in memory for the
 * session and nothing financial is written to device storage.
 *
 * `experimentalAutoDetectLongPolling` handles networks and proxies where gRPC
 * streaming silently stalls, which otherwise presents as a query that never
 * resolves and never errors.
 */
export const firestore = (): Firestore => {
  if (dbInstance) return dbInstance;
  dbInstance = initializeFirestore(ensureApp(), {
    experimentalAutoDetectLongPolling: true,
  });
  return dbInstance;
};

/**
 * Callable Cloud Functions.
 *
 * Region is pinned because `httpsCallable` defaults to `us-central1` silently;
 * a function deployed anywhere else then fails with a CORS error that says
 * nothing about the real cause.
 */
export const firebaseFunctions = (): Functions => {
  if (functionsInstance) return functionsInstance;
  functionsInstance = getFunctions(ensureApp(), FUNCTIONS_REGION);
  return functionsInstance;
};

/** Called once at startup so a misconfigured build says so in Diagnostics. */
export const reportFirebaseStatus = (): void => {
  const log = loggerFor('auth');
  if (!isFirebaseConfigured()) {
    log.warn('firebase.not_configured', {
      message: 'No Firebase config found — copy .env.example to .env.',
    });
    return;
  }
  log.info('firebase.configured', { metadata: { projectId: config.projectId } });
};
