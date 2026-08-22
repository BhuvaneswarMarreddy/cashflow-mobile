import type { ComponentType } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { radius } from '@/theme';

interface Props {
  onPress: () => void;
  disabled?: boolean;
  /** `light` is the white button — the readable one on the ink background. */
  color?: 'light' | 'dark';
  testID?: string;
}

interface NativeButtonProps {
  size?: number;
  color?: 'light' | 'dark';
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

type NativeButton = ComponentType<NativeButtonProps> & {
  Size: { Icon: number; Standard: number; Wide: number };
  Color: { Dark: 'dark'; Light: 'light' };
};

/**
 * Google's own sign-in button.
 *
 * Not a styled `<Button>` with a borrowed icon. Google's Sign-In branding
 * guidelines require their mark, their proportions and their wordmark — a
 * home-made approximation is both against the terms and instantly recognisable
 * as fake, which is exactly the "looks like a temp app" problem.
 *
 * `GoogleSigninButton` ships inside the SDK that is already installed, so this
 * costs no new dependency. It is a NATIVE view: the module's own import calls
 * `NativeModule.getConstants()` at module scope, which throws where the native
 * side is absent (Expo Go, jest). Hence the lazy `require` in a try/catch, the
 * same pattern `services/googleSignIn.ts` uses.
 *
 * The native view has a fixed intrinsic size (312×48 for Wide); the width is
 * overridden to fill the column so it lines up with the fields beneath it.
 */
const Native: NativeButton | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-google-signin/google-signin') as {
      GoogleSigninButton: NativeButton;
    };
    return mod.GoogleSigninButton;
  } catch {
    // Expo Go or jest: no native side. The caller already gates on
    // `authService.googleAvailable()`, so this branch renders nothing.
    return null;
  }
})();

export const GoogleButton = ({ onPress, disabled = false, color = 'light', testID }: Props) => {
  if (!Native) return null;

  return (
    // The native button ignores opacity while disabled, so the wrapper carries
    // it — otherwise a mid-submit tap looks live. It also clips the native
    // view's own corners to the app's control radius, matching Button.
    <View
      style={{ opacity: disabled ? 0.5 : 1, borderRadius: radius.control, overflow: 'hidden' }}
    >
      <Native
        size={Native.Size.Wide}
        color={color}
        disabled={disabled}
        onPress={onPress}
        style={{ width: '100%', height: 48 }}
        {...(testID !== undefined ? { testID } : {})}
      />
    </View>
  );
};
