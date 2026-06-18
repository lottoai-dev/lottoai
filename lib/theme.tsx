// lib/theme.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { STORAGE_KEYS } from '../constants/storage-keys';
import { AppTheme, ThemeMode, themes } from '../constants/theme';

type Pref = 'system' | ThemeMode;

interface ThemeContextValue {
  theme: AppTheme;
  mode: ThemeMode;
  pref: Pref;
  setPref: (p: Pref) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<Pref>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.THEME_PREF)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setPrefState(v);
      })
      .catch(() => {});
  }, []);

  const setPref = useCallback((p: Pref) => {
    setPrefState(p);
    AsyncStorage.setItem(STORAGE_KEYS.THEME_PREF, p).catch(() => {});
  }, []);

  const mode: ThemeMode = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: themes[mode], mode, pref, setPref }),
    [mode, pref, setPref]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx.theme;
}

export function useThemeControls() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeControls must be used within ThemeProvider');
  return ctx;
}