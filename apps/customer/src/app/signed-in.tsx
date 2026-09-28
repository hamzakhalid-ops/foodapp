import { useMutation, useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FormError, SecondaryButton } from '../components/ui';
import { toAuthErrorMessage } from '../lib/auth/auth-errors';
import { session } from '../lib/api';
import { useSessionStore } from '../lib/auth/session';
import { colors, spacing, typography } from '../theme/tokens';

/**
 * BOUNDARY PLACEHOLDER — not a product screen.
 *
 * Batch 01 ends at a successful sign-in / sign-up. The next screens are Phone Verification
 * (Batch 02) for `PENDING_VERIFICATION` accounts and Home (Batch 03) for active accounts; until
 * they are approved and implemented, this route confirms the authenticated session using the
 * backend's own `/me` response (API_SPEC §25). It has no Stitch styling on purpose and is replaced
 * when those batches land.
 */
export default function SignedInPlaceholder() {
  const router = useRouter();
  const status = useSessionStore((state) => state.status);
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => session.me(),
    enabled: status === 'signedIn',
  });
  const signOut = useMutation({
    mutationFn: () => session.logout(),
    onSuccess: () => {
      router.replace('/welcome');
    },
  });

  if (status === 'signedOut') return <Redirect href="/welcome" />;

  const next =
    me.data?.status === 'PENDING_VERIFICATION'
      ? 'Next: phone verification (Customer App Batch 02).'
      : 'Next: Home (Customer App Batch 03).';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={[typography.labelSm, styles.tag]}>BOUNDARY PLACEHOLDER</Text>
        <Text accessibilityRole="header" style={[typography.headlineLg, styles.title]}>
          You&apos;re signed in
        </Text>
        {me.isPending ? <ActivityIndicator color={colors.primaryContainer} /> : null}
        {me.isError ? <FormError {...toAuthErrorMessage(me.error)} /> : null}
        {me.data ? (
          <Text style={[typography.bodyMd, styles.detail]}>
            {me.data.email ?? me.data.phone} · account status {me.data.status}
          </Text>
        ) : null}
        <Text style={[typography.bodyMd, styles.detail]}>{next}</Text>
      </View>
      <SecondaryButton
        label="Sign out"
        onPress={() => {
          signOut.mutate();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, padding: spacing.screen },
  body: { flex: 1, justifyContent: 'center', gap: spacing.sm },
  tag: { color: colors.tertiary },
  title: { color: colors.onSurface },
  detail: { color: colors.onSurfaceVariant },
});
