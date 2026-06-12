// lib/OfflineBanner.tsx
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { FontFamily } from '../constants/theme';
import { WifiOffIcon } from './icons';
import { useTheme } from './theme';

export function OfflineBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // İlk durumu kontrol et
    NetInfo.fetch().then((state) => {
      setIsOffline(!state.isConnected || state.isInternetReachable === false);
    });

    // Dinleyici ekle
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected || state.isInternetReachable === false);
    });

    return () => unsubscribe();
  }, []);

  if (!isOffline) return null;

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