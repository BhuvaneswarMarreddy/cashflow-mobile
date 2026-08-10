import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from '@firebase/auth';

import { AppError } from '@/errors';
import { loggerFor } from '@/logging';
import { firebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import { isGoogleSignInAvailable, signInWithGoogle, signOutGoogle } from '@/services/googleSignIn';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

/**
 * Authentication, against the same Firebase project as the web app.
 *
 * Email/password only. Google sign-in is deliberately absent: it needs a popup
 * the web app opens with `signInWithPopup`, which has no equivalent in React
 * Native — the mobile version would need `expo-auth-session` and a redirect
 * scheme, and that is its own piece of work rather than a line of config.
 *
 * **Token storage tradeoff, stated plainly:** the Firebase RN SDK persists the
 * refresh token through AsyncStorage, not the Keychain. `getReactNativePersistence`
 * accepts any get/set/remove store, so an `expo-secure-store` adapter looks
 * tempting — but SecureStore caps values at 2048 bytes on Android and the
 * persisted user blob can exceed that, which would fail as an intermittent
 * signed-out-on-launch rather than a clean error. Keychain-backed persistence
 * is a real improvement and belongs with the biometric-unlock work, where the
 * size limit can be handled deliberately.
 */
export interface AuthService {
  /** Firebase ID token, refreshed by the SDK when close to expiry. */
  getAccessToken(): Promise<string | null>;
  /** Forces a fresh token — used after a 401. */
  refresh(): Promise<string | null>;
  signIn(email: string, password: string): Promise<AuthUser>;
  /** Google, via the native SDK. Development build only — see googleSignIn.ts. */
  signInWithGoogle(): Promise<AuthUser>;
  /** Whether the Google button should be offered on this build. */
  googleAvailable(): boolean;
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
  currentUser(): AuthUser | null;
  subscribe(listener: (user: AuthUser | null) => void): () => void;
}

const toAuthUser = (user: User | null): AuthUser | null =>
  user === null ? null : { uid: user.uid, email: user.email, displayName: user.displayName };

/**
 * Firebase error codes → calm, non-technical messages.
 *
 * `invalid-credential` deliberately does not distinguish "no such account"
 * from "wrong password" — that distinction is an account-enumeration oracle,
 * and Firebase stopped separating them for the same reason.
 */
const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-email': "That email address doesn't look right.",
  'auth/invalid-credential': "That email and password don't match.",
  'auth/wrong-password': "That email and password don't match.",
  'auth/user-not-found': "That email and password don't match.",
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/network-request-failed': "Cashflow can't reach the network right now.",
};

const authError = (error: unknown): AppError => {
  const code = (error as { code?: string })?.code ?? 'unknown';
  const isNetwork = code === 'auth/network-request-failed';
  return new AppError({
    category: isNetwork ? 'network' : 'authentication',
    code: code.replace('auth/', '').toUpperCase().replace(/-/g, '_'),
    userMessage: AUTH_MESSAGES[code] ?? 'Sign-in failed. Please try again.',
    technicalMessage: (error as { message?: string })?.message ?? code,
    retryable: isNetwork,
  });
};

const notConfigured = () =>
  new AppError({
    category: 'unexpected',
    code: 'FIREBASE_NOT_CONFIGURED',
    userMessage: 'Cashflow is not configured to connect yet.',
    technicalMessage: 'Missing EXPO_PUBLIC_FIREBASE_* values — see .env.example',
    retryable: false,
  });

export const createAuthService = (): AuthService => {
  const log = loggerFor('auth');

  return {
    getAccessToken: async () => {
      if (!isFirebaseConfigured()) return null;
      const user = firebaseAuth().currentUser;
      return user ? user.getIdToken() : null;
    },

    refresh: async () => {
      if (!isFirebaseConfigured()) return null;
      const user = firebaseAuth().currentUser;
      if (!user) return null;
      log.info('auth.token_refreshed');
      return user.getIdToken(true);
    },

    signIn: async (email, password) => {
      if (!isFirebaseConfigured()) throw notConfigured();
      try {
        const credential = await signInWithEmailAndPassword(
          firebaseAuth(),
          email.trim(),
          password,
        );
        log.info('auth.signed_in');
        return toAuthUser(credential.user) as AuthUser;
      } catch (error) {
        const normalised = authError(error);
        // The code is safe to log; the email and password never are.
        log.warn('auth.sign_in_failed', { metadata: { code: normalised.code } });
        throw normalised;
      }
    },

    signInWithGoogle: async () => {
      if (!isFirebaseConfigured()) throw notConfigured();
      const credential = await signInWithGoogle();
      return toAuthUser(credential.user) as AuthUser;
    },

    googleAvailable: () => isFirebaseConfigured() && isGoogleSignInAvailable(),

    sendPasswordReset: async (email) => {
      if (!isFirebaseConfigured()) throw notConfigured();
      try {
        await sendPasswordResetEmail(firebaseAuth(), email.trim());
        log.info('auth.reset_email_sent');
      } catch (error) {
        throw authError(error);
      }
    },

    signOut: async () => {
      if (!isFirebaseConfigured()) return;
      // Google first: leaving its session behind means the next sign-in
      // silently reuses the old account instead of showing the picker.
      await signOutGoogle();
      await firebaseSignOut(firebaseAuth());
      log.info('auth.signed_out');
    },

    currentUser: () => (isFirebaseConfigured() ? toAuthUser(firebaseAuth().currentUser) : null),

    subscribe: (listener) => {
      if (!isFirebaseConfigured()) {
        listener(null);
        return () => undefined;
      }
      return onAuthStateChanged(firebaseAuth(), (user) => listener(toAuthUser(user)));
    },
  };
};

export const authService = createAuthService();
