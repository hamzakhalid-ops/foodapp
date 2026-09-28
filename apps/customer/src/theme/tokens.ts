import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * "Warm Kinetic" design tokens — transcribed from the approved Stitch design system
 * (design/stitch/warm_kinetic/DESIGN.md and the Tailwind config embedded in each Stitch export).
 * Values are copied, not reinterpreted; add tokens here rather than hard-coding them in screens.
 */
export const colors = {
  surface: '#f7f9fb',
  surfaceDim: '#d8dadc',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f2f4f6',
  surfaceContainer: '#eceef0',
  surfaceContainerHigh: '#e6e8ea',
  surfaceContainerHighest: '#e0e3e5',
  onSurface: '#191c1e',
  onSurfaceVariant: '#5a4136',
  outline: '#8e7164',
  outlineVariant: '#e2bfb0',
  primary: '#a04100',
  onPrimary: '#ffffff',
  primaryContainer: '#ff6b00',
  primaryFixed: '#ffdbcc',
  onPrimaryFixed: '#351000',
  secondaryFixed: '#ffdbca',
  onSecondaryFixed: '#331200',
  tertiary: '#565e74',
  tertiaryContainer: '#9198b1',
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  /** Tailwind `emerald-500`, used by the "Live nearby" indicator. */
  live: '#10b981',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  /** `margin-mobile` — horizontal screen padding. */
  screen: 20,
} as const;

export const radii = {
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
} as const;

/** Plus Jakarta Sans faces, loaded in `src/app/_layout.tsx`. */
export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
} as const;

/** Stitch type scale (mobile variants where Stitch defines them). */
export const typography = {
  headlineXl: { fontFamily: fonts.extraBold, fontSize: 28, lineHeight: 34, letterSpacing: -0.56 },
  headlineLg: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.22 },
  headlineSm: { fontFamily: fonts.semiBold, fontSize: 18, lineHeight: 24 },
  bodyLg: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyMd: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  bodySm: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  labelLg: { fontFamily: fonts.semiBold, fontSize: 16, lineHeight: 20, letterSpacing: -0.16 },
  labelMd: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 18 },
  labelSm: { fontFamily: fonts.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.24 },
} satisfies Record<string, TextStyle>;

function shadow(offsetY: number, radius: number, opacity: number, elevation: number): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation },
    default: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: offsetY },
      shadowRadius: radius,
      shadowOpacity: opacity,
    },
  });
}

/** Tailwind `shadow-sm` / `shadow-md` / `shadow-xl` equivalents. */
export const shadows = {
  sm: shadow(1, 2, 0.06, 1),
  md: shadow(4, 6, 0.1, 4),
  xl: shadow(20, 25, 0.12, 12),
} as const;
