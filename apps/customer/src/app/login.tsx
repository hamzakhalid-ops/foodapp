import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginRequest, loginRequestSchema } from '@quickbite/validation';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BackButton,
  FormError,
  Icon,
  PrimaryButton,
  TextField,
  VisibilityToggle,
} from '../components/ui';
import { loginCopy } from '../content/marketing-copy';
import { toAuthErrorMessage } from '../lib/auth/auth-errors';
import { session } from '../lib/api';
import { colors, radii, spacing, typography } from '../theme/tokens';

/** Matches the Stitch field behavior: show a phone icon once the input looks like a number. */
const PHONE_LIKE = /^[+0-9\s()-]+$/;

export const EMPTY_FIELDS_MESSAGE = 'Please fill in both your email/phone and password.';

/** Screen 3 — Login (Batch 01). API_SPEC §17: email or phone identifier + password. */
export default function LoginScreen() {
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const { control, handleSubmit, watch, formState } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const login = useMutation({
    mutationFn: (values: LoginRequest) => session.login(values),
    onSuccess: () => {
      router.replace('/signed-in');
    },
  });

  const identifier = watch('identifier');
  const looksLikePhone = identifier.trim().length > 0 && PHONE_LIKE.test(identifier.trim());
  const hasEmptyFields = formState.isSubmitted && Object.keys(formState.errors).length > 0;
  const failure = login.isError ? toAuthErrorMessage(login.error) : null;

  const submit = handleSubmit((values) => {
    login.mutate(values);
  });

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
          <View style={styles.topBar}>
            <BackButton
              label="Back to welcome screen"
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/welcome');
              }}
            />
            <View style={styles.brandPill}>
              <View style={styles.brandPillIcon}>
                <Icon name="bolt" size={14} color={colors.onPrimary} />
              </View>
              <Text style={[typography.labelSm, styles.brandPillText]}>QuickBite</Text>
            </View>
            <View style={styles.topBarSpacer} />
          </View>

          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              <Text accessibilityRole="header" style={[typography.headlineLg, styles.title]}>
                Welcome back
              </Text>
              <Text style={styles.wave} accessibilityElementsHidden>
                👋
              </Text>
            </View>
            <Text style={[typography.bodyMd, styles.subtitle]}>
              Sign in with your email or phone number to continue
            </Text>
          </View>

          <View style={styles.form}>
            <Controller
              control={control}
              name="identifier"
              render={({ field }) => (
                <TextField
                  label="Email or Phone Number"
                  icon={looksLikePhone ? 'call' : 'mail-outline'}
                  placeholder="e.g. alex@example.com or +92 300 1234567"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="username"
                  keyboardType="email-address"
                  returnKeyType="next"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  testID="login-identifier"
                />
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field }) => (
                <TextField
                  ref={passwordRef}
                  label="Password"
                  icon="lock-outline"
                  placeholder="••••••••••••"
                  secureTextEntry={!passwordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="go"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  onSubmitEditing={() => void submit()}
                  testID="login-password"
                  labelTrailing={
                    // Forgot Password is Batch 02 (SCREEN_PLAN §6); the link is presented only.
                    <Text
                      style={[typography.labelSm, styles.forgot]}
                      accessibilityHint="Password reset is not available yet"
                    >
                      Forgot Password?
                    </Text>
                  }
                  trailing={
                    <VisibilityToggle
                      visible={passwordVisible}
                      onToggle={() => {
                        setPasswordVisible((visible) => !visible);
                      }}
                    />
                  }
                />
              )}
            />

            {hasEmptyFields ? <FormError message={EMPTY_FIELDS_MESSAGE} /> : null}
            {failure ? <FormError message={failure.message} requestId={failure.requestId} /> : null}

            <View style={styles.perk}>
              <View style={styles.perkIcon}>
                <Icon name="electric-moped" size={18} color={colors.onSecondaryFixed} />
              </View>
              <View style={styles.flex}>
                <Text numberOfLines={1} style={[typography.labelSm, { color: colors.onSurface }]}>
                  {loginCopy.perkTitle}
                </Text>
                <Text numberOfLines={1} style={[typography.bodySm, { color: colors.tertiary }]}>
                  {loginCopy.perkBody}
                </Text>
              </View>
            </View>

            <View style={styles.submit}>
              <PrimaryButton
                testID="login-submit"
                label="Sign In"
                loadingLabel="Signing In..."
                icon="arrow-forward"
                loading={login.isPending}
                onPress={() => void submit()}
              />
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={[typography.bodyMd, { color: colors.tertiary }]}>
              Don&apos;t have an account?{' '}
            </Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                router.replace('/create-account');
              }}
              hitSlop={8}
            >
              <Text style={[typography.labelMd, styles.link]}>Create Account</Text>
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
  content: { paddingHorizontal: spacing.screen, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  topBarSpacer: { width: 40, height: 40 },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255, 219, 204, 0.4)',
  },
  brandPillIcon: {
    width: 20,
    height: 20,
    borderRadius: radii.full,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandPillText: { color: colors.primary, fontFamily: 'PlusJakartaSans_700Bold' },
  titleBlock: { marginBottom: spacing.xl },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  title: { color: colors.onSurface },
  wave: { fontSize: 24 },
  subtitle: { color: colors.tertiary },
  form: { gap: spacing.md },
  forgot: { color: colors.primaryContainer },
  perk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginTop: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLow,
  },
  perkIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.secondaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submit: { marginTop: spacing.sm },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  link: { color: colors.primaryContainer, fontFamily: 'PlusJakartaSans_700Bold' },
});
