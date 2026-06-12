// components/ui/app-button.tsx
// Primary/secondary/ghost button with press-scale animation.

import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { FontFamily } from '../../constants/theme';
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
}) {
  const theme = useTheme();
  const c = theme.colors;
  const scale = useRef(new Animated.Value(1)).current;

  const brand = accent ?? c.brand;
  const height = size === 'lg' ? 52 : size === 'md' ? 46 : 40;
  const fontSize = size === 'lg' ? 15.5 : size === 'md' ? 14.5 : 13.5;
  const iconSize = size === 'lg' ? 20 : 18;

  let bg = brand;
  let fg = c.brandText;
  let border: ViewStyle = {};
  if (variant === 'secondary') { bg = c.surfaceAlt; fg = c.text; border = { borderWidth: 1, borderColor: c.border }; }
  if (variant === 'ghost') { bg = 'transparent'; fg = brand; }

  const press = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  return (
    <Animated.View style={[{ transform: [{ scale }] }, fullWidth && { width: '100%' }, style]}>
      <Pressable
        disabled={disabled || loading}
        onPressIn={() => press(0.96)}
        onPressOut={() => press(1)}
        onPress={() => {
          onPress?.();
        }}
        style={[
          styles.btn,
          { height, borderRadius: theme.radius.lg, backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
          border,
          variant === 'primary' && {
            shadowColor: brand,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.32,
            shadowRadius: 12,
            elevation: 4,
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontFamily: FontFamily.bold, letterSpacing: -0.1 },
});