// app/(tabs)/saved.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../../components/ui/app-button';
import { NumberBall } from '../../components/ui/number-ball';
import { Segmented } from '../../components/ui/segmented';
import { EmptyState, LoadingState } from '../../components/ui/states';
import { PressableScale, Surface } from '../../components/ui/surface';
import { STORAGE_KEYS } from '../../constants/storage-keys';
import { AppTheme } from '../../constants/theme';
import { useAlert } from '../../contexts/AlertContext';
import { useAuth } from '../../contexts/AuthContext';
import { showRewardedAd } from '../../lib/adMob';
import CouponHistory from '../../lib/CouponHistory';
import {
    formatMatchCategory,
    getCouponRank,
    getMatchDisplay,
    matchCouponToDraw,
    toMatchDisplayInput,
    type DrawSnapshot,
} from '../../lib/couponMatch';
import { consumeCouponsDirty } from '../../lib/couponsStore';
import {
    ADS_REWARDS_ENABLED,
    FEATURE_FREE_DAILY_LIMIT,
    FEATURE_REWARD_AMOUNT,
    formatQuotaResetIn,
    getFeatureQuotaStatus,
    msUntilQuotaReset,
    recordFeatureUsage,
    waitForRewardGrant,
    todayInTurkey,
} from '../../lib/featureQuota';
import { GameEmblem } from '../../lib/emblems';
import { getGameAccentColor, getGameByName } from '../../lib/games';
import { CloseIcon, PlayIcon, ShareIcon, StatsIcon, TicketIcon, TrashIcon, TrophyIcon } from '../../lib/icons';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';

function softHaptic() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

type ViewedHistoryToday = { date: string; couponIds: number[] };

function viewedHistoryStorageKey(userId: string) {
  return `${STORAGE_KEYS.VIEWED_HISTORY_TODAY}:${userId}`;
}

async function getViewedHistoryToday(userId: string): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(viewedHistoryStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ViewedHistoryToday;
    if (parsed?.date !== todayInTurkey() || !Array.isArray(parsed.couponIds)) return [];
    return parsed.couponIds.filter((id) => typeof id === 'number');
  } catch {
    return [];
  }
}

async function markHistoryViewedToday(userId: string, couponId: number): Promise<void> {
  try {
    const day = todayInTurkey();
    const existing = await getViewedHistoryToday(userId);
    if (existing.includes(couponId)) return;
    const payload: ViewedHistoryToday = { date: day, couponIds: [...existing, couponId] };
    await AsyncStorage.setItem(viewedHistoryStorageKey(userId), JSON.stringify(payload));
  } catch {
    // Yerel cache başarısız olsa bile kota/UX bozulmasın
  }
}

type Coupon = {
  id: number;
  game: string;
  icon: string;
  color: string;
  numbers: number[];
  bonus: number[];
  superStar?: number | null;
  date: string;
  timestamp?: string;
  matchedCount?: number;
  matchedNumbers?: number[];
  matchedBonus?: number[];
  matchedJoker?: boolean;
  jokerHitNumber?: number | null;
  matchedSuperStar?: boolean;
};

type DrawResult = { numbers: string; bonus: string; superstar?: number | null; draw_date: string; draw_no: string };
type CheckResult = {
  draw: DrawResult;
  matchedNumbers: number[];
  matchedBonus: number[];
  matchedJoker: boolean;
  jokerHitNumber: number | null;
  matchedSuperStar: boolean;
  mainMatchCount: number;
  score: number;
};
type FilterStatus = 'all' | 'pending' | 'checked';

type TicketStyles = ReturnType<typeof makeStyles>;

function matchesFilter(coupon: Coupon, filter: FilterStatus): boolean {
  if (filter === 'all') return true;
  const isPending = coupon.matchedCount === undefined || coupon.matchedCount === null;
  return filter === 'pending' ? isPending : !isPending;
}

function getScoreLabel(
  coupon: Pick<
    Coupon,
    'game' | 'matchedCount' | 'matchedNumbers' | 'matchedJoker' | 'matchedSuperStar' | 'matchedBonus' | 'superStar'
  >,
  colors: AppTheme['colors'],
) {
  const display = getMatchDisplay(toMatchDisplayInput(coupon));
  const color =
    display.tier === 'jackpot'
      ? colors.gold
      : display.tier === 'winner'
        ? colors.brand
        : colors.text3;
  return { label: display.label, sub: display.sub, color };
}

