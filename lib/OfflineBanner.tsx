// lib_OfflineBanner.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from './i18n';
import { useNetwork } from './useNetwork';

export function OfflineBanner() {
  const { isConnected } = useNetwork();

  if (isConnected) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        📡 {t('offlineBanner')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
});