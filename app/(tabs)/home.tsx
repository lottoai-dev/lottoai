// tabs_home.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Dimensions,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GAME_COLORS, getDayLabel, getDefaultCountry, getGameByName, getGamesByCountry } from '../../lib/games';
import { t } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 40;

function getTodayIndex(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

type LastDraw = {
  game: string;
  numbers: string;
  bonus: string;
  superstar?: number | null;
  draw_date: string;
  draw_no: string;
  created_at: string;
  estimated_prize?: number | null;
};

type NewDrawNotif = {
  game: string;
  icon: string;
  color: string;
  draw_date: string;
};

function getNextDraw() {
  const now = new Date();
  let nextGame = null;
  let minDiff = Infinity;

  // Sadece kullanıcının ülkesine ait oyunları tara
  const countryGames = getGamesByCountry(getDefaultCountry());

  for (const game of countryGames) {
    for (const day of game.drawDays) {
      const next = new Date();
      next.setHours(game.drawHour, game.drawMinute, 0, 0);
      const currentDay = now.getDay();
      let daysUntil = day - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      if (daysUntil === 0 && next <= now) daysUntil = 7;
      next.setDate(next.getDate() + daysUntil);
      const diff = next.getTime() - now.getTime();
      if (diff < minDiff) {
        minDiff = diff;
        nextGame = { game, next, diff };
      }
    }
  }
  return nextGame;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} gün ${hours % 24} saat`;
  }
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function parseNumbers(str: string): number[] {
  return str.split(' - ').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
}

function formatPrize(amount: number, currency: string = 'TRY'): string {
  if (currency === 'USD') {
    if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)} Billion`;
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)} Million`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
    return `$${amount}`;
  }
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} Milyar TL`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} Milyon TL`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)} Bin TL`;
  return `${amount} TL`;
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [nextDraw, setNextDraw] = useState(getNextDraw());
  const [countdown, setCountdown] = useState('');
  const [newDrawNotifs, setNewDrawNotifs] = useState<NewDrawNotif[]>([]);
  const [lastDraws, setLastDraws] = useState<LastDraw[]>([]);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const scaleAnim = useState(new Animated.Value(0.95))[0];
  const todayIndex = getTodayIndex();
  const [userName, setUserName] = useState('');
  const [pendingCoupons, setPendingCoupons] = useState(0);
  const [todayDrawCount, setTodayDrawCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kullanıcının ülkesi ve oyunları
  const userCountry = getDefaultCountry();
  const countryGames = useMemo(() => getGamesByCountry(userCountry), [userCountry]);
  const locale = countryGames[0]?.locale || 'tr-TR';

  const weekSchedule = useMemo(() => {
    const schedule: { day: number; label: string; games: { name: string; icon: string; time: string }[] }[] = [];
    for (let d = 0; d < 7; d++) {
      const jsDay = d === 6 ? 0 : d + 1;
      const gamesOfDay = countryGames
        .filter(g => g.drawDays.includes(jsDay))
        .map(g => ({
          name: g.name,
          icon: g.icon,
          time: `${g.drawHour}:${String(g.drawMinute).padStart(2, '0')}`,
        }));
      schedule.push({ day: d, label: getDayLabel(d, locale), games: gamesOfDay });
    }
    return schedule;
  }, [countryGames, locale]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
    ]).start();

    const interval = setInterval(() => {
      const next = getNextDraw();
      setNextDraw(next);
      if (next) setCountdown(formatCountdown(next.diff));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadSmartSummary = useCallback(async () => {
    try {
      const savedName = await AsyncStorage.getItem('userName');
      if (savedName) setUserName(savedName);

      const couponsRaw = await AsyncStorage.getItem('savedCoupons');
      if (couponsRaw) {
        const coupons = JSON.parse(couponsRaw);
        const pending = coupons.filter((c: any) => 
          c.matchedCount === undefined || c.matchedCount === null
        ).length;
        setPendingCoupons(pending);
      }

      const now = new Date();
      const today = now.getDay();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const count = countryGames.filter(g => {
        if (!g.drawDays.includes(today)) return false;
        const drawTime = g.drawHour * 60 + g.drawMinute;
        const currentTime = currentHour * 60 + currentMinute;
        return drawTime > currentTime;
      }).length;
      setTodayDrawCount(count);
    } catch (e) {}
  }, [countryGames]);

  const fetchLastDraws = useCallback(async () => {
    try {
      const gameNames = countryGames.map(g => g.name);
      const settled = await Promise.allSettled(
        gameNames.map((gameName) =>
          supabase
            .from('draws')
            .select('*')
            .eq('game', gameName)
            .order('draw_date_parsed', { ascending: false })
            .limit(1)
            .single()
        )
      );
      const results: LastDraw[] = settled
        .filter((r) => r.status === 'fulfilled' && r.value.data)
        .map((r) => (r as PromiseFulfilledResult<any>).value.data as LastDraw);
      results.sort((a, b) => {
        const dateA = a.draw_date.split('.').reverse().join('-');
        const dateB = b.draw_date.split('.').reverse().join('-');
        return dateB.localeCompare(dateA);
      });
      setLastDraws(results);
    } catch (e) {}
  }, [countryGames]);

  const checkNewDraws = useCallback(async () => {
    try {
      const lastSeenKey = 'lastSeenDrawDate';
      const lastSeen = await AsyncStorage.getItem(lastSeenKey);
      const today = new Date().toLocaleDateString('tr-TR');
      if (lastSeen === today) return;

      const settled = await Promise.allSettled(
        countryGames.map((game) =>
          supabase
            .from('draws')
            .select('game, draw_date')
            .eq('game', game.name)
            .order('draw_date_parsed', { ascending: false })
            .limit(1)
            .single()
        )
      );

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const notifs: NewDrawNotif[] = [];
      settled.forEach((result, index) => {
        if (result.status !== 'fulfilled' || !result.value.data) return;
        const data = result.value.data;
        const game = countryGames[index];
        const gc = GAME_COLORS[game.name as keyof typeof GAME_COLORS];
        const drawDate = new Date(data.draw_date.split('.').reverse().join('-'));
        if (drawDate >= yesterday) {
          notifs.push({ game: game.name, icon: game.icon, color: gc?.main || '#6C63FF', draw_date: data.draw_date });
        }
      });

      if (notifs.length > 0) {
        setNewDrawNotifs(notifs);
        await AsyncStorage.setItem(lastSeenKey, today);
      }
    } catch (e) {}
  }, [countryGames]);

  const loadAllData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await Promise.all([
        checkNewDraws(),
        fetchLastDraws(),
        loadSmartSummary(),
      ]);
    } catch (e) {
      setError('Veriler yüklenirken bir sorun oluştu.');
    } finally {
      setLoading(false);
    }
  }, [checkNewDraws, fetchLastDraws, loadSmartSummary]);

  useFocusEffect(
    useCallback(() => {
      loadAllData();
    }, [loadAllData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  }, [loadAllData]);

  const dismissNotif = useCallback((index: number) => {
    setNewDrawNotifs(prev => prev.filter((_, i) => i !== index));
  }, []);

  const getGameIcon = useCallback((gameName: string) => {
    return getGameByName(gameName)?.icon || '🎱';
  }, []);

  const getGameId = useCallback((gameName: string): string => {
    const game = getGameByName(gameName);
    return game?.id || 'cilgin';
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f23" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6C63FF"
            colors={['#6C63FF']}
            progressBackgroundColor="#1a1a2e"
          />
        }>

        {/* Header */}
        <LinearGradient colors={['#0f0f23', '#1a1a3e', '#1a1a2e']} style={styles.headerGradient}>
          <Animated.View style={[styles.header, { opacity: fadeAnim, paddingTop: insets.top + 12 }]}>
            <View>
              <Text style={styles.greeting}>
                {userName ? `Merhaba, ${userName}! 👋` : t('welcome')}
              </Text>
              <Text style={styles.appName}>{t('appName')}</Text>
              <Text style={styles.appSubtitle}>{t('smartCoupon')}</Text>
            </View>
            <LinearGradient colors={['#6C63FF', '#4834d4']} style={styles.logoGradient}>
              <Text style={styles.logoEmoji}>🍀</Text>
            </LinearGradient>
          </Animated.View>

          {error && (
            <View style={styles.errorCard}>
              <Text style={styles.errorEmoji}>⚠️</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadAllData}>
                <Text style={styles.retryBtnText}>{t('retry')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {!error && (pendingCoupons > 0 || todayDrawCount > 0) && (
            <View style={styles.smartSummaryCard}>
              {pendingCoupons > 0 && (
                <TouchableOpacity
                  style={styles.smartSummaryRow}
                  onPress={() => router.push('/(tabs)/saved' as any)}>
                  <Text style={styles.smartSummaryEmoji}>🎯</Text>
                  <Text style={styles.smartSummaryText}>
                    <Text style={styles.smartSummaryHighlight}>{pendingCoupons} kuponun</Text>
                    {' '}sonuç bekliyor
                  </Text>
                  <Text style={styles.smartSummaryArrow}>→</Text>
                </TouchableOpacity>
              )}
              {todayDrawCount > 0 && (
                <TouchableOpacity
                  style={[styles.smartSummaryRow, pendingCoupons > 0 && { borderTopWidth: 1, borderTopColor: '#2a2a4a' }]}
                  onPress={() => router.push('/(tabs)/generate' as any)}>
                  <Text style={styles.smartSummaryEmoji}>🎰</Text>
                  <Text style={styles.smartSummaryText}>
                    Bugün{' '}
                    <Text style={styles.smartSummaryHighlight}>{todayDrawCount} çekiliş</Text>
                    {' '}var
                  </Text>
                  <Text style={styles.smartSummaryArrow}>→</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!error && newDrawNotifs.map((notif, index) => (
            <View key={index} style={[styles.notifBanner, { borderLeftColor: notif.color }]}>
              <Text style={styles.notifEmoji}>{notif.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.notifTitle}>🆕 Yeni Sonuç!</Text>
                <Text style={styles.notifText}>{notif.game} · {notif.draw_date}</Text>
              </View>
              <TouchableOpacity
                style={[styles.notifBtn, { backgroundColor: notif.color }]}
                onPress={() => { dismissNotif(index); router.push(`/results?game=${getGameId(notif.game)}` as any); }}>
                <Text style={styles.notifBtnText}>Gör →</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => dismissNotif(index)} style={styles.notifClose}>
                <Text style={styles.notifCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {!error && nextDraw && (() => {
            const gc = GAME_COLORS[nextDraw.game.name as keyof typeof GAME_COLORS];
            const color = gc?.main || '#6C63FF';
            return (
              <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => router.push(`/(tabs)/generate?game=${nextDraw.game.id}` as any)}>
                  <LinearGradient
                    colors={[color + '33', color + '11']}
                    style={[styles.countdownCard, { borderColor: color + '66' }]}>
                    <Text style={styles.countdownLabel}>{t('nextDraw')}</Text>
                    <Text style={[styles.countdownGame, { color }]}>
                      {nextDraw.game.icon} {nextDraw.game.name}
                    </Text>
                    <Text style={styles.countdownTimer}>{countdown}</Text>
                    <Text style={styles.countdownDate}>
                      📅 {nextDraw.next.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })} · {nextDraw.game.drawHour}:{nextDraw.game.drawMinute.toString().padStart(2, '0')}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            );
          })()}
        </LinearGradient>

        {/* Son Çekilişler */}
        {!error && lastDraws.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Son Çekilişler 📡</Text>
              <TouchableOpacity onPress={() => router.push('/results' as any)}>
                <Text style={styles.seeAll}>Tümü →</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              pagingEnabled
              decelerationRate="fast"
              snapToInterval={CARD_WIDTH + 16}
              snapToAlignment="start"
              contentContainerStyle={{ paddingLeft: 20, paddingRight: 20 }}>
              {lastDraws.map((draw, index) => {
                const gc = GAME_COLORS[draw.game as keyof typeof GAME_COLORS];
                const mainColor = gc?.main || '#6C63FF';
                const bonusColor = gc?.bonus || '#FF6B6B';
                const icon = getGameIcon(draw.game);
                const nums = parseNumbers(draw.numbers);
                const gameCurrency = getGameByName(draw.game)?.currency || 'TRY';

                return (
                  <TouchableOpacity key={index} activeOpacity={0.9} onPress={() => router.push(`/results?game=${getGameId(draw.game)}` as any)}>
                    <LinearGradient
                      colors={[mainColor + '33', '#16213e']}
                      style={[styles.lastDrawCard, { borderColor: mainColor + '66', width: CARD_WIDTH }]}>
                      <View style={styles.lastDrawHeader}>
                        <Text style={styles.lastDrawEmoji}>{icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.lastDrawGame}>{draw.game}</Text>
                          <Text style={styles.lastDrawDate}>📅 {draw.draw_date}</Text>
                        </View>
                      </View>
                      <View style={styles.lastDrawNumbers}>
                        {nums.map((num, i) => (
                          <View key={i} style={[styles.lastDrawBall, { backgroundColor: mainColor }]}>
                            <Text style={styles.lastDrawBallText}>{num}</Text>
                          </View>
                        ))}
                      </View>
                      {draw.bonus && draw.bonus !== '-' && (
                        <View style={styles.lastDrawBonus}>
                          <Text style={styles.lastDrawBonusLabel}>🎯 </Text>
                          <View style={[styles.lastDrawBall, { backgroundColor: bonusColor }]}>
                            <Text style={styles.lastDrawBallText}>{draw.bonus}</Text>
                          </View>
                        </View>
                      )}
                      {draw.superstar != null && draw.superstar > 0 && (
                        <View style={styles.lastDrawBonus}>
                          <Text style={styles.lastDrawBonusLabel}>⭐ </Text>
                          <View style={[styles.lastDrawBall, { backgroundColor: '#FFD700' }]}>
                            <Text style={[styles.lastDrawBallText, { color: '#000' }]}>{draw.superstar}</Text>
                          </View>
                        </View>
                      )}
                      {draw.estimated_prize != null && draw.estimated_prize > 0 && (
                        <View style={styles.prizeRow}>
                          <Text style={styles.prizeLabel}>💰 Büyük İkramiye</Text>
                          <Text style={[styles.prizeAmount, { color: '#FFD700' }]}>
                            {formatPrize(draw.estimated_prize, gameCurrency)}
                          </Text>
                        </View>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {!error && !loading && lastDraws.length === 0 && (
          <View style={styles.guideCard}>
            <Text style={styles.guideEmoji}>🎉</Text>
            <Text style={styles.guideTitle}>Hoş Geldin!</Text>
            <Text style={styles.guideDesc}>
              Henüz bir çekiliş verisi yok.{'\n'}
              Şimdi ilk adımını at, kuponunu üret!
            </Text>
            <View style={styles.guideButtons}>
              <TouchableOpacity
                style={styles.guideBtn}
                onPress={() => router.push('/(tabs)/generate' as any)}>
                <Text style={styles.guideBtnEmoji}>🎲</Text>
                <Text style={styles.guideBtnText}>Kupon Üret</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.guideBtn, { backgroundColor: '#6C63FF18', borderColor: '#6C63FF44' }]}
                onPress={() => router.push('/(tabs)/notifications' as any)}>
                <Text style={styles.guideBtnEmoji}>🔔</Text>
                <Text style={[styles.guideBtnText, { color: '#6C63FF' }]}>Hatırlatıcıları Ayarla</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.guideFootnote}>
              Çekiliş sonuçları sisteme girildiğinde burada görünecek.
            </Text>
          </View>
        )}

        {!error && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Haftalık Takvim 📅</Text>
            </View>
            <View style={styles.scheduleContainer}>
              {weekSchedule.map((dayItem) => {
                const isToday = dayItem.day === todayIndex;
                return (
                  <View key={dayItem.day} style={[styles.scheduleRow, isToday && styles.scheduleTodayRow]}>
                    <View style={styles.scheduleDayBadge}>
                      <Text style={[styles.scheduleDayText, isToday && { color: '#6C63FF', fontWeight: 'bold' }]}>
                        {dayItem.label}
                      </Text>
                      {isToday && <Text style={styles.scheduleTodayDot}>●</Text>}
                    </View>
                    <View style={styles.scheduleGames}>
                      {dayItem.games.length === 0 ? (
                        <Text style={{ color: '#444', fontSize: 12 }}>—</Text>
                      ) : (
                        dayItem.games.map((g, i) => {
                          const gc2 = GAME_COLORS[g.name as keyof typeof GAME_COLORS];
                          const color = gc2?.main || '#6C63FF';
                          return (
                            <View key={i} style={[styles.scheduleGameChip, { backgroundColor: color + '22', borderColor: color + '66' }]}>
                              <Text style={styles.scheduleGameEmoji}>{g.icon}</Text>
                              <Text style={[styles.scheduleGameTime, { color }]}>{g.time}</Text>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  headerGradient: { paddingBottom: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50 },
  greeting: { color: '#999', fontSize: 14 },
  appName: { color: '#fff', fontSize: 32, fontWeight: 'bold', letterSpacing: 1 },
  appSubtitle: { color: '#6C63FF', fontSize: 12, marginTop: 2 },
  logoGradient: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  logoEmoji: { fontSize: 28 },
  errorCard: { marginHorizontal: 20, marginBottom: 12, backgroundColor: '#FF6B6B11', borderWidth: 1, borderColor: '#FF6B6B44', borderRadius: 16, padding: 20, alignItems: 'center', gap: 12 },
  errorEmoji: { fontSize: 36 },
  errorText: { color: '#FF6B6B', fontSize: 14, textAlign: 'center' },
  retryBtn: { backgroundColor: '#FF6B6B22', borderWidth: 1, borderColor: '#FF6B6B', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: '#FF6B6B', fontSize: 14, fontWeight: 'bold' },
  notifBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#16213e', marginHorizontal: 20, marginBottom: 10, padding: 12, borderRadius: 12, borderLeftWidth: 4, gap: 10 },
  notifEmoji: { fontSize: 24 },
  notifTitle: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  notifText: { color: '#999', fontSize: 12, marginTop: 2 },
  notifBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  notifBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  notifClose: { padding: 4 },
  notifCloseText: { color: '#666', fontSize: 14 },
  countdownCard: { marginHorizontal: 20, padding: 20, borderRadius: 20, borderWidth: 1, alignItems: 'center', gap: 6 },
  countdownLabel: { color: '#999', fontSize: 13 },
  countdownGame: { fontSize: 16, fontWeight: 'bold' },
  countdownTimer: { color: '#fff', fontSize: 42, fontWeight: 'bold', fontVariant: ['tabular-nums'], letterSpacing: 2 },
  countdownDate: { color: '#999', fontSize: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 20, marginBottom: 12 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  seeAll: { color: '#6C63FF', fontSize: 14, fontWeight: 'bold' },
  lastDrawCard: { marginRight: 16, padding: 20, borderRadius: 20, borderWidth: 1.5, minHeight: 200, justifyContent: 'center' },
  lastDrawHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  lastDrawEmoji: { fontSize: 32 },
  lastDrawGame: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  lastDrawDate: { color: '#999', fontSize: 12, marginTop: 3 },
  lastDrawNumbers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, justifyContent: 'center' },
  lastDrawBall: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  lastDrawBallText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  lastDrawBonus: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  lastDrawBonusLabel: { color: '#999', fontSize: 14 },
  prizeRow: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#2a2a4a', alignItems: 'center' },
  prizeLabel: { color: '#999', fontSize: 12 },
  prizeAmount: { fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  guideCard: { marginHorizontal: 20, backgroundColor: '#16213e', borderRadius: 20, borderWidth: 1, borderColor: '#2a2a4a', padding: 28, alignItems: 'center', gap: 14, marginBottom: 24 },
  guideEmoji: { fontSize: 48 },
  guideTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  guideDesc: { color: '#999', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  guideButtons: { flexDirection: 'row', gap: 10, width: '100%' },
  guideBtn: { flex: 1, backgroundColor: '#0f0f23', borderWidth: 1, borderColor: '#2a2a4a', borderRadius: 14, padding: 14, alignItems: 'center', gap: 6 },
  guideBtnEmoji: { fontSize: 22 },
  guideBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  guideFootnote: { color: '#555', fontSize: 11, textAlign: 'center' },
  scheduleContainer: { marginHorizontal: 20, marginBottom: 30, backgroundColor: '#16213e', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a4a' },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a4a' },
  scheduleTodayRow: { backgroundColor: '#6C63FF11' },
  scheduleDayBadge: { width: 70, flexDirection: 'row', alignItems: 'center', gap: 4 },
  scheduleDayText: { color: '#999', fontSize: 13, fontWeight: '600' },
  scheduleTodayDot: { color: '#6C63FF', fontSize: 8 },
  scheduleGames: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scheduleGameChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, gap: 4 },
  scheduleGameEmoji: { fontSize: 14 },
  scheduleGameTime: { fontSize: 12, fontWeight: 'bold' },
  smartSummaryCard: { marginHorizontal: 20, marginBottom: 12, backgroundColor: '#16213e', borderRadius: 16, borderWidth: 1, borderColor: '#2a2a4a', overflow: 'hidden' },
  smartSummaryRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  smartSummaryEmoji: { fontSize: 20 },
  smartSummaryText: { flex: 1, color: '#ccc', fontSize: 14 },
  smartSummaryHighlight: { color: '#fff', fontWeight: 'bold' },
  smartSummaryArrow: { color: '#6C63FF', fontSize: 16, fontWeight: 'bold' },
});