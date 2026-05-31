// app/(tabs)/saved.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { AppTheme, GameAccent } from '../../constants/theme';
import CouponHistory from '../../lib/CouponHistory';
import { GameEmblem } from '../../lib/emblems';
import { getGameByName } from '../../lib/games';
import { ChevronDownIcon, CloseIcon, ShareIcon, TicketIcon, TrashIcon, TrophyIcon } from '../../lib/icons';
import { getPrizeTable, type PrizeEstimate } from '../../lib/prizeEstimates';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
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

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [checkModal, setCheckModal] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState<Coupon | null>(null);
  const [checking, setChecking] = useState(false);
  const [expandedCoupon, setExpandedCoupon] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterGame, setFilterGame] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadCoupons = async () => {
    try {
      const data = await AsyncStorage.getItem('savedCoupons');
      setCoupons(data ? JSON.parse(data) : []);
    } catch {
      setCoupons([]);
    }
  };

  const autoCheckAllPending = useCallback(async () => {
    const saved = await AsyncStorage.getItem('savedCoupons');
    if (!saved) return;
    const allCoupons: Coupon[] = JSON.parse(saved);
    const pending = allCoupons.filter((cp) => cp.matchedCount === undefined || cp.matchedCount === null);
    if (pending.length === 0) return;

    let updated = [...allCoupons];
    let hasChanges = false;

    for (const coupon of pending) {
      try {
        let couponTimestamp: string;
        if (coupon.timestamp) couponTimestamp = coupon.timestamp;
        else {
          const [d, m, y] = coupon.date.split('.').map(Number);
          couponTimestamp = new Date(y, m - 1, d, 23, 59, 59).toISOString();
        }
        const { data: latestDraw } = await supabase
          .from('draws')
          .select('draw_date, draw_date_parsed, superstar')
          .eq('game', coupon.game)
          .order('draw_date_parsed', { ascending: false })
          .limit(1)
          .single();

        let latestIso = '';
        if (latestDraw?.draw_date_parsed) latestIso = latestDraw.draw_date_parsed.substring(0, 10);
        else if (latestDraw?.draw_date) {
          const [dd, mm, yyyy] = latestDraw.draw_date.split('.').map(Number);
          latestIso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        }
        if (!latestDraw || latestIso < couponTimestamp.split('T')[0]) continue;

        const { data } = await supabase
          .from('draws')
          .select('*')
          .eq('game', coupon.game)
          .gte('draw_date_parsed', couponTimestamp.split('T')[0])
          .order('draw_date_parsed', { ascending: true })
          .limit(1)
          .single();
        if (!data) continue;

        const drawnNumbers = parseNumbers(data.numbers);
        const drawnBonus =
          data.bonus && data.bonus !== '-'
            ? data.bonus.split(',').map((n: string) => parseInt(n.trim(), 10)).filter((n: number) => !isNaN(n))
            : [];
        const matchedNumbers = coupon.numbers.filter((n) => drawnNumbers.includes(n));
        const matchedBonus = coupon.bonus.filter((n) => drawnBonus.includes(n));
        const matchedSuperStar = coupon.superStar != null && data.superstar != null && coupon.superStar === data.superstar;
        const score = matchedNumbers.length + matchedBonus.length + (matchedSuperStar ? 1 : 0);

        updated = updated.map((cp) =>
          cp.id === coupon.id ? { ...cp, matchedCount: score, matchedNumbers, matchedBonus, matchedSuperStar } : cp
        );
        hasChanges = true;
      } catch {}
    }
    if (hasChanges) {
      setCoupons(updated);
      await AsyncStorage.setItem('savedCoupons', JSON.stringify(updated));
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('draws-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'draws' }, () => {
        autoCheckAllPending();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [autoCheckAllPending]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      loadCoupons().then(() => {
        autoCheckAllPending();
        setIsLoading(false);
      });
    }, [autoCheckAllPending])
  );

  const gameChips = useMemo(() => {
    const map = new Map<string, { game: string; id: string; color: string; count: number }>();
    coupons.forEach((cp) => {
      const existing = map.get(cp.game);
      if (existing) existing.count++;
      else {
        const id = getGameByName(cp.game)?.id ?? 'cilgin';
        map.set(cp.game, { game: cp.game, id, color: GameAccent[id] ?? c.brand, count: 1 });
      }
    });
    return Array.from(map.values());
  }, [coupons, c.brand]);

  const filteredCoupons = useMemo(() => {
    let result = coupons;
    if (filterGame) result = result.filter((cp) => cp.game === filterGame);
    if (filterStatus === 'pending') result = result.filter((cp) => cp.matchedCount === undefined || cp.matchedCount === null);
    else if (filterStatus === 'checked') result = result.filter((cp) => cp.matchedCount !== undefined && cp.matchedCount !== null);
    return result;
  }, [coupons, filterStatus, filterGame]);

  const totalCoupons = filteredCoupons.length;
  const totalMatched = coupons.reduce((acc, cp) => acc + (cp.matchedCount || 0), 0);
  const bestResult = coupons.reduce((max, cp) => Math.max(max, cp.matchedCount || 0), 0);
  const pendingCount = coupons.filter((cp) => cp.matchedCount === undefined || cp.matchedCount === null).length;
  const checkedCount = coupons.length - pendingCount;

  const handleDelete = (id: number) => {
    Alert.alert('Kuponu sil', 'Bu kupon kalıcı olarak silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          const updated = coupons.filter((cp) => cp.id !== id);
          setCoupons(updated);
          await AsyncStorage.setItem('savedCoupons', JSON.stringify(updated));
        },
      },
    ]);
  };

  const handleDeleteAll = () => {
    Alert.alert('Tümünü sil', 'Tüm kayıtlı kuponlar silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setCoupons([]);
          await AsyncStorage.removeItem('savedCoupons');
        },
      },
    ]);
  };

  const handleShare = async (coupon: Coupon) => {
    try {
      const numbersText = coupon.numbers.join(' - ');
      const bonusText = coupon.bonus && coupon.bonus.length > 0 ? `\nŞans Topu/Joker: ${coupon.bonus.join(' - ')}` : '';
      const superStarText = coupon.superStar ? `\nSüperStar: ${coupon.superStar}` : '';
      const message =
        `LottoAI Kuponu\n` +
        `———————————\n` +
        `Oyun: ${coupon.game}\n` +
        `Tarih: ${coupon.date}\n` +
        `Sayılar: ${numbersText}${bonusText}${superStarText}\n` +
        `———————————\n` +
        `LottoAI ile üretildi`;
      await Share.share({ message });
    } catch {
      Alert.alert('Hata', 'Paylaşım yapılamadı.');
    }
  };

  const getScoreLabel = (score: number) => {
    if (score === 0) return { label: 'Tutmadı', color: c.text3, sub: 'Bir sonrakine!' };
    if (score >= 6) return { label: 'Büyük ikramiye!', color: c.gold, sub: 'Tebrikler!' };
    if (score >= 4) return { label: `${score} sayı tutturdun`, color: c.brand, sub: 'Harika sonuç!' };
    if (score >= 2) return { label: `${score} sayı tutturdun`, color: c.brand, sub: 'İyi gidiyorsun!' };
    return { label: `${score} sayı tutturdun`, color: c.text2, sub: 'Bir sonrakine!' };
  };

  const formatPrize = (amount: number, currency = 'TRY') => {
    if (currency === 'USD') {
      if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
      if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
      if (amount >= 1e3) return `$${(amount / 1e3).toFixed(1)}K`;
      return `$${amount}`;
    }
    if (amount >= 1e6) return `${(amount / 1e6).toFixed(1)} Milyon TL`;
    if (amount >= 1e3) return `${(amount / 1e3).toFixed(1)} Bin TL`;
    return `${amount} TL`;
  };

  const openCheckResult = (coupon: Coupon) => {
    if (coupon.matchedCount === undefined || coupon.matchedCount === null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  const toggleExpand = (id: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setExpandedCoupon(expandedCoupon === id ? null : id);
  };

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 90 }}>
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
            {/* Stats */}
            <Surface style={s.stats}>
              <Stat value={String(coupons.length)} label="Toplam" color={c.brand} theme={theme} />
              <View style={[s.statDivider, { backgroundColor: c.hairline }]} />
              <Stat value={String(bestResult)} label="En iyi" color={c.gold} theme={theme} />
              <View style={[s.statDivider, { backgroundColor: c.hairline }]} />
              <Stat value={String(totalMatched)} label="Tutuşan" color={c.brand} theme={theme} />
            </Surface>

            {/* Status filter */}
            <View style={s.statusRow}>
              {([['all', `Tümü (${coupons.length})`], ['pending', `Bekleyen (${pendingCount})`], ['checked', `Kontrol (${checkedCount})`]] as [FilterStatus, string][]).map(([key, label]) => {
                const active = filterStatus === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => { setFilterStatus(key); Haptics.selectionAsync(); }}
                    style={[s.statusBtn, { backgroundColor: active ? c.brand : c.surface, borderColor: active ? c.brand : c.border }]}
                  >
                    <Text style={[s.statusBtnText, { color: active ? c.brandText : c.text2 }]} numberOfLines={1}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Game chips */}
            {gameChips.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                <PressableScale onPress={() => setFilterGame(null)} style={[s.chip, { backgroundColor: !filterGame ? c.brand : c.surface, borderColor: !filterGame ? c.brand : c.border }]}>
                  <Text style={[s.chipText, { color: !filterGame ? c.brandText : c.text2 }]}>Tümü</Text>
                </PressableScale>
                {gameChips.map((chip) => {
                  const active = filterGame === chip.game;
                  return (
                    <PressableScale key={chip.game} onPress={() => setFilterGame(active ? null : chip.game)} style={[s.chip, { backgroundColor: active ? chip.color + '14' : c.surface, borderColor: active ? chip.color : c.border }]}>
                      <GameEmblem game={chip.id} size={18} />
                      <Text style={[s.chipText, { color: active ? chip.color : c.text2 }]}>{chip.game} ({chip.count})</Text>
                    </PressableScale>
                  );
                })}
                <View style={{ width: 8 }} />
              </ScrollView>
            ) : null}

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
                  expanded={expandedCoupon === coupon.id}
                  onToggle={() => toggleExpand(coupon.id)}
                  onShare={() => handleShare(coupon)}
                  onDelete={() => handleDelete(coupon.id)}
                  onOpenResult={() => openCheckResult(coupon)}
                  getScoreLabel={getScoreLabel}
                  theme={theme}
                />
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Result modal */}
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
                const score = getScoreLabel(checkResult.score);
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
    </View>
  );
}

