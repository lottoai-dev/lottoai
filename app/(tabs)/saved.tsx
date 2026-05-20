// tabs_saved.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CouponHistory from '../../lib/CouponHistory';
import { GAME_COLORS } from '../../lib/games';
import { t } from '../../lib/i18n';
import { type PrizeEstimate } from '../../lib/prizeEstimates';
import { supabase } from '../../lib/supabase';

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

type DrawResult = {
  numbers: string;
  bonus: string;
  superstar?: number | null;
  draw_date: string;
  draw_no: string;
};

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
  return str.split(' - ').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
}

// Renkler
const PENDING_COLOR = '#3a3a5c';      // Sonuç bekleyen top rengi (açık gri)
const MISS_COLOR = '#3a3a5c';         // Tutmayan top rengi (açık gri - sonuç bekleyenle aynı)

export default function SavedScreen() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [checkModal, setCheckModal] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState<Coupon | null>(null);
  const [checking, setChecking] = useState(false);
  const [expandedCoupon, setExpandedCoupon] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterGame, setFilterGame] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const router = useRouter();

  const loadCoupons = async () => {
    try {
      const data = await AsyncStorage.getItem('savedCoupons');
      if (data) setCoupons(JSON.parse(data));
      else setCoupons([]);
    } catch (error) {
      setCoupons([]);
    }
  };

  const autoCheckAllPending = useCallback(async () => {
    const saved = await AsyncStorage.getItem('savedCoupons');
    if (!saved) return;
    const allCoupons: Coupon[] = JSON.parse(saved);
    const pending = allCoupons.filter(c => c.matchedCount === undefined || c.matchedCount === null);
    if (pending.length === 0) return;

    let updated = [...allCoupons];
    let hasChanges = false;

    for (const coupon of pending) {
      try {
        let couponTimestamp: string;
        if (coupon.timestamp) {
          couponTimestamp = coupon.timestamp;
        } else {
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
        if (latestDraw?.draw_date_parsed) {
          latestIso = latestDraw.draw_date_parsed.substring(0, 10);
        } else if (latestDraw?.draw_date) {
          const [dd, mm, yyyy] = latestDraw.draw_date.split('.').map(Number);
          latestIso = `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
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

        const targetDraw = data;
        const drawnNumbers = parseNumbers(targetDraw.numbers);
        const drawnBonus = targetDraw.bonus && targetDraw.bonus !== '-'
          ? targetDraw.bonus.split(',').map((n: string) => parseInt(n.trim())).filter((n: number) => !isNaN(n))
          : [];

        const matchedNumbers = coupon.numbers.filter((n) => drawnNumbers.includes(n));
        const matchedBonus = coupon.bonus.filter((n) => drawnBonus.includes(n));
        const matchedSuperStar = coupon.superStar != null && targetDraw.superstar != null && coupon.superStar === targetDraw.superstar;
        const mainMatchCount = matchedNumbers.length;
        const score = mainMatchCount + matchedBonus.length + (matchedSuperStar ? 1 : 0);

        updated = updated.map(c =>
          c.id === coupon.id ? {
            ...c,
            matchedCount: score,
            matchedNumbers: matchedNumbers,
            matchedBonus: matchedBonus,
            matchedSuperStar: matchedSuperStar,
          } : c
        );
        hasChanges = true;
      } catch (e) {}
    }

    if (hasChanges) {
      setCoupons(updated);
      await AsyncStorage.setItem('savedCoupons', JSON.stringify(updated));
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('draws-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'draws' },
        () => {
          autoCheckAllPending();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [autoCheckAllPending]);

  useFocusEffect(useCallback(() => {
    setIsLoading(true);
    loadCoupons().then(() => {
      autoCheckAllPending();
      setIsLoading(false);
    });
  }, [autoCheckAllPending]));

  const gameChips = useMemo(() => {
    const map = new Map<string, { game: string; icon: string; color: string; count: number }>();
    coupons.forEach(c => {
      const existing = map.get(c.game);
      if (existing) {
        existing.count++;
      } else {
        const gc = GAME_COLORS[c.game as keyof typeof GAME_COLORS];
        map.set(c.game, {
          game: c.game,
          icon: c.icon,
          color: gc?.main || c.color || '#6C63FF',
          count: 1,
        });
      }
    });
    return Array.from(map.values());
  }, [coupons]);

  const filteredCoupons = useMemo(() => {
    let result = coupons;

    if (filterGame) {
      result = result.filter(c => c.game === filterGame);
    }

    if (filterStatus === 'pending') {
      result = result.filter(c => c.matchedCount === undefined || c.matchedCount === null);
    } else if (filterStatus === 'checked') {
      result = result.filter(c => c.matchedCount !== undefined && c.matchedCount !== null);
    }

    return result;
  }, [coupons, filterStatus, filterGame]);

  const totalCoupons = filteredCoupons.length;
  const gameCounts = coupons.reduce((acc, c) => {
    acc[c.game] = (acc[c.game] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const mostPlayedGame = Object.entries(gameCounts).sort((a, b) => b[1] - a[1])[0];
  const totalMatched = coupons.reduce((acc, c) => acc + (c.matchedCount || 0), 0);
  const bestResult = coupons.reduce((max, c) => Math.max(max, c.matchedCount || 0), 0);

  const handleDelete = (id: number) => {
    Alert.alert(t('deleteCoupon'), t('deleteCouponMsg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
        const updated = coupons.filter((c) => c.id !== id);
        setCoupons(updated);
        await AsyncStorage.setItem('savedCoupons', JSON.stringify(updated));
      }},
    ]);
  };

  const handleDeleteAll = () => {
    Alert.alert(t('deleteAll'), t('deleteAllMsg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
        setCoupons([]);
        await AsyncStorage.removeItem('savedCoupons');
      }},
    ]);
  };

  const handleShare = async (coupon: Coupon) => {
    try {
      const numbersText = coupon.numbers.join(' - ');
      const bonusText = coupon.bonus && coupon.bonus.length > 0
        ? `\nŞans Topu/Joker: ${coupon.bonus.join(' - ')}` : '';
      const superStarText = coupon.superStar
        ? `\n⭐ SüperStar: ${coupon.superStar}` : '';
      const message =
        `🍀 LottoAI Kuponu\n` +
        `━━━━━━━━━━━━━━━\n` +
        `🎮 Oyun: ${coupon.game}\n` +
        `📅 Tarih: ${coupon.date}\n` +
        `🎱 Sayılar: ${numbersText}${bonusText}${superStarText}\n` +
        `━━━━━━━━━━━━━━━\n` +
        `LottoAI ile üretildi 🍀`;
      await Share.share({ message });
    } catch (error) {
      Alert.alert('Hata', 'Paylaşım yapılamadı!');
    }
  };

  const getScoreLabel = (score: number, game: string) => {
    if (score === 0) return { label: 'Hiç tutmadı 😢', color: '#666' };
    const gc = GAME_COLORS[game as keyof typeof GAME_COLORS];
    const color = gc?.main || '#6C63FF';
    if (score >= 6) return { label: 'BÜYÜK İKRAMİYE! 🏆', color: '#FFD700' };
    if (score >= 4) return { label: `${score} Bildin! 🎉`, color };
    if (score >= 2) return { label: `${score} Bildin 👍`, color };
    return { label: `${score} Tutturdu`, color: '#999' };
  };

  const formatPrize = (amount: number) => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} Milyon TL`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)} Bin TL`;
    return `${amount} TL`;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('savedTitle')}</Text>
          <Text style={styles.headerSub}>{t('savedSub')}</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6C63FF" />
            <Text style={styles.loadingText}>Kuponların yükleniyor...</Text>
          </View>
        ) : (
          <>
            {coupons.length > 0 && (
              <View style={styles.statsCard}>
                <Text style={styles.statsTitle}>📊 Kupon İstatistiklerin</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{coupons.length}</Text>
                    <Text style={styles.statLabel}>Toplam Kupon</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{bestResult}</Text>
                    <Text style={styles.statLabel}>En İyi Sonuç</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{totalMatched}</Text>
                    <Text style={styles.statLabel}>Toplam Tutuşan</Text>
                  </View>
                </View>
                {mostPlayedGame && (
                  <View style={styles.mostPlayed}>
                    <Text style={styles.mostPlayedLabel}>⭐ En çok oynanan:</Text>
                    <Text style={styles.mostPlayedValue}>{mostPlayedGame[0]} ({mostPlayedGame[1]} kez)</Text>
                  </View>
                )}
              </View>
            )}

            {coupons.length > 0 && (
              <View style={styles.filterRow}>
                <TouchableOpacity
                  style={[styles.filterBtn, filterStatus === 'all' && styles.filterBtnActive]}
                  onPress={() => setFilterStatus('all')}>
                  <Text style={[styles.filterBtnText, filterStatus === 'all' && styles.filterBtnTextActive]}>
                    Tümü ({coupons.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterBtn, filterStatus === 'pending' && styles.filterBtnActive]}
                  onPress={() => setFilterStatus('pending')}>
                  <Text style={[styles.filterBtnText, filterStatus === 'pending' && styles.filterBtnTextActive]}>
                    ⏳ Bekleyen ({coupons.filter(c => c.matchedCount === undefined || c.matchedCount === null).length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterBtn, filterStatus === 'checked' && styles.filterBtnActive]}
                  onPress={() => setFilterStatus('checked')}>
                  <Text style={[styles.filterBtnText, filterStatus === 'checked' && styles.filterBtnTextActive]}>
                    ✅ Kontrol ({coupons.filter(c => c.matchedCount !== undefined && c.matchedCount !== null).length})
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {gameChips.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.gameChipRow}
                contentContainerStyle={{ paddingLeft: 20, paddingRight: 4, gap: 8 }}>
                <TouchableOpacity
                  style={[styles.gameChip, !filterGame && styles.gameChipActive]}
                  onPress={() => setFilterGame(null)}>
                  <Text style={[styles.gameChipText, !filterGame && styles.gameChipTextActive]}>
                    Tümü ({coupons.length})
                  </Text>
                </TouchableOpacity>
                {gameChips.map(chip => (
                  <TouchableOpacity
                    key={chip.game}
                    style={[
                      styles.gameChip,
                      filterGame === chip.game && {
                        backgroundColor: chip.color + '22',
                        borderColor: chip.color,
                      },
                    ]}
                    onPress={() => setFilterGame(filterGame === chip.game ? null : chip.game)}>
                    <Text style={styles.gameChipEmoji}>{chip.icon}</Text>
                    <Text
                      style={[
                        styles.gameChipText,
                        filterGame === chip.game && { color: chip.color },
                      ]}>
                      {chip.game} ({chip.count})
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.topRow}>
              <Text style={styles.sectionTitle}>Toplam {totalCoupons} Kupon</Text>
              {coupons.length > 0 && (
                <TouchableOpacity onPress={handleDeleteAll}>
                  <Text style={styles.deleteAllText}>{t('deleteAll')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {coupons.length === 0 ? (
              <View style={styles.guideCard}>
                <Text style={styles.guideEmoji}>🎲</Text>
                <Text style={styles.guideTitle}>İlk Kuponunu Üret!</Text>
                <Text style={styles.guideDesc}>
                  Henüz kayıtlı kuponun yok. Kupon Üret ekranına git, sayılarını seç ve kaydet.
                </Text>
                <TouchableOpacity
                  style={styles.guideBtn}
                  onPress={() => router.push('/(tabs)/generate' as any)}>
                  <Text style={styles.guideBtnText}>🎲 Kupon Üret</Text>
                </TouchableOpacity>
              </View>
            ) : filteredCoupons.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>🎫</Text>
                <Text style={styles.emptyTitle}>
                  {filterStatus === 'pending' ? 'Bekleyen kupon yok' :
                   filterStatus === 'checked' ? 'Kontrol edilmiş kupon yok' :
                   t('noCoupons')}
                </Text>
                <Text style={styles.emptyDesc}>
                  {filterStatus === 'all' ? t('noCouponsDesc') :
                   filterStatus === 'pending' ? 'Tüm kuponlarını kontrol ettin. Yeni kupon üretip kaydedebilirsin.' :
                   'Henüz hiçbir kuponu kontrol etmedin. Bekleyen kuponlarını kontrol edebilirsin.'}
                </Text>
              </View>
            ) : null}

            {filteredCoupons.map((coupon, index) => {
              const gc = GAME_COLORS[coupon.game as keyof typeof GAME_COLORS];
              const mainColor = gc?.main || coupon.color;
              const bonusColor = gc?.bonus || '#FF6B6B';
              const isExpanded = expandedCoupon === coupon.id;
              const couponNumber = totalCoupons - index;
              const bonusLabel = coupon.game === 'Çılgın Sayısal Loto' ? 'Joker' : 'Şans Topu';
              const isChecked = coupon.matchedCount !== undefined && coupon.matchedCount !== null;

              return (
                <View key={coupon.id}>
                  <View style={[styles.couponCard, { borderLeftColor: mainColor }]}>
                    <View style={styles.couponHeaderRow}>
                      <View style={[styles.couponNumberBadge, { backgroundColor: mainColor + '22', borderColor: mainColor + '44' }]}>
                        <Text style={[styles.couponNumberText, { color: mainColor }]}>#{couponNumber}</Text>
                      </View>
                      <Text style={styles.couponEmoji}>{coupon.icon}</Text>
                      <View style={styles.couponInfo}>
                        <Text style={styles.couponGame}>{coupon.game}</Text>
                        <Text style={styles.couponDate}>📅 {coupon.date}</Text>
                      </View>
                    </View>

                    {/* Ana sayı topları */}
                    <View style={styles.numberBalls}>
                      {coupon.numbers.map((num, i) => {
                        const isHit = coupon.matchedNumbers && coupon.matchedNumbers.includes(num);
                        let bgColor = PENDING_COLOR;
                        if (isChecked) {
                          bgColor = isHit ? mainColor : MISS_COLOR;
                        }
                        return (
                          <View key={i} style={[styles.ball, { backgroundColor: bgColor }]}>
                            <Text style={styles.ballText}>{num}</Text>
                          </View>
                        );
                      })}
                    </View>

                    {/* Bonus / Joker */}
                    {coupon.bonus && coupon.bonus.length > 0 && (
                      <>
                        <Text style={styles.bonusLabel}>🎯 {bonusLabel}</Text>
                        <View style={styles.numberBalls}>
                          {coupon.bonus.map((num, i) => {
                            const isBonusHit = coupon.matchedBonus && coupon.matchedBonus.includes(num);
                            let bgColor = PENDING_COLOR;
                            if (isChecked) {
                              bgColor = isBonusHit ? bonusColor : MISS_COLOR;
                            }
                            return (
                              <View key={i} style={[styles.ball, { backgroundColor: bgColor }]}>
                                <Text style={styles.ballText}>{num}</Text>
                              </View>
                            );
                          })}
                        </View>
                      </>
                    )}

                    {/* SüperStar */}
                    {coupon.superStar != null && coupon.game === 'Çılgın Sayısal Loto' && (
                      <>
                        <Text style={styles.bonusLabel}>⭐ SüperStar</Text>
                        <View style={styles.numberBalls}>
                          <View style={[styles.ball, {
                            backgroundColor: isChecked
                              ? (coupon.matchedSuperStar ? '#FFD700' : MISS_COLOR)
                              : PENDING_COLOR
                          }]}>
                            <Text style={[styles.ballText, (!isChecked || coupon.matchedSuperStar) && { color: '#000' }]}>
                              {coupon.superStar}
                            </Text>
                          </View>
                        </View>
                      </>
                    )}

                    <View style={styles.actionRow}>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(coupon)}>
                        <Ionicons name="share-outline" size={18} color={mainColor} />
                        <Text style={[styles.actionBtnText, { color: mainColor }]}>Paylaş</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(coupon.id)}>
                        <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                        <Text style={[styles.actionBtnText, { color: '#FF6B6B' }]}>Sil</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={[styles.historyToggle, { borderColor: mainColor + '33' }]}
                      onPress={() => setExpandedCoupon(isExpanded ? null : coupon.id)}>
                      <Text style={[styles.historyToggleText, { color: mainColor }]}>
                        📊 Geçmiş Performans {isExpanded ? '▲' : '▼'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {isExpanded && (
                    <CouponHistory
                      game={coupon.game}
                      numbers={coupon.numbers}
                      bonus={coupon.bonus}
                      superStar={coupon.superStar ?? undefined}
                    />
                  )}
                </View>
              );
            })}

            <View style={{ height: 30 }} />
          </>
        )}
      </ScrollView>

      <Modal visible={checkModal} transparent animationType="slide" onRequestClose={() => setCheckModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {checking && (
              <View style={styles.modalLoading}>
                <Text style={styles.modalLoadingText}>Kontrol ediliyor...</Text>
              </View>
            )}

            {!checking && checkResult && checkingCoupon && (() => {
              const gc = GAME_COLORS[checkingCoupon.game as keyof typeof GAME_COLORS];
              const mainColor = gc?.main || '#6C63FF';
              const bonusColor = gc?.bonus || '#FF6B6B';
              const scoreLabel = getScoreLabel(checkResult.score, checkingCoupon.game);
              const hasPrize = checkResult.prize !== null;

              return (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>✅ Kupon Sonucu</Text>
                    <Text style={styles.modalSubtitle}>{checkingCoupon.game} · {checkResult.draw.draw_date}</Text>
                  </View>

                  <View style={[styles.scoreBox, { backgroundColor: scoreLabel.color + '33', borderColor: scoreLabel.color }]}>
                    <Text style={[styles.scoreLabel, { color: scoreLabel.color }]}>{scoreLabel.label}</Text>
                  </View>

                  {hasPrize && (
                    <View style={[styles.prizeCard, { borderColor: '#FFD700' }]}>
                      <View style={styles.prizeCardInner}>
                        <Text style={styles.prizeEmoji}>💰</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.prizeTitle}>Tahmini İkramiye</Text>
                          <Text style={styles.prizeAmount}>{formatPrize(checkResult.prize!.amount)}</Text>
                          {checkResult.prize!.note ? (
                            <Text style={styles.prizeNote}>{checkResult.prize!.note}</Text>
                          ) : null}
                        </View>
                      </View>
                      <Text style={styles.prizeWarning}>
                        ⚠️ Bu tutar tahminidir. Gerçek ikramiye tutarı çekiliş sonuçlarına göre değişir. Resmi sonuçlar için bayinize danışın.
                      </Text>
                    </View>
                  )}

                  {!hasPrize && checkResult.mainMatchCount > 0 && (
                    <View style={styles.noPrizeBox}>
                      <Text style={styles.noPrizeText}>
                        ℹ️ {checkResult.mainMatchCount} ana sayı tutturdun. Bu kategoride ikramiye dağıtılmamaktadır.
                      </Text>
                    </View>
                  )}

                  <Text style={styles.modalLabel}>Senin Sayıların</Text>
                  <View style={styles.modalBalls}>
                    {checkingCoupon.numbers.map((num, i) => (
                      <View key={i} style={[styles.modalBall, { backgroundColor: checkResult.matchedNumbers.includes(num) ? mainColor : '#2a2a4a' }]}>
                        <Text style={styles.modalBallText}>{num}</Text>
                      </View>
                    ))}
                  </View>

                  {checkingCoupon.superStar != null && checkResult.draw.superstar != null && (
                    <>
                      <Text style={styles.modalLabel}>⭐ SüperStar</Text>
                      <View style={styles.modalBalls}>
                        <View style={[styles.modalBall, {
                          backgroundColor: checkResult.matchedSuperStar ? '#FFD700' : '#2a2a4a',
                        }]}>
                          <Text style={[styles.modalBallText, { color: checkResult.matchedSuperStar ? '#000' : '#fff' }]}>
                            {checkingCoupon.superStar}
                          </Text>
                        </View>
                      </View>
                    </>
                  )}

                  <Text style={styles.modalLabel}>Çekilen Sayılar</Text>
                  <ScrollView style={{ maxHeight: 150 }}>
                    <View style={styles.modalBalls}>
                      {parseNumbers(checkResult.draw.numbers).map((num, i) => (
                        <View key={i} style={[styles.modalBall, {
                          backgroundColor: checkResult.matchedNumbers.includes(num) ? mainColor : '#16213e',
                          borderWidth: 1, borderColor: mainColor,
                        }]}>
                          <Text style={styles.modalBallText}>{num}</Text>
                        </View>
                      ))}
                    </View>
                    {checkResult.draw.bonus && checkResult.draw.bonus !== '-' && (
                      <View style={[styles.modalBalls, { marginTop: 8 }]}>
                        {checkResult.draw.bonus.split(',').map((n, i) => (
                          <View key={i} style={[styles.modalBall, {
                            backgroundColor: checkResult.matchedBonus.includes(parseInt(n.trim())) ? bonusColor : '#16213e',
                            borderWidth: 1, borderColor: bonusColor,
                          }]}>
                            <Text style={styles.modalBallText}>{n.trim()}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {checkResult.draw.superstar != null && (
                      <View style={[styles.modalBalls, { marginTop: 8 }]}>
                        <View style={[styles.modalBall, {
                          backgroundColor: checkResult.matchedSuperStar ? '#FFD700' : '#16213e',
                          borderWidth: 1, borderColor: '#FFD700',
                        }]}>
                          <Text style={[styles.modalBallText, { color: checkResult.matchedSuperStar ? '#000' : '#fff' }]}>
                            {checkResult.draw.superstar}
                          </Text>
                        </View>
                      </View>
                    )}
                  </ScrollView>

                  <TouchableOpacity
                    style={styles.historyLink}
                    onPress={() => {
                      const couponId = checkingCoupon.id;
                      setCheckModal(false);
                      setTimeout(() => {
                        setExpandedCoupon(couponId);
                        scrollRef.current?.scrollToEnd({ animated: true });
                      }, 400);
                    }}>
                    <Text style={styles.historyLinkText}>
                      📊 Bu kuponun geçmiş performansını gör
                    </Text>
                  </TouchableOpacity>
                </>
              );
            })()}

            <TouchableOpacity style={styles.modalClose} onPress={() => setCheckModal(false)}>
              <Text style={styles.modalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { padding: 20, paddingTop: 20 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  headerSub: { color: '#999', fontSize: 14, marginTop: 4 },
  loadingContainer: { alignItems: 'center', padding: 80, gap: 12 },
  loadingText: { color: '#999', fontSize: 14, marginTop: 8 },
  statsCard: { backgroundColor: '#16213e', marginHorizontal: 20, padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#2a2a4a' },
  statsTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 14 },
  statsGrid: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { color: '#6C63FF', fontSize: 24, fontWeight: 'bold' },
  statLabel: { color: '#999', fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 40, backgroundColor: '#2a2a4a' },
  mostPlayed: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0f0f23', padding: 10, borderRadius: 10 },
  mostPlayedLabel: { color: '#999', fontSize: 12 },
  mostPlayedValue: { color: '#fff', fontSize: 12, fontWeight: 'bold', flex: 1 },
  filterRow: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 12, gap: 8 },
  filterBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#16213e', borderWidth: 1, borderColor: '#2a2a4a', alignItems: 'center' },
  filterBtnActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  filterBtnText: { color: '#999', fontSize: 11, fontWeight: '600' },
  filterBtnTextActive: { color: '#fff' },
  gameChipRow: { marginBottom: 14 },
  gameChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#2a2a4a', backgroundColor: '#16213e', gap: 4 },
  gameChipActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  gameChipEmoji: { fontSize: 13 },
  gameChipText: { color: '#999', fontSize: 11, fontWeight: '600' },
  gameChipTextActive: { color: '#fff' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  deleteAllText: { color: '#FF6B6B', fontSize: 14 },
  emptyContainer: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 60, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  emptyDesc: { color: '#999', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  guideCard: { marginHorizontal: 20, backgroundColor: '#16213e', borderRadius: 20, borderWidth: 1, borderColor: '#2a2a4a', padding: 28, alignItems: 'center', gap: 14, marginTop: 40 },
  guideEmoji: { fontSize: 48 },
  guideTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  guideDesc: { color: '#999', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  guideBtn: { backgroundColor: '#6C63FF', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  guideBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  couponCard: { backgroundColor: '#16213e', marginHorizontal: 20, padding: 16, borderRadius: 16, marginBottom: 8, borderLeftWidth: 4 },
  couponHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  couponNumberBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  couponNumberText: { fontSize: 12, fontWeight: 'bold' },
  couponEmoji: { fontSize: 24 },
  couponInfo: { flex: 1 },
  couponGame: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  couponDate: { color: '#999', fontSize: 12, marginTop: 2 },
  numberBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  ball: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 },
  ballText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  bonusBall: { elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 },
  bonusLabel: { color: '#999', fontSize: 12, marginBottom: 6 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'center' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#2a2a4a', backgroundColor: '#0f0f23' },
  actionBtnText: { fontSize: 12, fontWeight: '600' },
  historyToggle: { marginTop: 12, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  historyToggleText: { fontSize: 13, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalLoading: { alignItems: 'center', padding: 40 },
  modalLoadingText: { color: '#999', fontSize: 16 },
  modalHeader: { marginBottom: 16 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  modalSubtitle: { color: '#999', fontSize: 13, marginTop: 4 },
  scoreBox: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16, alignItems: 'center' },
  scoreLabel: { fontSize: 18, fontWeight: 'bold' },
  prizeCard: { backgroundColor: '#FFD70015', borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 14, gap: 10 },
  prizeCardInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  prizeEmoji: { fontSize: 32 },
  prizeTitle: { color: '#FFD700', fontSize: 13, fontWeight: 'bold' },
  prizeAmount: { color: '#FFD700', fontSize: 26, fontWeight: 'bold', marginTop: 2 },
  prizeNote: { color: '#FFD70099', fontSize: 12, marginTop: 2 },
  prizeWarning: { color: '#FFD70088', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  noPrizeBox: { backgroundColor: '#16213e', borderWidth: 1, borderColor: '#2a2a4a', borderRadius: 10, padding: 12, marginBottom: 14 },
  noPrizeText: { color: '#999', fontSize: 12, textAlign: 'center' },
  modalLabel: { color: '#999', fontSize: 12, marginBottom: 8 },
  modalBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  modalBall: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  modalBallText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  modalClose: { backgroundColor: '#2a2a4a', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  modalCloseText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  historyLink: {
    backgroundColor: '#6C63FF15',
    borderWidth: 1,
    borderColor: '#6C63FF44',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  historyLinkText: {
    color: '#6C63FF',
    fontSize: 13,
    fontWeight: '600',
  },
});