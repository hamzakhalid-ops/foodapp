import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthHeader, Notice, StepBar } from '../components/auth-ui';
import { FormError, Icon, PrimaryButton, TextField } from '../components/ui';
import { verifyEmailCopy } from '../content/marketing-copy';
import { publicAuthApi, session } from '../lib/api';
import { toAuthErrorMessage } from '../lib/auth/auth-errors';
import { useSessionStore } from '../lib/auth/session';
import { colors, radii, shadows, spacing, typography } from '../theme/tokens';

/**
 * Screen 6 — Email Verification (Batch 02). API_SPEC §22: `POST /auth/verify-email` is public and
 * takes the single-use token sent by email. The screen opens either from the email link
 * (`/verify-email?token=…`, verified automatically) or after phone verification, where the
 * customer can paste the code from the email. Email verification does not block ordering, so the
 * customer may continue without it.
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const { token: linkToken } = useLocalSearchParams<{ token?: string }>();
  const status = useSessionStore((state) => state.status);
  const [code, setCode] = useState('');
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => session.me(),
    enabled: status === 'signedIn',
  });

  const verify = useMutation({
    mutationFn: (token: string) => publicAuthApi.verifyEmail({ token }),
  });

  // Links verify once, on arrival.
  const linkHandled = useRef(false);
  useEffect(() => {
    if (linkToken && !linkHandled.current) {
      linkHandled.current = true;
      verify.mutate(linkToken);
    }
  }, [linkToken, verify]);

  const next = () => {
    router.replace(status === 'signedIn' ? '/signed-in' : '/login');
  };

  const failure = verify.isError ? toAuthErrorMessage(verify.error) : null;
  const trimmed = code.trim();

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthHeader
          onBack={() => {
            if (router.canGoBack()) router.back();
            else next();
          }}
        />
        <StepBar filled={2} total={3} />

        <View style={styles.hero}>
          <View style={styles.iconTile}>
            <View style={styles.iconInner}>
              <Icon name="mark-email-unread" size={34} color={colors.primary} />
            </View>
            <View style={styles.iconBadge}>
              <Icon name="bolt" size={14} color={colors.onPrimary} />
            </View>
          </View>
          <View style={styles.eyebrow}>
            <View style={styles.eyebrowDot} />
            <Text style={[typography.labelMd, { color: colors.onSurfaceVariant }]}>
              Email Confirmation
            </Text>
          </View>
          <Text accessibilityRole="header" style={[typography.headlineXl, styles.title]}>
            {verify.isSuccess ? 'Email confirmed' : 'Check your email'}
          </Text>
          <Text style={[typography.bodyMd, styles.subtitle]}>
            {verify.isSuccess ? (
              'Thanks — your email address is verified.'
            ) : (
              <>
                We sent a confirmation link to{' '}
                <Text style={styles.email}>{me.data?.email ?? 'your email address'}</Text>. Tap the
                link in your inbox or paste the code from the email below.
              </>
            )}
          </Text>
        </View>

        {verify.isSuccess ? (
          <View style={styles.actions}>
            <Notice icon="check-circle" tone="success" message="Email address verified." />
            <PrimaryButton label="Continue" icon="arrow-forward" onPress={next} />
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <TextField
                variant="grey"
                label="Confirmation code"
                icon="key"
                placeholder="Paste the code from the email"
                autoCapitalize="none"
                autoCorrect={false}
                value={code}
                onChangeText={setCode}
                testID="email-code"
              />
            </View>
            <View style={styles.actions}>
              {failure ? (
                <FormError message={failure.message} requestId={failure.requestId} />
              ) : null}
              <PrimaryButton
                testID="email-verify"
                label="Confirm Email"
                loadingLabel="Confirming..."
                icon="arrow-forward"
                disabled={trimmed.length === 0}
                loading={verify.isPending}
                onPress={() => {
                  verify.mutate(trimmed);
                }}
              />
            </View>
            <View style={styles.help}>
              <Icon name="help-outline" size={18} color={colors.onSurfaceVariant} />
              <Text style={[typography.bodySm, styles.helpText]}>
                Didn&apos;t get the email? Check your spam folder.
              </Text>
            </View>
            <Pressable
              accessibilityRole="link"
              onPress={next}
              hitSlop={8}
              style={styles.skip}
              testID="email-skip"
            >
              <Text style={[typography.labelMd, styles.skipText]}>I&apos;ll do this later</Text>
            </Pressable>
          </>
        )}

        <View style={styles.footer}>
          <Icon name="verified-user" size={16} color={colors.tertiary} />
          <Text style={[typography.bodySm, { color: colors.tertiary }]}>
            {verifyEmailCopy.footer}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.screen, paddingBottom: spacing.xl },
  hero: { alignItems: 'center', marginBottom: spacing.lg },
  iconTile: {
    width: 88,
    height: 88,
    borderRadius: radii.xxl,
    backgroundColor: colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  iconInner: {
    width: 62,
    height: 62,
    borderRadius: radii.xl,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: radii.full,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainer,
    marginBottom: spacing.sm,
  },
  eyebrowDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.primaryContainer,
  },
  title: { color: colors.onSurface, textAlign: 'center', marginBottom: spacing.xs },
  subtitle: { color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 22 },
  email: { color: colors.onSurface, fontFamily: 'PlusJakartaSans_600SemiBold' },
  card: {
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceContainerLowest,
    ...shadows.sm,
  },
  actions: { gap: spacing.md, marginTop: spacing.lg },
  help: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLow,
  },
  helpText: { color: colors.onSurfaceVariant },
  skip: { alignSelf: 'center', marginTop: spacing.lg },
  skipText: { color: colors.primary },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
  },
});
