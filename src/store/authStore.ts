import { create } from 'zustand';

import { authService, type AuthUser } from '@/api/auth';
import { usageAnalytics } from '@/analytics';
import { normalizeError } from '@/errors';
import { isFirebaseConfigured } from '@/services/firebase';

/**
 * Session state.
 *
 * `status` starts at `unknown` rather than `signed-out`, and that distinction
 * is the whole point: Firebase restores a persisted session asynchronously, so
 * treating "not yet known" as "signed out" would flash the sign-in screen at
 * every launch for an already-authenticated user.
 */
export type AuthStatus = 'unknown' | 'signed-out' | 'signed-in';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** User-facing message from the last failed attempt. */
  error: string | null;
  submitting: boolean;

  signIn: (email: string, password: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
  /** Subscribes to Firebase; returns the unsubscribe. Called once from App. */
  observe: () => () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'unknown',
  user: null,
  error: null,
  submitting: false,

  signIn: async (email, password) => {
    set({ submitting: true, error: null });
    try {
      const user = await authService.signIn(email, password);
      set({ user, status: 'signed-in', submitting: false });
      usageAnalytics.track('action.selected', 'system', {
        target: 'sign-in',
        outcome: 'success',
      });
      return true;
    } catch (error) {
      const appError = normalizeError(error);
      set({ error: appError.userMessage, submitting: false });
      usageAnalytics.track('action.selected', 'system', {
        target: 'sign-in',
        outcome: 'failure',
        errorCategory: appError.category,
      });
      return false;
    }
  },

  signInWithGoogle: async () => {
    set({ submitting: true, error: null });
    try {
      const user = await authService.signInWithGoogle();
      set({ user, status: 'signed-in', submitting: false });
      usageAnalytics.track('action.selected', 'system', {
        target: 'sign-in-google',
        outcome: 'success',
      });
      return true;
    } catch (error) {
      const appError = normalizeError(error);
      // A cancelled picker is not a failure worth shouting about.
      const cancelled = appError.code === 'CANCELLED';
      set({ error: cancelled ? null : appError.userMessage, submitting: false });
      usageAnalytics.track('action.selected', 'system', {
        target: 'sign-in-google',
        outcome: cancelled ? 'cancelled' : 'failure',
        errorCategory: appError.category,
      });
      return false;
    }
  },

  sendPasswordReset: async (email) => {
    set({ submitting: true, error: null });
    try {
      await authService.sendPasswordReset(email);
      set({ submitting: false });
      return true;
    } catch (error) {
      set({ error: normalizeError(error).userMessage, submitting: false });
      return false;
    }
  },

  signOut: async () => {
    await authService.signOut();
    set({ user: null, status: 'signed-out', error: null });
  },

  clearError: () => set({ error: null }),

  observe: () => {
    if (!isFirebaseConfigured()) {
      set({ status: 'signed-out' });
      return () => undefined;
    }
    return authService.subscribe((user) =>
      set({ user, status: user ? 'signed-in' : 'signed-out' }),
    );
  },
}));
