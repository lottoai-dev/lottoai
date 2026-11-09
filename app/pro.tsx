// app/pro.tsx
// LottoAI Pro satın alma ekranı (paywall). Kota kartlarından, Profil'den ve
// İstatistik'teki kilitli sekmelerden açılır.
//
// - Fiyatlar koda yazılmaz: RevenueCat'in "default" offering'inden, mağazanın
//   yerel para birimiyle gelir. İndirim oranı ve aylık karşılık da buradan
//   hesaplanır.
// - Deneme yalnızca kullanıcı hak kazanıyorsa vaat edilir.
// - Apple/Google'ın istediği metinler: otomatik yenileme açıklaması,
//   "Satın alımları geri yükle", Kullanım Şartları ve Gizlilik bağlantıları.
// - Dil: kullanım ve istatistik. Kazanma şansı / tahmin iması YOK.

import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/ui/app-button';
import { Surface } from '../components/ui/surface';
import { AppTheme } from '../constants/theme';
import { useAlert } from '../contexts/AlertContext';
import { useAuth } from '../contexts/AuthContext';
import { usePro } from '../contexts/ProContext';
import { featureDailyLimit } from '../lib/featureQuota';
import { softHaptic } from '../lib/haptics';
import { CheckIcon, CloseIcon, LotaMark } from '../lib/icons';
import {
  getProOffer,
  getProSubscriptionInfo,
  openSubscriptionManagement,
  purchaseProPlan,
  restoreProPurchases,
  type ProOffer,
  type ProPlan,
  type ProSubscriptionInfo,
} from '../lib/purchases';
import { useTheme } from '../lib/theme';

const TERMS_URL = 'https://getlottoai.app/legal#terms';
const PRIVACY_URL = 'https://getlottoai.app/legal';

