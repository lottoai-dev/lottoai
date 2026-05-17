// tabs_results.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GAMES, GAME_COLORS } from '../../lib/games';
import GameSelector from '../../lib/GameSelector';
import { t } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';

type DrawResult = {
  id: number;
  game: string;
  numbers: string;
  bonus: string;
  superstar?: number | null;
  draw_date: string;
  draw_no: string;
};

const LAST_SEEN_PREFIX = 'lastSeenResult_';

function parseNumbers(str: string): number[] {
  return str.split(' - ').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
}

export default function ResultsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ game?: string }>();
  const [selectedGame, setSelectedGame] = useState(GAMES[0]);
  const [draws, setDraws] = useState<DrawResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newResults, setNewResults] = useState<string[]>([]);
  const PAGE_SIZE = 20;

  const gameColors = GAME_COLORS[selectedGame.name as keyof typeof GAME_COLORS];
  const mainColor = gameColors?.main || '#6C63FF';
  const bonusColor = gameColors?.bonus || '#FF6B6B';

  useEffect(() => {
    if (params.game) {
      const game = GAMES.find(g => g.id === params.game);
      if (game) {
        setDraws([]);
        setExpanded(null);
        setPage(0);
        setHasMore(true);
        setError(null);
        setSelectedGame(game);
        fetchResults(game, 0, false);
        markAsSeen(game.name);
      }
    }
  }, [params.game]);

  const checkNewResults = useCallback(async () => {
    try {
      const newGames: string[] = [];
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      for (const game of GAMES) {
        const { data } = await supabase
          .from('draws')
          .select('draw_date')
          .eq('game', game.name)
          .order('draw_date_parsed', { ascending: false })
          .limit(1)
          .single();

        if (!data) continue;

        const lastSeenKey = LAST_SEEN_PREFIX + game.name;
        const lastSeen = await AsyncStorage.getItem(lastSeenKey);
        const drawDateStr = data.draw_date;

        if (lastSeen !== drawDateStr) {
          const drawDate = new Date(drawDateStr.split('.').reverse().join('-'));
          if (drawDate >= yesterday) {
            newGames.push(game.name);
          }
        }
      }
      setNewResults(newGames);
    } catch (e) {}
  }, []);

  const markAsSeen = useCallback(async (gameName: string) => {
    setNewResults(prev => prev.filter(g => g !== gameName));
    const { data } = await supabase
      .from('draws')
      .select('draw_date')
      .eq('game', gameName)
      .order('draw_date_parsed', { ascending: false })
      .limit(1)
      .single();
    if (data) {
      await AsyncStorage.setItem(LAST_SEEN_PREFIX + gameName, data.draw_date);
    }
  }, []);

  const fetchResults = async (game: typeof GAMES[0], pageNum = 0, append = false) => {
    setError(null);
    setLoading(true);
    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error: supabaseError } = await supabase
        .from('draws')
        .select('*')
        .eq('game', game.name)
        .order('draw_date_parsed', { ascending: false })
        .range(from, to);
      if (supabaseError) throw supabaseError;
      if (data) {
        setDraws(prev => append ? [...prev, ...data] : data);
        setHasMore(data.length === PAGE_SIZE);
        setPage(pageNum);
      }
    } catch (e) {
      setError('Sonuçlar yüklenirken bir sorun oluştu.');
      if (!append) setDraws([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    if (!loading && hasMore) fetchResults(selectedGame, page + 1, true);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setExpanded(null);
    setPage(0);
    setHasMore(true);
    await fetchResults(selectedGame, 0, false);
    setRefreshing(false);
  }, [selectedGame]);

  useFocusEffect(
    useCallback(() => {
      fetchResults(selectedGame);
      checkNewResults();
    }, [selectedGame])
  );

  const handleGameSelect = async (game: typeof GAMES[0]) => {
    setDraws([]);
    setExpanded(null);
    setPage(0);
    setHasMore(true);
    setError(null);
    setSelectedGame(game);
    await fetchResults(game, 0, false);
    markAsSeen(game.name);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={mainColor}
            colors={[mainColor]}
            progressBackgroundColor="#1a1a2e"
          />
        }>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('drawResults')}</Text>
          <Text style={styles.headerSub}>{t('drawResultsSub')}</Text>
        </View>

        <Text style={styles.sectionTitle}>{t('selectGame')}</Text>
        <GameSelector
          selectedGame={selectedGame}
          onSelect={handleGameSelect}
          newResults={newResults}
        />

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => fetchResults(selectedGame)}>
              <Text style={styles.retryBtnText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        )}

        {!error && loading && draws.length === 0 && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={mainColor} />
            <Text style={styles.loadingText}>Sonuçlar yükleniyor...</Text>
          </View>
        )}

        {!error && !loading && draws.length === 0 && (
          <View style={styles.guideCard}>
            <Text style={styles.guideEmoji}>📅</Text>
            <Text style={styles.guideTitle}>Henüz Sonuç Yok</Text>
            <Text style={styles.guideDesc}>
              Bu oyun için sisteme henüz çekiliş sonucu girilmemiş. Haftalık takvimden hangi günler çekiliş olduğunu görebilirsin.
            </Text>
            <TouchableOpacity
              style={styles.guideBtn}
              onPress={() => fetchResults(selectedGame)}>
              <Text style={styles.guideBtnText}>🔄 Yenile</Text>
            </TouchableOpacity>
          </View>
        )}

        {!error && draws.length > 0 && (
          <>
            <View style={[styles.latestCard, { borderColor: mainColor + '44' }]}>
              <View style={styles.latestHeader}>
                <Text style={[styles.latestBadge, { backgroundColor: mainColor }]}>{t('latestDraw')}</Text>
                <Text style={styles.latestDate}>📅 {draws[0].draw_date} · No: {draws[0].draw_no}</Text>
              </View>
              <Text style={styles.numbersLabel}>{t('drawnNumbers')}</Text>
              <View style={styles.numberBalls}>
                {parseNumbers(draws[0].numbers).map((num, index) => (
                  <View key={index} style={[styles.ball, { backgroundColor: mainColor }]}>
                    <Text style={styles.ballText}>{num}</Text>
                  </View>
                ))}
              </View>
              {draws[0].bonus && draws[0].bonus !== '-' && (
                <>
                  <Text style={styles.bonusLabel}>
                    {selectedGame.name === 'Çılgın Sayısal Loto' ? 'Joker' : 'Şans Topu'}
                  </Text>
                  <View style={styles.numberBalls}>
                    <View style={[styles.ball, { backgroundColor: bonusColor }]}>
                      <Text style={styles.ballText}>{draws[0].bonus}</Text>
                    </View>
                  </View>
                </>
              )}
              {draws[0].superstar != null && draws[0].superstar > 0 && (
                <>
                  <Text style={styles.bonusLabel}>⭐ SüperStar</Text>
                  <View style={styles.numberBalls}>
                    <View style={[styles.ball, { backgroundColor: '#FFD700' }]}>
                      <Text style={[styles.ballText, { color: '#000' }]}>{draws[0].superstar}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>

            <Text style={styles.sectionTitle}>{t('pastDraws')}</Text>
            {draws.slice(1).map((draw) => (
              <TouchableOpacity
                key={draw.id}
                style={styles.historyCard}
                onPress={() => setExpanded(expanded === draw.id ? null : draw.id)}>
                <View style={styles.historyHeader}>
                  <View style={[styles.historyDot, { backgroundColor: mainColor }]} />
                  <Text style={styles.historyDate}>📅 {draw.draw_date}</Text>
                  <Text style={styles.historyNo}>No: {draw.draw_no}</Text>
                  <Text style={styles.historyArrow}>{expanded === draw.id ? '▲' : '▼'}</Text>
                </View>
                {expanded === draw.id && (
                  <View style={styles.historyNumbers}>
                    <View style={styles.numberBalls}>
                      {parseNumbers(draw.numbers).map((num, index) => (
                        <View key={index} style={[styles.smallBall, { backgroundColor: mainColor }]}>
                          <Text style={styles.smallBallText}>{num}</Text>
                        </View>
                      ))}
                    </View>
                    {draw.bonus && draw.bonus !== '-' && (
                      <View style={[styles.numberBalls, { marginTop: 8 }]}>
                        <View style={[styles.smallBall, { backgroundColor: bonusColor }]}>
                          <Text style={styles.smallBallText}>{draw.bonus}</Text>
                        </View>
                      </View>
                    )}
                    {draw.superstar != null && draw.superstar > 0 && (
                      <View style={[styles.numberBalls, { marginTop: 8 }]}>
                        <View style={[styles.smallBall, { backgroundColor: '#FFD700' }]}>
                          <Text style={[styles.smallBallText, { color: '#000' }]}>{draw.superstar}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}

        {!error && hasMore && draws.length > 0 && (
          <TouchableOpacity
            style={styles.loadMoreBtn}
            onPress={loadMore}
            disabled={loading}>
            <Text style={styles.loadMoreText}>
              {loading ? 'Yükleniyor...' : '↓ Daha Fazla Göster'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>{t('resultsNote')}</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { padding: 20, paddingTop: 20 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  headerSub: { color: '#999', fontSize: 14, marginTop: 4 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', paddingHorizontal: 20, marginBottom: 12, marginTop: 8 },
  errorCard: { marginHorizontal: 20, marginBottom: 20, backgroundColor: '#FF6B6B11', borderWidth: 1, borderColor: '#FF6B6B44', borderRadius: 16, padding: 20, alignItems: 'center', gap: 12 },
  errorEmoji: { fontSize: 36 },
  errorText: { color: '#FF6B6B', fontSize: 14, textAlign: 'center' },
  retryBtn: { backgroundColor: '#FF6B6B22', borderWidth: 1, borderColor: '#FF6B6B', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: '#FF6B6B', fontSize: 14, fontWeight: 'bold' },
  loadingContainer: { alignItems: 'center', padding: 30, gap: 12 },
  loadingText: { color: '#999', fontSize: 14 },
  guideCard: { marginHorizontal: 20, backgroundColor: '#16213e', borderRadius: 20, borderWidth: 1, borderColor: '#2a2a4a', padding: 28, alignItems: 'center', gap: 14, marginBottom: 20 },
  guideEmoji: { fontSize: 48 },
  guideTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  guideDesc: { color: '#999', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  guideBtn: { backgroundColor: '#6C63FF', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  guideBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  latestCard: { backgroundColor: '#16213e', marginHorizontal: 20, padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  latestHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  latestBadge: { color: '#fff', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  latestDate: { color: '#999', fontSize: 12 },
  numbersLabel: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  numberBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  ball: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  ballText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  smallBall: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  smallBallText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  bonusLabel: { color: '#999', fontSize: 13, marginBottom: 8 },
  historyCard: { backgroundColor: '#16213e', marginHorizontal: 20, padding: 14, borderRadius: 12, marginBottom: 8 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyDot: { width: 8, height: 8, borderRadius: 4 },
  historyDate: { color: '#fff', fontSize: 14, flex: 1 },
  historyNo: { color: '#999', fontSize: 12 },
  historyArrow: { color: '#999', fontSize: 12 },
  historyNumbers: { marginTop: 12 },
  loadMoreBtn: { backgroundColor: '#16213e', marginHorizontal: 20, padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#2a2a4a' },
  loadMoreText: { color: '#6C63FF', fontSize: 14, fontWeight: 'bold' },
  infoBox: { backgroundColor: '#16213e', marginHorizontal: 20, padding: 14, borderRadius: 12, marginBottom: 30 },
  infoText: { color: '#999', fontSize: 13, lineHeight: 20 },
});