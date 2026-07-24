// constants/theme.ts
// LottoAI design system — Calm Emerald.
// Soft dark surfaces (blue-gray tonal layers) + softened emerald accent.

import type { TextStyle, ViewStyle } from 'react-native';
import { Platform } from 'react-native';

export type ThemeMode = 'light' | 'dark';

/* ------------------------------------------------------------------ */
/* Font families (loaded in lib/fonts.ts via expo-font)               */
/* ------------------------------------------------------------------ */
export const FontFamily = {
  regular: 'PlusJakarta-Regular',
  medium: 'PlusJakarta-Medium',
  semibold: 'PlusJakarta-SemiBold',
  bold: 'PlusJakarta-Bold',
  extrabold: 'PlusJakarta-ExtraBold',
} as const;

/* ------------------------------------------------------------------ */
/* Spacing & radius scales                                            */
/* ------------------------------------------------------------------ */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 26,
  pill: 999,
} as const;

/* ------------------------------------------------------------------ */
/* Typography roles                                                   */
/* ------------------------------------------------------------------ */
export const typography = {
  display: { fontFamily: FontFamily.extrabold, fontSize: 42, lineHeight: 46, letterSpacing: -1.1 },
  h1: { fontFamily: FontFamily.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.5 },
  h2: { fontFamily: FontFamily.bold, fontSize: 18, lineHeight: 24, letterSpacing: -0.3 },
  h3: { fontFamily: FontFamily.semibold, fontSize: 16, lineHeight: 21, letterSpacing: -0.2 },
  title: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  body: { fontFamily: FontFamily.regular, fontSize: 14.5, lineHeight: 21 },
  bodyMedium: { fontFamily: FontFamily.medium, fontSize: 14.5, lineHeight: 21 },
  bodySemibold: { fontFamily: FontFamily.semibold, fontSize: 14.5, lineHeight: 21 },
  label: { fontFamily: FontFamily.semibold, fontSize: 13, lineHeight: 17 },
  caption: { fontFamily: FontFamily.medium, fontSize: 12, lineHeight: 16 },
  micro: { fontFamily: FontFamily.semibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 0.8 },
} as const satisfies Record<string, TextStyle>;

/* ------------------------------------------------------------------ */
/* Color tokens                                                       */
/* ------------------------------------------------------------------ */
export interface AppColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  elevated: string;
  border: string;
  hairline: string;
  text: string;
  text2: string;
  text3: string;
  brand: string;
  brandText: string;
  brandSoft: string;
  brandBorder: string;
  brandPressed: string;
  gold: string;
  goldSoft: string;
  danger: string;
  dangerSoft: string;
  success: string;
  warning: string;
  tabBg: string;
  tabBorder: string;
  overlay: string;
  highlight: string;
}

const lightColors: AppColors = {
  bg: '#F3F5F8',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F2F5',
  elevated: '#FFFFFF',
  border: 'rgba(15,20,30,0.06)',
  hairline: 'rgba(15,20,30,0.04)',
  text: '#0F141B',
  text2: '#5C6573',
  text3: '#949BA8',
  brand: '#1C9E73',
  brandText: '#FFFFFF',
  brandSoft: 'rgba(28,158,115,0.10)',
  brandBorder: 'rgba(28,158,115,0.20)',
  brandPressed: '#157E5C',
  gold: '#C29A2B',
  goldSoft: 'rgba(194,154,43,0.12)',
  danger: '#D9534F',
  dangerSoft: 'rgba(217,83,79,0.10)',
  success: '#1C9E73',
  warning: '#D9822B',
  tabBg: 'rgba(255,255,255,0.94)',
  tabBorder: 'rgba(15,20,30,0.06)',
  overlay: 'rgba(15,20,30,0.45)',
  highlight: 'rgba(255,255,255,0.7)',
};

const darkColors: AppColors = {
  bg: '#0A0C10',
  surface: '#12151B',
  surfaceAlt: '#181C24',
  elevated: '#1E232C',
  border: 'rgba(255,255,255,0.05)',
  hairline: 'rgba(255,255,255,0.04)',
  text: '#F2F4F7',
  text2: '#98A0AD',
  text3: '#5C6470',
  brand: '#3DD68C',
  brandText: '#06110B',
  brandSoft: 'rgba(61,214,140,0.12)',
  brandBorder: 'rgba(61,214,140,0.22)',
  brandPressed: '#32B877',
  gold: '#D6B348',
  goldSoft: 'rgba(214,179,72,0.14)',
  danger: '#E5706B',
  dangerSoft: 'rgba(229,112,107,0.12)',
  success: '#3DD68C',
  warning: '#E0954A',
  tabBg: 'rgba(10,12,16,0.94)',
  tabBorder: 'rgba(255,255,255,0.04)',
  overlay: 'rgba(0,0,0,0.55)',
  highlight: 'rgba(255,255,255,0.04)',
};

/* ------------------------------------------------------------------ */
/* Elevation / shadows — soft & minimal on dark                       */
/* ------------------------------------------------------------------ */
const lightShadow: ViewStyle = {
  shadowColor: '#101620',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.06,
  shadowRadius: 20,
  elevation: 4,
};
const lightShadowSm: ViewStyle = {
  shadowColor: '#101620',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 8,
  elevation: 1,
};
const darkShadow: ViewStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.28,
  shadowRadius: 18,
  elevation: 4,
};
const darkShadowSm: ViewStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.22,
  shadowRadius: 6,
  elevation: 1,
};

/* ------------------------------------------------------------------ */
/* Theme object                                                       */
/* ------------------------------------------------------------------ */
export interface AppTheme {
  mode: ThemeMode;
  colors: AppColors;
  shadow: ViewStyle;
  shadowSm: ViewStyle;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  font: typeof FontFamily;
}

export const lightTheme: AppTheme = {
  mode: 'light',
  colors: lightColors,
  shadow: lightShadow,
  shadowSm: lightShadowSm,
  spacing,
  radius,
  typography,
  font: FontFamily,
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  colors: darkColors,
  shadow: darkShadow,
  shadowSm: darkShadowSm,
  spacing,
  radius,
  typography,
  font: FontFamily,
};

export const themes: Record<ThemeMode, AppTheme> = {
  light: lightTheme,
  dark: darkTheme,
};

/* ------------------------------------------------------------------ */
/* Game accent colors — official MP palette (from lib/games.ts)       */
/* ------------------------------------------------------------------ */
export { GAME_ACCENT as GameAccent } from '../lib/games';

/* ------------------------------------------------------------------ */
/* Backward-compatible exports (legacy starter files import these)    */
/* ------------------------------------------------------------------ */
const tintColorLight = lightColors.brand;
const tintColorDark = darkColors.brand;

export const Colors = {
  light: {
    text: lightColors.text,
    background: lightColors.bg,
    tint: tintColorLight,
    icon: lightColors.text2,
    tabIconDefault: lightColors.text3,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: darkColors.text,
    background: darkColors.bg,
    tint: tintColorDark,
    icon: darkColors.text2,
    tabIconDefault: darkColors.text3,
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: { sans: FontFamily.regular, serif: 'ui-serif', rounded: FontFamily.bold, mono: 'ui-monospace' },
  default: { sans: FontFamily.regular, serif: 'serif', rounded: FontFamily.bold, mono: 'monospace' },
  web: {
    sans: "'Plus Jakarta Sans', system-ui, sans-serif",
    serif: 'Georgia, serif',
    rounded: "'Plus Jakarta Sans', sans-serif",
    mono: 'SFMono-Regular, Menlo, monospace',
  },
});
