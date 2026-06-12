// app/(tabs)/results.tsx
// Sonuçlar hub — merges the old Results, Statistics and Analyze screens
// behind a segmented control. Each segment is a self-contained component.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnalyzeTab } from '../../components/results/AnalyzeTab';
import { ResultsTab } from '../../components/results/ResultsTab';
import { StatisticsTab } from '../../components/results/StatisticsTab';
import { Segmented } from '../../components/ui/segmented';
import { AppTheme } from '../../constants/theme';
import GameSelector from '../../lib/GameSelector';
import { getDefaultCountry, getGamesByCountry, type Game } from '../../lib/games';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';

const LAST_SEEN_PREFIX = 'lastSeenResult_';
type Segment = 'results' | 'stats' | 'analyze';

const SEGMENTS = [
  { key: 'results', label: 'Sonuçlar' },
  { key: 'stats', label: 'İstatistik' },
  { key: 'analyze', label: 'Analiz' },
];

export default function ResultsHub() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const params = useLocalSearchParams<{ game?: string; tab?: string }>();

  const countryGames = useMemo(() => getGamesByCountry(getDefaultCountry()), []);
  const [selectedGame, setSelectedGame] = useState<Game>(countryGames[0]);
  const [segment, setSegment] = useState<Segment>('results');
  const [newResults, setNewResults] = useState<string[]>([]);

  // fade between segments
  const fade = useMemo(() => new Animated.Value(1), []);
  const switchSegment = useCallback(
    (next: string) => {
      setSegment(next as Segment);
    },
    []
  );

  useEffect(() => {
    if (params.game) {
      const g = countryGames.find((x) => x.id === params.game);
      if (g) setSelectedGame(g);
    }
    if (params.tab === 'stats' || params.tab === 'analyze' || params.tab === 'results') {
      setSegment(params.tab);
    }
  }, [params.game, params.tab, countryGames]);

  const checkNewResults = useCallback(async () => {
    try {
      const newGames: string[] = [];
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      for (const game of countryGames) {
        const { data } = await supabase
          .from('draws')
          .select('draw_date')
          .eq('game', game.name)
          .order('draw_date_parsed', { ascending: false })
          .limit(1)
          .single();
        if (!data) continue;
        const lastSeen = await AsyncStorage.getItem(LAST_SEEN_PREFIX + game.name);
        if (lastSeen !== data.draw_date) {
          const drawDate = new Date(data.draw_date.split('.').reverse().join('-'));
          if (drawDate >= yesterday) newGames.push(game.name);
        }
      }
      setNewResults(newGames);
    } catch {}
  }, [countryGames]);

  useFocusEffect(useCallback(() => { checkNewResults(); }, [checkNewResults]));

  const markSeen = useCallback((gameName: string) => {
    setNewResults((prev) => prev.filter((g) => g !== gameName));
  }, []);

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 90 }}
      >
        <View style={s.header}>
          <Text style={s.title}>Sonuçlar</Text>
          <Text style={s.subtitle}>Çekiliş sonuçları ve istatistikler</Text>
        </View>

        <Segmented options={SEGMENTS} value={segment} onChange={switchSegment} />

        <GameSelector selectedGame={selectedGame} onSelect={setSelectedGame} newResults={newResults} />
        <View style={{ height: 16 }} />

        <View>
          {segment === 'results' ? <ResultsTab game={selectedGame} onSeen={markSeen} /> : null}
          {segment === 'stats' ? <StatisticsTab game={selectedGame} /> : null}
          {segment === 'analyze' ? <AnalyzeTab game={selectedGame} /> : null}
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
    header: { paddingHorizontal: spacing.xl, paddingTop: 4, paddingBottom: 14 },
    title: { ...ty.h1, color: c.text },
    subtitle: { ...ty.bodyMedium, color: c.text2, marginTop: 3 },
  });
}