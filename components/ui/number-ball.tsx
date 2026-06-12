// components/ui/number-ball.tsx
import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { FontFamily } from '../../constants/theme';
import { useTheme } from '../../lib/theme';

type Variant = 'game' | 'bonus' | 'star' | 'muted' | 'matched';

export const NumberBall = React.memo(function NumberBall({
  value,
  color,
  size = 34,
  variant = 'game',
  style,
}: {
  value: number | string;
  color?: string;
  size?: number;
  variant?: Variant;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const c = theme.colors;

  let bg = color ?? c.brand;
  let fg = '#FFFFFF';
  let extra: ViewStyle = {};

  if (variant === 'bonus') {
    bg = '#169ad6';
    fg = '#FFFFFF';
  }
  if (variant === 'star') {
    bg = '#ffe103';
    fg = '#1A1407';
  }
  if (variant === 'muted') {
    bg = 'transparent';
    fg = c.text2;
    extra = { borderWidth: 1.5, borderColor: c.border };
  }
  if (variant === 'matched') {
    fg = '#FFFFFF';
    extra = { borderWidth: 2, borderColor: c.brand };
  }

  const fontSize = Math.round(size * 0.41);

  return (
    <View
      style={[
        styles.ball,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        variant !== 'muted' && bg !== 'transparent' ? { shadowColor: bg, ...shadow } : null,
        extra,
        style,
      ]}
    >
      <Text style={[styles.text, { color: fg, fontSize }]} allowFontScaling={false}>
        {value}
      </Text>
    </View>
  );
});

const shadow: ViewStyle = {
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.28,
  shadowRadius: 5,
  elevation: 2,
};

const styles = StyleSheet.create({
  ball: { alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: FontFamily.bold, fontVariant: ['tabular-nums'], includeFontPadding: false },
});