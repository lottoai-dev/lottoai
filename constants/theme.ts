// constants/theme.ts
// LottoAI design system — calm, trustworthy fintech.
// Emerald brand accent + neutral surfaces. Full light/dark token set.

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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 26,
  pill: 999,
} as const;

/* ------------------------------------------------------------------ */
/* Typography roles                                                   */
/* ------------------------------------------------------------------ */
export const typography = {
  display: { fontFamily: FontFamily.extrabold, fontSize: 46, lineHeight: 48, letterSpacing: -1.2 },
  h1: { fontFamily: FontFamily.extrabold, fontSize: 26, lineHeight: 32, letterSpacing: -0.6 },
  h2: { fontFamily: FontFamily.extrabold, fontSize: 19, lineHeight: 24, letterSpacing: -0.4 },
  h3: { fontFamily: FontFamily.bold, fontSize: 16, lineHeight: 21, letterSpacing: -0.2 },
  title: { fontFamily: FontFamily.bold, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  body: { fontFamily: FontFamily.regular, fontSize: 14.5, lineHeight: 21 },
  bodyMedium: { fontFamily: FontFamily.medium, fontSize: 14.5, lineHeight: 21 },
  bodySemibold: { fontFamily: FontFamily.semibold, fontSize: 14.5, lineHeight: 21 },
  label: { fontFamily: FontFamily.semibold, fontSize: 13, lineHeight: 17 },
  caption: { fontFamily: FontFamily.medium, fontSize: 12, lineHeight: 16 },
  micro: { fontFamily: FontFamily.semibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 0.4 },
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
}

const lightColors: AppColors = {
  bg: '#F4F5F7',
  surface: '#FFFFFF',
  surfaceAlt: '#FAFBFC',
  elevated: '#FFFFFF',
  border: '#E9EBEF',
  hairline: '#EEF0F3',
  text: '#12161B',
  text2: '#5C6571',
  text3: '#9AA1AB',
  brand: '#1C9E73',
  brandText: '#FFFFFF',
  brandSoft: 'rgba(28,158,115,0.10)',
  brandBorder: 'rgba(28,158,115,0.22)',
  brandPressed: '#157E5C',
  gold: '#C29A2B',
  goldSoft: 'rgba(194,154,43,0.12)',
  danger: '#D9534F',
  dangerSoft: 'rgba(217,83,79,0.10)',
  success: '#1C9E73',
  warning: '#D9822B',
  tabBg: 'rgba(255,255,255,0.94)',
  tabBorder: '#E9EBEF',
  overlay: 'rgba(18,22,27,0.45)',
};

const darkColors: AppColors = {
  bg: '#0E1212',
  surface: '#171C1C',
  surfaceAlt: '#1C2222',
  elevated: '#1F2626',
  border: '#272E2E',
  hairline: '#222929',
  text: '#ECEFEE',
  text2: '#9BA3A0',
  text3: '#69716E',
  brand: '#2FBE8C',
  brandText: '#04130D',
  brandSoft: 'rgba(47,190,140,0.13)',
  brandBorder: 'rgba(47,190,140,0.26)',
  brandPressed: '#26A579',
  gold: '#D6B348',
  goldSoft: 'rgba(214,179,72,0.14)',
  danger: '#E5706B',
  dangerSoft: 'rgba(229,112,107,0.13)',
  success: '#2FBE8C',
  warning: '#E0954A',
  tabBg: 'rgba(20,25,25,0.94)',
  tabBorder: '#242B2B',
  overlay: 'rgba(0,0,0,0.55)',
};

/* ------------------------------------------------------------------ */
/* Elevation / shadows                                                */
/* ------------------------------------------------------------------ */
const lightShadow: ViewStyle = {
  shadowColor: '#101620',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.07,
  shadowRadius: 24,
  elevation: 5,
};
const lightShadowSm: ViewStyle = {
  shadowColor: '#101620',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
};
const darkShadow: ViewStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.5,
  shadowRadius: 26,
  elevation: 6,
};
const darkShadowSm: ViewStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.4,
  shadowRadius: 8,
  elevation: 2,
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
/* Game accent colors (calmed from the official palette)              */
/* ------------------------------------------------------------------ */
export const GameAccent: Record<string, string> = {
  cilgin: '#ea0029',
  superloto: '#ff5100',
  sanstopu: '#e10098',
  onnumara: '#a25eb5',
};

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
    serif: "Georgia, serif",
    rounded: "'Plus Jakarta Sans', sans-serif",
    mono: "SFMono-Regular, Menlo, monospace",
  },
});