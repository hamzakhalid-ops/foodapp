import { type CurrentUser } from '@quickbite/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import heroImage from '../../assets/images/welcome-hero-burger.png';
import { AuthHeader, CodeBoxes, Notice, StepBar } from '../components/auth-ui';
import { FormError, Icon, PrimaryButton } from '../components/ui';
import { verifyPhoneCopy } from '../content/marketing-copy';
import { authApi, session } from '../lib/api';
import { toAuthErrorMessage } from '../lib/auth/auth-errors';
import { useSessionStore } from '../lib/auth/session';
import { colors, radii, shadows, spacing, typography } from '../theme/tokens';

/** API_SPEC §20: phone verification codes are 6 digits. */
export const PHONE_CODE_LENGTH = 6;

/**
 * Screen 5 — Phone Verification (Batch 02). API_SPEC §20–21. Verifying the phone activates a
 * `PENDING_VERIFICATION` account; the backend decides the resulting status.
 */
export default function VerifyPhoneScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useSessionStore((state) => state.status);
  const [code, setCode] = useState('');
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => session.me(),
    enabled: status === 'signedIn',
  });

  const verify = useMutation({
    mutationFn: (value: string) => authApi.verifyPhone({ code: value }),
    onSuccess: (user: CurrentUser) => {
      queryClient.setQueryData(['me'], user);
      router.replace('/verify-email');
    },
  });
  const resend = useMutation({
    mutationFn: () => authApi.resendPhoneVerification(),
    onSuccess: () => {
      setCode('');
      verify.reset();
    },
  });
  const leave = useMutation({
    mutationFn: () => session.logout(),
    onSettled: () => {
      router.replace('/welcome');
    },
  });

  if (status === 'signedOut') return <Redirect href="/welcome" />;

  const complete = code.length === PHONE_CODE_LENGTH;
  const verifyError = verify.isError ? toAuthErrorMessage(verify.error) : null;
  const resendError = resend.isError ? toAuthErrorMessage(resend.error) : null;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Leaving an unverified session signs out; the next sign-in returns here. */}
        <AuthHeader
          onBack={() => {
            leave.mutate();
          }}
        />
        <StepBar filled={2} total={2} />

        <View style={styles.stepPill}>
          <Icon name="verified-user" size={16} color={colors.primary} />
          <Text style={[typography.labelMd, { color: colors.onSurfaceVariant }]}>
            Step 2 of 2: Security
          </Text>
        </View>
        <Text accessibilityRole="header" style={[typography.headlineXl, styles.title]}>
          Verify Phone Number
        </Text>
        <Text style={[typography.bodyLg, styles.subtitle]}>
          We sent a 6-digit verification code to{' '}
          <Text style={styles.phone}>{me.data?.phone ?? 'your phone'}</Text>.
        </Text>

        <View style={styles.perkCard}>
          <Image source={heroImage} style={styles.perkImage} accessibilityIgnoresInvertColors />
          <View style={styles.flex}>
            <View style={styles.perkTitleRow}>
              <Text style={[typography.labelLg, { color: colors.onSurface }]}>
                {verifyPhoneCopy.perkTitle}
              </Text>
              <Icon name="local-fire-department" size={18} color={colors.primaryContainer} />
            </View>
            <Text style={[typography.bodySm, { color: colors.onSurfaceVariant }]}>
              {verifyPhoneCopy.perkBody}
            </Text>
          </View>
        </View>

        <CodeBoxes
          value={code}
          onChange={setCode}
          length={PHONE_CODE_LENGTH}
          testID="phone-code"
          accessibilityLabel="6-digit verification code"
        />

        <View style={styles.resendRow}>
          <Pressable
            accessibilityRole="button"
            disabled={resend.isPending}
            onPress={() => {
              resend.mutate();
            }}
            style={styles.resendPill}
            testID="phone-resend"
          >
            <Icon name="hourglass-empty" size={16} color={colors.onSurfaceVariant} />
            <Text style={[typography.bodyMd, { color: colors.onSurfaceVariant }]}>
              Didn&apos;t receive code?{' '}
              <Text style={styles.resendLink}>{resend.isPending ? 'Sending...' : 'Resend'}</Text>
            </Text>
          </Pressable>
        </View>

        <View style={styles.messages}>
          {resend.isSuccess ? (
            <Notice icon="mark-chat-read" tone="success" message="A new code is on its way." />
          ) : null}
          {verifyError ? (
            <FormError message={verifyError.message} requestId={verifyError.requestId} />
          ) : null}
          {resendError ? (
            <FormError message={resendError.message} requestId={resendError.requestId} />
          ) : null}
        </View>

        <PrimaryButton
          testID="phone-verify"
          label="Verify & Continue"
          loadingLabel="Verifying..."
          icon="arrow-forward"
          disabled={!complete}
          loading={verify.isPending}
          onPress={() => {
            verify.mutate(code);
          }}
        />

        <View style={styles.security}>
          <Icon name="lock-outline" size={20} color={colors.primary} />
          <Text style={[typography.bodySm, styles.securityText]}>{verifyPhoneCopy.security}</Text>
        </View>
        <View style={styles.badges}>
          {verifyPhoneCopy.badges.map((badge) => (
            <Text key={badge} style={[typography.labelSm, styles.badge]}>
              {badge}
            </Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.screen, paddingBottom: spacing.xl },
  stepPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainer,
    marginBottom: spacing.sm,
  },
  title: { color: colors.onSurface, marginBottom: spacing.xs },
  subtitle: { color: colors.onSurfaceVariant, marginBottom: spacing.lg },
  phone: { color: colors.onSurface, fontFamily: 'PlusJakartaSans_600SemiBold' },
  perkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceContainerLowest,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  perkImage: { width: 48, height: 48, borderRadius: radii.lg },
  perkTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resendRow: { alignItems: 'center', marginTop: spacing.lg },
  resendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainer,
  },
  resendLink: { color: colors.primary, fontFamily: 'PlusJakartaSans_700Bold' },
  messages: { gap: spacing.sm, marginVertical: spacing.md },
  security: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLowest,
    ...shadows.sm,
  },
  securityText: { flex: 1, color: colors.onSurfaceVariant, textAlign: 'center' },
  badges: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  badge: { color: colors.tertiary, letterSpacing: 1 },
});
