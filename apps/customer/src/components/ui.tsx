import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { type ComponentProps, forwardRef, type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import logoAsset from '../../assets/logo/quickbite-logo.png';
import { colors, radii, shadows, spacing, typography } from '../theme/tokens';

/**
 * Building blocks for the Stitch "Warm Kinetic" screens. Stitch uses Material Symbols (outlined);
 * the equivalent Material Icons glyphs are used here.
 */
export type IconName = ComponentProps<typeof MaterialIcons>['name'];

export function Icon({
  name,
  size = 20,
  color = colors.onSurface,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <MaterialIcons name={name} size={size} color={color} accessibilityElementsHidden />;
}

export const logoSource = logoAsset;

/** "Quick" + orange "Bite" word mark. */
export function WordMark({ size = typography.headlineSm.fontSize }: { size?: number }) {
  return (
    <Text style={[typography.headlineSm, styles.wordMark, { fontSize: size }]}>
      Quick<Text style={styles.wordMarkAccent}>Bite</Text>
    </Text>
  );
}

export function LogoTile({ size, style }: { size: number; style?: ViewStyle }) {
  return (
    <View style={[styles.logoTile, { width: size, height: size }, style]}>
      <Image
        source={logoSource}
        style={styles.fill}
        resizeMode="contain"
        accessibilityLabel="QuickBite logo"
      />
    </View>
  );
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  testID?: string;
}

export function PrimaryButton({
  label,
  onPress,
  icon,
  loading,
  loadingLabel,
  disabled,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        shadows.md,
        pressed && styles.pressed,
        inactive && styles.inactive,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.onPrimary} size="small" /> : null}
      <Text style={[typography.labelLg, styles.primaryLabel]}>
        {loading && loadingLabel ? loadingLabel : label}
      </Text>
      {!loading && icon ? <Icon name={icon} color={colors.onPrimary} /> : null}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  icon,
  iconColor,
  testID,
  height = 52,
}: ButtonProps & {
  iconColor?: string;
  height?: number;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        shadows.sm,
        { height },
        pressed && styles.pressed,
      ]}
    >
      {icon ? <Icon name={icon} color={iconColor ?? colors.onSurface} /> : null}
      <Text style={[typography.labelLg, styles.secondaryLabel]}>{label}</Text>
    </Pressable>
  );
}

export function BackButton({
  onPress,
  label = 'Go back',
  background = colors.surfaceContainer,
}: {
  onPress: () => void;
  label?: string;
  background?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.backButton,
        { backgroundColor: background },
        pressed && styles.pressed,
      ]}
    >
      <Icon name="arrow-back" size={22} />
    </Pressable>
  );
}

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  icon: IconName;
  error?: string | undefined;
  /** Rendered inside the field on the right (e.g. a visibility toggle). */
  trailing?: ReactNode;
  /** Stitch uses a white field on Login and a grey field on Create Account. */
  variant?: 'white' | 'grey';
  labelTrailing?: ReactNode;
  hint?: ReactNode;
  /** Hides the visible label when the caller renders its own (the label stays accessible). */
  hideLabel?: boolean;
}

export const TextField = forwardRef<TextInput, FieldProps>(function TextField(
  { label, icon, error, trailing, variant = 'white', labelTrailing, hint, hideLabel, ...input },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const background =
    variant === 'white'
      ? focused
        ? colors.surfaceContainerLow
        : colors.surfaceContainerLowest
      : focused
        ? colors.surfaceContainerLowest
        : colors.surfaceContainerLow;
  return (
    <View style={styles.field}>
      {hideLabel ? null : (
        <View style={styles.fieldLabelRow}>
          <Text
            style={[
              variant === 'white' ? typography.labelSm : typography.labelMd,
              styles.fieldLabel,
            ]}
          >
            {label}
          </Text>
          {labelTrailing}
        </View>
      )}
      <View
        style={[
          styles.fieldBox,
          { backgroundColor: background },
          focused ? shadows.md : shadows.sm,
          error ? styles.fieldBoxError : null,
        ]}
      >
        <Icon name={icon} color={variant === 'white' ? colors.tertiary : colors.onSurfaceVariant} />
        <TextInput
          {...input}
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={
            variant === 'white' ? colors.tertiaryContainer : colors.outlineVariant
          }
          style={[typography.bodyMd, styles.fieldInput]}
          onFocus={(event) => {
            setFocused(true);
            input.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            input.onBlur?.(event);
          }}
        />
        {trailing}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[typography.bodySm, styles.fieldError]}>
          {error}
        </Text>
      ) : (
        hint
      )}
    </View>
  );
});

/** Eye toggle used inside password fields. */
export function VisibilityToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      onPress={onToggle}
      hitSlop={8}
    >
      <Icon name={visible ? 'visibility-off' : 'visibility'} color={colors.tertiary} />
    </Pressable>
  );
}

/** Error banner (Stitch `loginFeedback`). */
export function FormError({
  message,
  requestId,
}: {
  message: string;
  requestId?: string | undefined;
}) {
  return (
    <View accessibilityRole="alert" style={styles.formError}>
      <Icon name="error-outline" size={18} color={colors.onErrorContainer} />
      <View style={styles.flex}>
        <Text style={[typography.bodySm, { color: colors.onErrorContainer }]}>{message}</Text>
        {requestId ? (
          <Text style={[typography.bodySm, styles.requestId]}>Ref: {requestId}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  pressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  inactive: { opacity: 0.7 },
  wordMark: { color: colors.onSurface, letterSpacing: -0.4 },
  wordMarkAccent: { color: colors.primaryContainer },
  logoTile: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 4,
    overflow: 'hidden',
    ...shadows.sm,
  },
  primaryButton: {
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.primaryContainer,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryLabel: { color: colors.onPrimary },
  secondaryButton: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLowest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  secondaryLabel: { color: colors.onSurface },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { gap: 6 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { color: colors.onSurfaceVariant },
  fieldBox: {
    height: 52,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  fieldBoxError: { borderWidth: 1, borderColor: colors.error },
  fieldInput: { flex: 1, height: '100%', color: colors.onSurface, paddingVertical: 0 },
  fieldError: { color: colors.error, paddingHorizontal: 4 },
  formError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.errorContainer,
  },
  requestId: { color: colors.onErrorContainer, opacity: 0.7, marginTop: 2 },
});
