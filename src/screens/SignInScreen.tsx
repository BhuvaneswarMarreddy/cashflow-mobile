import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
  type TextInput as TextInputRef,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authService } from '@/api/auth';
import { AppText, Button, Divider, GoogleButton, Icon, LogoMark } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme';

/**
 * Sign in.
 *
 * The whole first-run flow, deliberately: the accounts are already linked on
 * the web app, so there is nothing for this client to connect. Asking someone
 * to re-link banks they have already linked would burn Plaid's lifetime Item
 * allowance for data the backend already holds.
 */
export const SignInScreen = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInputRef>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  /** Non-error feedback: the reset-link confirmation, or how to get one. */
  const [notice, setNotice] = useState<string | null>(null);

  const signIn = useAuthStore((state) => state.signIn);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const sendPasswordReset = useAuthStore((state) => state.sendPasswordReset);
  const submitting = useAuthStore((state) => state.submitting);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;
  // Only offered on a build that has the native module — in Expo Go the button
  // would be a promise the app cannot keep.
  const googleAvailable = authService.googleAvailable();

  const inputStyle = {
    minHeight: theme.touchTarget.comfortable,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    ...theme.typography.body,
  };

  const submit = () => {
    if (!canSubmit) return;
    void signIn(email, password);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.xl,
          paddingTop: insets.top + theme.spacing.huge,
          paddingBottom: insets.bottom + theme.spacing.huge,
          gap: theme.spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
        testID="screen-sign-in"
      >
        <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
          <LogoMark size={64} showWordmark />
          <AppText variant="secondary" tone="textSecondary" align="center">
            Sign in with the account you use on the web app.
          </AppText>
        </View>

        {googleAvailable ? (
          <View style={{ gap: theme.spacing.lg }}>
            <GoogleButton
              disabled={submitting}
              onPress={() => void signInWithGoogle()}
              testID="button-google"
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <View style={{ flex: 1 }}>
                <Divider />
              </View>
              <AppText variant="caption" tone="textTertiary">
                or use your password
              </AppText>
              <View style={{ flex: 1 }}>
                <Divider />
              </View>
            </View>
          </View>
        ) : null}

        <View style={{ gap: theme.spacing.md }}>
          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="caption" tone="textSecondary">
              Email
            </AppText>
            <TextInput
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setNotice(null);
                if (error) clearError();
              }}
              style={inputStyle}
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              accessibilityLabel="Email address"
              testID="input-email"
            />
          </View>

          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="caption" tone="textSecondary">
              Password
            </AppText>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                if (error) clearError();
              }}
              style={inputStyle}
              placeholder="Your password"
              placeholderTextColor={theme.colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
              accessibilityLabel="Password"
              testID="input-password"
            />
          </View>

          {error || notice ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                padding: theme.spacing.md,
                borderRadius: theme.radius.control,
                backgroundColor: error ? theme.colors.errorSurface : theme.colors.positiveSurface,
              }}
            >
              <Icon
                name={error ? 'alert-circle' : 'mail'}
                size={16}
                color={error ? theme.colors.error : theme.colors.positive}
              />
              <AppText
                variant="secondary"
                tone={error ? 'error' : 'positive'}
                style={{ flex: 1 }}
              >
                {error ?? notice}
              </AppText>
            </View>
          ) : null}

          <Button
            label={submitting ? 'Signing in…' : 'Sign in'}
            onPress={submit}
            loading={submitting}
            disabled={!canSubmit}
            fullWidth
            testID="button-sign-in"
          />

          {/* Always tappable. A greyed-out link reads as "not built yet", which
              is exactly the wrong impression for a feature that does work —
              so an empty email gets an instruction, not a dead button. */}
          <Button
            label="Forgot password?"
            variant="ghost"
            fullWidth
            disabled={submitting}
            onPress={() => {
              clearError();
              if (email.trim().length === 0) {
                setNotice('Type your email address above, then tap this again.');
                return;
              }
              void sendPasswordReset(email).then((sent) => {
                if (sent) setNotice(`Reset link sent to ${email.trim()}. Check your inbox.`);
              });
            }}
            testID="button-forgot-password"
          />
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
};
