import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthHeader, Notice } from '../components/auth-ui';
import { FormError, Icon, PrimaryButton, TextField, VisibilityToggle } from '../components/ui';
import { publicAuthApi, session } from '../lib/api';
import { toAuthErrorMessage } from '../lib/auth/auth-errors';
import { useRecoveryStore } from '../lib/auth/recovery';
import { routeAfterSignIn } from '../lib/auth/routes';
import { colors, radii, spacing, typography } from '../theme/tokens';

/**
 * Guidance shown while typing. The password policy itself is owned by the backend
 * (AUTH_AUTHORIZATION §9) and is enforced there; this mirrors its current minimum only as a hint
 * and never blocks submission. Stitch's uppercase / number-or-symbol rules are not backend rules
 * and are not shown.
 */
const MIN_LENGTH_HINT = 8;

/**
 * Screen 8 — Reset Password (Batch 02). API_SPEC §24: `POST /auth/reset-password` with the
 * single-use reset token; success revokes every session of the account. The token arrives in the
 * reset link (`/reset-password?token=…`) or is pasted from the email/SMS.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token: linkToken } = useLocalSearchParams<{ token?: string }>();
  const identifier = useRecoveryStore((state) => state.identifier);
  const setIdentifier = useRecoveryStore((state) => state.setIdentifier);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: async (input: { token: string; newPassword: string }) => {
      await publicAuthApi.resetPassword(input);
      // Sign straight in when we know who asked for the reset (Forgot Password on this device).
      // The token is already consumed, so a failed sign-in falls back to Login rather than
      // surfacing an error that invites a retry with the same token.
      if (!identifier) return null;
      try {
        return await session.login({ identifier, password: input.newPassword });
      } catch {
        return null;
      }
    },
    onSuccess: (user) => {
      setIdentifier(null);
      if (user) router.replace(routeAfterSignIn(user));
      else router.replace({ pathname: '/login', params: { reset: 'done' } });
    },
  });

  const token = (linkToken ?? code).trim();
  const longEnough = password.length >= MIN_LENGTH_HINT;
  const matches = confirm.length > 0 && confirm === password;

  const submit = () => {
    if (!token) {
      setFormError('Enter the reset code we sent you.');
      return;
    }
    if (!password) {
      setFormError('Enter a new password.');
      return;
    }
    if (password !== confirm) {
      setFormError('Passwords do not match.');
      return;
    }
    setFormError(null);
    reset.mutate({ token, newPassword: password });
  };

  const failure = reset.isError ? toAuthErrorMessage(reset.error) : null;
  const toLogin = () => {
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AuthHeader
            onBack={() => {
              if (router.canGoBack()) router.back();
              else toLogin();
            }}
          />

          <View style={styles.eyebrow}>
            <Icon name="verified-user" size={16} color={colors.primary} />
            <Text style={[typography.labelMd, { color: colors.onPrimaryFixed }]}>
              Account Recovery
            </Text>
          </View>
          <Text accessibilityRole="header" style={[typography.headlineXl, styles.title]}>
            Create New Password 🛡️
          </Text>
          <Text style={[typography.bodyLg, styles.subtitle]}>
            {linkToken || !identifier
              ? 'Choose a new password for your QuickBite account.'
              : 'We sent a reset code if this account exists. Enter it below with your new password.'}
          </Text>

          <View style={styles.form}>
            {linkToken ? null : (
              <TextField
                label="Reset Code"
                icon="key"
                placeholder="Paste the code we sent you"
                autoCapitalize="none"
                autoCorrect={false}
                value={code}
                onChangeText={setCode}
                testID="reset-code"
              />
            )}
            <TextField
              label="New Password"
              icon="lock-outline"
              placeholder="••••••••••••"
              secureTextEntry={!visible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              error={failure?.fields.password}
              testID="reset-password"
              trailing={
                <VisibilityToggle
                  visible={visible}
                  onToggle={() => {
                    setVisible((value) => !value);
                  }}
                />
              }
            />

            <View style={styles.requirements}>
              <Text style={[typography.labelMd, { color: colors.onSurfaceVariant }]}>
                Password Requirements
              </Text>
              {[
                { met: longEnough, label: `At least ${MIN_LENGTH_HINT} characters` },
                { met: matches, label: 'Both passwords match' },
              ].map((rule) => (
                <View key={rule.label} style={styles.rule}>
                  <Icon
                    name={rule.met ? 'check-circle-outline' : 'more-horiz'}
                    size={18}
                    color={rule.met ? colors.live : colors.primary}
                  />
                  <Text
                    style={[
                      typography.bodyMd,
                      { color: rule.met ? colors.live : colors.onSurfaceVariant },
                    ]}
                  >
                    {rule.label}
                  </Text>
                </View>
              ))}
            </View>

            <TextField
              label="Confirm New Password"
              icon="lock-reset"
              placeholder="••••••••••••"
              secureTextEntry={!visible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              value={confirm}
              onChangeText={setConfirm}
              testID="reset-confirm"
              trailing={matches ? <Icon name="check-circle-outline" color={colors.live} /> : null}
            />

            <Notice
              icon="devices"
              message="You'll be signed out of all active sessions on other devices for security."
            />

            {formError ? <FormError message={formError} /> : null}
            {failure && !failure.fields.password ? (
              <FormError message={failure.message} requestId={failure.requestId} />
            ) : null}

            <PrimaryButton
              testID="reset-submit"
              label={identifier ? 'Reset Password & Log In' : 'Reset Password'}
              loadingLabel="Resetting..."
              icon="arrow-forward"
              loading={reset.isPending}
              onPress={submit}
            />
            <Pressable accessibilityRole="link" onPress={toLogin} hitSlop={8} style={styles.cancel}>
              <Text style={[typography.labelLg, { color: colors.onSurfaceVariant }]}>
                Cancel and return to Login
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.screen, paddingBottom: spacing.xl },
  eyebrow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.primaryFixed,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: { color: colors.onSurface, marginBottom: spacing.xs },
  subtitle: { color: colors.onSurfaceVariant, marginBottom: spacing.lg },
  form: { gap: spacing.md },
  requirements: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLow,
  },
  rule: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cancel: { alignSelf: 'center', paddingVertical: spacing.sm },
});
