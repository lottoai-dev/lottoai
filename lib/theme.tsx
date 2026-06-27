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

// Tema context'ini ikiye böl — sık değişen ve az değişen
const ThemeValueContext = createContext<{ theme: AppTheme; mode: ThemeMode } | null>(null);
const ThemeControlContext = createContext<{ pref: Pref; setPref: (p: Pref) => void } | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<Pref>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.THEME_PREF)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') {
          setPrefState(v);
        }
      })
      .catch(() => {});
  }, []);

  const setPref = useCallback((p: Pref) => {
    setPrefState(p);
    AsyncStorage.setItem(STORAGE_KEYS.THEME_PREF, p).catch(() => {});
  }, []);

  const mode: ThemeMode = pref === 'system'
    ? (system === 'dark' ? 'dark' : 'light')
    : pref;

  const themeValue = useMemo(() => ({ theme: themes[mode], mode }), [mode]);
  const controlValue = useMemo(() => ({ pref, setPref }), [pref, setPref]);

  return (
    <ThemeValueContext.Provider value={themeValue}>
      <ThemeControlContext.Provider value={controlValue}>
        {children}
      </ThemeControlContext.Provider>
    </ThemeValueContext.Provider>
  );
}

export function useTheme(): AppTheme {
  const ctx = useContext(ThemeValueContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx.theme;
}

export function useThemeControls() {
  const themeCtx = useContext(ThemeValueContext);
  const controlCtx = useContext(ThemeControlContext);
  if (!themeCtx || !controlCtx) throw new Error('useThemeControls must be used within ThemeProvider');
  return { ...themeCtx, ...controlCtx };
}