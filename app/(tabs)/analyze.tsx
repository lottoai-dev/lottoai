// tabs_analyze.tsx
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GAME_COLORS, getDefaultCountry, getGamesByCountry } from '../../lib/games';
import GameSelector from '../../lib/GameSelector';
import { t } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';

type DrawRow = { numbers: string; draw_date: string };

function parseNumbers(str: string): number[] {
  return str.split(' - ').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
}

export default function AnalyzeScreen() {
  const insets = useSafeAreaInsets();

  // Kullanıcının ülkesine ait oyunlar
  const userCountry = getDefaultCountry();
  const countryGames = getGamesByCountry(userCountry);

  const [selectedGame, setSelectedGame] = useState(countryGames[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draws, setDraws] = useState<DrawRow[]>([]);
  const [inputNumbers, setInputNumbers] = useState('');
  const [analysisResult, setAnalysisResult] = useState<null | {
    numbers: number[];
    stats: {
      number: number;
      count: number;
      lastSeen: string;
      hot: boolean;
      missingSince: number;
      topPairs: number[];
    }[];
  }>(null);

  const gc = GAME_COLORS[selectedGame.name as keyof typeof GAME_COLORS];
  const mainColor = gc?.main || '#6C63FF';

  const fetchDraws = async (game: (typeof countryGames)[0]) => {
    setError(null);
    setLoading(true);
    setAnalysisResult(null);
    setInputNumbers('');
    setDraws([]);
    try {
      const { data, error: supabaseError } = await supabase
        .from('draws')
        .select('numbers, draw_date')
        .eq('game', game.name)
        .order('draw_date_parsed', { ascending: false });
      if (supabaseError) throw supabaseError;
      if (data) setDraws(data);
    } catch (e) {
      setError('Veriler yüklenirken bir sorun oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchDraws(selectedGame); }, [selectedGame]));

  const handleAnalyze = () => {
    const numbers = inputNumbers
      .split(/[\s,]+/)
      .map((n) => parseInt(n.trim()))
      .filter((n) => !isNaN(n) && n >= 1 && n <= selectedGame.max);

    if (numbers.length === 0) return;

    const avgExpected = draws.length > 0 ? draws.length / selectedGame.max : 0;

    const stats = numbers.map((num) => {
      let count = 0;
      let lastSeen = 'Hiç çıkmadı';
      let missingSince = 0;
      const pairFreq: Record<number, number> = {};

      for (let i = 0; i < draws.length; i++) {
        const drawnNums = parseNumbers(draws[i].numbers)
          .filter((n) => n >= 1 && n <= selectedGame.max);

        if (drawnNums.includes(num)) {
          count++;
          if (lastSeen === 'Hiç çıkmadı') lastSeen = draws[i].draw_date;

          drawnNums.forEach(pair => {
            if (pair !== num) pairFreq[pair] = (pairFreq[pair] || 0) + 1;
          });
        } else if (lastSeen === 'Hiç çıkmadı') {
          missingSince++;
        }
      }

      const topPairs = Object.entries(pairFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([n]) => parseInt(n));

      const hot = count > avgExpected;

      return { number: num, count, lastSeen, hot, missingSince, topPairs };
    });

    setAnalysisResult({ numbers, stats });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('analyzeTitle')}</Text>
          <Text style={styles.headerSub}>{t('analyzeSub')}</Text>
        </View>

        <Text style={styles.sectionTitle}>{t('selectGame')}</Text>
        <GameSelector selectedGame={selectedGame} onSelect={setSelectedGame} />

        {/* Hata Durumu */}
        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => fetchDraws(selectedGame)}>
              <Text style={styles.retryBtnText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Yükleniyor */}
        {!error && loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={mainColor} />
            <Text style={styles.loadingText}>{t('analyzing')}</Text>
          </View>
        )}

        {/* Sayı Girişi ve Analiz Butonu */}
        {!error && !loading && (
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>
              Analiz etmek istediğin sayıları gir (1-{selectedGame.max} arası, virgülle ayır):
            </Text>
            <TextInput
              style={[styles.input, { borderColor: mainColor }]}
              placeholder={`Örnek: 3, 15, 27, 42`}
              placeholderTextColor="#555"
              value={inputNumbers}
              onChangeText={setInputNumbers}
              keyboardType="numeric"
            />
            <TouchableOpacity
              style={[styles.analyzeBtn, { backgroundColor: mainColor }]}
              onPress={handleAnalyze}>
              <Text style={styles.analyzeBtnText}>{t('analyzeBtn')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Analiz Sonuçları */}
        {!error && !loading && analysisResult && (
          <>
            <Text style={styles.sectionTitle}>Analiz Sonuçları</Text>
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                📊 {draws.length} çekiliş analiz edildi · {selectedGame.name}
              </Text>
            </View>

            {analysisResult.stats.map((stat) => (
              <View key={stat.number} style={[styles.statCard, { borderLeftColor: stat.hot ? mainColor : '#666' }]}>
                <View style={[styles.numberBall, { backgroundColor: stat.hot ? mainColor : '#2a2a4a' }]}>
                  <Text style={styles.numberText}>{stat.number}</Text>
                </View>
                <View style={styles.statInfo}>
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Toplam Çıkış:</Text>
                    <Text style={[styles.statValue, { color: mainColor }]}>{stat.count} kez</Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Son Çıkış:</Text>
                    <Text style={styles.statValue}>{stat.lastSeen}</Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Durum:</Text>
                    <Text style={[styles.statValue, { color: stat.hot ? '#FFD700' : '#999' }]}>
                      {stat.hot ? '🔥 Sıcak Sayı' : '❄️ Soğuk Sayı'}
                    </Text>
                  </View>
                  {stat.missingSince > 0 && (
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Gecikme:</Text>
                      <Text style={[styles.statValue, { color: '#FF9F43' }]}>
                        ⏳ {stat.missingSince} çekilişten beri çıkmadı
                      </Text>
                    </View>
                  )}
                  {stat.topPairs.length > 0 && (
                    <View style={[styles.statRow, { alignItems: 'flex-start', flexDirection: 'column', gap: 4 }]}>
                      <Text style={styles.statLabel}>En çok birlikte çıktığı:</Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                        {stat.topPairs.map((pair, pi) => (
                          <View key={pi} style={[styles.pairBall, { backgroundColor: mainColor + '33', borderColor: mainColor }]}>
                            <Text style={[styles.pairBallText, { color: mainColor }]}>{pair}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              </View>
            ))}

            <View style={styles.legendBox}>
              <Text style={[styles.legendItem, { color: '#FFD700' }]}>🔥 Sıcak: Ortalamadan fazla çıkan sayı</Text>
              <Text style={[styles.legendItem, { color: '#999' }]}>❄️ Soğuk: Ortalamadan az çıkan sayı</Text>
              <Text style={[styles.legendItem, { color: '#FF9F43' }]}>⏳ Gecikme: Son çıkıştan bu yana geçen çekiliş sayısı</Text>
            </View>
          </>
        )}

        {/* Boş Durum */}
        {!error && !loading && !analysisResult && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🔢</Text>
            <Text style={styles.emptyTitle}>{t('analyzeStart')}</Text>
            <Text style={styles.emptyDesc}>{t('analyzeStartDesc')}</Text>
          </View>
        )}

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
  errorCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: '#FF6B6B11', borderWidth: 1, borderColor: '#FF6B6B44', borderRadius: 16, padding: 20, alignItems: 'center', gap: 12 },
  errorEmoji: { fontSize: 36 },
  errorText: { color: '#FF6B6B', fontSize: 14, textAlign: 'center' },
  retryBtn: { backgroundColor: '#FF6B6B22', borderWidth: 1, borderColor: '#FF6B6B', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: '#FF6B6B', fontSize: 14, fontWeight: 'bold' },
  loadingContainer: { alignItems: 'center', padding: 40, gap: 12 },
  loadingText: { color: '#999', fontSize: 14 },
  inputContainer: { backgroundColor: '#16213e', marginHorizontal: 20, padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#2a2a4a' },
  inputLabel: { color: '#999', fontSize: 13, marginBottom: 10 },
  input: { backgroundColor: '#0f0f23', color: '#fff', fontSize: 16, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  analyzeBtn: { padding: 14, borderRadius: 12, alignItems: 'center' },
  analyzeBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  infoBox: { backgroundColor: '#16213e', marginHorizontal: 20, padding: 12, borderRadius: 10, marginBottom: 12 },
  infoText: { color: '#999', fontSize: 13 },
  statCard: { backgroundColor: '#16213e', marginHorizontal: 20, padding: 16, borderRadius: 12, marginBottom: 10, borderLeftWidth: 4, flexDirection: 'row', alignItems: 'center', gap: 14 },
  numberBall: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  numberText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  statInfo: { flex: 1, gap: 4 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statLabel: { color: '#999', fontSize: 13 },
  statValue: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  legendBox: { backgroundColor: '#16213e', marginHorizontal: 20, padding: 14, borderRadius: 12, marginTop: 8, marginBottom: 20, gap: 6 },
  legendItem: { fontSize: 12 },
  emptyContainer: { alignItems: 'center', padding: 40, gap: 8 },
  emptyEmoji: { fontSize: 50 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  emptyDesc: { color: '#999', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  pairBall: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  pairBallText: { fontSize: 11, fontWeight: 'bold' },
});