function formatDateTr(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Yıllık planın aylık ödemeye göre indirimi (%). Hesaplanamazsa null. */
function annualDiscountPct(offer: ProOffer | null): number | null {
  const m = offer?.monthly;
  const a = offer?.annual;
  if (!m || !a || m.price <= 0 || m.currencyCode !== a.currencyCode) return null;
  const pct = Math.round((1 - a.price / (m.price * 12)) * 100);
  return pct > 0 ? pct : null;
}

export default function ProScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const { showAlert } = useAlert();
  const { user } = useAuth();
  const { isPro, refresh } = usePro();

  const [offer, setOffer] = useState<ProOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<ProPlan['kind']>('annual');
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [subInfo, setSubInfo] = useState<ProSubscriptionInfo | null>(null);
  // Başarı mesajı açılır pencereyle değil ekranın içinde gösterilir: mağazanın
  // ödeme penceresi kapanırken açılan iOS Modal'ı görünmeyip dokunuşları
  // kilitleyebiliyor (uygulama donmuş gibi kalıyordu).
  const [success, setSuccess] = useState<'purchased' | 'restored' | null>(null);

  /** Mağaza penceresi tamamen kapandıktan sonra uyarı göster (bkz. yukarı). */
  const alertAfterStoreSheet = useCallback(
    (title: string, message: string) => {
      setTimeout(() => showAlert(title, message), 700);
    },
    [showAlert],
  );

  const loadOffer = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const o = await getProOffer();
      setOffer(o);
      setLoadFailed(!o || (!o.monthly && !o.annual));
      if (o && !o.annual && o.monthly) setSelected('monthly');
    } catch {
      setOffer(null);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOffer();
  }, [loadOffer]);

  useEffect(() => {
    if (isPro) void getProSubscriptionInfo().then(setSubInfo);
  }, [isPro]);

  const plan: ProPlan | null = (selected === 'annual' ? offer?.annual : offer?.monthly) ?? null;
  const discount = annualDiscountPct(offer);
  const trialPlan = plan?.trialAvailable ? plan : null;

  const close = () => {
    softHaptic();
    router.back();
  };

  const handlePurchase = async () => {
    if (!plan || busy) return;
    softHaptic();
    if (!user) {
      router.push('/login' as never);
      return;
    }
    setBusy('purchase');
    try {
      const result = await purchaseProPlan(plan);
      if (result.status === 'cancelled') return;
      if (result.status === 'error') {
        alertAfterStoreSheet('Satın alma tamamlanamadı', 'Ödeme alınmadı. Birazdan tekrar dener misin?');
        return;
      }
      await refresh();
      if (result.isPro) {
        setSuccess('purchased');
      } else {
        alertAfterStoreSheet('Satın alma alındı', 'Pro birkaç saniye içinde aktif olacak.');
      }
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    if (busy) return;
    softHaptic();
    if (!user) {
      router.push('/login' as never);
      return;
    }
    setBusy('restore');
    try {
      const result = await restoreProPurchases();
      if ('error' in result) {
        alertAfterStoreSheet('Geri yüklenemedi', 'Satın alımlar şu an kontrol edilemedi. Birazdan tekrar dener misin?');
        return;
      }
      await refresh();
      if (result.isPro) {
        setSuccess('restored');
      } else {
        alertAfterStoreSheet('Abonelik bulunamadı', 'Bu mağaza hesabında aktif bir LottoAI Pro aboneliği yok.');
      }
    } finally {
      setBusy(null);
    }
  };

  const ctaLabel = !user
    ? 'Giriş yap ve devam et'
    : trialPlan
      ? `${trialPlan.trialDays || 7} gün ücretsiz dene`
      : 'Abone ol';

  const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
  const accountName = Platform.OS === 'ios' ? 'Apple hesabınızdan' : 'Google Play hesabınızdan';

  const benefits = [
    `Sınırsız filtreli kolon (ücretsiz: günde ${featureDailyLimit('filtered_coupon')})`,
    `Sınırsız kolon geçmişi (ücretsiz: günde ${featureDailyLimit('report')})`,
    `Sınırsız Lota kolon (ücretsiz: günde ${featureDailyLimit('lota')})`,
    'Toplam ve Ardışık istatistikleri',
  ];

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <View style={[s.nav, { paddingTop: insets.top + 6 }]}>
        <View style={{ width: 38 }} />
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={close}
          style={[s.navBtn, { backgroundColor: c.surface }]}
          hitSlop={8}
          accessibilityLabel="Kapat"
        >
          <CloseIcon color={c.text2} size={20} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.hero}>
          <View style={[s.heroIcon, { backgroundColor: c.brandSoft }]}>
            <LotaMark color={c.brand} size={30} />
          </View>
          <Text style={s.title}>LottoAI Pro</Text>
          <Text style={s.subtitle}>Sınırsız kullanım, gelişmiş istatistik</Text>
        </View>

        <Surface style={s.benefits}>
          {benefits.map((b) => (
            <View key={b} style={s.benefitRow}>
              <View style={[s.benefitCheck, { backgroundColor: c.brandSoft }]}>
                <CheckIcon color={c.brand} size={14} strokeWidth={2.6} />
              </View>
              <Text style={s.benefitText}>{b}</Text>
            </View>
          ))}
        </Surface>

        {success ? (
          <Surface style={[s.activeCard, { alignItems: 'center' }]}>
            <View style={[s.successIcon, { backgroundColor: c.brandSoft }]}>
              <CheckIcon color={c.brand} size={26} strokeWidth={2.6} />
            </View>
            <Text style={[s.activeTitle, { color: c.brand, textAlign: 'center' }]}>
              {success === 'purchased' ? 'Hoş geldin, Pro aktif!' : 'Aboneliğin geri yüklendi'}
            </Text>
            <Text style={[s.activeText, { textAlign: 'center' }]}>
              {success === 'purchased'
                ? 'Teşekkürler! Artık tüm özellikleri sınırsız kullanabilirsin.'
                : 'LottoAI Pro aboneliğin bu hesapta aktif.'}
            </Text>
            <AppButton label="Devam et" onPress={close} style={{ marginTop: 16, alignSelf: 'stretch' }} />
          </Surface>
        ) : isPro ? (
          <Surface style={s.activeCard}>
            <Text style={[s.activeTitle, { color: c.brand }]}>Pro aktif</Text>
            {subInfo ? (
              <Text style={s.activeText}>
                {subInfo.isTrial ? 'Ücretsiz deneme' : 'Abonelik'}
                {formatDateTr(subInfo.expirationDate)
                  ? subInfo.willRenew
                    ? ` · ${formatDateTr(subInfo.expirationDate)} tarihinde yenilenecek`
                    : ` · ${formatDateTr(subInfo.expirationDate)} tarihine kadar geçerli`
                  : ''}
              </Text>
            ) : (
              <Text style={s.activeText}>Tüm özellikler sınırsız açık.</Text>
            )}
            <AppButton
              label="Aboneliği yönet"
              variant="secondary"
              onPress={() => {
                softHaptic();
                void openSubscriptionManagement(subInfo?.managementURL);
              }}
              style={{ marginTop: 14 }}
            />
          </Surface>
        ) : loading ? (
          <View style={s.center}>
            <ActivityIndicator color={c.brand} />
          </View>
        ) : loadFailed || !offer ? (
          <Surface style={s.activeCard}>
            <Text style={s.activeText}>
              Abonelik seçenekleri şu an yüklenemedi. İnternet bağlantını kontrol edip tekrar dener misin?
            </Text>
            <AppButton label="Tekrar dene" variant="secondary" onPress={() => void loadOffer()} style={{ marginTop: 14 }} />
          </Surface>
        ) : (
          <>
            {offer.annual ? (
              <PlanCard
                plan={offer.annual}
                selected={selected === 'annual'}
                onSelect={() => setSelected('annual')}
                title="Yıllık"
                priceLine={`${offer.annual.priceString} / yıl`}
                detail={
                  offer.annual.pkg.product.pricePerMonthString
                    ? `aylık ~${offer.annual.pkg.product.pricePerMonthString}`
                    : null
                }
                badge={discount ? `%${discount} indirim` : null}
                note={offer.annual.trialAvailable ? `İlk ${offer.annual.trialDays || 7} gün ücretsiz` : null}
                styles={s}
                theme={theme}
              />
            ) : null}
            {offer.monthly ? (
              <PlanCard
                plan={offer.monthly}
                selected={selected === 'monthly'}
                onSelect={() => setSelected('monthly')}
                title="Aylık"
                priceLine={`${offer.monthly.priceString} / ay`}
                detail={null}
                badge={null}
                note={offer.monthly.trialAvailable ? `İlk ${offer.monthly.trialDays || 7} gün ücretsiz` : null}
                styles={s}
                theme={theme}
              />
            ) : null}

            <AppButton
              label={busy === 'purchase' ? 'İşleniyor…' : ctaLabel}
              onPress={handlePurchase}
              disabled={!plan || busy !== null}
              loading={busy === 'purchase'}
              style={{ marginTop: 18 }}
            />

            {trialPlan && user ? (
              <Text style={s.trialNote}>
                {trialPlan.trialDays || 7} günlük deneme bitince{' '}
                {trialPlan.kind === 'annual' ? `${trialPlan.priceString} / yıl` : `${trialPlan.priceString} / ay`}{' '}
                ücretlendirilir. Deneme bitmeden iptal edersen ücret alınmaz.
              </Text>
            ) : null}
          </>
        )}

        <View style={s.links}>
          <Pressable onPress={handleRestore} disabled={busy !== null} hitSlop={6}>
            <Text style={[s.link, { color: c.brand }]}>
              {busy === 'restore' ? 'Kontrol ediliyor…' : 'Satın alımları geri yükle'}
            </Text>
          </Pressable>
          <Text style={s.linkSep}>·</Text>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={6}>
            <Text style={s.link}>Kullanım Şartları</Text>
          </Pressable>
          <Text style={s.linkSep}>·</Text>
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={6}>
            <Text style={s.link}>Gizlilik</Text>
          </Pressable>
        </View>

        <Text style={s.legal}>
          Ödeme, satın alma onaylandığında {accountName} alınır. Abonelik, mevcut dönemin bitiminden en az 24 saat
          önce iptal edilmezse aynı süre ve fiyatla otomatik olarak yenilenir; yenileme ücreti dönem bitmeden önceki
          24 saat içinde alınır. Aboneliği {storeName} hesap ayarlarından yönetebilir veya iptal edebilirsin. Ücretsiz
          deneme varsa, kullanılmayan kısmı abonelik satın alındığında sona erer. LottoAI çekiliş sonuçlarını tahmin
          etmez ve kazanma şansını artırmaz.
        </Text>
      </ScrollView>
    </View>
  );
}

