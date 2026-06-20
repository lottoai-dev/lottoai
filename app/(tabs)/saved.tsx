// app/(tabs)/saved.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../../components/ui/app-button';
import { NumberBall } from '../../components/ui/number-ball';
import { EmptyState, LoadingState } from '../../components/ui/states';
import { PressableScale, Surface } from '../../components/ui/surface';
import { STORAGE_KEYS } from '../../constants/storage-keys';
import { AppTheme, GameAccent } from '../../constants/theme';
import { useAlert } from '../../contexts/AlertContext';
import CouponHistory from '../../lib/CouponHistory';
import { GameEmblem } from '../../lib/emblems';
import { getGameByName } from '../../lib/games';
import { CloseIcon, ShareIcon, StatsIcon, TicketIcon, TrashIcon, TrophyIcon } from '../../lib/icons';
import { formatPrize, getPrizeTable, type PrizeEstimate } from '../../lib/prizeEstimates';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function softHaptic() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
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
  matchedSuperStar?: boolean;
};

type DrawResult = { numbers: string; bonus: string; superstar?: number | null; draw_date: string; draw_no: string };
type CheckResult = {
  draw: DrawResult;
  matchedNumbers: number[];
  matchedBonus: number[];
  matchedSuperStar: boolean;
  mainMatchCount: number;
  prize: PrizeEstimate | null;
  score: number;
};
type FilterStatus = 'all' | 'pending' | 'checked';

