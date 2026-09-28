import { useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, shadows, spacing, typography } from '../theme/tokens';
import { Icon, type IconName, logoSource } from './ui';

/**
 * Building blocks shared by the account-verification and password-recovery screens (Batch 02),
 * which use a common Stitch header, step bar and code-box input.
 */

/** Stitch header: plain back arrow · orange bolt tile + "QuickBite" · small logo. */
export function AuthHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        hitSlop={10}
        style={styles.headerSide}
      >
        <Icon name="arrow-back" size={24} />
      </Pressable>
      <View style={styles.headerBrand}>
        <View style={styles.headerBolt}>
          <Icon name="bolt" size={20} color={colors.onPrimary} />
        </View>
        <Text style={[typography.headlineSm, styles.headerTitle]}>QuickBite</Text>
      </View>
      <View style={[styles.headerSide, styles.headerRight]}>
        <Image
          source={logoSource}
          style={styles.headerLogo}
          resizeMode="contain"
          accessibilityLabel="QuickBite logo"
        />
      </View>
    </View>
  );
}

/** Segmented progress bar; `filled` of `total` segments are highlighted. */
export function StepBar({ filled, total }: { filled: number; total: number }) {
  return (
    <View
      style={styles.stepBar}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: filled }}
    >
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[
            styles.stepSegment,
            index < filled && { backgroundColor: colors.primaryContainer },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * One-time code input rendered as boxes. A single (visually hidden) TextInput holds the value so
 * paste, autofill (`oneTimeCode`) and backspace behave natively; the boxes only display it.
 */
export function CodeBoxes({
  value,
  onChange,
  length,
  testID,
  accessibilityLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  length: number;
  testID?: string;
  accessibilityLabel: string;
}) {
  const inputRef = useRef<TextInput>(null);
  const digits = value.split('');
  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.codeRow}>
      {Array.from({ length }, (_, index) => {
        const char = digits[index];
        const active = index === digits.length;
        return (
          <View
            key={index}
            style={[
              styles.codeBox,
              char !== undefined && styles.codeBoxFilled,
              active && styles.codeBoxActive,
            ]}
          >
            {char !== undefined ? (
              <Text style={[typography.headlineLg, styles.codeChar]}>{char}</Text>
            ) : active ? (
              <View style={styles.codeCursor} />
            ) : (
              <View style={styles.codeDot} />
            )}
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={(text) => {
          onChange(text.replace(/\D/g, '').slice(0, length));
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus
        caretHidden
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

/** Neutral / success notice banner (Stitch info cards). */
export function Notice({
  icon,
  message,
  tone = 'neutral',
}: {
  icon: IconName;
  message: string;
  tone?: 'neutral' | 'success';
}) {
  const success = tone === 'success';
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.notice, success && { backgroundColor: colors.primaryFixed }]}
    >
      <Icon name={icon} size={18} color={success ? colors.onPrimaryFixed : colors.tertiary} />
      <Text
        style={[
          typography.bodySm,
          styles.noticeText,
          { color: success ? colors.onPrimaryFixed : colors.onSurfaceVariant },
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  headerSide: { width: 48, height: 40, justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end' },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerBolt: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  headerTitle: { color: colors.onSurface, fontFamily: 'PlusJakartaSans_700Bold' },
  headerLogo: { width: 32, height: 24 },
  stepBar: { flexDirection: 'row', gap: 6, marginTop: spacing.xs, marginBottom: spacing.lg },
  stepSegment: {
    flex: 1,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHigh,
  },
  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  codeBox: {
    flex: 1,
    maxWidth: 56,
    aspectRatio: 0.95,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxFilled: { backgroundColor: colors.surfaceContainerLowest, ...shadows.sm },
  codeBoxActive: { backgroundColor: colors.surfaceContainerLowest, ...shadows.md },
  codeChar: { color: colors.onSurface },
  codeCursor: {
    position: 'absolute',
    bottom: 10,
    width: 18,
    height: 3,
    borderRadius: radii.full,
    backgroundColor: colors.primaryContainer,
  },
  codeDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.outlineVariant,
  },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLow,
  },
  noticeText: { flex: 1, lineHeight: 18 },
});
