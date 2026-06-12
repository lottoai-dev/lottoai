// components/ui/toggle.tsx
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import { useTheme } from '../../lib/theme';

export function Toggle({
  value,
  onChange,
  accent,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  accent?: string;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const on = accent ?? c.brand;
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, { toValue: value ? 1 : 0, useNativeDriver: false, speed: 30, bounciness: 4 }).start();
  }, [value, anim]);

  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: [c.border, on] });
  const x = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 21] });

  return (
    <Pressable
      onPress={() => {
        onChange(!value);
      }}
      hitSlop={8}
    >
      <Animated.View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: bg, justifyContent: 'center' }}>
        <Animated.View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: '#fff',
            transform: [{ translateX: x }],
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.25,
            shadowRadius: 3,
            elevation: 2,
          }}
        />
      </Animated.View>
    </Pressable>
  );
}