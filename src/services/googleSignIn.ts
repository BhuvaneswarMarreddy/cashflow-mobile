import { GoogleAuthProvider, signInWithCredential, type UserCredential } from '@firebase/auth';

import { AppError } from '@/errors';
import { loggerFor } from '@/logging';

import { firebaseAuth } from './firebase';

/**
 * Google sign-in.
 *
 * **Requires a development build.** `@react-native-google-signin` is a native
 * module, so Expo Go cannot load it — Expo's own guide is explicit that these
 * libraries "can't be used in Expo Go". The generic `expo-auth-session` route
 * does not rescue it either: Expo Go's redirect is `exp://…`, which Google's
 * OAuth accepts from neither a Web client (https only) nor an iOS client
 * (reverse-DNS scheme), and the `auth.expo.io` proxy that used to bridge that
 * gap is retired.
 *
 * The flow: Google returns an ID token, which is exchanged for a Firebase
 * credential. The resulting Firebase user is the *same account* as the web
 * app's Google sign-in — same UID, so `_require_owner` on the callables and the
 * Firestore rules both pass unchanged.
 */

const log = loggerFor('auth');

let configured = false;

/** Native-module surface we use, kept narrow so the import stays typed. */
type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

const loadModule = (): GoogleSigninModule => {
  try {
    // Required lazily: importing at module scope would crash the whole app in
    // Expo Go, where the native module is absent, before any error handling
    // could turn it into a readable message.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin') as GoogleSigninModule;
  } catch {
    throw unavailable();
  }
};

const unavailable = () =>
  new AppError({
    category: 'permission',
    code: 'GOOGLE_SIGNIN_UNAVAILABLE',
    userMessage: 'Google sign-in needs the installed app, not Expo Go.',
    technicalMessage:
      '@react-native-google-signin native module missing — run a development build.',
    retryable: false,
  });

const configure = (module: GoogleSigninModule): void => {
  if (configured) return;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!iosClientId) {
    throw new AppError({
      category: 'unexpected',
      code: 'GOOGLE_CLIENT_ID_MISSING',
      userMessage: 'Cashflow is not configured for Google sign-in yet.',
      technicalMessage: 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is unset — see .env.example',
      retryable: false,
    });
  }
  module.GoogleSignin.configure({ iosClientId });
  configured = true;
};

export const isGoogleSignInAvailable = (): boolean => {
  try {
    loadModule();
    return true;
  } catch {
    return false;
  }
};

export const signInWithGoogle = async (): Promise<UserCredential> => {
  const module = loadModule();
  configure(module);

  try {
    await module.GoogleSignin.hasPlayServices();
    const response = await module.GoogleSignin.signIn();

    if (!module.isSuccessResponse(response)) {
      // The user backed out. Not an error to report — just nothing to do.
      throw new AppError({
        category: 'user-action',
        code: 'CANCELLED',
        userMessage: 'Sign-in cancelled.',
        technicalMessage: 'Google sign-in dismissed by the user',
        retryable: true,
      });
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      throw new AppError({
        category: 'authentication',
        code: 'NO_ID_TOKEN',
        userMessage: "Google didn't return the information Cashflow needs.",
        technicalMessage: 'Google sign-in succeeded without an idToken',
        retryable: true,
      });
    }

    const credential = await signInWithCredential(
      firebaseAuth(),
      GoogleAuthProvider.credential(idToken),
    );
    log.info('auth.signed_in_google');
    return credential;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const code = (error as { code?: string })?.code ?? 'unknown';
    log.warn('auth.google_sign_in_failed', { metadata: { code } });
    throw new AppError({
      category: 'authentication',
      code: String(code).toUpperCase(),
      userMessage: "Google sign-in didn't complete. Please try again.",
      technicalMessage: (error as { message?: string })?.message ?? String(code),
      retryable: true,
    });
  }
};

export const signOutGoogle = async (): Promise<void> => {
  try {
    const module = loadModule();
    await module.GoogleSignin.signOut();
  } catch {
    // Nothing to sign out of — either the module is absent or no Google
    // session exists. Firebase sign-out is what actually ends the session.
  }
};
