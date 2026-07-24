// app/(tabs)/results.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnalyzeTab } from '../../components/results/AnalyzeTab';
import { ResultsTab } from '../../components/results/ResultsTab';
import { StatisticsTab } from '../../components/results/StatisticsTab';
import { Segmented } from '../../components/ui/segmented';
import { STORAGE_KEYS } from '../../constants/storage-keys';
import { AppTheme } from '../../constants/theme';
import GameSelector from '../../lib/GameSelector';
import { getDefaultCountry, getGameAccentColor, getGamesByCountry, type Game } from '../../lib/games';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';

const LAST_SEEN_PREFIX = 'lastSeenResult_';
const RESULTS_BADGE_TTL_MS = 60_000;
type Segment = 'results' | 'stats' | 'analyze';

const SEGMENTS = [
  { key: 'results', label: 'Sonuçlar' },
  { key: 'stats', label: 'İstatistik' },
  { key: 'analyze', label: 'Analiz' },
];

function softHaptic() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

export default function ResultsHub() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const params = useLocalSearchParams<{ game?: string; tab?: string }>();

  const countryGames = useMemo(() => getGamesByCountry(getDefaultCountry()), []);
  const [selectedGame, setSelectedGame] = useState<Game>(countryGames[0]);
  const [segment, setSegment] = useState<Segment>('results');
  const [newResults, setNewResults] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const selectedAccent = getGameAccentColor(selectedGame.id);
  const lastBadgeCheckRef = useRef(0);

  const switchSegment = useCallback((next: string) => {
    setSegment(next as Segment);
  }, []);

  useEffect(() => {
    if (params.game) {
      const g = countryGames.find((x) => x.id === params.game);
      if (g) setSelectedGame(g);
    }
    if (params.tab === 'stats' || params.tab === 'analyze' || params.tab === 'results') {
      setSegment(params.tab);
    }
  }, [params.game, params.tab, countryGames]);

  const checkNewResults = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = opts?.force ?? false;
      if (!force && lastBadgeCheckRef.current > 0 && Date.now() - lastBadgeCheckRef.current < RESULTS_BADGE_TTL_MS) {
        return;
      }

      try {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        // Prefer Home's last-draws cache to avoid N network round-trips.
        let drawDates = new Map<string, string>();
        try {
          const raw = await AsyncStorage.getItem(STORAGE_KEYS.LAST_DRAWS_CACHE);
          if (raw) {
            const cached = JSON.parse(raw) as { game: string; draw_date: string }[];
            if (Array.isArray(cached)) {
              for (const row of cached) {
                if (row?.game && row?.draw_date) drawDates.set(row.game, row.draw_date);
              }
            }
          }
        } catch {}

        if (drawDates.size === 0 || force) {
          const settled = await Promise.all(
            countryGames.map(async (game) => {
              const { data } = await supabase
                .from('draws')
                .select('draw_date')
                .eq('game', game.name)
                .order('draw_date_parsed', { ascending: false })
                .limit(1)
                .single();
              return data ? ([game.name, data.draw_date] as const) : null;
            }),
          );
          drawDates = new Map();
          for (const row of settled) {
            if (row) drawDates.set(row[0], row[1]);
          }
        }

        const newGames: string[] = [];
        await Promise.all(
          countryGames.map(async (game) => {
            const drawDateStr = drawDates.get(game.name);
            if (!drawDateStr) return;
            const lastSeen = await AsyncStorage.getItem(LAST_SEEN_PREFIX + game.name);
            if (lastSeen === drawDateStr) return;
            const drawDate = new Date(drawDateStr.split('.').reverse().join('-'));
            if (drawDate >= yesterday) newGames.push(game.name);
          }),
        );
        setNewResults(newGames);
        lastBadgeCheckRef.current = Date.now();
      } catch {}
    },
    [countryGames],
  );

  useFocusEffect(
    useCallback(() => {
      void checkNewResults();
    }, [checkNewResults]),
  );

  const markSeen = useCallback((gameName: string) => {
    setNewResults((prev) => prev.filter((g) => g !== gameName));
  }, []);

  const onRefresh = useCallback(async () => {
    softHaptic();
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    await checkNewResults({ force: true });
    setRefreshing(false);
  }, [checkNewResults]);

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 90 }}
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
        <View style={s.header}>
          <View style={s.eyebrowRow}>
            <View style={[s.eyebrowDot, { backgroundColor: selectedAccent }]} />
            <Text style={[s.eyebrow, { color: selectedAccent }]}>ÇEKİLİŞ MERKEZİ</Text>
          </View>
          <Text style={s.title}>Sonuçlar</Text>
          <Text style={s.subtitle}>Çekiliş sonuçları ve istatistikler</Text>
        </View>

        <GameSelector
          selectedGame={selectedGame}
          onSelect={setSelectedGame}
          newResults={newResults}
          variant="compact"
        />

        <View style={s.segmentWrap}>
          <Segmented
            options={SEGMENTS}
            value={segment}
            onChange={switchSegment}
            accent={selectedAccent}
          />
        </View>

        <View>
          {segment === 'results' ? <ResultsTab game={selectedGame} onSeen={markSeen} refreshKey={refreshKey} /> : null}
          {segment === 'stats' ? <StatisticsTab game={selectedGame} refreshKey={refreshKey} /> : null}
          {segment === 'analyze' ? <AnalyzeTab game={selectedGame} refreshKey={refreshKey} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: spacing.xl, paddingTop: 4, paddingBottom: 18 },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
    eyebrowDot: { width: 7, height: 7, borderRadius: 4 },
    eyebrow: {
      ...ty.micro,
      fontFamily: theme.font.extrabold,
      letterSpacing: 1,
    },
    title: { ...ty.h1, color: c.text },
    subtitle: { ...ty.bodyMedium, color: c.text2, marginTop: 3 },
    segmentWrap: { marginTop: 14 },
  });
}