/* ───────────────── ticket card ───────────────── */
function CouponTicket({
  coupon,
  number,
  expanded,
  onToggle,
  onShare,
  onDelete,
  onOpenResult,
  getScoreLabel,
  theme,
}: {
  coupon: Coupon;
  number: number;
  expanded: boolean;
  onToggle: () => void;
  onShare: () => void;
  onDelete: () => void;
  onOpenResult: () => void;
  getScoreLabel: (n: number) => { label: string; color: string; sub: string };
  theme: AppTheme;
}) {
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const id = getGameByName(coupon.game)?.id ?? 'cilgin';
  const mainColor = GameAccent[id] ?? c.brand;
  const isChecked = coupon.matchedCount !== undefined && coupon.matchedCount !== null;
  const score = isChecked ? getScoreLabel(coupon.matchedCount as number) : null;

  // entrance animation
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim]);

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

          <View style={s.ticketActions}>
            <PressableScale onPress={onShare} style={[s.actionBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <ShareIcon color={c.text2} size={18} />
              <Text style={[s.actionText, { color: c.text2 }]}>Paylaş</Text>
            </PressableScale>
            <PressableScale onPress={onDelete} haptic={false} style={[s.actionIconBtn, { backgroundColor: c.dangerSoft, borderColor: c.dangerSoft }]}>
              <TrashIcon color={c.danger} size={18} />
            </PressableScale>
          </View>

          <PressableScale onPress={onToggle} style={[s.historyToggle, { borderColor: mainColor + '22' }]}>
            <Text style={[s.historyToggleText, { color: mainColor }]}>Geçmiş performans</Text>
            <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
              <ChevronDownIcon color={mainColor} size={16} />
            </View>
          </PressableScale>
        </View>
      </View>

      {expanded ? (
        <View style={{ marginTop: -4, marginBottom: 8 }}>
          <CouponHistory game={coupon.game} numbers={coupon.numbers} bonus={coupon.bonus} superStar={coupon.superStar ?? undefined} />
        </View>
      ) : null}
    </Animated.View>
  );
}

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

    chipRow: { paddingHorizontal: spacing.xl, gap: 8, marginBottom: spacing.lg },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
    chipText: { ...ty.caption, fontFamily: theme.font.semibold },

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
    ticketActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1 },
    actionText: { ...ty.caption, fontFamily: theme.font.bold },
    actionIconBtn: { width: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1 },
    historyToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1 },
    historyToggleText: { ...ty.label, fontFamily: theme.font.bold },

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