function isPendingCoupon(cp: Coupon) {
  return cp.matchedCount === undefined || cp.matchedCount === null;
}

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const scrollRef = useRef<ScrollView>(null);
  const { showAlert } = useAlert();
  const { user } = useAuth();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [checkModal, setCheckModal] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState<Coupon | null>(null);
  const [checking, setChecking] = useState(false);
  const [historyModalCoupon, setHistoryModalCoupon] = useState<Coupon | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [isLoading, setIsLoading] = useState(true);
  // "Geçmiş" (rapor) görüntüleme günlük ücretsiz hakkı doldurduğunda bu
  // kart açılır. pendingHistoryId, reklam izlenip ödül kazanıldığında
  // hangi kuponun geçmişinin otomatik açılacağını tutar.
  const [reportQuotaVisible, setReportQuotaVisible] = useState(false);
  const [pendingHistoryId, setPendingHistoryId] = useState<number | null>(null);
  const [watchingAd, setWatchingAd] = useState(false);
  const [checkingQuota, setCheckingQuota] = useState<number | null>(null);

  const couponsRef = useRef(coupons);
  couponsRef.current = coupons;
  const hasLoadedRef = useRef(false);
  const autoCheckInFlightRef = useRef(false);
  const autoCheckRef = useRef<(showNotification?: boolean) => Promise<void>>(async () => {});

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        router.replace('/login' as any);
      }
    }, [router, user]),
  );

  const loadCoupons = useCallback(async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS);
      const parsed: Coupon[] = data ? JSON.parse(data) : [];
      setCoupons(parsed);
      couponsRef.current = parsed;
      hasLoadedRef.current = true;
      return parsed;
    } catch {
      setCoupons([]);
      couponsRef.current = [];
      hasLoadedRef.current = true;
      return [] as Coupon[];
    }
  }, []);

  const autoCheckAllPending = useCallback(async (showNotification = false) => {
    if (autoCheckInFlightRef.current) return;
    autoCheckInFlightRef.current = true;

    try {
      let allCoupons = couponsRef.current;
      if (!hasLoadedRef.current) {
        const saved = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS);
        if (!saved) return;
        allCoupons = JSON.parse(saved);
        couponsRef.current = allCoupons;
      }

      const pending = allCoupons.filter(isPendingCoupon);
      if (pending.length === 0) return;

      setCoupons(allCoupons);

      let oldestDateStr = '';
      for (const coupon of pending) {
        if (!coupon.date) continue;
        if (!oldestDateStr || coupon.date < oldestDateStr) {
          oldestDateStr = coupon.date;
        }
      }

      let newlyCheckedCount = 0;
      let bestNewRank = 0;
      let bestNewLabel = '';
      const patches = new Map<
        number,
        Pick<
          Coupon,
          | 'matchedCount'
          | 'matchedNumbers'
          | 'matchedBonus'
          | 'matchedJoker'
          | 'jokerHitNumber'
          | 'matchedSuperStar'
        >
      >();

      try {
        if (oldestDateStr) {
          const [d, m, y] = oldestDateStr.split('.').map(Number);
          const oldestIso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

          const gameNames = [...new Set(pending.map((cp) => cp.game))];
          const { data: allDraws } = await supabase
            .from('draws')
            .select('game, numbers, bonus, superstar, draw_date, draw_no, draw_date_parsed')
            .in('game', gameNames)
            .gte('draw_date_parsed', oldestIso)
            .order('draw_date_parsed', { ascending: true });

          if (allDraws && allDraws.length > 0) {
            const drawsByGame = new Map<string, typeof allDraws>();
            for (const draw of allDraws) {
              const list = drawsByGame.get(draw.game);
              if (list) list.push(draw);
              else drawsByGame.set(draw.game, [draw]);
            }

            for (const coupon of pending) {
              const relevantDraws = drawsByGame.get(coupon.game);
              if (!relevantDraws || relevantDraws.length === 0) continue;

              const couponIso = coupon.timestamp ? coupon.timestamp.split('T')[0] : oldestIso;

              const firstDrawAfter = relevantDraws.find((draw) => {
                const drawIso = draw.draw_date_parsed ? draw.draw_date_parsed.substring(0, 10) : '';
                return drawIso >= couponIso;
              });

              if (!firstDrawAfter) continue;

              const draw: DrawSnapshot = {
                numbers: firstDrawAfter.numbers,
                bonus: firstDrawAfter.bonus ?? '-',
                superstar: firstDrawAfter.superstar,
                draw_date: firstDrawAfter.draw_date,
                draw_no: firstDrawAfter.draw_no,
              };
              const match = matchCouponToDraw(
                {
                  game: coupon.game,
                  numbers: coupon.numbers,
                  bonus: coupon.bonus,
                  superStar: coupon.superStar,
                },
                draw,
              );

              patches.set(coupon.id, {
                matchedCount: match.mainMatchCount,
                matchedNumbers: match.matchedNumbers,
                matchedBonus: match.matchedBonus,
                matchedJoker: match.matchedJoker,
                jokerHitNumber: match.jokerHitNumber,
                matchedSuperStar: match.matchedSuperStar,
              });
              newlyCheckedCount++;
              if (match.rank > bestNewRank) {
                bestNewRank = match.rank;
                bestNewLabel = getMatchDisplay({
                  game: coupon.game,
                  mainMatchCount: match.mainMatchCount,
                  matchedJoker: match.matchedJoker,
                  matchedSuperStar: match.matchedSuperStar,
                  matchedBonusCount: match.matchedBonus.length,
                  playedSuperStar: coupon.superStar != null,
                }).label;
              }
            }
          }
        }
      } catch {
        /* ignore draw fetch / match errors */
      }

      if (patches.size === 0) return;

      const updated = allCoupons.map((cp) => {
        const patch = patches.get(cp.id);
        return patch ? { ...cp, ...patch } : cp;
      });

      couponsRef.current = updated;
      setCoupons(updated);
      await AsyncStorage.setItem(STORAGE_KEYS.SAVED_COUPONS, JSON.stringify(updated));

      if (showNotification && newlyCheckedCount > 0) {
        const gameList = [...new Set(pending.map((cp) => cp.game))].join(', ');
        const body = `${newlyCheckedCount} kuponun kontrol edildi${bestNewRank > 0 ? `, en iyi: ${bestNewLabel}` : ''}.`;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Çekiliş Sonuçları Açıklandı!',
            body: `Yeni sonuçlar: ${gameList}\n${body}`,
            data: { screen: 'saved' },
            sound: true,
          },
          trigger: null,
        });
      }
    } finally {
      autoCheckInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    autoCheckRef.current = autoCheckAllPending;
  }, [autoCheckAllPending]);

  useEffect(() => {
    const channel = supabase
      .channel('draws-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'draws' }, () => {
        autoCheckRef.current(true);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;

      const needsReload = !hasLoadedRef.current || consumeCouponsDirty();

      if (needsReload) {
        const showSpinner = !hasLoadedRef.current;
        if (showSpinner) setIsLoading(true);
        loadCoupons().then((loaded) => {
          setIsLoading(false);
          if (loaded.some(isPendingCoupon)) {
            autoCheckAllPending(false);
          }
        });
        return;
      }

      if (couponsRef.current.some(isPendingCoupon)) {
        autoCheckAllPending(false);
      }
    }, [autoCheckAllPending, loadCoupons, user]),
  );

  const handleFilterChange = useCallback((key: string) => {
    const next = key as FilterStatus;
    setFilterStatus((prev) => (prev === next ? prev : next));
  }, []);

  // Keep every ticket mounted; filter only toggles visibility (no remount = instant switch).
  const visibleIdSet = useMemo(() => {
    const ids = new Set<number>();
    for (const cp of coupons) {
      if (matchesFilter(cp, filterStatus)) ids.add(cp.id);
    }
    return ids;
  }, [coupons, filterStatus]);

  const totalCoupons = visibleIdSet.size;

  const ticketNumberById = useMemo(() => {
    const map = new Map<number, number>();
    let i = 0;
    for (const cp of coupons) {
      if (!visibleIdSet.has(cp.id)) continue;
      map.set(cp.id, totalCoupons - i);
      i++;
    }
    return map;
  }, [coupons, totalCoupons, visibleIdSet]);
  const bestResultCoupon = useMemo(() => {
    let best: Coupon | null = null;
    let bestRank = -1;
    for (const cp of coupons) {
      if (isPendingCoupon(cp)) continue;
      const rank = getCouponRank(cp);
      if (rank > bestRank) {
        bestRank = rank;
        best = cp;
      }
    }
    return best;
  }, [coupons]);

  const bestResultLabel = bestResultCoupon
    ? formatMatchCategory(toMatchDisplayInput(bestResultCoupon))
    : '—';

  const pendingCount = useMemo(() => coupons.filter(isPendingCoupon).length, [coupons]);
  const checkedCount = coupons.length - pendingCount;

  const filterOptions = useMemo(
    () => [
      { key: 'all', label: `Tümü (${coupons.length})` },
      { key: 'pending', label: `Bekleyen (${pendingCount})` },
      { key: 'checked', label: `Kontrol (${checkedCount})` },
    ],
    [coupons.length, pendingCount, checkedCount],
  );

  const persistCoupons = useCallback(async (updated: Coupon[]) => {
    couponsRef.current = updated;
    setCoupons(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.SAVED_COUPONS, JSON.stringify(updated));
  }, []);

  const handleDelete = useCallback(
    (id: number) => {
      showAlert('Kuponu sil', 'Bu kupon kalıcı olarak silinecek.', [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const updated = couponsRef.current.filter((cp) => cp.id !== id);
            await persistCoupons(updated);
          },
        },
      ]);
    },
    [persistCoupons, showAlert],
  );

  const handleDeleteAll = useCallback(() => {
    softHaptic();
    showAlert('Tümünü sil', 'Tüm kayıtlı kuponlar silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          couponsRef.current = [];
          setCoupons([]);
          await AsyncStorage.removeItem(STORAGE_KEYS.SAVED_COUPONS);
        },
      },
    ]);
  }, [showAlert]);

  const handleShare = useCallback(
    async (id: number) => {
      const coupon = couponsRef.current.find((cp) => cp.id === id);
      if (!coupon) return;
      softHaptic();
      try {
        const numbersText = coupon.numbers.join(' · ');
        const bonusText =
          coupon.bonus && coupon.bonus.length > 0 ? `\n🔵 Şans Topu: ${coupon.bonus.join(' · ')}` : '';
        const superStarText = coupon.superStar ? `\n⭐ SüperStar: ${coupon.superStar}` : '';
        const matchText =
          coupon.matchedCount !== undefined && coupon.matchedCount !== null
            ? `\n🎯 Sonuç: ${getMatchDisplay(toMatchDisplayInput(coupon)).label}`
            : '';
        const message =
          `🍀 LottoAI Kuponu\n` +
          `━━━━━━━━━━━━━━━\n` +
          `🎮 ${coupon.game}\n` +
          `📅 ${coupon.date}\n` +
          `━━━━━━━━━━━━━━━\n` +
          `🔢 ${numbersText}${bonusText}${superStarText}${matchText}\n` +
          `━━━━━━━━━━━━━━━\n` +
          `LottoAI ile üretildi`;
        await Share.share({ message });
      } catch {
        showAlert('Hata', 'Paylaşım yapılamadı.');
      }
    },
    [showAlert],
  );

  const openCheckResult = useCallback((id: number) => {
    const coupon = couponsRef.current.find((cp) => cp.id === id);
    if (!coupon || isPendingCoupon(coupon)) return;
    softHaptic();
    const mainMatchCount = coupon.matchedNumbers?.length ?? coupon.matchedCount ?? 0;

    setCheckingCoupon(coupon);
    setCheckResult({
      draw: { numbers: '', bonus: '', superstar: null, draw_date: coupon.date, draw_no: '' },
      matchedNumbers: coupon.matchedNumbers ?? [],
      matchedBonus: coupon.matchedBonus ?? [],
      matchedJoker: !!coupon.matchedJoker,
      jokerHitNumber: coupon.jokerHitNumber ?? null,
      matchedSuperStar: !!coupon.matchedSuperStar,
      mainMatchCount,
      score: getCouponRank(coupon),
    });
    setChecking(false);
    setCheckModal(true);
  }, []);

  /**
   * "Geçmiş" butonuna basıldığında çağrılır. Önce günlük ücretsiz hak
   * kontrol edilir — hak varsa geçmiş direkt açılır, yoksa reklam kartı
   * gösterilir. pendingHistoryId, reklam izlenip ödül kazanılınca hangi
   * kuponun geçmişinin açılacağını hatırlamak için tutulur.
   */
  const openHistory = useCallback(async (id: number) => {
    const coupon = couponsRef.current.find((cp) => cp.id === id);
    if (!coupon) return;
    softHaptic();

    if (!user) {
      router.push('/login' as any);
      return;
    }

    // Aynı kupon aynı gün içinde daha önce açıldıysa kotadan düşme.
    const viewedIds = await getViewedHistoryToday(user.id);
    if (viewedIds.includes(id)) {
      setHistoryModalCoupon(coupon);
      return;
    }

    setCheckingQuota(id);
    const status = await getFeatureQuotaStatus('report');
    setCheckingQuota(null);

    if (status.exhausted) {
      setPendingHistoryId(id);
      setReportQuotaVisible(true);
      return;
    }

    void recordFeatureUsage('report');
    void markHistoryViewedToday(user.id, id);
    setHistoryModalCoupon(coupon);
  }, [router, user]);

  /**
   * Rapor kotası kartındaki "Reklam izle" butonuna basıldığında çağrılır.
   * Hak, Google'ın sunucumuza yaptığı SSV çağrısıyla eklenir; burada o
   * çağrının kotaya yansımasını bekleriz. Yansıyınca bekleyen kuponun
   * geçmişi otomatik açılır.
   */
  const handleWatchAd = useCallback(async () => {
    if (!user) return;
    softHaptic();
    setWatchingAd(true);
    try {
      const before = await getFeatureQuotaStatus('report');
      const result = await showRewardedAd('report', { userId: user.id });
      if (result.status === 'earned') {
        const granted = await waitForRewardGrant('report', before.used);
        if (!granted) {
          showAlert(
            'Ödülün yolda',
            'Reklamı izledin ama hakkın henüz yansımadı. Birkaç saniye içinde eklenecek, sonra tekrar dener misin?',
          );
          return;
        }
        setReportQuotaVisible(false);
        const couponId = pendingHistoryId;
        const coupon = couponId != null ? couponsRef.current.find((cp) => cp.id === couponId) : null;
        setPendingHistoryId(null);
        if (coupon && user) {
          void recordFeatureUsage('report');
          void markHistoryViewedToday(user.id, coupon.id);
          setHistoryModalCoupon(coupon);
        } else if (coupon) {
          setHistoryModalCoupon(coupon);
        }
      } else if (result.status === 'closed_without_reward') {
        showAlert('Tamamlanmadı', 'Ödül kazanmak için reklamı sonuna kadar izlemen gerekiyor.');
      } else {
        showAlert('Reklam yüklenemedi', 'Şu an reklam gösterilemiyor, birazdan tekrar dener misin?');
      }
    } finally {
      setWatchingAd(false);
    }
  }, [pendingHistoryId, showAlert, user]);

  const handleCancelReportQuota = useCallback(() => {
    softHaptic();
    setReportQuotaVisible(false);
    setPendingHistoryId(null);
  }, []);

  const goGenerate = useCallback(() => {
    router.push('/(tabs)/generate');
  }, [router]);

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 90 }}
      >
        <SavedHeader styles={s} brand={c.brand} />

        {isLoading ? (
          <LoadingState label="Kuponların yükleniyor…" />
        ) : coupons.length === 0 ? (
          <View style={{ paddingTop: 40 }}>
            <EmptyState
              icon={<TicketIcon color={c.brand} size={30} />}
              title="Henüz kuponun yok"
              desc="Kupon üret ekranında sayılarını seç ve kaydet. Sonuçlar açıklanınca otomatik kontrol edip burada gösterelim."
              action="İlk kuponunu üret"
              onAction={goGenerate}
            />
          </View>
        ) : (
          <>
            <View style={s.statsRow}>
              <Surface style={s.statCard}>
                <View style={[s.statIcon, { backgroundColor: c.brandSoft }]}>
                  <TicketIcon color={c.brand} size={19} />
                </View>
                <Text style={s.statValue}>{coupons.length}</Text>
                <Text style={s.statLabel}>Toplam kupon</Text>
              </Surface>
              <Surface style={s.statCard}>
                <View style={[s.statIcon, { backgroundColor: c.surfaceAlt }]}>
                  <TrophyIcon color={c.text2} size={19} />
                </View>
                <Text style={s.statValue}>{bestResultLabel}</Text>
                <Text style={s.statLabel}>En iyi sonuç</Text>
              </Surface>
            </View>

            <Segmented options={filterOptions} value={filterStatus} onChange={handleFilterChange} />

            <View style={s.topRow}>
              <Text style={s.sectionTitle}>{totalCoupons} kupon</Text>
              <Pressable onPress={handleDeleteAll} hitSlop={8}>
                <Text style={[s.deleteAll, { color: c.danger }]}>Tümünü sil</Text>
              </Pressable>
            </View>

            {totalCoupons === 0 ? (
              <EmptyState
                icon={<TicketIcon color={c.brand} size={30} />}
                title={
                  filterStatus === 'pending'
                    ? 'Bekleyen kupon yok'
                    : filterStatus === 'checked'
                      ? 'Kontrol edilmiş kupon yok'
                      : 'Kupon bulunamadı'
                }
                desc={filterStatus === 'pending' ? 'Tüm kuponların kontrol edildi.' : 'Bu filtreye uygun kupon yok.'}
              />
            ) : null}

            {coupons.map((coupon) => {
              const visible = visibleIdSet.has(coupon.id);
              return (
                <View key={coupon.id} style={visible ? undefined : s.ticketHidden} removeClippedSubviews={false}>
                  <CouponTicket
                    coupon={coupon}
                    number={ticketNumberById.get(coupon.id) ?? 0}
                    styles={s}
                    theme={theme}
                    onShare={handleShare}
                    onDelete={handleDelete}
                    onOpenResult={openCheckResult}
                    onOpenHistory={openHistory}
                    historyLoading={checkingQuota === coupon.id}
                  />
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <Modal visible={checkModal} transparent animationType="none" onRequestClose={() => setCheckModal(false)}>
        <View style={[s.overlay, { backgroundColor: c.overlay }]}>
          <View style={[s.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={s.grabber} />
            {checking ? (
              <LoadingState label="Kontrol ediliyor…" />
            ) : checkResult && checkingCoupon ? (
              <CheckResultBody
                checkingCoupon={checkingCoupon}
                checkResult={checkResult}
                styles={s}
                colors={c}
                onClose={() => {
                  softHaptic();
                  setCheckModal(false);
                }}
              />
            ) : null}
          </View>
        </View>
      </Modal>

      {historyModalCoupon && (
        <CouponHistory
          game={historyModalCoupon.game}
          numbers={historyModalCoupon.numbers}
          bonus={historyModalCoupon.bonus}
          superStar={historyModalCoupon.superStar ?? undefined}
          visible={!!historyModalCoupon}
          onClose={() => setHistoryModalCoupon(null)}
        />
      )}

      <Modal visible={reportQuotaVisible} transparent animationType="fade" onRequestClose={handleCancelReportQuota}>
        <View style={[s.overlay, { backgroundColor: c.overlay }]}>
          <View style={[s.quotaCard, { backgroundColor: c.surface, marginBottom: insets.bottom + 24 }]}>
            <View style={[s.quotaIcon, { backgroundColor: c.brandSoft }]}>
              <StatsIcon color={c.brand} size={26} />
            </View>
            <Text style={s.quotaTitle}>Geçmiş görüntüleme hakkın bitti</Text>
            {ADS_REWARDS_ENABLED ? (
              <>
                <Text style={s.quotaDesc}>
                  Bugün için {FEATURE_FREE_DAILY_LIMIT} kupon geçmişi görüntüleme hakkını kullandın. Kısa bir reklam izleyip {FEATURE_REWARD_AMOUNT} hak daha kazanabilirsin.
                </Text>
                <AppButton
                  haptic={false}
                  label={watchingAd ? 'Reklam yükleniyor…' : `Reklam izle, +${FEATURE_REWARD_AMOUNT} hak kazan`}
                  accent={c.brand}
                  onPress={handleWatchAd}
                  disabled={watchingAd}
                  iconLeft={(color, size) =>
                    watchingAd ? <ActivityIndicator color={color} size="small" /> : <PlayIcon color={color} size={size} />
                  }
                  style={{ marginTop: 6 }}
                />
                <Pressable onPress={handleCancelReportQuota} style={{ marginTop: 16, alignItems: 'center' }} hitSlop={8}>
                  <Text style={[s.quotaCancel, { color: c.text3 }]}>Vazgeç</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={s.quotaDesc}>
                  Bugün için {FEATURE_FREE_DAILY_LIMIT} kupon geçmişi görüntüleme hakkını kullandın. Hakların {formatQuotaResetIn(msUntilQuotaReset())} sonra yenilenecek.
                </Text>
                <AppButton
                  haptic={false}
                  label="Tamam"
                  variant="secondary"
                  onPress={handleCancelReportQuota}
                  style={{ marginTop: 10 }}
                />
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const SavedHeader = React.memo(function SavedHeader({
  styles: s,
  brand,
}: {
  styles: TicketStyles;
  brand: string;
}) {
  return (
    <View style={s.header}>
      <View style={s.eyebrowRow}>
        <View style={[s.eyebrowDot, { backgroundColor: brand }]} />
        <Text style={[s.eyebrow, { color: brand }]}>KUPON CÜZDANI</Text>
      </View>
      <Text style={s.title}>Kuponlarım</Text>
      <Text style={s.subtitle}>Kayıtlı kuponların ve sonuçları</Text>
    </View>
  );
});

function CheckResultBody({
  checkingCoupon,
  checkResult,
  styles: s,
  colors: c,
  onClose,
}: {
  checkingCoupon: Coupon;
  checkResult: CheckResult;
  styles: TicketStyles;
  colors: AppTheme['colors'];
  onClose: () => void;
}) {
  const id = getGameByName(checkingCoupon.game)?.id ?? 'cilgin';
  const mainColor = getGameAccentColor(id);
  const score = getScoreLabel(checkingCoupon, c);
  const matchedMainSet = useMemo(() => new Set(checkResult.matchedNumbers), [checkResult.matchedNumbers]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 540 }}>
      <View style={s.modalHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.modalTitle}>Kupon sonucu</Text>
          <Text style={s.modalSubtitle}>
            {checkingCoupon.game} · {checkResult.draw.draw_date}
          </Text>
        </View>
        <Pressable onPress={onClose} style={[s.close, { backgroundColor: c.surfaceAlt }]} hitSlop={8}>
          <CloseIcon color={c.text2} size={20} />
        </Pressable>
      </View>

      <View style={[s.scoreBox, { backgroundColor: score.color + '14', borderColor: score.color + '33' }]}>
        <TrophyIcon color={score.color} size={22} />
        <View style={{ flex: 1 }}>
          <Text style={[s.scoreLabel, { color: score.color }]}>{score.label}</Text>
          <Text style={s.scoreSub}>{score.sub}</Text>
        </View>
      </View>

      <Text style={s.modalLabel}>SENİN SAYILARIN</Text>
      <View style={s.modalBalls}>
        {checkingCoupon.numbers.map((num, i) => {
          const hitMain = matchedMainSet.has(num);
          const hitJoker = checkResult.jokerHitNumber === num;
          return (
            <NumberBall
              key={i}
              value={num}
              color={hitMain ? mainColor : undefined}
              variant={hitMain ? 'matched' : hitJoker ? 'bonus' : 'muted'}
              size={38}
            />
          );
        })}
      </View>

      {checkingCoupon.superStar != null ? (
        <>
          <Text style={s.modalLabel}>SÜPERSTAR</Text>
          <View style={s.modalBalls}>
            <NumberBall
              value={checkingCoupon.superStar}
              variant={checkResult.matchedSuperStar ? 'star' : 'muted'}
              size={38}
            />
          </View>
        </>
      ) : null}

      <AppButton haptic={false} label="Kapat" variant="secondary" onPress={onClose} style={{ marginTop: 12 }} />
    </ScrollView>
  );
}

const CouponTicket = React.memo(function CouponTicket({
  coupon,
  number,
  styles: s,
  theme,
  onShare,
  onDelete,
  onOpenResult,
  onOpenHistory,
  historyLoading,
}: {
  coupon: Coupon;
  number: number;
  styles: TicketStyles;
  theme: AppTheme;
  onShare: (id: number) => void;
  onDelete: (id: number) => void;
  onOpenResult: (id: number) => void;
  onOpenHistory: (id: number) => void;
  historyLoading?: boolean;
}) {
  const c = theme.colors;
  const id = getGameByName(coupon.game)?.id ?? 'cilgin';
  const mainColor = getGameAccentColor(id);
  const isChecked = !isPendingCoupon(coupon);
  const score = isChecked ? getScoreLabel(coupon, c) : null;

  const matchedMainSet = useMemo(
    () => (isChecked && coupon.matchedNumbers ? new Set(coupon.matchedNumbers) : null),
    [coupon.matchedNumbers, isChecked],
  );
  const matchedBonusSet = useMemo(
    () => (isChecked && coupon.matchedBonus ? new Set(coupon.matchedBonus) : null),
    [coupon.matchedBonus, isChecked],
  );

  return (
    <View style={s.ticket}>
      <View style={[s.ticketStripe, { backgroundColor: mainColor }]} />
      <View style={s.ticketBody}>
        <View style={s.ticketHead}>
          <View style={[s.ticketEmblem, { backgroundColor: `${mainColor}14` }]}>
            <GameEmblem game={id} size={38} color={mainColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.ticketGame, { color: mainColor }]}>{coupon.game}</Text>
            <Text style={s.ticketDate}>
              {coupon.date} · #{number}
            </Text>
          </View>
          {isChecked ? (
            <Pressable
              onPress={() => onOpenResult(coupon.id)}
              style={[s.scorePill, { backgroundColor: score!.color + '1A' }]}
            >
              <Text style={[s.scorePillText, { color: score!.color }]} numberOfLines={1}>
                {score!.label}
              </Text>
            </Pressable>
          ) : (
            <View style={[s.pendingPill, { backgroundColor: c.surfaceAlt }]}>
              <Text style={s.pendingPillText}>Bekliyor</Text>
            </View>
          )}
        </View>

        <View style={[s.perforation, { borderTopColor: c.border }]} />

        <View style={s.ticketBalls}>
          {coupon.numbers.map((num, i) => {
            if (!isChecked) return <NumberBall key={i} value={num} variant="muted" size={36} />;
            const hitMain = matchedMainSet?.has(num);
            const hitJoker = coupon.jokerHitNumber === num;
            return (
              <NumberBall
                key={i}
                value={num}
                color={hitMain ? mainColor : undefined}
                variant={hitMain ? 'matched' : hitJoker ? 'bonus' : 'muted'}
                size={36}
              />
            );
          })}
        </View>

        {coupon.bonus && coupon.bonus.length > 0 ? (
          <View style={s.ticketBalls}>
            {coupon.bonus.map((num, i) => {
              if (!isChecked) return <NumberBall key={i} value={num} variant="muted" size={36} />;
              const hit = matchedBonusSet?.has(num);
              return <NumberBall key={i} value={num} variant={hit ? 'bonus' : 'muted'} size={36} />;
            })}
          </View>
        ) : null}

        {coupon.superStar != null ? (
          <View style={s.ticketBalls}>
            {!isChecked ? (
              <NumberBall value={coupon.superStar} variant="muted" size={36} />
            ) : (
              <NumberBall value={coupon.superStar} variant={coupon.matchedSuperStar ? 'star' : 'muted'} size={36} />
            )}
          </View>
        ) : null}

        <View style={s.ticketActions}>
          <PressableScale
            haptic={false}
            onPress={() => onOpenHistory(coupon.id)}
            disabled={historyLoading}
            style={[s.historyBtn, { flex: 1, opacity: historyLoading ? 0.6 : 1 }]}
          >
            {historyLoading ? (
              <ActivityIndicator color={mainColor} size="small" />
            ) : (
              <StatsIcon color={mainColor} size={16} />
            )}
            <Text style={[s.historyBtnText, { color: mainColor }]}>Geçmiş</Text>
          </PressableScale>
          <PressableScale haptic={false} onPress={() => onShare(coupon.id)} style={[s.historyBtn, { flex: 1 }]}>
            <ShareIcon color={mainColor} size={16} />
            <Text style={[s.historyBtnText, { color: mainColor }]}>Paylaş</Text>
          </PressableScale>
          <PressableScale
            onPress={() => onDelete(coupon.id)}
            style={[s.historyBtn, { flex: 1, backgroundColor: c.dangerSoft }]}
          >
            <TrashIcon color={c.danger} size={16} />
            <Text style={[s.historyBtnText, { color: c.danger }]}>Sil</Text>
          </PressableScale>
        </View>
      </View>
    </View>
  );
});

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
    subtitle: { ...ty.bodyMedium, color: c.text2, marginTop: 3 },

    statsRow: { flexDirection: 'row', gap: 12, marginHorizontal: spacing.xl, marginBottom: spacing.lg },
    statCard: { flex: 1, padding: 14, borderRadius: radius.xl },
    statIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    statValue: {
      fontFamily: theme.font.extrabold,
      fontSize: 20,
      lineHeight: 25,
      letterSpacing: -0.3,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    statLabel: { ...ty.caption, color: c.text3, marginTop: 2 },

    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      marginBottom: spacing.md,
    },
    sectionTitle: { ...ty.h3, color: c.text },
    deleteAll: { ...ty.label },

    ticket: {
      marginHorizontal: spacing.xl,
      marginBottom: 12,
      borderRadius: radius.xl,
      backgroundColor: c.surface,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    ticketHidden: { display: 'none' },
    ticketStripe: { width: 4 },
    ticketBody: { flex: 1, padding: 16 },
    ticketHead: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 14 },
    ticketEmblem: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ticketGame: { ...ty.h3 },
    ticketDate: { ...ty.caption, color: c.text3, marginTop: 2 },
    scorePill: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill, flexShrink: 0 },
    scorePillText: { ...ty.caption, fontFamily: theme.font.bold },
    pendingPill: {
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceAlt,
      flexShrink: 0,
    },
    pendingPillText: { ...ty.caption, fontFamily: theme.font.semibold, color: c.text3 },
    perforation: { borderTopWidth: 1, borderStyle: 'dashed', marginHorizontal: -16, marginBottom: 14 },
    ticketBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8 },

    ticketActions: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
    historyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 42,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceAlt,
    },
    historyBtnText: { ...ty.label },

    overlay: { flex: 1, justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.elevated,
      marginBottom: spacing.lg,
    },
    modalHead: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
    modalTitle: { ...ty.h2, color: c.text },
    modalSubtitle: { ...ty.caption, color: c.text2, marginTop: 3 },
    close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    scoreBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderRadius: radius.lg,
      borderWidth: 1,
      marginBottom: 14,
    },
    scoreLabel: { ...ty.h3 },
    scoreSub: { ...ty.caption, color: c.text2, marginTop: 2 },
    modalLabel: { ...ty.caption, color: c.text2, fontFamily: theme.font.semibold, marginBottom: 9 },
    modalBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 16 },

    quotaCard: {
      marginHorizontal: 24,
      borderRadius: 28,
      padding: 24,
      alignItems: 'center',
    },
    quotaIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    quotaTitle: { ...ty.h2, color: c.text, textAlign: 'center' },
    quotaDesc: { ...ty.bodyMedium, color: c.text2, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    quotaCancel: { ...ty.label },
  });
}