// lib/OfflineBanner.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontFamily } from '../constants/theme';
import { WifiOffIcon } from './icons';
import { useTheme } from './theme';
import { useNetwork } from './useNetwork';

export function OfflineBanner() {
  const { isConnected } = useNetwork();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (isConnected) return null;

  return (
    <View style={[styles.banner, { backgroundColor: theme.colors.danger, paddingTop: insets.top + 8 }]}>
      <WifiOffIcon color="#fff" size={16} />
      <Text style={styles.text} allowFontScaling={false}>
        İnternet bağlantısı yok
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  text: { color: '#fff', fontSize: 13, fontFamily: FontFamily.bold },
});