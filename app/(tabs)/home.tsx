// app/(tabs)/home.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Dimensions,
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
import { AppTheme, spacing } from '../../constants/theme';
import { useBildirim } from '../../contexts/BildirimContext';
import { BrandMark, GameEmblem } from '../../lib/emblems';
import {
    getDayLabel,
    getDefaultCountry,
    getGameAccentColor,
    getGameByName,
    getGamesByCountry,
} from '../../lib/games';
import { softHaptic } from '../../lib/haptics';
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
/** Match hero width: screen minus horizontal xl margins on both sides. */
const CARD_WIDTH = width - spacing.xl * 2;
const DRAW_CARD_GAP = 14;
const ON_NUMARA_PREVIEW_COUNT = 7;
const LAST_SEEN_PREFIX = 'lastSeenResult_';
/** Skip full network reload when returning to Home within this window. */
const HOME_FETCH_TTL_MS = 60_000;
const LAST_DRAW_SELECT = 'game, numbers, bonus, superstar, draw_date, draw_no, estimated_prize';

/* ----------------------------- helpers ----------------------------- */
function getTodayIndex(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function shadeHex(hex: string, amount: number): string {
  const raw = hex.replace('#', '');
  const n = parseInt(raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw, 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
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
  return { game, id, color: getGameAccentColor(id) };
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
  const [pendingCoupons, setPendingCoupons] = useState(0);
  const [todayDrawCount, setTodayDrawCount] = useState(0);
  const [newResults, setNewResults] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(getTodayIndex);

  const lastDrawsRef = useRef(lastDraws);
  lastDrawsRef.current = lastDraws;
  const lastFetchAtRef = useRef(0);
  const loadInFlightRef = useRef(false);

  const todayIndex = getTodayIndex();

  const userCountry = getDefaultCountry();
  const countryGames = useMemo(() => getGamesByCountry(userCountry), [userCountry]);
  const locale = countryGames[0]?.locale || 'tr-TR';

  const weekSchedule = useMemo(() => {
    const schedule: { day: number; label: string; short: string; games: { id: string; name: string; time: string }[] }[] = [];
    for (let d = 0; d < 7; d++) {
      const jsDay = d === 6 ? 0 : d + 1;
      const gamesOfDay = countryGames
        .filter((g) => g.drawDays.includes(jsDay))
        .map((g) => ({ id: g.id, name: g.name, time: `${g.drawHour}:${pad(g.drawMinute)}` }));
      const full = getDayLabel(d, locale);
      schedule.push({ day: d, label: full, short: full.slice(0, 3), games: gamesOfDay });
    }
    return schedule;
  }, [countryGames, locale]);

  const selectedSchedule = weekSchedule[selectedDay];

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
      const couponsRaw = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS);
      if (couponsRaw) {
        const coupons = JSON.parse(couponsRaw);
        const pending = coupons.filter(
          (cp: { matchedCount?: number | null }) => cp.matchedCount === undefined || cp.matchedCount === null,
        ).length;
        setPendingCoupons(pending);
      } else {
        setPendingCoupons(0);
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

  const checkNewResults = useCallback(async (draws: LastDraw[]) => {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const settled = await Promise.all(
        draws.map(async (draw) => {
          const lastSeen = await AsyncStorage.getItem(LAST_SEEN_PREFIX + draw.game);
          if (lastSeen === draw.draw_date) return null;
          const drawDate = new Date(draw.draw_date.split('.').reverse().join('-'));
          return drawDate >= yesterday ? draw.game : null;
        }),
      );
      setNewResults(settled.filter((name): name is string => name != null));
    } catch {}
  }, []);

  const fetchLastDraws = useCallback(async (): Promise<LastDraw[]> => {
    try {
      const gameNames = countryGames.map((g) => g.name);
      const settled = await Promise.allSettled(
        gameNames.map((gameName) =>
          supabase
            .from('draws')
            .select(LAST_DRAW_SELECT)
            .eq('game', gameName)
            .order('draw_date_parsed', { ascending: false })
            .limit(1)
            .single(),
        ),
      );
      const results: LastDraw[] = settled
        .filter((r) => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ data: LastDraw | null }>).value.data)
        .map((r) => (r as PromiseFulfilledResult<{ data: LastDraw }>).value.data);
      results.sort((a, b) => {
        const da = a.draw_date.split('.').reverse().join('-');
        const db = b.draw_date.split('.').reverse().join('-');
        return db.localeCompare(da);
      });
      setLastDraws(results);
      lastDrawsRef.current = results;
      AsyncStorage.setItem(STORAGE_KEYS.LAST_DRAWS_CACHE, JSON.stringify(results)).catch(() => {});
      return results;
    } catch {
      return lastDrawsRef.current;
    }
  }, [countryGames]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEYS.LAST_DRAWS_CACHE)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const cached = JSON.parse(raw) as LastDraw[];
          if (Array.isArray(cached) && cached.length > 0) {
            setLastDraws((prev) => {
              if (prev.length > 0) return prev;
              lastDrawsRef.current = cached;
              return cached;
            });
          }
        } catch {}
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAll = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = opts?.force ?? false;
      if (loadInFlightRef.current) return;

      const cacheAge = Date.now() - lastFetchAtRef.current;
      const hasCachedDraws = lastDrawsRef.current.length > 0;
      const cacheFresh = !force && lastFetchAtRef.current > 0 && cacheAge < HOME_FETCH_TTL_MS && hasCachedDraws;

      // Tab switch: only refresh local summary (pending coupons / today's draws).
      if (cacheFresh) {
        await loadSmartSummary();
        return;
      }

      loadInFlightRef.current = true;
      setError(null);
      if (!hasCachedDraws) setLoading(true);
      try {
        const draws = await fetchLastDraws();
        await Promise.all([loadSmartSummary(), checkNewResults(draws)]);
        lastFetchAtRef.current = Date.now();
      } catch {
        setError('Veriler yüklenirken bir sorun oluştu.');
      } finally {
        setLoading(false);
        loadInFlightRef.current = false;
      }
    },
    [checkNewResults, fetchLastDraws, loadSmartSummary],
  );

  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll]),
  );

  const onRefresh = useCallback(async () => {
    softHaptic();
    setRefreshing(true);
    lastFetchAtRef.current = 0;
    await loadAll({ force: true });
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
  const heroPrize = useMemo(() => {
    if (!nextDraw) return null;
    const match = lastDraws.find((d) => d.game === nextDraw.game.name);
    if (!match?.estimated_prize || match.estimated_prize <= 0) return null;
    return formatPrize(match.estimated_prize, next?.game?.currency || 'TRY');
  }, [nextDraw, lastDraws, next]);

  const blocks = showDays
    ? [
        { v: pad(parts.days), l: 'Gün' },
        { v: pad(parts.hours), l: 'Saat' },
        { v: pad(parts.minutes), l: 'Dk' },
      ]
    : [
        { v: pad(parts.hours), l: 'Saat' },
        { v: pad(parts.minutes), l: 'Dk' },
        { v: pad(parts.seconds), l: 'Sn' },
      ];

  // Özet kartlarından sadece biri görünüyorsa (XOR), yatay bar düzenine geçilir —
  // tek başına kalan kare kart tam genişlikte boş ve seyrek görünüyordu.
  const singleSummary = (pendingCoupons > 0) !== (todayDrawCount > 0);

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 4, paddingBottom: 28 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.brand}
            colors={[c.brand]}
            progressViewOffset={insets.top + 12}
          />
        }
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <BrandMark size={44} />
            <Text style={s.brand}>LottoAI</Text>
          </View>
          <View style={s.headerActions}>
            <PressableScale haptic={false} style={s.iconBtn} onPress={() => { softHaptic(); router.push('/(tabs)/ai-assistant' as any); }}>
              <AIAssistantIcon color={c.brand} size={25} />
            </PressableScale>
            <PressableScale haptic={false} style={s.iconBtn} onPress={() => { softHaptic(); router.push('/(tabs)/bildirimler' as any); }}>
              <BellIcon color={c.text2} size={19} />
              {unreadCount > 0 ? (
                <View style={[s.dot, { borderColor: c.bg }]}>
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
            <AppButton haptic={false} label="Tekrar dene" variant="secondary" size="md" fullWidth={false} onPress={() => { softHaptic(); void loadAll({ force: true }); }} />
          </Surface>
        ) : null}

        {/* Countdown hero */}
        {!error && next ? (
          <View style={s.heroWrap}>
            <LinearGradient
              colors={[next.color, shadeHex(next.color, -48), shadeHex(next.color, -78)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.hero}
            >
              <View style={s.heroGlow} />
              <View style={s.heroTop}>
                <View>
                  <Text style={s.heroEyebrow}>SONRAKİ ÇEKİLİŞ</Text>
                  <Text style={s.heroGame}>{nextDraw.game.name}</Text>
                </View>
                <View style={s.heroEmblem}>
                  <GameEmblem game={next.id} size={42} />
                </View>
              </View>

              <View style={s.timerRow}>
                {blocks.map((b, i) => (
                  <React.Fragment key={b.l}>
                    {i > 0 ? <Text style={s.timerColon}>:</Text> : null}
                    <View style={s.timerBlock}>
                      <Text style={s.timerNum}>{b.v}</Text>
                      <Text style={s.timerUnit}>{b.l}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>

              <View style={s.heroMeta}>
                <View style={s.heroMetaLeft}>
                  <ClockIcon color="rgba(255,255,255,0.72)" size={14} />
                  <Text style={s.heroDate}>
                    {nextDraw.next.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}
                    {nextDraw.game.drawHour}:{pad(nextDraw.game.drawMinute)}
                  </Text>
                </View>
                {heroPrize ? (
                  <Text style={s.heroPrize} numberOfLines={1}>{heroPrize}</Text>
                ) : null}
              </View>

              <PressableScale
                haptic={false}
                onPress={() => { softHaptic(); router.push(`/(tabs)/generate?game=${nextDraw.game.id}` as any); }}
                style={s.heroCta}
              >
                <Text style={[s.heroCtaText, { color: next.color }]}>Kupon üret</Text>
                <ArrowRightIcon color={next.color} size={18} />
              </PressableScale>
            </LinearGradient>
          </View>
        ) : null}

        {/* Smart summary — stat cards */}
        {!error && (pendingCoupons > 0 || todayDrawCount > 0) ? (
          <View style={s.summaryRowWrap}>
            {pendingCoupons > 0 ? (
              <PressableScale haptic={false} style={[s.summaryCard, singleSummary && s.summaryCardSingle]} onPress={() => { softHaptic(); router.push('/(tabs)/saved' as any); }}>
              {singleSummary ? (
                <>
                  <View style={[s.summaryIcon, { backgroundColor: c.brandSoft }]}>
                    <TicketIcon color={c.brand} size={19} />
                  </View>
                  <Text style={s.summaryValueSingle}>{pendingCoupons}</Text>
                  <Text style={s.summaryLabelSingle}>kupon · Sonuç bekliyor</Text>
                  <ChevronRightIcon color={c.text3} size={16} />
                </>
              ) : (
                <>
                  <View style={s.summaryCardTop}>
                    <View style={[s.summaryIcon, { backgroundColor: c.brandSoft }]}>
                      <TicketIcon color={c.brand} size={19} />
                    </View>
                    <ChevronRightIcon color={c.text3} size={16} />
                  </View>
                  <Text style={s.summaryValue}>{pendingCoupons}</Text>
                  <Text style={s.summaryLabel}>kupon · Sonuç bekliyor</Text>
                </>
              )}
            </PressableScale>
            ) : null}
            {todayDrawCount > 0 ? (
              <PressableScale haptic={false} style={[s.summaryCard, singleSummary && s.summaryCardSingle]} onPress={() => { softHaptic(); router.push('/(tabs)/generate' as any); }}>
              {singleSummary ? (
                <>
                  <View style={[s.summaryIcon, { backgroundColor: c.goldSoft }]}>
                    <CalendarIcon color={c.gold} size={19} />
                  </View>
                  <Text style={s.summaryValueSingle}>{todayDrawCount}</Text>
                  <Text style={s.summaryLabelSingle}>çekiliş · Bugün</Text>
                  <ChevronRightIcon color={c.text3} size={16} />
                </>
              ) : (
                <>
                  <View style={s.summaryCardTop}>
                    <View style={[s.summaryIcon, { backgroundColor: c.goldSoft }]}>
                      <CalendarIcon color={c.gold} size={19} />
                    </View>
                    <ChevronRightIcon color={c.text3} size={16} />
                  </View>
                  <Text style={s.summaryValue}>{todayDrawCount}</Text>
                  <Text style={s.summaryLabel}>çekiliş · Bugün</Text>
                </>
              )}
            </PressableScale>
            ) : null}
          </View>
        ) : null}

        {/* Last draws */}
        {!error && lastDraws.length > 0 ? (
          <>
            <SectionHeader title="Son çekilişler" action="Tümü" onAction={() => router.push('/results' as any)} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={CARD_WIDTH + DRAW_CARD_GAP}
              contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: DRAW_CARD_GAP }}
            >
              {lastDraws.map((draw, index) => {
                const meta = gameMeta(draw.game);
                const nums = parseNumbers(draw.numbers);
                const isOnNumara = meta.id === 'onnumara';
                const displayNums = isOnNumara ? nums.slice(0, ON_NUMARA_PREVIEW_COUNT) : nums;
                const hiddenCount = isOnNumara ? Math.max(0, nums.length - ON_NUMARA_PREVIEW_COUNT) : 0;
                const currency = meta.game?.currency || 'TRY';
                const isNew = newResults.includes(draw.game);
                const hasBonus = !isOnNumara && draw.bonus && draw.bonus !== '-';
                const hasStar = !isOnNumara && draw.superstar != null && draw.superstar > 0;
                return (
                  <PressableScale
                    haptic={false}
                    key={index}
                    onPress={() => {
                      softHaptic();
                      if (isNew) markSeen(draw.game);
                      router.push(`/results?game=${meta.id}` as any);
                    }}
                    style={{ width: CARD_WIDTH }}
                  >
                    <View style={s.drawCard}>
                      <View style={[s.drawAccent, { backgroundColor: meta.color }]} />
                      <View style={s.drawHeader}>
                        <View style={{ flex: 1 }}>
                          <View style={s.drawEyebrowRow}>
                            <Text style={s.drawEyebrow}>SON ÇEKİLİŞ</Text>
                            {isNew ? (
                              <View style={[s.newBadge, { backgroundColor: c.danger }]}>
                                <Text style={s.newBadgeText}>Yeni</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={[s.drawGame, { color: meta.color }]}>{draw.game}</Text>
                          <View style={s.drawDateRow}>
                            <CalendarIcon color={c.text3} size={14} />
                            <Text style={s.drawDate}>{draw.draw_date} · {draw.draw_no}. çekiliş</Text>
                          </View>
                        </View>
                        <View style={[s.drawEmblem, { backgroundColor: `${meta.color}14` }]}>
                          <GameEmblem game={meta.id} size={34} color={meta.color} />
                        </View>
                      </View>
                      <View style={s.drawNumbers}>
                        {displayNums.map((n, i) => (
                          <View key={i} style={[s.colorBall, { backgroundColor: meta.color }]}>
                            <Text style={s.colorBallText} allowFontScaling={false}>
                              {n}
                            </Text>
                          </View>
                        ))}
                        {hiddenCount > 0 ? (
                          <View style={[s.colorBall, { backgroundColor: `${meta.color}33` }]}>
                            <Text style={[s.colorBallText, { fontSize: 12 }]} allowFontScaling={false}>
                              +{hiddenCount}
                            </Text>
                          </View>
                        ) : null}
                        {hasBonus ? <NumberBall value={draw.bonus} variant="bonus" size={34} /> : null}
                        {hasStar ? <NumberBall value={draw.superstar!} variant="star" size={34} /> : null}
                      </View>
                      {draw.estimated_prize != null && draw.estimated_prize > 0 ? (
                        <View style={[s.prizeRow, { backgroundColor: `${meta.color}14` }]}>
                          <View>
                            <Text style={s.prizeLabel}>BÜYÜK İKRAMİYE</Text>
                            <Text style={s.prizeAmount}>{formatPrize(draw.estimated_prize, currency)}</Text>
                          </View>
                          <View style={s.prizeArrow}>
                            <ChevronRightIcon color={c.text2} size={17} />
                          </View>
                        </View>
                      ) : null}
                    </View>
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
              haptic={false}
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
            <View style={s.dayStrip}>
              {weekSchedule.map((row) => {
                const isToday = row.day === todayIndex;
                const isSelected = row.day === selectedDay;
                return (
                  <PressableScale
                    key={row.day}
                    haptic={false}
                    onPress={() => { softHaptic(); setSelectedDay(row.day); }}
                    style={[
                      s.dayChip,
                      isSelected && { backgroundColor: c.brand },
                      isToday && { borderColor: c.brand },
                      !isSelected && isToday && { backgroundColor: c.brandSoft },
                    ]}
                  >
                    <Text
                      style={[
                        s.dayChipLabel,
                        isSelected && { color: c.brandText },
                        !isSelected && isToday && { color: c.brand },
                      ]}
                    >
                      {row.short}
                    </Text>
                    <Text
                      style={[
                        s.dayChipCount,
                        isSelected && { color: c.brandText, opacity: 0.85 },
                        !isSelected && isToday && { color: c.brand },
                      ]}
                    >
                      {row.games.length > 0 ? row.games.length : '—'}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>

            <Surface style={s.scheduleDetail}>
              <View style={s.scheduleDetailHead}>
                <Text style={s.scheduleDetailTitle}>
                  {selectedSchedule?.label}
                  {selectedDay === todayIndex ? ' · Bugün' : ''}
                </Text>
                <Text style={s.scheduleDetailMeta}>
                  {selectedSchedule && selectedSchedule.games.length > 0
                    ? `${selectedSchedule.games.length} çekiliş`
                    : 'Çekiliş yok'}
                </Text>
              </View>
              {selectedSchedule && selectedSchedule.games.length > 0 ? (
                selectedSchedule.games.map((g, i) => {
                  const color = getGameAccentColor(g.id);
                  return (
                    <PressableScale
                      key={g.id}
                      haptic={false}
                      onPress={() => { softHaptic(); router.push(`/(tabs)/generate?game=${g.id}` as any); }}
                      style={[
                        s.scheduleGameRow,
                        i < selectedSchedule.games.length - 1 && {
                          borderBottomWidth: 1,
                          borderBottomColor: c.hairline,
                        },
                      ]}
                    >
                      <View style={[s.scheduleEmblem, { backgroundColor: `${color}14` }]}>
                        <GameEmblem game={g.id} size={28} color={color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.scheduleGameName}>{g.name}</Text>
                        <View style={s.scheduleGameMeta}>
                          <ClockIcon color={c.text3} size={13} />
                          <Text style={s.scheduleGameTime}>{g.time}</Text>
                        </View>
                      </View>
                      <View style={[s.scheduleGameDot, { backgroundColor: color }]} />
                      <ChevronRightIcon color={c.text3} size={16} />
                    </PressableScale>
                  );
                })
              ) : (
                <Text style={s.scheduleEmptyDay}>Bu gün çekiliş yok</Text>
              )}
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

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xl,
      paddingTop: 6,
      paddingBottom: 4,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 8 },
    brand: { ...ty.h2, color: c.text },
    headerActions: { flexDirection: 'row', gap: 8 },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dot: {
      position: 'absolute',
      top: 3,
      right: 3,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: c.danger,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 2,
    },
    dotText: {
      fontSize: 9,
      fontFamily: theme.font.bold,
      color: '#fff',
      lineHeight: 12,
      textAlign: 'center',
      includeFontPadding: false,
    },

    errorCard: {
      marginHorizontal: spacing.xl,
      marginTop: spacing.lg,
      padding: spacing.xxl,
      alignItems: 'center',
      gap: spacing.md,
    },
    errorText: { ...ty.bodyMedium, color: c.text2, textAlign: 'center' },

    heroWrap: { marginHorizontal: spacing.xl, marginTop: spacing.lg },
    hero: {
      borderRadius: radius.xxl,
      padding: 20,
      overflow: 'hidden',
    },
    heroGlow: {
      position: 'absolute',
      top: -40,
      right: -30,
      width: 160,
      height: 160,
      borderRadius: 80,
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    heroEyebrow: {
      fontFamily: theme.font.semibold,
      fontSize: 10.5,
      letterSpacing: 1.1,
      color: 'rgba(255,255,255,0.7)',
      marginBottom: 4,
    },
    heroGame: {
      fontFamily: theme.font.extrabold,
      fontSize: 22,
      lineHeight: 26,
      color: '#fff',
      letterSpacing: -0.4,
    },
    heroEmblem: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    timerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    timerBlock: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.22)',
      borderRadius: radius.lg,
      paddingVertical: 12,
    },
    timerColon: {
      fontFamily: theme.font.bold,
      fontSize: 24,
      color: 'rgba(255,255,255,0.45)',
      marginBottom: 14,
    },
    timerNum: {
      fontFamily: theme.font.extrabold,
      fontSize: 34,
      lineHeight: 38,
      color: '#fff',
      letterSpacing: -0.8,
      fontVariant: ['tabular-nums'],
      includeFontPadding: false,
    },
    timerUnit: {
      fontFamily: theme.font.medium,
      fontSize: 11,
      color: 'rgba(255,255,255,0.65)',
      marginTop: 2,
    },
    heroMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
      gap: 10,
    },
    heroMetaLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    heroDate: {
      fontFamily: theme.font.medium,
      fontSize: 12.5,
      color: 'rgba(255,255,255,0.78)',
      textTransform: 'capitalize',
    },
    heroPrize: {
      fontFamily: theme.font.extrabold,
      fontSize: 13,
      color: '#fff',
      fontVariant: ['tabular-nums'],
    },
    heroCta: {
      marginTop: 16,
      height: 48,
      borderRadius: radius.pill,
      backgroundColor: '#fff',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    heroCtaText: {
      fontFamily: theme.font.semibold,
      fontSize: 15,
    },

    summaryRowWrap: {
      flexDirection: 'row',
      gap: 12,
      marginHorizontal: spacing.xl,
      marginTop: spacing.md,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      padding: 14,
    },
    summaryCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    summaryIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryValue: {
      fontFamily: theme.font.bold,
      fontSize: 26,
      lineHeight: 30,
      letterSpacing: -0.3,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    summaryLabel: { ...ty.caption, color: c.text3, marginTop: 2 },
    summaryCardSingle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
    },
    summaryValueSingle: {
      fontFamily: theme.font.bold,
      fontSize: 20,
      letterSpacing: -0.3,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    summaryLabelSingle: { ...ty.caption, color: c.text3, flex: 1 },

    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, marginTop: spacing.xxl, marginBottom: 13 },
    sectionTitle: { ...ty.h2, color: c.text },
    sectionAction: { ...ty.label, color: c.brand },

    drawCard: {
      borderRadius: radius.xxl,
      padding: 18,
      paddingLeft: 22,
      overflow: 'hidden',
      backgroundColor: c.surface,
    },
    drawAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    newBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
    newBadgeText: { ...ty.micro, color: '#fff', fontFamily: theme.font.extrabold },
    drawHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
    drawEmblem: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    drawEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    drawEyebrow: {
      fontFamily: theme.font.semibold,
      fontSize: 10.5,
      letterSpacing: 1.1,
      color: c.text3,
    },
    drawGame: {
      fontFamily: theme.font.extrabold,
      fontSize: 20,
      lineHeight: 24,
      letterSpacing: -0.4,
    },
    drawDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    drawDate: { fontFamily: theme.font.medium, fontSize: 12.5, color: c.text3 },
    drawNumbers: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap', gap: 6, minHeight: 34 },
    colorBall: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorBallText: {
      fontFamily: theme.font.bold,
      fontSize: 14,
      color: '#fff',
      fontVariant: ['tabular-nums'],
      includeFontPadding: false,
    },
    prizeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.md,
      paddingHorizontal: 13,
      paddingVertical: 11,
      borderRadius: radius.lg,
    },
    prizeLabel: {
      ...ty.micro,
      color: c.text3,
      fontSize: 9,
      letterSpacing: 0.7,
      marginBottom: 2,
    },
    prizeAmount: { fontFamily: theme.font.bold, fontSize: 15, color: c.text, fontVariant: ['tabular-nums'] },
    prizeArrow: {
      width: 30,
      height: 30,
      borderRadius: 10,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },

    emptyCard: { marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: spacing.xxl, alignItems: 'center', gap: spacing.md },
    emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    emptyTitle: { ...ty.h2, color: c.text },
    emptyDesc: { ...ty.body, color: c.text2, textAlign: 'center', maxWidth: 260 },

    dayStrip: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: spacing.xl,
      marginBottom: 12,
    },
    dayChip: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: radius.xl,
      backgroundColor: c.surface,
      alignItems: 'center',
      gap: 3,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    dayChipLabel: { ...ty.label, color: c.text2, textTransform: 'capitalize', fontSize: 12 },
    dayChipCount: { ...ty.caption, color: c.text3, fontFamily: theme.font.semibold },

    scheduleDetail: {
      marginHorizontal: spacing.xl,
      marginBottom: spacing.xxl,
      overflow: 'hidden',
    },
    scheduleDetailHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: 14,
      paddingBottom: 10,
    },
    scheduleDetailTitle: { ...ty.label, color: c.text, textTransform: 'capitalize' },
    scheduleDetailMeta: { ...ty.caption, color: c.text3 },
    scheduleGameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: spacing.lg,
      paddingVertical: 13,
    },
    scheduleEmblem: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scheduleGameName: { ...ty.bodySemibold, color: c.text },
    scheduleGameMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    scheduleGameTime: { ...ty.caption, color: c.text3 },
    scheduleGameDot: { width: 8, height: 8, borderRadius: 4 },
    scheduleEmptyDay: {
      ...ty.body,
      color: c.text3,
      paddingHorizontal: spacing.lg,
      paddingVertical: 18,
    },
  });
}