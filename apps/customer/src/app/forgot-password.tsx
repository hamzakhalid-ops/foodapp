import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import mealImage from '../../assets/images/forgot-password-meal.png';
import { AuthHeader } from '../components/auth-ui';
import { FormError, Icon, type IconName, PrimaryButton, TextField } from '../components/ui';
import { forgotPasswordCopy } from '../content/marketing-copy';
import { publicAuthApi } from '../lib/api';
import { toAuthErrorMessage } from '../lib/auth/auth-errors';
import { useRecoveryStore } from '../lib/auth/recovery';
import { DIAL_CODE, isPlausibleLocalNumber, toE164 } from '../lib/phone';
import { colors, radii, shadows, spacing, typography } from '../theme/tokens';

type Channel = 'email' | 'phone';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Screen 7 — Forgot Password (Batch 02). API_SPEC §23: always `202` for a well-formed request, so
 * the screen never reveals whether an account exists; the reset token goes to the channel that
 * matches the identifier.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const setIdentifier = useRecoveryStore((state) => state.setIdentifier);
  const [channel, setChannel] = useState<Channel>('email');
  const [value, setValue] = useState('');
  const [inputError, setInputError] = useState<string | undefined>();

  const request = useMutation({
    mutationFn: (identifier: string) => publicAuthApi.forgotPassword({ identifier }),
    onSuccess: (_, identifier) => {
      setIdentifier(identifier);
      router.push('/reset-password');
    },
  });

  const submit = () => {
    const trimmed = value.trim();
    if (channel === 'email' && !EMAIL_PATTERN.test(trimmed)) {
      setInputError('Enter a valid email address');
      return;
    }
    if (channel === 'phone' && !isPlausibleLocalNumber(trimmed)) {
      setInputError('Enter a valid phone number');
      return;
    }
    setInputError(undefined);
    request.mutate(channel === 'email' ? trimmed : toE164(DIAL_CODE.code, trimmed));
  };

  const failure = request.isError ? toAuthErrorMessage(request.error) : null;

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
              else router.replace('/login');
            }}
          />

          <View style={styles.hero}>
            <View style={styles.heroRing}>
              <View style={styles.heroCircle}>
                <Icon name="lock-reset" size={34} color={colors.primary} />
              </View>
              <View style={styles.heroBadge}>
                <Icon name="vpn-key" size={16} color={colors.onPrimary} />
              </View>
            </View>
            <Text accessibilityRole="header" style={[typography.headlineLg, styles.title]}>
              Forgot Password? 🔑
            </Text>
            <Text style={[typography.bodyMd, styles.subtitle]}>
              Don&apos;t worry! It happens. Enter the email address or phone number linked with your
              QuickBite account and we&apos;ll send you recovery instructions.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.tabs} accessibilityRole="tablist">
              {(
                [
                  { key: 'email', label: 'Email', icon: 'mail-outline' },
                  { key: 'phone', label: 'SMS Phone', icon: 'sms' },
                ] satisfies { key: Channel; label: string; icon: IconName }[]
              ).map((tab) => {
                const selected = channel === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setChannel(tab.key);
                      setValue('');
                      setInputError(undefined);
                      request.reset();
                    }}
                    style={[styles.tab, selected && styles.tabSelected]}
                    testID={`forgot-tab-${tab.key}`}
                  >
                    <Icon
                      name={tab.icon}
                      size={18}
                      color={selected ? colors.primary : colors.onSurfaceVariant}
                    />
                    <Text
                      style={[
                        typography.labelMd,
                        { color: selected ? colors.primary : colors.onSurfaceVariant },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {channel === 'email' ? (
              <TextField
                variant="grey"
                label="Email Address"
                icon="alternate-email"
                placeholder="e.g. alex@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                value={value}
                onChangeText={setValue}
                error={inputError}
                testID="forgot-identifier"
              />
            ) : (
              <View style={styles.phoneBlock}>
                <Text style={[typography.labelMd, { color: colors.onSurfaceVariant }]}>
                  Phone Number
                </Text>
                <View style={styles.phoneRow}>
                  <View style={styles.dialCode}>
                    <Text style={styles.flag}>{DIAL_CODE.flag}</Text>
                    <Text style={[typography.labelMd, { color: colors.onSurface }]}>
                      {DIAL_CODE.code}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <TextField
                      variant="grey"
                      label="Phone Number"
                      hideLabel
                      icon="phone"
                      placeholder="300 1234567"
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      value={value}
                      onChangeText={setValue}
                      testID="forgot-identifier"
                    />
                  </View>
                </View>
                {inputError ? (
                  <Text accessibilityRole="alert" style={[typography.bodySm, styles.error]}>
                    {inputError}
                  </Text>
                ) : null}
              </View>
            )}

            <View style={styles.assurance}>
              <Icon name="verified-user" size={18} color={colors.primary} />
              <Text style={[typography.bodySm, styles.assuranceText]}>
                We will send a reset code to this {channel === 'email' ? 'email address' : 'phone'}{' '}
                if it belongs to a QuickBite account.
              </Text>
            </View>

            {failure ? <FormError message={failure.message} requestId={failure.requestId} /> : null}

            <PrimaryButton
              testID="forgot-submit"
              label="Send Recovery Code"
              loadingLabel="Sending..."
              icon="arrow-forward"
              loading={request.isPending}
              onPress={submit}
            />
          </View>

          <View style={styles.backRow}>
            <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
              Remember your password?{' '}
            </Text>
            <Pressable
              accessibilityRole="link"
              hitSlop={8}
              onPress={() => {
                router.replace('/login');
              }}
            >
              <Text style={[typography.labelMd, styles.link]}>Back to Sign In</Text>
            </Pressable>
          </View>

          <View style={styles.mealCard}>
            <Image source={mealImage} style={styles.mealImage} accessibilityIgnoresInvertColors />
            <View style={styles.flex}>
              <Text style={[typography.labelLg, { color: colors.onSurface }]}>
                {forgotPasswordCopy.hungryTitle}
              </Text>
              <Text style={[typography.bodySm, { color: colors.onSurfaceVariant }]}>
                {forgotPasswordCopy.hungryBody}
              </Text>
            </View>
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
  hero: { alignItems: 'center', marginBottom: spacing.lg },
  heroRing: {
    width: 104,
    height: 104,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroCircle: {
    width: 76,
    height: 76,
    borderRadius: radii.full,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    position: 'absolute',
    right: -2,
    bottom: 6,
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  title: { color: colors.onSurface, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 22 },
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceContainerLowest,
    ...shadows.md,
  },
  tabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainer,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  tabSelected: { backgroundColor: colors.surfaceContainerLowest, ...shadows.sm },
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
  error: { color: colors.error, paddingHorizontal: 4 },
  assurance: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  assuranceText: { flex: 1, color: colors.onSurfaceVariant, lineHeight: 18 },
  backRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  link: { color: colors.primaryContainer, fontFamily: 'PlusJakartaSans_700Bold' },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: 12,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceContainerLowest,
    ...shadows.sm,
  },
  mealImage: { width: 56, height: 56, borderRadius: radii.lg },
});
