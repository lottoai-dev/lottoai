// app/(tabs)/bildirimler.tsx
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AppState,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTheme } from '../../constants/theme';
import { useBildirim, type Bildirim } from '../../contexts/BildirimContext';
import { BackIcon, BellIcon } from '../../lib/icons';
import { useTheme } from '../../lib/theme';

const TIME_TICK_MS = 60_000;

function softHaptic() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

function formatBildirimTime(isoString: string, nowMs: number) {
  const date = new Date(isoString);
  const diffMs = nowMs - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'az önce';
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} saat önce`;
  return date.toLocaleDateString('tr-TR');
}

export default function BildirimlerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const { bildirimler, markAsRead, markAllAsRead } = useBildirim();
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Ekran odaktayken göreli süreleri dakikada bir yenile
  useFocusEffect(
    useCallback(() => {
      setNowMs(Date.now());
      const id = setInterval(() => setNowMs(Date.now()), TIME_TICK_MS);
      return () => clearInterval(id);
    }, []),
  );

  // Arka plandan dönüşte interval throttle olsa bile hemen güncelle
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNowMs(Date.now());
    });
    return () => sub.remove();
  }, []);

  const handlePress = (bildirim: Bildirim) => {
    softHaptic();
    markAsRead(bildirim.id);
    if (bildirim.screen === 'saved') router.push('/(tabs)/saved');
    else if (bildirim.screen === 'generate') router.push('/(tabs)/generate');
  };

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <View style={{ paddingTop: insets.top + 6 }}>
        <View style={s.nav}>
          <Pressable
            onPress={() => {
              softHaptic();
              router.back();
            }}
            style={[s.navBtn, { backgroundColor: c.surface }]}
            hitSlop={6}
          >
            <BackIcon color={c.text2} size={22} />
          </Pressable>
          <Text style={s.navTitle}>Bildirimler</Text>
          <View style={{ width: 38 }} />
        </View>
        {bildirimler.length > 0 ? (
          <Pressable
            onPress={() => {
              softHaptic();
              markAllAsRead();
            }}
            hitSlop={8}
            style={s.markAllRow}
          >
            <Text style={[s.markAll, { color: c.brand }]}>Tümünü okundu işaretle</Text>
          </Pressable>
        ) : null}
      </View>

      {bildirimler.length === 0 ? (
        <View style={s.empty}>
          <View style={[s.emptyIcon, { backgroundColor: c.surfaceAlt }]}>
            <BellIcon color={c.text3} size={36} />
          </View>
          <Text style={s.emptyTitle}>Henüz bildirim yok</Text>
          <Text style={s.emptyDesc}>Çekiliş ve kolon bildirimlerin burada görünecek.</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: insets.bottom + 40,
          }}
        >
          {bildirimler.map((b) => (
            <BildirimRow
              key={b.id}
              bildirim={b}
              nowMs={nowMs}
              styles={s}
              colors={c}
              onPress={handlePress}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const BildirimRow = React.memo(function BildirimRow({
  bildirim,
  nowMs,
  styles: s,
  colors: c,
  onPress,
}: {
  bildirim: Bildirim;
  nowMs: number;
  styles: ReturnType<typeof makeStyles>;
  colors: AppTheme['colors'];
  onPress: (b: Bildirim) => void;
}) {
  return (
    <TouchableOpacity
      style={[s.item, { backgroundColor: bildirim.isRead ? c.surface : c.brandSoft }]}
      onPress={() => onPress(bildirim)}
      activeOpacity={1}
    >
      <View style={[s.dot, { backgroundColor: bildirim.isRead ? 'transparent' : c.brand }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.itemTitle} numberOfLines={1}>
          {bildirim.title}
        </Text>
        <Text style={s.itemBody} numberOfLines={3}>
          {bildirim.body}
        </Text>
        <Text style={s.itemTime}>{formatBildirimTime(bildirim.createdAt, nowMs)}</Text>
      </View>
    </TouchableOpacity>
  );
});

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    nav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
      gap: 8,
    },
    navBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navTitle: { ...ty.h3, color: c.text },
    markAllRow: { alignItems: 'flex-end', paddingHorizontal: spacing.xl, paddingBottom: 6 },
    markAll: { ...ty.label },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xxl,
      gap: 10,
      paddingBottom: 80,
    },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    emptyTitle: { ...ty.h2, color: c.text },
    emptyDesc: { ...ty.bodyMedium, color: c.text3, textAlign: 'center', maxWidth: 240 },
    item: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 14,
      borderRadius: radius.xl,
      marginBottom: 8,
    },
    dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
    itemTitle: { ...ty.bodySemibold, color: c.text, marginBottom: 2 },
    itemBody: { ...ty.caption, color: c.text2, lineHeight: 18 },
    itemTime: { ...ty.micro, color: c.text3, marginTop: 6, letterSpacing: 0 },
  });
}
