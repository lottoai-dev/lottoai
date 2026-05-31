// components/ui/segmented.tsx
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FontFamily } from '../../constants/theme';
import { useTheme } from '../../lib/theme';

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.wrap, { backgroundColor: theme.mode === 'dark' ? c.surfaceAlt : '#ECEEF1' }]}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            style={[styles.seg, active && [{ backgroundColor: c.surface }, theme.shadowSm]]}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(opt.key);
            }}
          >
            <Text
              style={[styles.label, { color: active ? c.text : c.text2, fontFamily: active ? FontFamily.bold : FontFamily.semibold }]}
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
  wrap: { flexDirection: 'row', gap: 3, padding: 4, borderRadius: 14, marginHorizontal: 20, marginBottom: 16 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11 },
  label: { fontSize: 13 },
});