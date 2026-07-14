// components/ui/toggle.tsx
import React from 'react';
import { Pressable, View } from 'react-native';
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

  return (
    <Pressable
      onPress={() => {
        onChange(!value);
      }}
      hitSlop={8}
    >
      <View
        style={{
          width: 46,
          height: 28,
          borderRadius: 14,
          backgroundColor: value ? on : c.border,
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: '#fff',
            transform: [{ translateX: value ? 21 : 3 }],
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.25,
            shadowRadius: 3,
            elevation: 2,
          }}
        />
      </View>
    </Pressable>
  );
}
