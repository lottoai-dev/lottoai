// components/ui/surface.tsx
// Card surface + a press-scale wrapper for tappable rows/cards.

import * as Haptics from 'expo-haptics';
import React, { useRef } from 'react';
import { Animated, Pressable, View, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '../../lib/theme';

export function Surface({
  children,
  style,
  elevated = true,
  ...rest
}: ViewProps & { elevated?: boolean }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: theme.radius.xl,
          borderWidth: 1,
          borderColor: c.border,
        },
        elevated ? theme.shadowSm : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function PressableScale({
  children,
  onPress,
  style,
  haptic = true,
  disabled,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  haptic?: boolean;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        disabled={disabled}
        onPressIn={() => to(0.97)}
        onPressOut={() => to(1)}
        onPress={() => {
          if (haptic) Haptics.selectionAsync();
          onPress?.();
        }}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}