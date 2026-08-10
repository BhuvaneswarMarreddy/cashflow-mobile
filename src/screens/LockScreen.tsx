import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, LogoMark } from '@/components';
import { authenticateLocally, biometricCapability } from '@/services/biometrics';
import { useAuthStore } from '@/store/authStore';
import { useLockStore } from '@/store/lockStore';
import { useTheme } from '@/theme';

/**
 * The cover over the figures.
 *
 * Prompts once automatically on mount — the whole point of a biometric lock is
 * that the common case takes no taps. When it fails or is dismissed the screen
 * stays put with a manual retry rather than falling through, and "Sign out" is
 * the deliberate way past it. Nothing here can be bypassed by backgrounding the
 * app, because the gate lives above the navigator.
 */
export const LockScreen = () => {
  const theme = useTheme();
  const unlock = useLockStore((state) => state.unlock);
  const signOut = useAuthStore((state) => state.signOut);

  const [label, setLabel] = useState('Face ID');
  const [prompting, setPrompting] = useState(false);
  const [failed, setFailed] = useState(false);

  const attempt = useCallback(async () => {
    setPrompting(true);
    const ok = await authenticateLocally('Unlock Cashflow');
    setPrompting(false);
    if (ok) unlock();
    else setFailed(true);
  }, [unlock]);

  useEffect(() => {
    let alive = true;
    void biometricCapability().then((capability) => {
      if (!alive) return;
      setLabel(capability.label);
      // Enrolment removed while the lock was on would strand the user behind a
      // prompt that can never succeed. Open the door rather than trap them.
      if (!capability.available) unlock();
      else void attempt();
    });
    return () => {
      alive = false;
    };
  }, [attempt, unlock]);

  return (
    <View
      testID="screen-lock"
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xl,
        paddingHorizontal: theme.spacing.xl,
      }}
    >
      <LogoMark size={72} showWordmark />

      <AppText variant="secondary" tone="textSecondary" align="center">
        {failed
          ? `Cashflow is locked. Unlock with ${label} to see your figures.`
          : `Unlocking with ${label}…`}
      </AppText>

      <View style={{ alignSelf: 'stretch', gap: theme.spacing.sm }}>
        <Button
          label={`Unlock with ${label}`}
          icon="unlock"
          fullWidth
          loading={prompting}
          disabled={prompting}
          onPress={() => void attempt()}
          testID="button-unlock"
        />
        <Button
          label="Sign out instead"
          variant="ghost"
          fullWidth
          disabled={prompting}
          onPress={() => void signOut()}
        />
      </View>
    </View>
  );
};
