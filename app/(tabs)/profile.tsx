// app/(tabs)/profile.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Svg, { Circle, Path } from 'react-native-svg';
import { PressableScale, Surface } from '../../components/ui/surface';
import { STORAGE_KEYS } from '../../constants/storage-keys';
import { AppTheme } from '../../constants/theme';
import { useAlert } from '../../contexts/AlertContext';
import { BrandMark } from '../../lib/emblems';
import {
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  DocIcon,
  EditIcon,
  InfoIcon,
  MailIcon,
  SearchIcon,
  ShieldIcon,
  StatsIcon,
  TrashIcon,
} from '../../lib/icons';
import { useTheme, useThemeControls } from '../../lib/theme';

function softHaptic() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

function SunGlyph({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={1.8} />
      <Path d="M12 2.5v2.5M12 19v2.5M4.5 12H2M22 12h-2.5M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function MoonGlyph({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M20 13.5A8 8 0 1110.5 4a6.5 6.5 0 009.5 9.5z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}

function AutoGlyph({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={1.8} />
      <Path d="M12 3.5v17a8.5 8.5 0 000-17z" fill={color} />
    </Svg>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const { pref, setPref } = useThemeControls();
  const { showAlert } = useAlert();

  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [tempName, setTempName] = useState('');
  const [totalCoupons, setTotalCoupons] = useState(0);
  const [bestResult, setBestResult] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const loadData = async () => {
    try {
      const savedName = await AsyncStorage.getItem(STORAGE_KEYS.USER_NAME);
      if (savedName) setName(savedName);

      const couponsData = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS);
      if (couponsData) {
        const coupons = JSON.parse(couponsData);
        setTotalCoupons(coupons.length);
        setBestResult(coupons.reduce((max: number, cp: any) => Math.max(max, cp.matchedCount || 0), 0));
      }

      const notifData = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_SETTINGS);
      if (notifData) {
        const settings = JSON.parse(notifData);
        setNotificationsEnabled(
          Object.values(settings).some((v: any) => v?.before === true || v?.after === true)
        );
      }
    } catch {}
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const saveName = async () => {
    if (tempName.trim() === '') {
      showAlert('Uyarı', 'İsim boş olamaz.');
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEYS.USER_NAME, tempName.trim());
    setName(tempName.trim());
    setEditing(false);
    softHaptic();
  };

  const clearData = () => {
    showAlert('Tüm verileri sil', 'Tüm kuponların, ayarların ve verilerin silinecek. Bu işlem geri alınamaz.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          softHaptic();
          await AsyncStorage.clear();
          setTotalCoupons(0);
          setBestResult(0);
          setName('');
          showAlert('Silindi', 'Tüm veriler temizlendi. Uygulamayı kapatıp açın.');
        },
      },
    ]);
  };

  const themeOptions: { key: 'light' | 'system' | 'dark'; label: string; Glyph: (p: { color: string }) => React.ReactNode }[] = [
    { key: 'light', label: 'Açık', Glyph: SunGlyph },
    { key: 'system', label: 'Sistem', Glyph: AutoGlyph },
    { key: 'dark', label: 'Koyu', Glyph: MoonGlyph },
  ];

  const MenuRow = ({ Icon, color, title, sub, onPress, last }: {
    Icon: (p: any) => React.ReactNode;
    color: string;
    title: string;
    sub: string;
    onPress?: () => void;
    last?: boolean;
  }) => (
    <PressableScale
      onPress={() => { softHaptic(); onPress?.(); }}
      style={[s.menuRow, ...(!last ? [{ borderBottomWidth: 1, borderBottomColor: c.hairline }] : [])]}
    >
      <View style={[s.menuIcon, { backgroundColor: color + '1A' }]}>
        <Icon color={color} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.menuTitle}>{title}</Text>
        <Text style={s.menuSub}>{sub}</Text>
      </View>
      <ChevronRightIcon color={c.text3} size={18} />
    </PressableScale>
  );

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 90 }}
      >
        <View style={s.header}>
          <Text style={s.title}>Profil</Text>
        </View>

        <Surface style={s.avatarCard}>
          <View style={[s.avatar, { backgroundColor: c.brand }]}>
            <Text style={s.avatarText}>{name ? name.charAt(0).toUpperCase() : 'L'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            {editing ? (
              <View style={s.editRow}>
                <TextInput
                  style={[s.nameInput, { backgroundColor: c.surfaceAlt, borderColor: c.brandBorder, color: c.text }]}
                  value={tempName}
                  onChangeText={setTempName}
                  placeholder="İsmini gir"
                  placeholderTextColor={c.text3}
                  autoFocus
                />
                <Pressable onPress={saveName} style={[s.editBtn, { backgroundColor: c.brand }]} hitSlop={6}>
                  <CheckIcon color={c.brandText} size={18} />
                </Pressable>
                <Pressable onPress={() => { softHaptic(); setEditing(false); }} style={[s.editBtn, { backgroundColor: c.surfaceAlt }]} hitSlop={6}>
                  <CloseIcon color={c.text2} size={18} />
                </Pressable>
              </View>
            ) : (
              <Pressable style={s.nameRow} onPress={() => { softHaptic(); setTempName(name); setEditing(true); }}>
                <Text style={s.nameText}>{name || 'İsim ekle'}</Text>
                <EditIcon color={c.text3} size={16} />
              </Pressable>
            )}
            {!editing ? <Text style={s.memberText}>LottoAI kullanıcısı</Text> : null}
          </View>
        </Surface>

        <Surface style={s.statsCard}>
          <Stat value={String(totalCoupons)} label="Kupon" color={c.brand} theme={theme} divider />
          <Stat value={String(bestResult)} label="En iyi" color={c.gold} theme={theme} divider={false} />
        </Surface>

        <Surface style={s.card}>
          <Text style={s.cardLabel}>GÖRÜNÜM</Text>
          <View style={[s.themeSeg, { backgroundColor: theme.mode === 'dark' ? c.surfaceAlt : '#ECEEF1' }]}>
            {themeOptions.map((opt) => {
              const active = pref === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => { softHaptic(); setPref(opt.key); }}
                  style={[s.themeOpt, active && [{ backgroundColor: c.surface }, theme.shadowSm]]}
                >
                  {opt.Glyph({ color: active ? c.text : c.text2 })}
                  <Text style={[
                    s.themeOptText,
                    { color: active ? c.text : c.text2, fontFamily: active ? theme.font.bold : theme.font.semibold }
                  ]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Surface>

        <Surface style={s.card}>
          <Text style={s.cardLabel}>ARAÇLAR</Text>
          <MenuRow
            Icon={BellIcon}
            color={c.brand}
            title="Hatırlatıcılar"
            sub={notificationsEnabled ? 'Açık' : 'Çekiliş öncesi/sonrası bildirim'}
            onPress={() => router.push('/notifications')}
          />
          <MenuRow
            Icon={StatsIcon}
            color={c.gold}
            title="İstatistikler"
            sub="Sıcak/soğuk sayılar, dağılım"
            onPress={() => router.push('/(tabs)/results?tab=stats')}
          />
          <MenuRow
            Icon={SearchIcon}
            color={c.brand}
            title="Sayı analizi"
            sub="Sayılarını sorgula"
            onPress={() => router.push('/(tabs)/results?tab=analyze')}
            last
          />
        </Surface>

        <View style={[s.responsible, { backgroundColor: c.brandSoft, borderColor: c.brandBorder }]}>
          <View style={s.responsibleHead}>
            <ShieldIcon color={c.brand} size={20} />
            <Text style={s.responsibleTitle}>Sorumlu oyun</Text>
          </View>
          <Text style={s.responsibleText}>
            Şans oyunları eğlence amaçlıdır, gelir kaynağı değildir. 18 yaş ve üzeri içindir. Oyun kontrolden çıktıysa{' '}
            <Text
              style={{ fontFamily: theme.font.bold, color: c.brand }}
              onPress={() => { softHaptic(); Linking.openURL('tel:115'); }}
            >
              Yeşilay 115
            </Text>{' '}
            danışma hattını arayabilirsin.
          </Text>
        </View>

        <Surface style={s.card}>
          <Text style={s.cardLabel}>HAKKINDA</Text>
          <MenuRow Icon={ShieldIcon} color={c.text2} title="Gizlilik politikası" sub="Kişisel verilerin" onPress={() => Linking.openURL('https://lottoai-dev.github.io/lottoai-legal')} />
          <MenuRow Icon={DocIcon} color={c.text2} title="Kullanım koşulları" sub="Uygulama kuralları" onPress={() => Linking.openURL('https://lottoai-dev.github.io/lottoai-legal')} />
          <MenuRow Icon={InfoIcon} color={c.text2} title="Sık sorulan sorular" sub="Uygulama hakkında" onPress={() => router.push('/legal')} />
          <MenuRow Icon={MailIcon} color={c.text2} title="Bize ulaş" sub="lottoai.destek@gmail.com" onPress={() => Linking.openURL('mailto:lottoai.destek@gmail.com')} />
          <MenuRow Icon={InfoIcon} color={c.text3} title="Versiyon" sub="1.0.0" last />
        </Surface>

        <PressableScale
          onPress={() => { softHaptic(); clearData(); }}
          style={[s.danger, { backgroundColor: c.dangerSoft, borderColor: c.danger + '33' }]}
        >
          <TrashIcon color={c.danger} size={20} />
          <Text style={[s.dangerText, { color: c.danger }]}>Tüm verileri sil</Text>
        </PressableScale>

        <View style={s.footer}>
          <BrandMark size={34} />
          <Text style={s.footerText}>LottoAI · v1.0.0</Text>
          <Text style={s.footerSub}>18+ · Şans oyunları asistanı</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ value, label, color, theme, divider }: {
  value: string;
  label: string;
  color: string;
  theme: AppTheme;
  divider?: boolean;
}) {
  const c = theme.colors;
  return (
    <>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ fontFamily: theme.font.extrabold, fontSize: 26, color, fontVariant: ['tabular-nums'] }}>
          {value}
        </Text>
        <Text style={{ ...theme.typography.caption, color: c.text2, marginTop: 3 }}>{label}</Text>
      </View>
      {divider ? (
        <View style={{ width: 1, height: 40, backgroundColor: c.hairline, alignSelf: 'center' }} />
      ) : null}
    </>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: spacing.xl, paddingTop: 4, paddingBottom: 14 },
    title: { ...ty.h1, color: c.text },

    avatarCard: {
      marginHorizontal: spacing.xl, marginBottom: spacing.md,
      padding: 22, flexDirection: 'row', alignItems: 'center',
      gap: 16, borderRadius: radius.xxl,
    },
    avatar: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: theme.font.extrabold, fontSize: 28, color: '#fff' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    nameText: { ...ty.h2, color: c.text },
    memberText: { ...ty.caption, color: c.text2, marginTop: 3 },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    nameInput: {
      flex: 1, height: 42, borderRadius: radius.md, borderWidth: 1,
      paddingHorizontal: 12, fontFamily: theme.font.bold, fontSize: 16,
    },
    editBtn: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },

    statsCard: { flexDirection: 'row', marginHorizontal: spacing.xl, padding: 18, marginBottom: spacing.md },

    card: { marginHorizontal: spacing.xl, marginBottom: spacing.md, paddingHorizontal: 18, paddingVertical: 16 },
    cardLabel: { ...ty.micro, color: c.text2, marginBottom: 10 },

    themeSeg: { flexDirection: 'row', gap: 3, padding: 4, borderRadius: 13 },
    themeOpt: {
      flex: 1, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10,
    },
    themeOptText: { fontSize: 13 },

    menuRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13 },
    menuIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    menuTitle: { ...ty.bodySemibold, color: c.text },
    menuSub: { ...ty.caption, color: c.text3, marginTop: 1 },

    responsible: { marginHorizontal: spacing.xl, marginBottom: spacing.md, padding: 16, borderRadius: radius.xl, borderWidth: 1 },
    responsibleHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    responsibleTitle: { ...ty.title, color: c.text },
    responsibleText: { ...ty.caption, color: c.text2, lineHeight: 19 },

    danger: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 10, marginHorizontal: spacing.xl, marginBottom: spacing.md,
      padding: 14, borderRadius: radius.md, borderWidth: 1,
    },
    dangerText: { ...ty.title },

    footer: { alignItems: 'center', gap: 5, paddingTop: 18, paddingBottom: 28 },
    footerText: { ...ty.label, color: c.text2, marginTop: 4 },
    footerSub: { ...ty.caption, color: c.text3 },
  });
}