import { zodResolver } from '@hookform/resolvers/zod';
import { type RegisterRequest } from '@quickbite/validation';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, type FieldPath, useForm } from 'react-hook-form';
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
import { z } from 'zod';
import {
  BackButton,
  FormError,
  Icon,
  LogoTile,
  PrimaryButton,
  TextField,
  VisibilityToggle,
  WordMark,
} from '../components/ui';
import { toAuthErrorMessage } from '../lib/auth/auth-errors';
import { routeAfterSignIn } from '../lib/auth/routes';
import { session } from '../lib/api';
import { DIAL_CODE, isPlausibleLocalNumber, toE164 } from '../lib/phone';
import { colors, radii, spacing, typography } from '../theme/tokens';

/**
 * Client-side checks are presentation only. The password policy is owned by the backend
 * (AUTH_AUTHORIZATION §9) and is not duplicated here; its errors are shown when returned.
 */
const createAccountSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Enter your first name').max(100),
    lastName: z.string().trim().min(1, 'Enter your last name').max(100),
    email: z.string().trim().pipe(z.email('Enter a valid email address')),
    phone: z.string().refine(isPlausibleLocalNumber, {
      message: 'Enter a valid phone number',
    }),
    password: z.string().min(1, 'Enter a password'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
    acceptTerms: z.boolean().refine((value) => value, {
      message: 'Please accept the Terms of Service and Privacy Policy',
    }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type CreateAccountForm = z.infer<typeof createAccountSchema>;

const SERVER_FIELDS: Partial<Record<string, FieldPath<CreateAccountForm>>> = {
  firstName: 'firstName',
  lastName: 'lastName',
  email: 'email',
  phone: 'phone',
  password: 'password',
};

/** Screen 4 — Create Account (Batch 01). API_SPEC §16.1, then login (§17). */
export default function CreateAccountScreen() {
  const router = useRouter();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const { control, handleSubmit, watch, setError, formState } = useForm<CreateAccountForm>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
  });

  const register = useMutation({
    mutationFn: (request: RegisterRequest) => session.register(request),
    onSuccess: (user) => {
      router.replace(routeAfterSignIn(user));
    },
    onError: (error) => {
      for (const [field, message] of Object.entries(toAuthErrorMessage(error).fields)) {
        const target = SERVER_FIELDS[field];
        if (target) setError(target, { message });
      }
    },
  });

  const submit = handleSubmit((values) => {
    register.mutate({
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim(),
      phone: toE164(DIAL_CODE.code, values.phone),
      password: values.password,
    });
  });

  const [password, confirmPassword] = watch(['password', 'confirmPassword']);
  const matchState =
    confirmPassword.length === 0 ? 'empty' : password === confirmPassword ? 'match' : 'mismatch';
  const failure = register.isError ? toAuthErrorMessage(register.error) : null;
  const errors = formState.errors;

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
              background={colors.surfaceContainerLow}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/welcome');
              }}
            />
            <View style={styles.brand}>
              <LogoTile size={28} style={styles.brandTile} />
              <WordMark />
            </View>
            <View style={styles.stepBadge}>
              <Text style={[typography.labelSm, { color: colors.onSurfaceVariant }]}>1 of 1</Text>
            </View>
          </View>

          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              <Text accessibilityRole="header" style={[typography.headlineXl, styles.title]}>
                Create Account
              </Text>
              <View style={styles.titleBadge}>
                <Text style={styles.titleBadgeText}>⚡</Text>
              </View>
            </View>
            <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
              Sign up to start ordering from your favorite spots
            </Text>
          </View>

          <View style={styles.form}>
            {/* API_SPEC §16.1 requires firstName and lastName, so the Stitch "Full Name" field is split. */}
            <View style={styles.nameRow}>
              <View style={styles.flex}>
                <Controller
                  control={control}
                  name="firstName"
                  render={({ field }) => (
                    <TextField
                      variant="grey"
                      label="First Name"
                      icon="person-outline"
                      placeholder="Alex"
                      autoComplete="name-given"
                      textContentType="givenName"
                      autoCapitalize="words"
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={errors.firstName?.message}
                      testID="signup-first-name"
                    />
                  )}
                />
              </View>
              <View style={styles.flex}>
                <Controller
                  control={control}
                  name="lastName"
                  render={({ field }) => (
                    <TextField
                      variant="grey"
                      label="Last Name"
                      icon="person-outline"
                      placeholder="Morgan"
                      autoComplete="name-family"
                      textContentType="familyName"
                      autoCapitalize="words"
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={errors.lastName?.message}
                      testID="signup-last-name"
                    />
                  )}
                />
              </View>
            </View>

            <Controller
              control={control}
              name="email"
              render={({ field }) => (
                <TextField
                  variant="grey"
                  label="Email Address"
                  icon="mail-outline"
                  placeholder="alex@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.email?.message}
                  testID="signup-email"
                />
              )}
            />

            <View style={styles.phoneBlock}>
              <Text style={[typography.labelMd, { color: colors.onSurfaceVariant }]}>
                Phone Number
              </Text>
              <View style={styles.phoneRow}>
                <View style={styles.dialCode} accessibilityLabel={`Country code ${DIAL_CODE.code}`}>
                  <Text style={styles.flag}>{DIAL_CODE.flag}</Text>
                  <Text style={[typography.labelMd, { color: colors.onSurface }]}>
                    {DIAL_CODE.code}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Controller
                    control={control}
                    name="phone"
                    render={({ field }) => (
                      <TextField
                        variant="grey"
                        label="Phone Number"
                        icon="phone"
                        placeholder="300 1234567"
                        keyboardType="phone-pad"
                        autoComplete="tel"
                        textContentType="telephoneNumber"
                        value={field.value}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        testID="signup-phone"
                        hideLabel
                      />
                    )}
                  />
                </View>
              </View>
              {errors.phone?.message ? (
                <Text accessibilityRole="alert" style={[typography.bodySm, styles.error]}>
                  {errors.phone.message}
                </Text>
              ) : null}
            </View>

            <Controller
              control={control}
              name="password"
              render={({ field }) => (
                <TextField
                  variant="grey"
                  label="Password"
                  icon="lock-outline"
                  placeholder="••••••••••••"
                  secureTextEntry={!passwordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.password?.message}
                  testID="signup-password"
                  trailing={
                    <VisibilityToggle
                      visible={passwordVisible}
                      onToggle={() => {
                        setPasswordVisible((visible) => !visible);
                      }}
                    />
                  }
                  hint={
                    <View style={styles.hint}>
                      <Icon name="info-outline" size={14} color={colors.primaryContainer} />
                      <Text style={[typography.bodySm, { color: colors.onSurfaceVariant }]}>
                        At least 8 characters
                      </Text>
                    </View>
                  }
                />
              )}
            />

            <Controller
              control={control}
              name="confirmPassword"
              render={({ field }) => (
                <TextField
                  variant="grey"
                  label="Confirm Password"
                  icon="lock-clock"
                  placeholder="••••••••••••"
                  secureTextEntry={!passwordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.confirmPassword?.message}
                  testID="signup-confirm-password"
                  trailing={
                    <Icon
                      name={matchState === 'mismatch' ? 'cancel' : 'check-circle'}
                      color={
                        matchState === 'match'
                          ? colors.primaryContainer
                          : matchState === 'mismatch'
                            ? colors.error
                            : colors.outlineVariant
                      }
                    />
                  }
                />
              )}
            />

            <Controller
              control={control}
              name="acceptTerms"
              render={({ field }) => (
                <View style={styles.termsBlock}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: field.value }}
                    accessibilityLabel="I agree to QuickBite's Terms of Service and Privacy Policy"
                    onPress={() => {
                      field.onChange(!field.value);
                    }}
                    style={styles.termsRow}
                    testID="signup-terms"
                  >
                    <View style={[styles.checkbox, field.value && styles.checkboxChecked]}>
                      {field.value ? (
                        <Icon name="check" size={16} color={colors.onPrimary} />
                      ) : null}
                    </View>
                    {/* Terms / Privacy screens are planned for a later batch (STITCH_INDEX #78–79). */}
                    <Text style={[typography.bodySm, styles.termsText]}>
                      I agree to QuickBite&apos;s{' '}
                      <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
                      <Text style={styles.termsLink}>Privacy Policy</Text>
                    </Text>
                  </Pressable>
                  {errors.acceptTerms?.message ? (
                    <Text accessibilityRole="alert" style={[typography.bodySm, styles.error]}>
                      {errors.acceptTerms.message}
                    </Text>
                  ) : null}
                </View>
              )}
            />

            {failure ? <FormError message={failure.message} requestId={failure.requestId} /> : null}

            <View style={styles.submit}>
              <PrimaryButton
                testID="signup-submit"
                label="Create Account"
                loadingLabel="Creating Account..."
                icon="arrow-forward"
                loading={register.isPending}
                onPress={() => void submit()}
              />
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
              Already have an account?{' '}
            </Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                router.replace('/login');
              }}
              hitSlop={8}
            >
              <Text style={[typography.labelLg, styles.link]}>Log In</Text>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandTile: { borderRadius: radii.md, padding: 2, backgroundColor: 'rgba(255, 107, 0, 0.1)' },
  stepBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHigh,
  },
  titleBlock: { marginTop: spacing.md, marginBottom: spacing.lg },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  title: { color: colors.onSurface },
  titleBadge: {
    width: 24,
    height: 24,
    borderRadius: radii.full,
    backgroundColor: colors.secondaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBadgeText: { fontSize: 12 },
  form: { gap: spacing.md },
  nameRow: { flexDirection: 'row', gap: spacing.sm },
  phoneBlock: { gap: 6 },
  phoneRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  dialCode: {
    height: 52,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  flag: { fontSize: 16 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, marginTop: 2 },
  error: { color: colors.error, paddingHorizontal: 4 },
  termsBlock: { gap: 6, paddingTop: spacing.xs },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: {
    width: 20,
    height: 20,
    marginTop: 2,
    borderRadius: 6,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primaryContainer },
  termsText: { flex: 1, color: colors.onSurface, lineHeight: 18 },
  termsLink: { fontFamily: typography.labelSm.fontFamily, color: colors.primaryContainer },
  submit: { paddingTop: spacing.sm },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  link: { color: colors.primaryContainer, fontFamily: 'PlusJakartaSans_700Bold' },
});
