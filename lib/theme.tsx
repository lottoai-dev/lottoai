// lib/theme.tsx
import React, { createContext, useContext, useMemo } from 'react';
import { AppTheme, themes } from '../constants/theme';

// Uygulama şu an sadece koyu temayı destekliyor.
// Açık tema talebi gelirse, system/light/dark seçim mantığı geri eklenebilir.
const FIXED_MODE = 'dark' as const;

const ThemeValueContext = createContext<{ theme: AppTheme; mode: 'dark' } | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeValue = useMemo(() => ({ theme: themes[FIXED_MODE], mode: FIXED_MODE }), []);

  return (
    <ThemeValueContext.Provider value={themeValue}>
      {children}
    </ThemeValueContext.Provider>
  );
}

export function useTheme(): AppTheme {
  const ctx = useContext(ThemeValueContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx.theme;
}