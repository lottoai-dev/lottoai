import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AIAssistantIcon } from '../lib/icons';
import { useTheme } from '../lib/theme';

type LotaAvatarSize = 'sm' | 'lg';

const SIZES = {
  sm: { outer: 42, radius: 14, icon: 22 },
  lg: { outer: 80, radius: 26, icon: 38 },
} as const;

export function LotaAvatar({ size = 'sm', style }: { size?: LotaAvatarSize; style?: ViewStyle }) {
  const theme = useTheme();
  const c = theme.colors;
  const dim = SIZES[size];

  return (
    <View
      style={[
        styles.wrap,
        size === 'lg' ? theme.shadow : theme.shadowSm,
        { width: dim.outer, height: dim.outer, borderRadius: dim.radius },
        style,
      ]}
    >
      <LinearGradient
        colors={[c.brand, c.brandPressed]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.grad, { borderRadius: dim.radius }]}
      >
        <AIAssistantIcon color={c.brandText} size={dim.icon} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  grad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
