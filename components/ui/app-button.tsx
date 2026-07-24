// components/ui/app-button.tsx
// Primary/secondary/ghost button — Calm Emerald.

import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
    type ViewStyle,
} from 'react-native';
import { FontFamily } from '../../constants/theme';
import { softHaptic } from '../../lib/haptics';
import { useTheme } from '../../lib/theme';

type Variant = 'primary' | 'secondary' | 'ghost';

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled,
  loading,
  iconLeft,
  iconRight,
  style,
  fullWidth = true,
  accent,
  haptic = true,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'lg' | 'md' | 'sm';
  disabled?: boolean;
  loading?: boolean;
  iconLeft?: (color: string, size: number) => React.ReactNode;
  iconRight?: (color: string, size: number) => React.ReactNode;
  style?: ViewStyle;
  fullWidth?: boolean;
  accent?: string;
  haptic?: boolean;
}) {
  const theme = useTheme();
  const c = theme.colors;

  const brand = accent ?? c.brand;
  const height = size === 'lg' ? 52 : size === 'md' ? 46 : 40;
  const fontSize = size === 'lg' ? 15 : size === 'md' ? 14 : 13;
  const iconSize = size === 'lg' ? 20 : 18;

  let bg = brand;
  let fg = c.brandText;
  if (variant === 'secondary') {
    bg = c.surfaceAlt;
    fg = accent ? accent : c.text;
  }
  if (variant === 'ghost') {
    bg = 'transparent';
    fg = brand;
  }

  return (
    <View style={[fullWidth && { width: '100%' }, style]}>
      <Pressable
        disabled={disabled || loading}
        onPress={() => {
          if (haptic) softHaptic();
          onPress?.();
        }}
        style={[
          styles.btn,
          {
            height,
            borderRadius: theme.radius.pill,
            backgroundColor: bg,
            opacity: disabled ? 0.45 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <View style={styles.row}>
            {iconLeft?.(fg, iconSize)}
            <Text style={[styles.label, { color: fg, fontSize }]} allowFontScaling={false}>
              {label}
            </Text>
            {iconRight?.(fg, iconSize)}
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontFamily: FontFamily.semibold, letterSpacing: -0.1 },
});
