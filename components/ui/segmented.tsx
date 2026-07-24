// components/ui/segmented.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FontFamily } from '../../constants/theme';
import { softHaptic } from '../../lib/haptics';
import { useTheme } from '../../lib/theme';

export function Segmented({
  options,
  value,
  onChange,
  accent,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  accent?: string;
}) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.wrap, { backgroundColor: c.surfaceAlt }]}>
      {options.map((opt) => {
        const active = opt.key === value;
        const activeBg = accent ?? c.elevated;
        const activeFg = accent ? '#FFFFFF' : c.text;
        return (
          <Pressable
            key={opt.key}
            style={[styles.seg, active && { backgroundColor: activeBg }]}
            onPress={() => {
              if (active) return;
              onChange(opt.key);
              softHaptic();
            }}
          >
            <Text
              style={[
                styles.label,
                {
                  color: active ? activeFg : c.text2,
                  fontFamily: active ? FontFamily.semibold : FontFamily.medium,
                },
              ]}
              allowFontScaling={false}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 3,
    padding: 4,
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  label: { fontSize: 13 },
});
