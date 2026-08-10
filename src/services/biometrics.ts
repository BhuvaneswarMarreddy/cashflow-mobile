import * as LocalAuthentication from 'expo-local-authentication';

import { loggerFor } from '@/logging';

/**
 * Biometric app lock.
 *
 * **This is a lock, not a login.** The Firebase session is what proves who you
 * are, and it persists on its own; Face ID only decides whether the person
 * holding the unlocked phone right now gets to see the balances. Treating a
 * fingerprint as authentication would be wrong — the device has no way to prove
 * anything to the server — and it is also why failing biometrics does *not*
 * sign the user out. It just keeps the screen covered.
 *
 * `expo-local-authentication` needs a development build; the enrolment check
 * below returns false wherever the native module is absent, so every caller
 * degrades to "no lock available" rather than throwing.
 */

const log = loggerFor('auth');

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'passcode' | 'none';

export interface BiometricCapability {
  /** Hardware present AND a biometric actually enrolled. */
  available: boolean;
  kind: BiometricKind;
  /** What to call it in the UI: "Face ID", "Touch ID", "your passcode". */
  label: string;
}

const LABELS: Record<BiometricKind, string> = {
  face: 'Face ID',
  fingerprint: 'Touch ID',
  iris: 'iris recognition',
  passcode: 'your passcode',
  none: 'a device lock',
};

const UNAVAILABLE: BiometricCapability = { available: false, kind: 'none', label: LABELS.none };

export const biometricCapability = async (): Promise<BiometricCapability> => {
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    // Hardware without enrolment is the common case worth distinguishing: the
    // phone can do Face ID, this person just has not set it up, and offering
    // the toggle would produce a prompt that can never succeed.
    if (!hasHardware || !enrolled) return UNAVAILABLE;

    const kind: BiometricKind = types.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    )
      ? 'face'
      : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ? 'fingerprint'
        : types.includes(LocalAuthentication.AuthenticationType.IRIS)
          ? 'iris'
          : 'passcode';

    return { available: true, kind, label: LABELS[kind] };
  } catch {
    return UNAVAILABLE;
  }
};

/**
 * Prompts, and reports only whether it succeeded.
 *
 * `disableDeviceFallback: false` leaves the passcode escape hatch in place —
 * without it, a failed face scan strands someone outside their own accounts
 * with no way back except reinstalling.
 */
export const authenticateLocally = async (reason: string): Promise<boolean> => {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use passcode',
      disableDeviceFallback: false,
    });
    // The outcome is logged, never the biometric itself — there is nothing to
    // redact here because nothing identifying is ever returned to JS.
    log.info(result.success ? 'auth.unlocked' : 'auth.unlock_failed');
    return result.success;
  } catch {
    return false;
  }
};
