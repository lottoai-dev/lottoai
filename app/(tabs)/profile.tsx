// app/(tabs)/profile.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale, Surface } from '../../components/ui/surface';
import { STORAGE_KEYS } from '../../constants/storage-keys';
import { AppTheme } from '../../constants/theme';
import { useAlert } from '../../contexts/AlertContext';
import { useAuth } from '../../contexts/AuthContext';
import { useBildirim } from '../../contexts/BildirimContext';
import { deleteAccount } from '../../lib/delete-account';
import { BrandMark } from '../../lib/emblems';
import {
    BellIcon,
    CheckIcon,
    ChevronRightIcon,
    CloseIcon,
    DocIcon,
    EditIcon,
    InfoIcon,
    LogOutIcon,
    MailIcon,
    SearchIcon,
    ShieldIcon,
    StatsIcon,
    TicketIcon,
    TrashIcon,
    TrophyIcon,
} from '../../lib/icons';
import { useTheme } from '../../lib/theme';

function softHaptic() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

const LEGAL_URL = 'https://getlottoai.app/legal';
const PRIVACY_URL = `${LEGAL_URL}`;
const TERMS_URL = `${LEGAL_URL}#terms`;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const { showAlert } = useAlert();
  const { user, signOut } = useAuth();
  const { clearAll: clearBildirimler } = useBildirim();

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
    softHaptic();
    if (tempName.trim() === '') {
      showAlert('Uyarı', 'İsim boş olamaz.');
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEYS.USER_NAME, tempName.trim());
    setName(tempName.trim());
    setEditing(false);
  };

  const handleDeleteAccount = () => {
    showAlert(
      'Hesabımı sil',
      'Hesabın ve bu cihazdaki tüm verilerin (kayıtlı kolonlar, Lota geçmişi, tercihler) kalıcı olarak silinecek. Bu işlem geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Hesabı sil',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteAccount();
            if (!result.ok) {
              showAlert('Hata', result.message);
              return;
            }
            clearBildirimler();
            setTotalCoupons(0);
            setBestResult(0);
            setName('');
            setNotificationsEnabled(false);
            setEditing(false);
            showAlert('Hesap silindi', 'Hesabın ve verilerin silindi.', [
              { text: 'Tamam', onPress: () => router.replace('/onboarding') },
            ]);
          },
        },
      ],
    );
  };

  const handleSignOut = () => {
    showAlert('Çıkış yap', 'Hesabından çıkmak istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: async () => {
          await signOut();
        },
      },
    ]);
  };

  const MenuRow = ({ Icon, color, title, sub, onPress, last }: {
    Icon: (p: any) => React.ReactNode;
    color: string;
    title: string;
    sub: string;
    onPress?: () => void;
    last?: boolean;
  }) => (
    <PressableScale
      haptic={false}
      onPress={() => { softHaptic(); onPress?.(); }}
      style={[s.menuRow, ...(!last ? [{ borderBottomWidth: 1, borderBottomColor: c.hairline }] : [])]}
    >
      <View style={[s.menuIcon, { backgroundColor: `${color}14` }]}>
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
          <View style={s.eyebrowRow}>
            <View style={[s.eyebrowDot, { backgroundColor: c.brand }]} />
            <Text style={[s.eyebrow, { color: c.brand }]}>HESAP</Text>
          </View>
          <Text style={s.title}>Profil</Text>
        </View>

        {!user && (
          <Pressable
            onPress={() => { softHaptic(); router.push('/login' as any); }}
            style={[s.loginBanner, { backgroundColor: c.brandSoft }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[s.loginBannerTitle, { color: c.brand }]}>Hesabına giriş yap</Text>
              <Text style={[s.loginBannerSub, { color: c.text2 }]}>Kolonlarını kaydet ve Lota AI&apos;ı kullan</Text>
            </View>
            <ChevronRightIcon color={c.brand} size={20} />
          </Pressable>
        )}

        <Surface style={s.avatarCard}>
          <View style={[s.panelAccent, { backgroundColor: c.brand }]} />
          <View style={[s.avatar, { backgroundColor: c.brandSoft }]}>
            <Text style={[s.avatarText, { color: c.brand }]}>{name ? name.charAt(0).toUpperCase() : 'L'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            {editing ? (
              <View style={s.editRow}>
                <TextInput
                  style={[s.nameInput, { backgroundColor: c.surfaceAlt, color: c.text }]}
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
            {!editing && (
              <Text style={s.memberText}>
                {user ? user.email : 'LottoAI kullanıcısı'}
              </Text>
            )}
          </View>
        </Surface>

        <View style={s.statsRow}>
          <Surface style={s.statCard}>
            <View style={[s.statIcon, { backgroundColor: c.brandSoft }]}>
              <TicketIcon color={c.brand} size={19} />
            </View>
            <Text style={s.statValue}>{totalCoupons}</Text>
            <Text style={s.statLabel}>Kolon</Text>
          </Surface>
          <Surface style={s.statCard}>
            <View style={[s.statIcon, { backgroundColor: c.surfaceAlt }]}>
              <TrophyIcon color={c.text2} size={19} />
            </View>
            <Text style={s.statValue}>{bestResult}</Text>
            <Text style={s.statLabel}>En çok tutan</Text>
          </Surface>
        </View>

        <Surface style={s.card}>
          <View style={[s.panelAccent, { backgroundColor: c.brand }]} />
          <Text style={s.cardLabel}>ARAÇLAR</Text>
          <MenuRow
            Icon={BellIcon}
            color={c.brand}
            title="Hatırlatıcılar"
            sub={notificationsEnabled ? 'Açık' : 'Çekiliş hatırlatma ve sonuç bildirimi'}
            onPress={() => router.push('/notifications')}
          />
          <MenuRow
            Icon={StatsIcon}
            color={c.brand}
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

        <Surface style={s.responsible}>
          <View style={[s.panelAccent, { backgroundColor: c.brand }]} />
          <View style={s.responsibleHead}>
            <View style={[s.responsibleIcon, { backgroundColor: c.brandSoft }]}>
              <ShieldIcon color={c.brand} size={20} />
            </View>
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
        </Surface>

        <Surface style={s.card}>
          <View style={[s.panelAccent, { backgroundColor: c.brand }]} />
          <Text style={s.cardLabel}>HAKKINDA</Text>
          <MenuRow Icon={ShieldIcon} color={c.text2} title="Gizlilik politikası" sub="Kişisel verilerin" onPress={() => Linking.openURL(PRIVACY_URL)} />
          <MenuRow Icon={DocIcon} color={c.text2} title="Kullanım koşulları" sub="Uygulama kuralları" onPress={() => Linking.openURL(TERMS_URL)} />
          <MenuRow Icon={InfoIcon} color={c.text2} title="Sık sorulan sorular" sub="Uygulama hakkında" onPress={() => router.push('/legal')} />
          <MenuRow Icon={MailIcon} color={c.text2} title="Bize ulaş" sub="support@getlottoai.app" onPress={() => Linking.openURL('mailto:support@getlottoai.app')} />
          <MenuRow Icon={InfoIcon} color={c.text3} title="Versiyon" sub="1.0.0" last />
        </Surface>

        {user && (
          <>
            <PressableScale
              haptic={false}
              onPress={() => { softHaptic(); handleSignOut(); }}
              style={[s.danger, { backgroundColor: c.dangerSoft }]}
            >
              <LogOutIcon color={c.danger} size={20} />
              <Text style={[s.dangerText, { color: c.danger }]}>Çıkış Yap</Text>
            </PressableScale>

            <PressableScale
              haptic={false}
              onPress={() => { softHaptic(); handleDeleteAccount(); }}
              style={[s.danger, { backgroundColor: c.dangerSoft }]}
            >
              <TrashIcon color={c.danger} size={20} />
              <Text style={[s.dangerText, { color: c.danger }]}>Hesabımı sil</Text>
            </PressableScale>
          </>
        )}

        <View style={s.footer}>
          <BrandMark size={38} />
          <Text style={s.footerText}>LottoAI · v1.0.0</Text>
          <Text style={s.footerSub}>18+ · Şans oyunları asistanı</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: spacing.xl, paddingTop: 4, paddingBottom: 14 },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
    eyebrowDot: { width: 7, height: 7, borderRadius: 4 },
    eyebrow: { ...ty.micro, fontFamily: theme.font.extrabold, letterSpacing: 1 },
    title: { ...ty.h1, color: c.text },

    loginBanner: {
      flexDirection: 'row', alignItems: 'center',
      marginHorizontal: spacing.xl, marginBottom: spacing.md,
      padding: 16, borderRadius: radius.xl,
    },
    loginBannerTitle: { ...ty.bodySemibold },
    loginBannerSub: { ...ty.caption, marginTop: 2 },

    avatarCard: {
      marginHorizontal: spacing.xl,
      marginBottom: spacing.md,
      padding: 22,
      paddingLeft: 26,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      borderRadius: radius.xxl,
      overflow: 'hidden',
    },
    panelAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    avatar: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: theme.font.bold, fontSize: 28 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    nameText: { ...ty.h2, color: c.text },
    memberText: { ...ty.caption, color: c.text3, marginTop: 3 },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    nameInput: {
      flex: 1, height: 42, borderRadius: radius.lg,
      paddingHorizontal: 12, fontFamily: theme.font.semibold, fontSize: 16,
    },
    editBtn: { width: 42, height: 42, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },

    statsRow: { flexDirection: 'row', gap: 12, marginHorizontal: spacing.xl, marginBottom: spacing.md },
    statCard: { flex: 1, padding: 14, borderRadius: radius.xl },
    statIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    statValue: { fontFamily: theme.font.bold, fontSize: 20, lineHeight: 25, letterSpacing: -0.3, color: c.text, fontVariant: ['tabular-nums'] },
    statLabel: { ...ty.caption, color: c.text3, marginTop: 2 },

    card: { marginHorizontal: spacing.xl, marginBottom: spacing.md, paddingHorizontal: 22, paddingVertical: 16, overflow: 'hidden' },
    cardLabel: { ...ty.micro, color: c.text3, marginBottom: 10 },

    menuRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13 },
    menuIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    menuTitle: { ...ty.bodySemibold, color: c.text },
    menuSub: { ...ty.caption, color: c.text3, marginTop: 1 },

    responsible: { marginHorizontal: spacing.xl, marginBottom: spacing.md, padding: 16, paddingLeft: 20, borderRadius: radius.xl, overflow: 'hidden' },
    responsibleHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    responsibleIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    responsibleTitle: { ...ty.title, color: c.text },
    responsibleText: { ...ty.caption, color: c.text2, lineHeight: 19 },

    danger: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 10, marginHorizontal: spacing.xl, marginBottom: spacing.md,
      padding: 14, borderRadius: radius.pill,
    },
    dangerText: { ...ty.title },

    footer: { alignItems: 'center', gap: 5, paddingTop: 18, paddingBottom: 28 },
    footerText: { ...ty.label, color: c.text2, marginTop: 4 },
    footerSub: { ...ty.caption, color: c.text3 },
  });
}