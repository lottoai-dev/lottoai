// components/ui/states.tsx
// Shared loading / error / empty state blocks for the Results hub and beyond.

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { RefreshIcon, WifiOffIcon } from '../../lib/icons';
import { useTheme } from '../../lib/theme';
import { AppButton } from './app-button';
import { Surface } from './surface';

export function LoadingState({ label = 'Yükleniyor…' }: { label?: string }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={c.brand} />
      <Text style={[styles.muted, { color: c.text2 }]}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Surface style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: c.dangerSoft }]}>
        <WifiOffIcon color={c.danger} size={28} />
      </View>
      <Text style={[styles.title, { color: c.text }]}>Bir şeyler ters gitti</Text>
      <Text style={[styles.desc, { color: c.text2 }]}>{message}</Text>
      <AppButton label="Tekrar dene" variant="secondary" size="md" fullWidth={false} onPress={onRetry} iconLeft={(color, size) => <RefreshIcon color={color} size={size} />} />
    </Surface>
  );
}

export function EmptyState({
  icon,
  title,
  desc,
  action,
  onAction,
}: {
  icon?: React.ReactNode;
  title: string;
  desc: string;
  action?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Surface style={styles.card}>
      {icon ? <View style={[styles.iconWrap, { backgroundColor: c.brandSoft }]}>{icon}</View> : null}
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      <Text style={[styles.desc, { color: c.text2 }]}>{desc}</Text>
      {action ? <AppButton label={action} onPress={onAction} fullWidth={false} style={{ marginTop: 2 }} /> : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: 48, gap: 14 },
  muted: { fontFamily: 'PlusJakarta-Medium', fontSize: 14 },
  card: { marginHorizontal: 20, marginTop: 16, padding: 24, alignItems: 'center', gap: 12 },
  iconWrap: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  title: { fontFamily: 'PlusJakarta-Bold', fontSize: 18, letterSpacing: -0.3 },
  desc: { fontFamily: 'PlusJakarta-Regular', fontSize: 14.5, lineHeight: 21, textAlign: 'center', maxWidth: 270 },
});