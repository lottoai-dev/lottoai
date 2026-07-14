// app/(tabs)/home.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Dimensions,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPrize } from '../../lib/prizeEstimates';

import { AppButton } from '../../components/ui/app-button';
import { NumberBall } from '../../components/ui/number-ball';
import { PressableScale, Surface } from '../../components/ui/surface';
import { STORAGE_KEYS } from '../../constants/storage-keys';
import { AppTheme, GameAccent } from '../../constants/theme';
import { useBildirim } from '../../contexts/BildirimContext';
import { BrandMark, GameEmblem } from '../../lib/emblems';
import {
    getDayLabel,
    getDefaultCountry,
    getGameByName,
    getGamesByCountry,
} from '../../lib/games';
import {
    AIAssistantIcon,
    ArrowRightIcon,
    BellIcon,
    CalendarIcon,
    ChevronRightIcon,
    ClockIcon,
    SparkIcon,
    TicketIcon,
    WifiOffIcon,
} from '../../lib/icons';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 64;
const ON_NUMARA_PREVIEW_COUNT = 7;
const LAST_SEEN_PREFIX = 'lastSeenResult_';

function softHaptic() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

/* ----------------------------- helpers ----------------------------- */
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
  estimated_prize?: number | null;
};

function getNextDraw() {
  const now = new Date();
  let nextGame: any = null;
  let minDiff = Infinity;
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

function countdownParts(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

const pad = (n: number) => n.toString().padStart(2, '0');

function parseNumbers(str: string): number[] {
  return str.split(' - ').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
}

function gameMeta(name: string) {
  const game = getGameByName(name);
  const id = game?.id ?? 'cilgin';
  return { game, id, color: GameAccent[id] ?? '#1C9E73' };
}

/* ----------------------------- section ----------------------------- */
function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const theme = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={() => { softHaptic(); onAction?.(); }} hitSlop={8}>
          <Text style={s.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------ screen ----------------------------- */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const { unreadCount } = useBildirim();

  const [nextDraw, setNextDraw] = useState(getNextDraw());
  const [parts, setParts] = useState(countdownParts(nextDraw?.diff ?? 0));
  const [lastDraws, setLastDraws] = useState<LastDraw[]>([]);
  const [userName, setUserName] = useState('');
  const [pendingCoupons, setPendingCoupons] = useState(0);
  const [todayDrawCount, setTodayDrawCount] = useState(0);
  const [newResults, setNewResults] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayIndex = getTodayIndex();

  const userCountry = getDefaultCountry();
  const countryGames = useMemo(() => getGamesByCountry(userCountry), [userCountry]);
  const locale = countryGames[0]?.locale || 'tr-TR';

  const weekSchedule = useMemo(() => {
    const schedule: { day: number; label: string; games: { id: string; name: string; time: string }[] }[] = [];
    for (let d = 0; d < 7; d++) {
      const jsDay = d === 6 ? 0 : d + 1;
      const gamesOfDay = countryGames
        .filter((g) => g.drawDays.includes(jsDay))
        .map((g) => ({ id: g.id, name: g.name, time: `${g.drawHour}:${pad(g.drawMinute)}` }));
      schedule.push({ day: d, label: getDayLabel(d, locale), games: gamesOfDay });
    }
    return schedule;
  }, [countryGames, locale]);

  useEffect(() => {
    const interval = setInterval(() => {
      const next = getNextDraw();
      setNextDraw(next);
      if (next) setParts(countdownParts(next.diff));
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
        const pending = coupons.filter(
          (cp: any) => cp.matchedCount === undefined || cp.matchedCount === null
        ).length;
        setPendingCoupons(pending);
      }
      const now = new Date();
      const today = now.getDay();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const count = countryGames.filter((g) => {
        if (!g.drawDays.includes(today)) return false;
        return g.drawHour * 60 + g.drawMinute > currentTime;
      }).length;
      setTodayDrawCount(count);
    } catch {}
  }, [countryGames]);

  const checkNewResults = useCallback(async () => {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const settled = await Promise.all(
        countryGames.map(async (game) => {
          const [{ data }, lastSeen] = await Promise.all([
            supabase
              .from('draws')
              .select('draw_date')
              .eq('game', game.name)
              .order('draw_date_parsed', { ascending: false })
              .limit(1)
              .single(),
            AsyncStorage.getItem(LAST_SEEN_PREFIX + game.name),
          ]);
          if (!data) return null;
          if (lastSeen === data.draw_date) return null;
          const drawDate = new Date(data.draw_date.split('.').reverse().join('-'));
          return drawDate >= yesterday ? game.name : null;
        })
      );
      setNewResults(settled.filter((name): name is string => name != null));
    } catch {}
  }, [countryGames]);

  const fetchLastDraws = useCallback(async () => {
    try {
      const gameNames = countryGames.map((g) => g.name);
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
        .filter((r) => r.status === 'fulfilled' && (r as any).value.data)
        .map((r) => (r as PromiseFulfilledResult<any>).value.data as LastDraw);
      results.sort((a, b) => {
        const da = a.draw_date.split('.').reverse().join('-');
        const db = b.draw_date.split('.').reverse().join('-');
        return db.localeCompare(da);
      });
      setLastDraws(results);
      AsyncStorage.setItem(STORAGE_KEYS.LAST_DRAWS_CACHE, JSON.stringify(results)).catch(() => {});
    } catch {}
  }, [countryGames]);

  // Önceki oturumdan cache'i hemen göster — ağ gelene kadar boş ekran olmasın
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEYS.LAST_DRAWS_CACHE)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const cached = JSON.parse(raw) as LastDraw[];
          if (Array.isArray(cached) && cached.length > 0) {
            setLastDraws((prev) => (prev.length > 0 ? prev : cached));
          }
        } catch {}
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await Promise.all([fetchLastDraws(), loadSmartSummary(), checkNewResults()]);
    } catch {
      setError('Veriler yüklenirken bir sorun oluştu.');
    } finally {
      setLoading(false);
    }
  }, [fetchLastDraws, loadSmartSummary, checkNewResults]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const markSeen = useCallback(async (gameName: string) => {
    setNewResults((prev) => prev.filter((g) => g !== gameName));
    try {
      const { data } = await supabase
        .from('draws')
        .select('draw_date')
        .eq('game', gameName)
        .order('draw_date_parsed', { ascending: false })
        .limit(1)
        .single();
      if (data) await AsyncStorage.setItem(LAST_SEEN_PREFIX + gameName, data.draw_date);
    } catch {}
  }, []);

  const next = nextDraw ? gameMeta(nextDraw.game.name) : null;
  const showDays = parts.days > 0;

  const blocks = showDays
    ? [
        { v: pad(parts.days), l: 'Gün' },
        { v: pad(parts.hours), l: 'Saat' },
        { v: pad(parts.minutes), l: 'Dakika' },
      ]
    : [
        { v: pad(parts.hours), l: 'Saat' },
        { v: pad(parts.minutes), l: 'Dakika' },
        { v: pad(parts.seconds), l: 'Saniye' },
      ];

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} colors={[c.brand]} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <BrandMark size={42} />
            <View>
              <Text style={s.greeting}>{userName ? `Merhaba, ${userName}` : 'Merhaba'}</Text>
              <Text style={s.brand}>LottoAI</Text>
            </View>
          </View>
          <View style={s.headerActions}>
            <PressableScale style={s.iconBtn} onPress={() => { softHaptic(); router.push('/(tabs)/ai-assistant' as any); }}>
              <AIAssistantIcon color={c.brand} size={20} />
            </PressableScale>
            <PressableScale style={s.iconBtn} onPress={() => { softHaptic(); router.push('/(tabs)/bildirimler' as any); }}>
              <BellIcon color={c.text2} size={20} />
              {unreadCount > 0 ? (
                <View style={[s.dot, { borderColor: c.surface }]}>
                  {unreadCount > 1 ? (
                    <Text style={s.dotText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  ) : null}
                </View>
              ) : null}
            </PressableScale>
          </View>
        </View>

        {error ? (
          <Surface style={s.errorCard}>
            <WifiOffIcon color={c.danger} size={30} />
            <Text style={s.errorText}>{error}</Text>
            <AppButton label="Tekrar dene" variant="secondary" size="md" fullWidth={false} onPress={() => { softHaptic(); loadAll(); }} />
          </Surface>
        ) : null}

        {/* Countdown hero */}
        {!error && next ? (
          <Surface elevated style={s.hero}>
              <View style={[s.heroAccent, { backgroundColor: next.color }]} />
              <View style={s.heroBody}>
                <View style={s.heroTop}>
                  <Text style={s.heroLabel}>SONRAKİ ÇEKİLİŞ</Text>
                  <View style={[s.gamePill, { backgroundColor: next.color + '14' }]}>
                    <View style={[s.gameDot, { backgroundColor: next.color }]} />
                    <Text style={[s.gamePillText, { color: next.color }]}>{nextDraw.game.name}</Text>
                  </View>
                </View>

                <View style={s.timerRow}>
                  {blocks.map((b) => (
                    <View
                      key={b.l}
                      style={[s.timerBlock, { backgroundColor: next.color + '10', borderColor: next.color + '22' }]}
                    >
                      <Text style={s.timerNum}>{b.v}</Text>
                      <Text style={s.timerUnit}>{b.l}</Text>
                    </View>
                  ))}
                </View>

                <View style={s.heroDateRow}>
                  <ClockIcon color={c.text2} size={15} />
                  <Text style={s.heroDate}>
                    {nextDraw.next.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
                    {nextDraw.game.drawHour}:{pad(nextDraw.game.drawMinute)}
                  </Text>
                </View>

                <AppButton
                  label="Kupon üret"
                  onPress={() => { softHaptic(); router.push(`/(tabs)/generate?game=${nextDraw.game.id}` as any); }}
                  iconRight={(color, size) => <ArrowRightIcon color={color} size={size} />}
                  style={{ marginTop: 16 }}
                />
              </View>
            </Surface>
        ) : null}

        {/* Smart summary */}
        {!error && (pendingCoupons > 0 || todayDrawCount > 0) ? (
          <Surface style={s.summary}>
            {pendingCoupons > 0 ? (
              <PressableScale style={s.summaryRow} onPress={() => { softHaptic(); router.push('/(tabs)/saved' as any); }}>
                <View style={[s.summaryIcon, { backgroundColor: c.brandSoft }]}>
                  <TicketIcon color={c.brand} size={20} />
                </View>
                <Text style={s.summaryText}>
                  <Text style={s.summaryStrong}>{pendingCoupons} kuponun</Text> sonuç bekliyor
                </Text>
                <ChevronRightIcon color={c.text3} size={18} />
              </PressableScale>
            ) : null}
            {pendingCoupons > 0 && todayDrawCount > 0 ? <View style={s.divider} /> : null}
            {todayDrawCount > 0 ? (
              <PressableScale style={s.summaryRow} onPress={() => { softHaptic(); router.push('/(tabs)/generate' as any); }}>
                <View style={[s.summaryIcon, { backgroundColor: c.goldSoft }]}>
                  <SparkIcon color={c.gold} size={20} />
                </View>
                <Text style={s.summaryText}>
                  Bugün <Text style={s.summaryStrong}>{todayDrawCount} çekiliş</Text> var
                </Text>
                <ChevronRightIcon color={c.text3} size={18} />
              </PressableScale>
            ) : null}
          </Surface>
        ) : null}

        {/* Last draws */}
        {!error && lastDraws.length > 0 ? (
          <>
            <SectionHeader title="Son çekilişler" action="Tümü" onAction={() => router.push('/results' as any)} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={CARD_WIDTH + 14}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
            >
              {lastDraws.map((draw, index) => {
                const meta = gameMeta(draw.game);
                const nums = parseNumbers(draw.numbers);
                const isOnNumara = meta.id === 'onnumara';
                const displayNums = isOnNumara ? nums.slice(0, ON_NUMARA_PREVIEW_COUNT) : nums;
                const hiddenCount = isOnNumara ? Math.max(0, nums.length - ON_NUMARA_PREVIEW_COUNT) : 0;
                const currency = meta.game?.currency || 'TRY';
                const isNew = newResults.includes(draw.game);
                return (
                  <PressableScale
                    key={index}
                    onPress={() => {
                      softHaptic();
                      if (isNew) markSeen(draw.game);
                      router.push(`/results?game=${meta.id}` as any);
                    }}
                    style={[s.drawCard, { width: CARD_WIDTH }]}
                  >
                    {isNew ? (
                      <View style={[s.newBadge, { backgroundColor: c.danger }]}>
                        <Text style={s.newBadgeText}>Yeni</Text>
                      </View>
                    ) : null}
                    <View style={s.drawHeader}>
                      <GameEmblem game={meta.id} size={40} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.drawGame}>{draw.game}</Text>
                        <View style={s.drawDateRow}>
                          <CalendarIcon color={c.text3} size={14} />
                          <Text style={s.drawDate}>{draw.draw_date} · {draw.draw_no}. çekiliş</Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.drawNumbers}>
                      {displayNums.map((n, i) => (
                        <NumberBall key={i} value={n} color={meta.color} size={34} />
                      ))}
                      {!isOnNumara && draw.bonus && draw.bonus !== '-' ? (
                        <NumberBall value={draw.bonus} variant="bonus" size={34} />
                      ) : null}
                      {!isOnNumara && draw.superstar != null && draw.superstar > 0 ? (
                        <NumberBall value={draw.superstar} variant="star" size={34} />
                      ) : null}
                      {hiddenCount > 0 ? (
                        <NumberBall
                          value={`+${hiddenCount}`}
                          variant="muted"
                          size={34}
                          style={{ backgroundColor: `${meta.color}28`, borderColor: `${meta.color}55` }}
                        />
                      ) : null}
                    </View>
                    {draw.estimated_prize != null && draw.estimated_prize > 0 ? (
                      <View style={s.prizeRow}>
                        <Text style={s.prizeLabel}>Büyük ikramiye</Text>
                        <Text style={s.prizeAmount}>{formatPrize(draw.estimated_prize, currency)}</Text>
                      </View>
                    ) : null}
                  </PressableScale>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        {/* Empty welcome */}
        {!error && !loading && lastDraws.length === 0 ? (
          <Surface style={s.emptyCard}>
            <View style={[s.emptyIcon, { backgroundColor: c.brandSoft }]}>
              <SparkIcon color={c.brand} size={28} />
            </View>
            <Text style={s.emptyTitle}>Hoş geldin</Text>
            <Text style={s.emptyDesc}>Henüz çekiliş verisi yok. İlk kuponunu üreterek başla.</Text>
            <AppButton
              label="Kupon üret"
              onPress={() => { softHaptic(); router.push('/(tabs)/generate' as any); }}
              style={{ marginTop: 4 }}
            />
          </Surface>
        ) : null}

        {/* Weekly schedule */}
        {!error ? (
          <>
            <SectionHeader title="Haftalık takvim" />
            <Surface style={s.schedule}>
              {weekSchedule.map((row, i) => {
                const isToday = row.day === todayIndex;
                return (
                  <View
                    key={row.day}
                    style={[
                      s.scheduleRow,
                      i < weekSchedule.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.hairline },
                      isToday && { backgroundColor: c.brandSoft },
                    ]}
                  >
                    <View style={s.scheduleDay}>
                      <Text style={[s.scheduleDayText, isToday && { color: c.brand, fontFamily: theme.font.extrabold }]}>
                        {row.label}
                      </Text>
                      {isToday ? <View style={[s.scheduleDot, { backgroundColor: c.brand }]} /> : null}
                    </View>
                    <View style={s.scheduleGames}>
                      {row.games.length === 0 ? (
                        <Text style={s.scheduleEmpty}>—</Text>
                      ) : (
                        row.games.map((g) => {
                          const color = GameAccent[g.id] ?? c.brand;
                          return (
                            <View key={g.id} style={[s.gameChip, { backgroundColor: color + '12', borderColor: color + '22' }]}>
                              <GameEmblem game={g.id} size={20} />
                              <Text style={[s.gameChipText, { color }]}>{g.name}</Text>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </View>
                );
              })}
            </Surface>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

/* ------------------------------ styles ----------------------------- */
function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: 4, paddingBottom: 2 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    greeting: { ...ty.caption, color: c.text2 },
    brand: { ...ty.h2, color: c.text },
    headerActions: { flexDirection: 'row', gap: spacing.sm },
    iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', ...theme.shadowSm },
    dot: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.danger, borderWidth: 2, borderColor: c.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
    dotText: { fontSize: 10, fontFamily: theme.font.bold, color: '#fff', lineHeight: 14, textAlign: 'center', includeFontPadding: false },

    errorCard: { marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: spacing.xxl, alignItems: 'center', gap: spacing.md },
    errorText: { ...ty.bodyMedium, color: c.text2, textAlign: 'center' },

    hero: { marginHorizontal: spacing.xl, marginTop: spacing.lg, borderRadius: radius.xxl, overflow: 'hidden' },
    heroAccent: { height: 4, width: '100%' },
    heroBody: { padding: spacing.xl },
    heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroLabel: { ...ty.micro, color: c.text2 },
    gamePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
    gameDot: { width: 7, height: 7, borderRadius: 4 },
    gamePillText: { ...ty.label, fontSize: 12 },
    timerRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
    timerBlock: { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6, borderRadius: radius.lg, borderWidth: 1 },
    timerNum: { fontFamily: theme.font.bold, fontSize: 32, lineHeight: 36, color: c.text, letterSpacing: -0.4, includeFontPadding: false },
    timerUnit: { ...ty.caption, color: c.text3, marginTop: 4 },
    heroDateRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: spacing.md },
    heroDate: { ...ty.caption, color: c.text2, textTransform: 'capitalize' },

    summary: { marginHorizontal: spacing.xl, marginTop: spacing.md, overflow: 'hidden' },
    summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 },
    summaryIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    summaryText: { flex: 1, ...ty.bodyMedium, color: c.text2 },
    summaryStrong: { fontFamily: theme.font.bold, color: c.text },
    divider: { height: 1, backgroundColor: c.hairline, marginHorizontal: spacing.lg },

    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, marginTop: spacing.xxl, marginBottom: 13 },
    sectionTitle: { ...ty.h2, color: c.text },
    sectionAction: { ...ty.label, color: c.brand },

    drawCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.xxl, padding: 18, ...theme.shadowSm },
    newBadge: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, zIndex: 2 },
    newBadgeText: { ...ty.micro, color: '#fff', fontFamily: theme.font.extrabold },
    drawHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: spacing.lg },
    drawGame: { ...ty.h3, color: c.text },
    drawDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
    drawDate: { ...ty.caption, color: c.text3 },
    drawNumbers: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
    prizeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.hairline },
    prizeLabel: { ...ty.caption, color: c.text2 },
    prizeAmount: { fontFamily: theme.font.extrabold, fontSize: 15, color: c.text, fontVariant: ['tabular-nums'] },

    emptyCard: { marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: spacing.xxl, alignItems: 'center', gap: spacing.md },
    emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    emptyTitle: { ...ty.h2, color: c.text },
    emptyDesc: { ...ty.body, color: c.text2, textAlign: 'center', maxWidth: 260 },

    schedule: { marginHorizontal: spacing.xl, marginBottom: spacing.xxl, overflow: 'hidden' },
    scheduleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 13 },
    scheduleDay: { width: 58, flexDirection: 'row', alignItems: 'center', gap: 6 },
    scheduleDayText: { ...ty.label, color: c.text2 },
    scheduleDot: { width: 6, height: 6, borderRadius: 3 },
    scheduleGames: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    scheduleEmpty: { ...ty.caption, color: c.text3 },
    gameChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingLeft: 6, paddingRight: 10, borderRadius: radius.pill, borderWidth: 1 },
    gameChipText: { ...ty.caption, fontFamily: theme.font.semibold },
  });
}