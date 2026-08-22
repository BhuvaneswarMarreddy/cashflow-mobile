import * as Haptics from 'expo-haptics';
import { Pressable, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/theme';

interface Props {
  onPress: () => void;
  disabled?: boolean;
  /** `light` is the white button — the readable one on the ink background. */
  color?: 'light' | 'dark';
  testID?: string;
}

/**
 * Google sign-in, as one of OUR buttons.
 *
 * This used to wrap the SDK's native `GoogleSigninButton`, but that view draws
 * its own white rounded-rect at Google's small radius, and no amount of wrapper
 * clipping can make corners ROUNDER than the child painted them — clipping only
 * removes pixels. The owner wants this button flush with the app's controls, so
 * it is a `Pressable` with the exact geometry `Button` uses (same touch target,
 * same `radius.control`), carrying the official four-colour G mark drawn inline
 * with react-native-svg (already a dependency; no asset, no native module).
 *
 * Branding: Google's guidelines permit custom sign-in buttons that keep the
 * G mark's artwork and clear space, which this does — what they prohibit is
 * altering the MARK, not restyling the container.
 */

/** The canonical four-colour G, viewBox 0 0 18 18, from Google's own asset. */
const GoogleG = ({ size }: { size: number }) => (
  <Svg width={size} height={size} viewBox="0 0 18 18">
    <Path
      fill="#4285F4"
      d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
    />
    <Path
      fill="#34A853"
      d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
    />
    <Path
      fill="#FBBC05"
      d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
    />
    <Path
      fill="#EA4335"
      d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.3459l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"
    />
  </Svg>
);

export const GoogleButton = ({ onPress, disabled = false, color = 'light', testID }: Props) => {
  const theme = useTheme();
  const light = color === 'light';

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Sign in with Google"
      accessibilityState={{ disabled }}
      {...(testID !== undefined ? { testID } : {})}
      style={({ pressed }) => ({
        minHeight: theme.touchTarget.comfortable,
        paddingHorizontal: theme.spacing.xl,
        borderRadius: theme.radius.control,
        // Google's light/dark surface colours; the light one reads on ink.
        backgroundColor: light ? '#FFFFFF' : '#131314',
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        gap: theme.spacing.md,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <GoogleG size={20} />
      <Text
        style={{
          ...theme.typography.body,
          fontWeight: '600',
          color: light ? '#1F1F1F' : '#E3E3E3',
        }}
      >
        Sign in with Google
      </Text>
    </Pressable>
  );
};