function parseNumbers(str: string): number[] {
  return str.split(' - ').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
}

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const scrollRef = useRef<ScrollView>(null);
  const { showAlert } = useAlert();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [checkModal, setCheckModal] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState<Coupon | null>(null);
  const [checking, setChecking] = useState(false);
  const [historyModalCoupon, setHistoryModalCoupon] = useState<Coupon | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [isLoading, setIsLoading] = useState(true);

  const loadCoupons = async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS);
      setCoupons(data ? JSON.parse(data) : []);
    } catch {
      setCoupons([]);
    }
  };

  const autoCheckRef = useRef<(showNotification?: boolean) => Promise<void>>(async () => {});
  const autoCheckAllPending = useCallback(async (showNotification = false) => {
    const saved = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS);
    if (!saved) return;
    const allCoupons: Coupon[] = JSON.parse(saved);
    const pending = allCoupons.filter((cp) => cp.matchedCount === undefined || cp.matchedCount === null);
    if (pending.length === 0) return;

    setCoupons(allCoupons);

    let updated = [...allCoupons];
    let hasChanges = false;

    let oldestDateStr = '';
    for (const coupon of pending) {
      if (!coupon.date) continue;
      if (!oldestDateStr || coupon.date < oldestDateStr) {
        oldestDateStr = coupon.date;
      }
    }

    let newlyCheckedCount = 0;
    let bestNewScore = 0;

    try {
      if (oldestDateStr) {
        const [d, m, y] = oldestDateStr.split('.').map(Number);
        const oldestIso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        const gameNames = [...new Set(pending.map((cp) => cp.game))];
        const { data: allDraws } = await supabase
          .from('draws')
          .select('*')
          .in('game', gameNames)
          .gte('draw_date_parsed', oldestIso)
          .order('draw_date_parsed', { ascending: true });

        if (allDraws) {
          for (const coupon of pending) {
            const relevantDraws = allDraws.filter((d: any) => d.game === coupon.game);
            if (relevantDraws.length === 0) continue;

            const couponIso = coupon.timestamp
              ? coupon.timestamp.split('T')[0]
              : oldestIso;

            const firstDrawAfter = relevantDraws.find((d: any) => {
              const drawIso = d.draw_date_parsed ? d.draw_date_parsed.substring(0, 10) : '';
              return drawIso >= couponIso;
            });

            if (!firstDrawAfter) continue;

            const drawnNumbers = parseNumbers(firstDrawAfter.numbers);
            const drawnBonus =
              firstDrawAfter.bonus && firstDrawAfter.bonus !== '-'
                ? firstDrawAfter.bonus.split(',').map((n: string) => parseInt(n.trim(), 10)).filter((n: number) => !isNaN(n))
                : [];
            const matchedNumbers = coupon.numbers.filter((n) => drawnNumbers.includes(n));
            const matchedBonus = coupon.bonus.filter((n) => drawnBonus.includes(n));
            const matchedSuperStar = coupon.superStar != null && firstDrawAfter.superstar != null && coupon.superStar === firstDrawAfter.superstar;
            const score = matchedNumbers.length + matchedBonus.length + (matchedSuperStar ? 1 : 0);

            updated = updated.map((cp) =>
              cp.id === coupon.id ? { ...cp, matchedCount: score, matchedNumbers, matchedBonus, matchedSuperStar } : cp
            );
            hasChanges = true;
            newlyCheckedCount++;
            if (score > bestNewScore) bestNewScore = score;
          }
        }
      }
    } catch {}

    if (hasChanges) {
      setCoupons(updated);
      await AsyncStorage.setItem(STORAGE_KEYS.SAVED_COUPONS, JSON.stringify(updated));

      if (showNotification && newlyCheckedCount > 0) {
        const gameList = [...new Set(pending.map((cp) => cp.game))].join(', ');
        const body = `${newlyCheckedCount} kuponun kontrol edildi${bestNewScore > 0 ? `, en iyi: ${bestNewScore} sayı` : ''}.`;
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
    }
  }, []);

  useEffect(() => {
    autoCheckRef.current = autoCheckAllPending;
  }, [autoCheckAllPending]);

  useEffect(() => {
    const channel = supabase.channel('draws-changes')
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
      setIsLoading(true);
      loadCoupons().then(() => {
        autoCheckAllPending(false);
        setIsLoading(false);
      });
    }, [autoCheckAllPending])
  );

  const filteredCoupons = useMemo(() => {
    let result = coupons;
    if (filterStatus === 'pending') result = result.filter((cp) => cp.matchedCount === undefined || cp.matchedCount === null);
    else if (filterStatus === 'checked') result = result.filter((cp) => cp.matchedCount !== undefined && cp.matchedCount !== null);
    return result;
  }, [coupons, filterStatus]);

  const totalCoupons = filteredCoupons.length;
  const totalMatched = coupons.reduce((acc, cp) => acc + (cp.matchedCount || 0), 0);
  const bestResult = coupons.reduce((max, cp) => Math.max(max, cp.matchedCount || 0), 0);
  const pendingCount = coupons.filter((cp) => cp.matchedCount === undefined || cp.matchedCount === null).length;
  const checkedCount = coupons.length - pendingCount;

  const handleDelete = (id: number) => {
    showAlert('Kuponu sil', 'Bu kupon kalıcı olarak silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          softHaptic();
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          const updated = coupons.filter((cp) => cp.id !== id);
          setCoupons(updated);
          await AsyncStorage.setItem(STORAGE_KEYS.SAVED_COUPONS, JSON.stringify(updated));
        },
      },
    ]);
  };

  const handleDeleteAll = () => {
    showAlert('Tümünü sil', 'Tüm kayıtlı kuponlar silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          softHaptic();
          setCoupons([]);
          await AsyncStorage.removeItem(STORAGE_KEYS.SAVED_COUPONS);
        },
      },
    ]);
  };

  const handleShare = async (coupon: Coupon) => {
    try {
      const numbersText = coupon.numbers.join(' · ');
      const bonusText = coupon.bonus && coupon.bonus.length > 0 ? `\n🔵 Şans Topu: ${coupon.bonus.join(' · ')}` : '';
      const superStarText = coupon.superStar ? `\n⭐ SüperStar: ${coupon.superStar}` : '';
      const matchText = coupon.matchedCount !== undefined && coupon.matchedCount !== null
        ? `\n🎯 Sonuç: ${coupon.matchedCount} sayı tutturdu`
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
  };

  const getScoreLabel = (score: number, gameName: string) => {
    const prizeTable = getPrizeTable(gameName);
    const hasPrize = prizeTable ? prizeTable[score] != null : false;

    if (score === 0) return { label: 'Tutmadı', color: c.text3, sub: 'Bir sonrakine!' };
    if (hasPrize && score >= 6) return { label: 'Büyük ikramiye!', color: c.gold, sub: 'Tebrikler!' };
    if (hasPrize) return { label: `${score} sayı tutturdun`, color: c.brand, sub: 'Harika sonuç!' };
    return { label: `${score} sayı tutturdun`, color: c.text2, sub: 'Bir sonrakine!' };
  };

  const openCheckResult = (coupon: Coupon) => {
    if (coupon.matchedCount === undefined || coupon.matchedCount === null) return;
    const prizeTable = getPrizeTable(coupon.game);
    const prize = prizeTable && coupon.matchedNumbers ? prizeTable[coupon.matchedNumbers.length] ?? null : null;
    setCheckingCoupon(coupon);
    setCheckResult({
      draw: { numbers: '', bonus: '', superstar: null, draw_date: coupon.date, draw_no: '' },
      matchedNumbers: coupon.matchedNumbers ?? [],
      matchedBonus: coupon.matchedBonus ?? [],
      matchedSuperStar: !!coupon.matchedSuperStar,
      mainMatchCount: coupon.matchedNumbers?.length ?? 0,
      prize,
      score: coupon.matchedCount,
    });
    setChecking(false);
    setCheckModal(true);
  };

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 90 }}
      >
        <View style={s.header}>
          <Text style={s.title}>Kuponlarım</Text>
          <Text style={s.subtitle}>Kayıtlı kuponların ve sonuçları</Text>
        </View>

        {isLoading ? (
          <LoadingState label="Kuponların yükleniyor…" />
        ) : coupons.length === 0 ? (
          <View style={{ paddingTop: 40 }}>
            <EmptyState
              icon={<TicketIcon color={c.brand} size={30} />}
              title="Henüz kuponun yok"
              desc="Kupon üret ekranında sayılarını seç ve kaydet. Sonuçlar açıklanınca otomatik kontrol edip burada gösterelim."
              action="İlk kuponunu üret"
              onAction={() => router.push('/(tabs)/generate')}
            />
          </View>
        ) : (
          <>
            <Surface style={s.stats}>
              <Stat value={String(coupons.length)} label="Toplam" color={c.brand} theme={theme} />
              <View style={[s.statDivider, { backgroundColor: c.hairline }]} />
              <Stat value={String(bestResult)} label="En iyi" color={c.gold} theme={theme} />
              <View style={[s.statDivider, { backgroundColor: c.hairline }]} />
              <Stat value={String(totalMatched)} label="Tutuşan" color={c.brand} theme={theme} />
            </Surface>

            <View style={s.statusRow}>
              {([['all', `Tümü (${coupons.length})`], ['pending', `Bekleyen (${pendingCount})`], ['checked', `Kontrol (${checkedCount})`]] as [FilterStatus, string][]).map(([key, label]) => {
                const active = filterStatus === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => { setFilterStatus(key); }}
                    style={[s.statusBtn, { backgroundColor: active ? c.brand : c.surface, borderColor: active ? c.brand : c.border }]}
                  >
                    <Text style={[s.statusBtnText, { color: active ? c.brandText : c.text2 }]} numberOfLines={1}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={s.topRow}>
              <Text style={s.sectionTitle}>{totalCoupons} kupon</Text>
              <Pressable onPress={handleDeleteAll} hitSlop={8}>
                <Text style={[s.deleteAll, { color: c.danger }]}>Tümünü sil</Text>
              </Pressable>
            </View>

            {filteredCoupons.length === 0 ? (
              <EmptyState
                icon={<TicketIcon color={c.brand} size={30} />}
                title={filterStatus === 'pending' ? 'Bekleyen kupon yok' : filterStatus === 'checked' ? 'Kontrol edilmiş kupon yok' : 'Kupon bulunamadı'}
                desc={filterStatus === 'pending' ? 'Tüm kuponların kontrol edildi.' : 'Bu filtreye uygun kupon yok.'}
              />
            ) : (
              filteredCoupons.map((coupon, index) => (
                <CouponTicket
                  key={coupon.id}
                  coupon={coupon}
                  number={totalCoupons - index}
                  onShare={() => handleShare(coupon)}
                  onDelete={() => handleDelete(coupon.id)}
                  onOpenResult={() => openCheckResult(coupon)}
                  onOpenHistory={() => setHistoryModalCoupon(coupon)}
                  getScoreLabel={getScoreLabel}
                  theme={theme}
                />
              ))
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={checkModal} transparent animationType="slide" onRequestClose={() => setCheckModal(false)}>
        <View style={[s.overlay, { backgroundColor: c.overlay }]}>
          <View style={[s.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={s.grabber} />
            {checking ? (
              <LoadingState label="Kontrol ediliyor…" />
            ) : checkResult && checkingCoupon ? (
              (() => {
                const id = getGameByName(checkingCoupon.game)?.id ?? 'cilgin';
                const mainColor = GameAccent[id] ?? c.brand;
                const score = getScoreLabel(checkResult.score, checkingCoupon.game);
                const currency = getGameByName(checkingCoupon.game)?.currency || 'TRY';
                return (
                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 540 }}>
                    <View style={s.modalHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.modalTitle}>Kupon sonucu</Text>
                        <Text style={s.modalSubtitle}>{checkingCoupon.game} · {checkResult.draw.draw_date}</Text>
                      </View>
                      <Pressable onPress={() => setCheckModal(false)} style={[s.close, { backgroundColor: c.surfaceAlt }]} hitSlop={8}>
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

                    {checkResult.prize ? (
                      <View style={[s.prizeCard, { backgroundColor: c.goldSoft, borderColor: c.gold + '44' }]}>
                        <View style={s.prizeRow}>
                          <Text style={s.prizeLabel}>Tahmini ikramiye</Text>
                          <Text style={s.prizeAmount}>{formatPrize(checkResult.prize.amount, currency)}</Text>
                        </View>
                        <Text style={s.prizeNote}>Tahminidir; resmî tutar çekiliş sonuçlarına göre değişir. Bayinize danışın.</Text>
                      </View>
                    ) : null}

                    <Text style={s.modalLabel}>SENİN SAYILARIN</Text>
                    <View style={s.modalBalls}>
                      {checkingCoupon.numbers.map((num, i) => {
                        const hit = checkResult.matchedNumbers.includes(num);
                        return <NumberBall key={i} value={num} color={hit ? mainColor : undefined} variant={hit ? 'game' : 'muted'} size={38} />;
                      })}
                    </View>

                    {checkingCoupon.superStar != null ? (
                      <>
                        <Text style={s.modalLabel}>SÜPERSTAR</Text>
                        <View style={s.modalBalls}>
                          <NumberBall value={checkingCoupon.superStar} variant={checkResult.matchedSuperStar ? 'star' : 'muted'} size={38} />
                        </View>
                      </>
                    ) : null}

                    <AppButton label="Kapat" variant="secondary" onPress={() => setCheckModal(false)} style={{ marginTop: 12 }} />
                  </ScrollView>
                );
              })()
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
    </View>
  );
}

const CouponTicket = React.memo(function CouponTicket({
  coupon,
  number,
  onShare,
  onDelete,
  onOpenResult,
  onOpenHistory,
  getScoreLabel,
  theme,
}: {
  coupon: Coupon;
  number: number;
  onShare: () => void;
  onDelete: () => void;
  onOpenResult: () => void;
  onOpenHistory: () => void;
  getScoreLabel: (n: number, gameName: string) => { label: string; color: string; sub: string };
  theme: AppTheme;
}) {
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const id = getGameByName(coupon.game)?.id ?? 'cilgin';
  const mainColor = GameAccent[id] ?? c.brand;
  const isChecked = coupon.matchedCount !== undefined && coupon.matchedCount !== null;
  const score = isChecked ? getScoreLabel(coupon.matchedCount as number, coupon.game) : null;

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
      <View style={s.ticket}>
        <View style={[s.ticketStripe, { backgroundColor: mainColor }]} />
        <View style={s.ticketBody}>
          <View style={s.ticketHead}>
            <GameEmblem game={id} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={s.ticketGame}>{coupon.game}</Text>
              <Text style={s.ticketDate}>{coupon.date} · #{number}</Text>
            </View>
            {isChecked ? (
              <Pressable onPress={onOpenResult} style={[s.scorePill, { backgroundColor: (score!.color) + '1A' }]}>
                <Text style={[s.scorePillText, { color: score!.color }]} numberOfLines={1}>
                  {coupon.matchedCount === 0 ? 'Tutmadı' : `${coupon.matchedCount} tutturdu`}
                </Text>
              </Pressable>
            ) : (
              <View style={[s.pendingPill, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                <Text style={s.pendingPillText}>Bekliyor</Text>
              </View>
            )}
          </View>

          <View style={[s.perforation, { borderTopColor: c.border }]} />

          <View style={s.ticketBalls}>
            {coupon.numbers.map((num, i) => {
              if (!isChecked) return <NumberBall key={i} value={num} variant="muted" size={36} />;
              const hit = coupon.matchedNumbers?.includes(num);
              return <NumberBall key={i} value={num} color={hit ? mainColor : undefined} variant={hit ? 'game' : 'muted'} size={36} />;
            })}
          </View>

          {coupon.bonus && coupon.bonus.length > 0 ? (
            <View style={s.ticketBalls}>
              {coupon.bonus.map((num, i) => {
                if (!isChecked) return <NumberBall key={i} value={num} variant="muted" size={32} />;
                const hit = coupon.matchedBonus?.includes(num);
                return <NumberBall key={i} value={num} variant={hit ? 'bonus' : 'muted'} size={32} />;
              })}
            </View>
          ) : null}

          {coupon.superStar != null ? (
            <View style={s.ticketBalls}>
              {(() => {
                if (!isChecked) return <NumberBall value={coupon.superStar} variant="muted" size={32} />;
                const hit = coupon.matchedSuperStar;
                return <NumberBall value={coupon.superStar} variant={hit ? 'star' : 'muted'} size={32} />;
              })()}
            </View>
          ) : null}

          <View style={s.ticketActions}>
            <PressableScale
              onPress={onOpenHistory}
              style={[s.historyBtn, { flex: 1, borderColor: mainColor + '22' }]}
            >
              <StatsIcon color={mainColor} size={16} />
              <Text style={[s.historyBtnText, { color: mainColor }]}>Geçmiş</Text>
            </PressableScale>
            <PressableScale
              onPress={onShare}
              style={[s.actionBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
            >
              <ShareIcon color={c.text2} size={20} />
            </PressableScale>
            <PressableScale
              onPress={onDelete}
              style={[s.actionBtn, { backgroundColor: c.danger + '18', borderColor: c.danger + '44' }]}
            >
              <TrashIcon color={c.danger} size={20} />
            </PressableScale>
          </View>
        </View>
      </View>
    </Animated.View>
  );
});

function Stat({ value, label, color, theme }: { value: string; label: string; color: string; theme: AppTheme }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontFamily: theme.font.extrabold, fontSize: 26, color, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ ...theme.typography.caption, color: theme.colors.text2, marginTop: 3 }}>{label}</Text>
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: spacing.xl, paddingTop: 4, paddingBottom: 14 },
    title: { ...ty.h1, color: c.text },
    subtitle: { ...ty.bodyMedium, color: c.text2, marginTop: 3 },

    stats: { flexDirection: 'row', marginHorizontal: spacing.xl, padding: 18, marginBottom: spacing.lg },
    statDivider: { width: 1, height: 40, alignSelf: 'center' },

    statusRow: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
    statusBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.md, borderWidth: 1 },
    statusBtnText: { ...ty.caption, fontFamily: theme.font.bold },

    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, marginBottom: spacing.md },
    sectionTitle: { ...ty.h3, color: c.text },
    deleteAll: { ...ty.label },

    ticket: { marginHorizontal: spacing.xl, marginBottom: 12, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, flexDirection: 'row', overflow: 'hidden', ...theme.shadowSm },
    ticketStripe: { width: 8 },
    ticketBody: { flex: 1, padding: 16 },
    ticketHead: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 14 },
    ticketGame: { ...ty.h3, color: c.text },
    ticketDate: { ...ty.caption, color: c.text3, marginTop: 2 },
    scorePill: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill, flexShrink: 0 },
    scorePillText: { ...ty.caption, fontFamily: theme.font.extrabold },
    pendingPill: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, flexShrink: 0 },
    pendingPillText: { ...ty.caption, fontFamily: theme.font.bold, color: c.text3 },
    perforation: { borderTopWidth: 1, borderStyle: 'dashed', marginHorizontal: -16, marginBottom: 14 },
    ticketBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8 },

    ticketActions: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
    actionBtn: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
    },
    actionText: { ...ty.label, fontFamily: theme.font.semibold },
    historyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1 },
    historyBtnText: { ...ty.label, fontFamily: theme.font.bold },

    overlay: { flex: 1, justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: spacing.lg },
    modalHead: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
    modalTitle: { ...ty.h2, color: c.text },
    modalSubtitle: { ...ty.caption, color: c.text2, marginTop: 3 },
    close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    scoreBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg, borderWidth: 1, marginBottom: 14 },
    scoreLabel: { ...ty.h3, fontFamily: theme.font.extrabold },
    scoreSub: { ...ty.caption, color: c.text2, marginTop: 2 },
    prizeCard: { padding: 14, borderRadius: radius.md, borderWidth: 1, marginBottom: 16 },
    prizeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    prizeLabel: { ...ty.bodyMedium, color: c.text2 },
    prizeAmount: { fontFamily: theme.font.extrabold, fontSize: 20, color: c.text },
    prizeNote: { ...ty.micro, color: c.text3, marginTop: 6, letterSpacing: 0, lineHeight: 15 },
    modalLabel: { ...ty.caption, color: c.text2, fontFamily: theme.font.semibold, marginBottom: 9 },
    modalBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 16 },
  });
}