import { useLockStore } from '../lockStore';
import { usePreferences } from '../preferencesStore';

const enableLock = (lockAfterMinutes = 5) =>
  usePreferences.setState((state) => ({
    security: { ...state.security, biometricLock: true, lockAfterMinutes },
  }));

beforeEach(() => {
  useLockStore.setState({ locked: false, backgroundedAt: null });
  usePreferences.setState((state) => ({
    security: { ...state.security, biometricLock: false, lockAfterMinutes: 5 },
  }));
});

const T0 = Date.parse('2026-08-09T12:00:00.000Z');
const minutes = (n: number) => T0 + n * 60_000;

describe('lock', () => {
  it('stays open on a cold start when the preference is off', () => {
    useLockStore.getState().arm();
    expect(useLockStore.getState().locked).toBe(false);
  });

  it('arms on a cold start when the preference is on', () => {
    enableLock();
    useLockStore.getState().arm();
    expect(useLockStore.getState().locked).toBe(true);
  });

  it('re-locks after the grace period', () => {
    enableLock(5);
    useLockStore.getState().noteBackgrounded(T0);
    useLockStore.getState().noteForegrounded(minutes(6));
    expect(useLockStore.getState().locked).toBe(true);
  });

  it('does not re-lock for a quick trip away', () => {
    enableLock(5);
    useLockStore.getState().noteBackgrounded(T0);
    useLockStore.getState().noteForegrounded(minutes(1));
    expect(useLockStore.getState().locked).toBe(false);
  });

  /**
   * The Face ID sheet itself deactivates the app. If a foreground with no
   * recorded background could re-lock, unlocking would re-arm the lock it just
   * opened and the app would be permanently unopenable.
   */
  it('never re-locks when the app never actually went away', () => {
    enableLock(0);
    useLockStore.getState().unlock();
    useLockStore.getState().noteForegrounded(minutes(99));
    expect(useLockStore.getState().locked).toBe(false);
  });

  it('clears the background stamp on unlock, so the pending trip cannot re-arm it', () => {
    enableLock(0);
    useLockStore.getState().noteBackgrounded(T0);
    useLockStore.getState().unlock();
    useLockStore.getState().noteForegrounded(minutes(10));
    expect(useLockStore.getState().locked).toBe(false);
  });
});
