import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logoSource } from '../components/ui';
import { splashCopy } from '../content/marketing-copy';
import { session } from '../lib/api';
import { routeAfterSignIn } from '../lib/auth/routes';
import { colors, radii, shadows, spacing, typography } from '../theme/tokens';

/** Keeps the brand moment visible on fast devices (Stitch splash). */
export const MIN_SPLASH_MS = 1200;
const MESSAGE_INTERVAL_MS = 1800;

type Phase = 'connecting' | 'offline';

/**
 * Screen 1 — Splash (Batch 01). Restores a stored session, then routes to the signed-in area or
 * to Welcome. A network failure never discards the stored session: it shows a retry state.
 */
export default function SplashScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('connecting');
  const [messageIndex, setMessageIndex] = useState(0);
  const version = Constants.expoConfig?.version;

  const start = useCallback(() => {
    let cancelled = false;
    setPhase('connecting');
    const minimumDelay = new Promise((resolve) => setTimeout(resolve, MIN_SPLASH_MS));
    // A restored session goes where the account status says (unverified → phone verification).
    const destination = session
      .restore()
      .then(async (status) =>
        status === 'signedIn' ? routeAfterSignIn(await session.me()) : ('/welcome' as const),
      );
    Promise.all([destination, minimumDelay])
      .then(([route]) => {
        if (!cancelled) router.replace(route);
      })
      .catch(() => {
        if (!cancelled) setPhase('offline');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(start, [start]);

  useEffect(() => {
    if (phase !== 'connecting') return;
    const timer = setInterval(() => {
      setMessageIndex((index) => (index + 1) % splashCopy.loadingMessages.length);
    }, MESSAGE_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [phase]);

  const offline = phase === 'offline';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.statusRow}>
        <View style={styles.statusPill} accessibilityLiveRegion="polite">
          <View style={[styles.statusDot, offline && { backgroundColor: colors.error }]} />
          <Text style={[typography.labelSm, styles.statusText]}>
            {offline ? 'Offline' : 'Connecting'}
          </Text>
        </View>
      </View>

      <View style={styles.center}>
        <View style={styles.logoWrap}>
          <View style={styles.glow} />
          <View style={styles.logoCircle}>
            <Image
              source={logoSource}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="QuickBite logo"
            />
          </View>
        </View>
        <View style={styles.eyebrow}>
          <Text style={[typography.labelSm, styles.eyebrowText]}>
            {splashCopy.eyebrow.toUpperCase()}
          </Text>
        </View>
        <Text style={[typography.bodyMd, styles.body]}>{splashCopy.body}</Text>
      </View>

      <View style={styles.footer}>
        {offline ? (
          <View style={styles.offlineCard} accessibilityRole="alert">
            <Text style={[typography.bodySm, styles.loadingText]}>
              Can&apos;t reach QuickBite. Check your connection.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={start}
              style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]}
            >
              <Text style={[typography.labelSm, { color: colors.onPrimary }]}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.loadingPill} accessibilityRole="progressbar">
            <ActivityIndicator size="small" color={colors.primaryContainer} />
            <Text style={[typography.bodySm, styles.loadingText]}>
              {splashCopy.loadingMessages[messageIndex]}
            </Text>
          </View>
        )}
        {version ? <Text style={[typography.labelSm, styles.version]}>v{version}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.screen,
    paddingVertical: spacing.xl,
  },
  statusRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: spacing.xs },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainer,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.primaryContainer,
  },
  statusText: { color: colors.tertiary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoWrap: { marginBottom: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    top: -16,
    left: -16,
    right: -16,
    bottom: -16,
    borderRadius: radii.full,
    backgroundColor: colors.primaryFixed,
    opacity: 0.25,
  },
  logoCircle: {
    width: 176,
    height: 176,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    ...shadows.xl,
  },
  logo: { width: 144, height: 144 },
  eyebrow: {
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderRadius: radii.full,
    backgroundColor: colors.primaryFixed,
    marginBottom: spacing.xs,
  },
  eyebrowText: { color: colors.onPrimaryFixed, letterSpacing: 1.2 },
  body: { color: colors.tertiary, textAlign: 'center', maxWidth: 260, lineHeight: 23 },
  footer: { alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md },
  loadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.full,
    ...shadows.sm,
  },
  loadingText: { color: colors.tertiary },
  offlineCard: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radii.xl,
    ...shadows.sm,
  },
  retry: {
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.full,
  },
  version: { color: colors.outlineVariant },
});
