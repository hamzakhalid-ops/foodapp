import { useRouter } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, LogoTile, PrimaryButton, SecondaryButton, WordMark } from '../components/ui';
import { welcomeCopy } from '../content/marketing-copy';
import { colors, radii, shadows, spacing, typography } from '../theme/tokens';

import heroImage from '../../assets/images/welcome-hero-burger.png';

/** Screen 2 — Welcome (Batch 01). Entry point for signing up or signing in. */
export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <LogoTile size={40} />
            <View>
              <WordMark />
              <Text style={[typography.bodySm, styles.tagline]}>{welcomeCopy.tagline}</Text>
            </View>
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={[typography.labelSm, styles.liveText]}>{welcomeCopy.liveBadge}</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={[styles.heroGlow, styles.heroGlowTop]} />
          <View style={[styles.heroGlow, styles.heroGlowBottom]} />
          <View style={styles.heroStage}>
            <View style={styles.heroImageFrame}>
              <Image
                source={heroImage}
                style={styles.heroImage}
                resizeMode="cover"
                accessibilityLabel="Gourmet burger with melted cheddar and fries"
              />
              <View style={styles.heroScrim} />
            </View>
            <View style={[styles.badge, styles.badgeTopRight]}>
              <View style={[styles.badgeIcon, { backgroundColor: colors.primaryContainer }]}>
                <Icon name="bolt" size={18} color={colors.onPrimary} />
              </View>
              <View>
                <Text style={[typography.labelSm, styles.badgeValue]}>
                  {welcomeCopy.speedValue}
                </Text>
                <Text style={[typography.bodySm, styles.badgeLabel]}>{welcomeCopy.speedLabel}</Text>
              </View>
            </View>
            <View style={[styles.badge, styles.badgeBottomLeft]}>
              <View style={[styles.badgeIcon, { backgroundColor: colors.primaryFixed }]}>
                <Icon name="star" size={18} color={colors.onPrimaryFixed} />
              </View>
              <View>
                <Text style={[typography.labelSm, styles.badgeValue]}>
                  {welcomeCopy.ratingValue}
                </Text>
                <Text style={[typography.bodySm, styles.badgeLabel]}>
                  {welcomeCopy.ratingLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.copy}>
          <View style={styles.eyebrow}>
            <Icon name="local-fire-department" size={16} color={colors.primary} />
            <Text style={[typography.labelSm, { color: colors.onSecondaryFixed }]}>
              {welcomeCopy.eyebrow}
            </Text>
          </View>
          <Text accessibilityRole="header" style={[typography.headlineXl, styles.headline]}>
            {welcomeCopy.headline}{' '}
            <Text style={{ color: colors.primaryContainer }}>{welcomeCopy.headlineAccent}</Text>
          </Text>
          <Text style={[typography.bodyMd, styles.body]}>{welcomeCopy.body}</Text>
          <View style={styles.features}>
            {welcomeCopy.features.map((feature) => (
              <View key={feature} style={styles.feature}>
                <Icon name="check-circle-outline" size={14} color={colors.primary} />
                <Text style={[typography.labelSm, styles.featureText]}>{feature}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            label="Get Started"
            icon="arrow-forward"
            onPress={() => {
              router.push('/create-account');
            }}
          />
          <SecondaryButton
            label="I already have an account"
            onPress={() => {
              router.push('/login');
            }}
          />
          {/* Terms of Service / Privacy Policy screens are planned for a later batch (STITCH_INDEX #78–79). */}
          <Text style={[typography.bodySm, styles.legal]}>
            By continuing, you agree to QuickBite&apos;s{' '}
            <Text style={styles.legalLink}>Terms of Service</Text> and acknowledge our{' '}
            <Text style={styles.legalLink}>Privacy Policy</Text>.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.screen, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
    marginBottom: spacing.md,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tagline: { color: colors.onSurfaceVariant, fontSize: 11, lineHeight: 14 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHigh,
  },
  liveDot: { width: 8, height: 8, borderRadius: radii.full, backgroundColor: colors.live },
  liveText: { color: colors.onSurfaceVariant },
  hero: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radii.xxl,
    backgroundColor: colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginVertical: spacing.sm,
    ...shadows.sm,
  },
  heroGlow: { position: 'absolute', borderRadius: radii.full },
  heroGlowTop: {
    width: 192,
    height: 192,
    top: -48,
    right: -48,
    backgroundColor: colors.primaryFixed,
    opacity: 0.3,
  },
  heroGlowBottom: {
    width: 176,
    height: 176,
    bottom: -40,
    left: -40,
    backgroundColor: colors.secondaryFixed,
    opacity: 0.4,
  },
  heroStage: { width: 224, height: 224, alignItems: 'center', justifyContent: 'center' },
  heroImageFrame: {
    width: 192,
    height: 192,
    borderRadius: radii.full,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerLow,
    ...shadows.md,
  },
  heroImage: { width: '100%', height: '100%' },
  heroScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: '#000000',
    opacity: 0.18,
  },
  badge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: 10,
    paddingRight: 14,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceContainerLowest,
    ...shadows.md,
  },
  badgeTopRight: { top: -4, right: -8 },
  badgeBottomLeft: { bottom: -8, left: -8 },
  badgeIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeValue: { color: colors.onSurface },
  badgeLabel: { color: colors.onSurfaceVariant, fontSize: 10, lineHeight: 13 },
  copy: { alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.lg },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.full,
    backgroundColor: colors.secondaryFixed,
    marginBottom: spacing.sm,
  },
  headline: { color: colors.onSurface, textAlign: 'center', marginBottom: spacing.sm },
  body: { color: colors.onSurfaceVariant, textAlign: 'center', maxWidth: 320, lineHeight: 23 },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainer,
  },
  featureText: { color: colors.onSurface },
  actions: { gap: 12 },
  legal: {
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    lineHeight: 18,
  },
  legalLink: {
    fontFamily: typography.labelSm.fontFamily,
    color: colors.onSurface,
    textDecorationLine: 'underline',
  },
});