function PlanCard({
  selected,
  onSelect,
  title,
  priceLine,
  detail,
  badge,
  note,
  styles: s,
  theme,
}: {
  plan: ProPlan;
  selected: boolean;
  onSelect: () => void;
  title: string;
  priceLine: string;
  detail: string | null;
  badge: string | null;
  note: string | null;
  styles: ReturnType<typeof makeStyles>;
  theme: AppTheme;
}) {
  const c = theme.colors;
  return (
    <Pressable
      onPress={() => {
        softHaptic();
        onSelect();
      }}
      style={[
        s.plan,
        {
          backgroundColor: selected ? c.brandSoft : c.surface,
          borderColor: selected ? c.brand : c.border,
        },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={[s.radio, { borderColor: selected ? c.brand : c.text3 }]}>
        {selected ? <View style={[s.radioDot, { backgroundColor: c.brand }]} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <View style={s.planHead}>
          <Text style={s.planTitle}>{title}</Text>
          {badge ? (
            <View style={[s.badge, { backgroundColor: c.brand }]}>
              <Text style={s.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={s.planPrice}>
          {priceLine}
          {detail ? <Text style={s.planDetail}>{`  (${detail})`}</Text> : null}
        </Text>
        {note ? <Text style={[s.planNote, { color: c.brand }]}>{note}</Text> : null}
      </View>
    </Pressable>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { radius, typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 6 },
    navBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    hero: { alignItems: 'center', marginTop: 4, marginBottom: 20 },
    heroIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    title: { ...ty.h1, color: c.text },
    subtitle: { ...ty.bodyMedium, color: c.text2, marginTop: 4, textAlign: 'center' },
    benefits: { padding: 16, gap: 12, marginBottom: 18 },
    benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    benefitCheck: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    benefitText: { ...ty.bodyMedium, color: c.text, flex: 1 },
    plan: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 16,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      marginBottom: 10,
    },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    radioDot: { width: 11, height: 11, borderRadius: 6 },
    planHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    planTitle: { ...ty.h3, color: c.text },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
    badgeText: { ...ty.micro, color: '#fff', letterSpacing: 0.2 },
    planPrice: { ...ty.bodySemibold, color: c.text, marginTop: 4, fontVariant: ['tabular-nums'] },
    planDetail: { ...ty.caption, color: c.text3 },
    planNote: { ...ty.caption, fontFamily: theme.font.semibold, marginTop: 3 },
    trialNote: { ...ty.caption, color: c.text2, textAlign: 'center', marginTop: 10 },
    activeCard: { padding: 18, marginBottom: 6 },
    successIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    activeTitle: { ...ty.h2 },
    activeText: { ...ty.body, color: c.text2, marginTop: 4 },
    center: { paddingVertical: 32, alignItems: 'center' },
    links: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 22 },
    link: { ...ty.caption, color: c.text2, fontFamily: theme.font.semibold },
    linkSep: { ...ty.caption, color: c.text3 },
    legal: { ...ty.caption, color: c.text3, textAlign: 'center', marginTop: 14, lineHeight: 17 },
  });
}
