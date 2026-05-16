// tabs_statistics.tsx
import { useFocusEffect, useRouter } from 'expo-router';
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
import { GAMES, GAME_COLORS } from '../../lib/games';
import GameSelector from '../../lib/GameSelector';
import { t } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';

function combination(n: number, r: number): number {
  if (r > n) return 0;
  if (r === 0 || r === n) return 1;
  let result = 1;
  for (let i = 0; i < r; i++) {
    result *= (n - i);
    result /= (i + 1);
  }
  return Math.round(result);
}

const ON_NUMARA_DRAWN = 22;

function calcOdds(game: typeof GAMES[0]): number {
  if (game.id === 'onnumara') {
    return combination(game.max, game.count) / combination(ON_NUMARA_DRAWN, game.count);
  }
  const mainOdds = combination(game.max, game.count);
  if (game.bonus) {
    return mainOdds * combination(game.bonus.max, game.bonus.count);
  }
  return mainOdds;
}

function formatOdds(n: number): string {
  if (n >= 1_000_000_000) return `1 / ${(n / 1_000_000_000).toFixed(1)} milyar`;
  if (n >= 1_000_000) return `1 / ${(n / 1_000_000).toFixed(1)} milyon`;
  if (n >= 1_000) return `1 / ${(n / 1_000).toFixed(0)} bin`;
  return `1 / ${n.toFixed(0)}`;
}

type NumberStat = { number: number; count: number; percentage: number };
type ColdNumber = { number: number; count: number; missingSince: number };

const FILTERS = [
  { label: 'Son 10', value: 10 },
  { label: 'Son 50', value: 50 },
  { label: 'Son 100', value: 100 },
  { label: 'Tümü', value: 0 },
];

function parseNumbers(str: string): number[] {
  return str.split(' - ').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
}

export default function StatisticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selectedGame, setSelectedGame] = useState(GAMES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalDraws, setTotalDraws] = useState(0);
  const [mostCommon, setMostCommon] = useState<NumberStat[]>([]);
  const [leastCommon, setLeastCommon] = useState<NumberStat[]>([]);
  const [coldNumbers, setColdNumbers] = useState<ColdNumber[]>([]);
  const [activeTab, setActiveTab] = useState<'most' | 'least' | 'distribution' | 'consecutive' | 'sum' | 'odds' | 'cold'>('most');
  const [filterValue, setFilterValue] = useState(0);
  const [couponCount, setCouponCount] = useState('1');

  const [evenOddStats, setEvenOddStats] = useState({ even: 0, odd: 0 });
  const [rangeStats, setRangeStats] = useState<{ label: string; count: number; pct: number }[]>([]);
  const [consecutiveStats, setConsecutiveStats] = useState({ avg: 0, max: 0, distribution: [] as {label: string; count: number; pct: number}[] });
  const [sumStats, setSumStats] = useState({ avg: 0, min: 0, max: 0, distribution: [] as {label: string; count: number; pct: number}[] });

  const gc = GAME_COLORS[selectedGame.name as keyof typeof GAME_COLORS];
  const mainColor = gc?.main || '#6C63FF';

  const fetchStats = useCallback(async (game: typeof GAMES[0], limit: number) => {
    setError(null);
    setLoading(true);
    try {
      let query = supabase
        .from('draws')
        .select('numbers, draw_date')
        .eq('game', game.name)
        .order('draw_date_parsed', { ascending: false });

      if (limit > 0) query = query.limit(limit);

      const { data, error: supabaseError } = await query;
      if (supabaseError) throw supabaseError;
      if (!data || data.length === 0) {
        setMostCommon([]);
        setLeastCommon([]);
        setColdNumbers([]);
        setEvenOddStats({ even: 0, odd: 0 });
        setRangeStats([]);
        setConsecutiveStats({ avg: 0, max: 0, distribution: [] });
        setSumStats({ avg: 0, min: 0, max: 0, distribution: [] });
        setTotalDraws(0);
        return;
      }

      setTotalDraws(data.length);

      const countMap: Record<number, number> = {};
      const missingSinceMap: Record<number, number> = {};
      let totalNumbers = 0;
      let evenCount = 0;
      let oddCount = 0;

      data.forEach((row, drawIndex) => {
        const nums = parseNumbers(row.numbers).filter(n => n >= 1 && n <= game.max);

        nums.forEach((num) => {
          countMap[num] = (countMap[num] || 0) + 1;
          totalNumbers++;
          if (num % 2 === 0) evenCount++; else oddCount++;

          // İlk görüldüğü (en son) çekilişten itibaren gecikme sayısını kaydet
          if (missingSinceMap[num] === undefined) {
            missingSinceMap[num] = drawIndex;
          }
        });
      });

      // Geciken sayılar listesini oluştur (sadece 10 tane)
      const coldList: ColdNumber[] = [];
      for (let num = 1; num <= game.max; num++) {
        const count = countMap[num] || 0;
        const missingSince = missingSinceMap[num] ?? data.length;
        coldList.push({ number: num, count, missingSince });
      }
      coldList.sort((a, b) => b.missingSince - a.missingSince);
      setColdNumbers(coldList.slice(0, 10));

      const stats: NumberStat[] = Object.entries(countMap).map(([num, count]) => ({
        number: parseInt(num),
        count,
        percentage: Math.round((count / data.length) * 100),
      }));
      stats.sort((a, b) => b.count - a.count);
      setMostCommon(stats.slice(0, 10));
      setLeastCommon([...stats].sort((a, b) => a.count - b.count).slice(0, 10));

      setEvenOddStats({
        even: Math.round((evenCount / totalNumbers) * 100),
        odd: Math.round((oddCount / totalNumbers) * 100),
      });

      const rangeSize = Math.ceil(game.max / 5);
      const ranges = Array.from({ length: 5 }, (_, i) => {
        const from = i * rangeSize + 1;
        const to = Math.min((i + 1) * rangeSize, game.max);
        let count = 0;
        for (let n = from; n <= to; n++) count += countMap[n] || 0;
        return {
          label: `${from}-${to}`,
          count,
          pct: totalNumbers > 0 ? Math.round((count / totalNumbers) * 100) : 0,
        };
      });
      setRangeStats(ranges);

      const consecutiveDist: Record<number, number> = {};
      let totalConsecutive = 0;
      let maxConsecutive = 0;

      data.forEach((row) => {
        const nums = parseNumbers(row.numbers).sort((a, b) => a - b);

        let pairs = 0;
        for (let i = 0; i < nums.length - 1; i++) {
          if (nums[i + 1] - nums[i] === 1) pairs++;
        }
        consecutiveDist[pairs] = (consecutiveDist[pairs] || 0) + 1;
        totalConsecutive += pairs;
        if (pairs > maxConsecutive) maxConsecutive = pairs;
      });

      const avgConsecutive = data.length > 0 ? Math.round((totalConsecutive / data.length) * 10) / 10 : 0;
      const consecutiveDistArr = Array.from({ length: maxConsecutive + 1 }, (_, i) => ({
        label: i === 0 ? 'Yok' : `${i} çift`,
        count: consecutiveDist[i] || 0,
        pct: data.length > 0 ? Math.round(((consecutiveDist[i] || 0) / data.length) * 100) : 0,
      }));
      setConsecutiveStats({ avg: avgConsecutive, max: maxConsecutive, distribution: consecutiveDistArr });

      const sums: number[] = [];
      data.forEach((row) => {
        const nums = parseNumbers(row.numbers).filter(n => n >= 1 && n <= game.max);
        if (nums.length > 0) sums.push(nums.reduce((a, b) => a + b, 0));
      });

      if (sums.length > 0) {
        const avgSum = Math.round(sums.reduce((a, b) => a + b, 0) / sums.length);
        const minSum = Math.min(...sums);
        const maxSum = Math.max(...sums);
        const rangeWidth = Math.ceil((maxSum - minSum) / 5);
        const sumDist = Array.from({ length: 5 }, (_, i) => {
          const from = minSum + i * rangeWidth;
          const to = i === 4 ? maxSum : from + rangeWidth - 1;
          const count = sums.filter(s => s >= from && s <= to).length;
          return {
            label: `${from}-${to}`,
            count,
            pct: Math.round((count / sums.length) * 100),
          };
        });
        setSumStats({ avg: avgSum, min: minSum, max: maxSum, distribution: sumDist });
      }

    } catch (e) {
      setError('İstatistikler yüklenirken bir sorun oluştu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStats(selectedGame, filterValue);
    }, [selectedGame, filterValue, fetchStats])
  );

  const displayStats = activeTab === 'most' ? mostCommon : activeTab === 'least' ? leastCommon : [];
  const maxCount = displayStats.length > 0 ? displayStats[0].count : 1;
  const maxRangeCount = rangeStats.length > 0 ? Math.max(...rangeStats.map(r => r.count)) : 1;
  const odds = calcOdds(selectedGame);
  const count = parseInt(couponCount) || 1;
  const adjustedOdds = odds / count;

  // Gecikenler için maksimum gecikme değeri (çubuk genişliği için)
  const maxMissing = coldNumbers.length > 0 ? coldNumbers[0].missingSince : 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('statsTitle')}</Text>
          <Text style={styles.headerSub}>{t('statsSub')}</Text>
        </View>

        {/* Oyun Seçici */}
        <Text style={styles.sectionTitle}>{t('selectGame')}</Text>
        <GameSelector selectedGame={selectedGame} onSelect={setSelectedGame} />

        {/* Zaman Filtresi */}
        <Text style={styles.sectionTitle}>Zaman Aralığı</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {FILTERS.map((f) => {
            const isActive = filterValue === f.value;
            return (
              <TouchableOpacity
                key={f.value}
                style={[styles.filterBtn, isActive && { backgroundColor: mainColor, borderColor: mainColor }]}
                onPress={() => setFilterValue(f.value)}>
                <Text style={[styles.filterBtnText, isActive && { color: '#fff' }]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Hata Durumu */}
        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => fetchStats(selectedGame, filterValue)}>
              <Text style={styles.retryBtnText}>{t('retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Görsel Özet Kartı */}
        {!error && (
          <View style={[styles.summaryCard, { borderColor: mainColor }]}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryIcon}>{selectedGame.icon}</Text>
              <View style={styles.summaryInfo}>
                <Text style={[styles.summaryGameName, { color: mainColor }]}>{selectedGame.name}</Text>
                <Text style={styles.summaryMeta}>
                  {filterValue > 0 ? `Son ${filterValue} çekiliş` : 'Tüm çekilişler'}
                </Text>
              </View>
            </View>

            <View style={styles.summaryCounter}>
              <Text style={[styles.summaryCounterValue, { color: mainColor }]}>{totalDraws}</Text>
              <Text style={styles.summaryCounterLabel}>
                {totalDraws === 0 ? 'Henüz veri yok' : 'çekiliş analiz edildi'}
              </Text>
            </View>

            {totalDraws === 0 && (
              <View style={styles.summaryEmptyArea}>
                <Text style={styles.summaryEmptyHint}>
                  Henüz çekiliş verisi yok. Önce kuponunu oyna, sonuçları burada analiz et!
                </Text>
                <TouchableOpacity
                  style={styles.summaryEmptyBtn}
                  onPress={() => router.push('/(tabs)/generate' as any)}>
                  <Text style={styles.summaryEmptyBtnText}>🎲 Kupon Üret</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Sekme Menüsü */}
        {!error && totalDraws > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabScroll}
            contentContainerStyle={styles.tabScrollContent}>
            {[
              { key: 'most', label: '🔥 En Çok' },
              { key: 'least', label: '❄️ En Az' },
              { key: 'cold', label: '⏳ Geciken' },
              { key: 'distribution', label: '📈 Dağılım' },
              { key: 'consecutive', label: '🔗 Ardışık' },
              { key: 'sum', label: '∑ Toplam' },
              { key: 'odds', label: '🎯 İhtimal' },
            ].map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, activeTab === t.key && { backgroundColor: mainColor }]}
                onPress={() => setActiveTab(t.key as any)}>
                <Text style={[styles.tabText, activeTab === t.key && { color: '#fff' }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {!error && loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={mainColor} />
            <Text style={styles.loadingText}>İstatistikler hesaplanıyor...</Text>
          </View>
        )}

        {/* En Çok / En Az */}
        {!error && !loading && totalDraws > 0 && (activeTab === 'most' || activeTab === 'least') && (
          <>
            {displayStats.map((stat, index) => (
              <View key={stat.number} style={styles.statRow}>
                <View style={[styles.rankBadge, { backgroundColor: '#2a2a4a' }]}>
                  <Text style={styles.rankText}>{index + 1}</Text>
                </View>
                <View style={[styles.numberBall, { backgroundColor: mainColor }]}>
                  <Text style={styles.numberText}>{stat.number}</Text>
                </View>
                <View style={styles.barContainer}>
                  <View style={[styles.bar, { width: `${(stat.count / maxCount) * 100}%`, backgroundColor: mainColor }]} />
                </View>
                <View style={styles.countContainer}>
                  <Text style={styles.countText}>{stat.count}</Text>
                  <Text style={styles.percentText}>%{stat.percentage}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Geciken Sayılar Sekmesi — diğerleri gibi sade ve 10 satırlı */}
        {!error && !loading && totalDraws > 0 && activeTab === 'cold' && (
          <>
            <Text style={styles.sectionTitle}>En Uzun Süredir Çıkmayanlar</Text>
            {coldNumbers.map((item, index) => (
              <View key={item.number} style={styles.statRow}>
                <View style={[styles.rankBadge, { backgroundColor: '#2a2a4a' }]}>
                  <Text style={styles.rankText}>{index + 1}</Text>
                </View>
                <View style={[styles.numberBall, { backgroundColor: mainColor }]}>
                  <Text style={styles.numberText}>{item.number}</Text>
                </View>
                <View style={styles.barContainer}>
                <View style={[styles.bar, { width: `${(item.missingSince / maxMissing) * 100}%`, backgroundColor: mainColor }]} />
                </View>
                <View style={styles.countContainer}>
                  <Text style={styles.countText}>{item.missingSince}</Text>
                  <Text style={styles.percentText}>çekiliş</Text>
                </View>
              </View>
            ))}
            {coldNumbers.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Geciken sayı verisi bulunamadı.</Text>
              </View>
            )}
          </>
        )}

        {/* Dağılım */}
        {!error && !loading && totalDraws > 0 && activeTab === 'distribution' && (
          <View style={styles.distributionContainer}>

            <View style={[styles.distCard, { borderColor: mainColor + '44' }]}>
              <Text style={styles.distCardTitle}>⚖️ Çift / Tek Dağılımı</Text>
              <View style={styles.evenOddRow}>
                <View style={styles.evenOddItem}>
                  <View style={[styles.evenOddBar, { backgroundColor: mainColor, height: `${evenOddStats.even}%` }]} />
                  <Text style={[styles.evenOddPct, { color: mainColor }]}>%{evenOddStats.even}</Text>
                  <Text style={styles.evenOddLabel}>Çift</Text>
                </View>
                <View style={styles.evenOddDivider} />
                <View style={styles.evenOddItem}>
                  <View style={[styles.evenOddBar, { backgroundColor: gc?.bonus || '#FF6B6B', height: `${evenOddStats.odd}%` }]} />
                  <Text style={[styles.evenOddPct, { color: gc?.bonus || '#FF6B6B' }]}>%{evenOddStats.odd}</Text>
                  <Text style={styles.evenOddLabel}>Tek</Text>
                </View>
              </View>
            </View>

            <View style={[styles.distCard, { borderColor: mainColor + '44' }]}>
              <Text style={styles.distCardTitle}>🔢 Sayı Aralığı Dağılımı</Text>
              {rangeStats.map((r, i) => (
                <View key={i} style={styles.rangeRow}>
                  <Text style={styles.rangeLabel}>{r.label}</Text>
                  <View style={styles.rangeBarBg}>
                    <View style={[styles.rangeBar, {
                      width: `${(r.count / maxRangeCount) * 100}%`,
                      backgroundColor: mainColor,
                      opacity: 0.5 + (i * 0.1),
                    }]} />
                  </View>
                  <Text style={[styles.rangePct, { color: mainColor }]}>%{r.pct}</Text>
                </View>
              ))}
            </View>

            {selectedGame.id === 'onnumara' && (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  💡 On Numara'da 80 top arasından 22 top çekilir. Siz 10 sayı seçersiniz. 
                  Bu dağılım çekilen 22 sayı üzerinden hesaplanmıştır.
                </Text>
              </View>
            )}

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>{t('statsNote')}</Text>
            </View>
          </View>
        )}

        {/* Ardışık */}
        {!error && !loading && totalDraws > 0 && activeTab === 'consecutive' && (
          <View style={styles.distributionContainer}>
            <View style={[styles.distCard, { borderColor: mainColor + '44' }]}>
              <Text style={styles.distCardTitle}>🔗 Ardışık Sayı Analizi</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryBigNum, { color: mainColor }]}>{consecutiveStats.avg}</Text>
                  <Text style={styles.summaryItemLabel}>Ortalama çift</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryBigNum, { color: mainColor }]}>{consecutiveStats.max}</Text>
                  <Text style={styles.summaryItemLabel}>Maks. çift</Text>
                </View>
              </View>
              <Text style={styles.distSubTitle}>Çekiliş başına ardışık çift sayısı dağılımı:</Text>
              {consecutiveStats.distribution.map((r, i) => (
                <View key={i} style={styles.rangeRow}>
                  <Text style={styles.rangeLabel}>{r.label}</Text>
                  <View style={styles.rangeBarBg}>
                    <View style={[styles.rangeBar, {
                      width: `${r.pct}%`,
                      backgroundColor: mainColor,
                    }]} />
                  </View>
                  <Text style={[styles.rangePct, { color: mainColor }]}>%{r.pct}</Text>
                </View>
              ))}
            </View>
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                💡 Ardışık çift: 23-24 gibi yan yana gelen sayılar. Ortalama değer kupon stratejisi için referans alınabilir.
              </Text>
            </View>
          </View>
        )}

        {/* Toplam */}
        {!error && !loading && totalDraws > 0 && activeTab === 'sum' && (
          <View style={styles.distributionContainer}>
            <View style={[styles.distCard, { borderColor: mainColor + '44' }]}>
              <Text style={styles.distCardTitle}>∑ Çekilen Sayıların Toplamı</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryBigNum, { color: mainColor }]}>{sumStats.avg}</Text>
                  <Text style={styles.summaryItemLabel}>Ortalama toplam</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryBigNum, { color: '#6BCB77' }]}>{sumStats.min}</Text>
                  <Text style={styles.summaryItemLabel}>En düşük</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryBigNum, { color: '#FF6B6B' }]}>{sumStats.max}</Text>
                  <Text style={styles.summaryItemLabel}>En yüksek</Text>
                </View>
              </View>
              <Text style={styles.distSubTitle}>Toplam aralığı dağılımı:</Text>
              {sumStats.distribution.map((r, i) => (
                <View key={i} style={styles.rangeRow}>
                  <Text style={[styles.rangeLabel, { width: 70 }]}>{r.label}</Text>
                  <View style={styles.rangeBarBg}>
                    <View style={[styles.rangeBar, {
                      width: `${r.pct}%`,
                      backgroundColor: mainColor,
                      opacity: 0.5 + (i * 0.1),
                    }]} />
                  </View>
                  <Text style={[styles.rangePct, { color: mainColor }]}>%{r.pct}</Text>
                </View>
              ))}
            </View>
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                💡 Kuponundaki sayıların toplamı ortalama değere yakınsa istatistiksel olarak daha dengeli bir kupon oluşturmuş olursun.
              </Text>
            </View>
          </View>
        )}

        {/* İhtimal */}
        {!error && !loading && totalDraws > 0 && activeTab === 'odds' && (
          <View style={styles.oddsContainer}>
            <View style={[styles.oddsMainCard, { borderColor: mainColor }]}>
              <Text style={styles.oddsTitle}>🏆 Büyük İkramiye</Text>
              <Text style={[styles.oddsValue, { color: mainColor }]}>{formatOdds(odds)}</Text>
              <Text style={styles.oddsDesc}>
                {selectedGame.count} doğru sayı / {selectedGame.max} top
                {selectedGame.bonus ? ` + 1/${selectedGame.bonus.max} şans topu` : ''}
              </Text>
            </View>

            <View style={styles.couponCalc}>
              <Text style={styles.couponCalcTitle}>🎫 Kaç Kupon Oynarsanız?</Text>
              <View style={styles.couponInputRow}>
                <TouchableOpacity
                  style={[styles.couponBtn, { borderColor: mainColor }]}
                  onPress={() => setCouponCount(String(Math.max(1, count - 1)))}>
                  <Text style={[styles.couponBtnText, { color: mainColor }]}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.couponInput, { borderColor: mainColor, color: mainColor }]}
                  value={couponCount}
                  onChangeText={setCouponCount}
                  keyboardType="numeric"
                  textAlign="center"
                />
                <TouchableOpacity
                  style={[styles.couponBtn, { borderColor: mainColor }]}
                  onPress={() => setCouponCount(String(count + 1))}>
                  <Text style={[styles.couponBtnText, { color: mainColor }]}>+</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.adjustedOdds, { backgroundColor: mainColor + '22', borderColor: mainColor + '44' }]}>
                <Text style={styles.adjustedLabel}>{count} kupon ile şansın:</Text>
                <Text style={[styles.adjustedValue, { color: mainColor }]}>{formatOdds(adjustedOdds)}</Text>
              </View>
            </View>

            {selectedGame.id === 'onnumara' && (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  💡 On Numara'da 80 top arasından 22 top çekilir, siz 10 sayı seçersiniz. 
                  10 bilme ihtimali: 1'e karşı {(combination(80, 10) / combination(22, 10)).toLocaleString('tr-TR')}.
                </Text>
              </View>
            )}

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                💡 Şans oyunları tamamen rastgeledir. Bu hesaplamalar teorik olasılıklara dayanmaktadır. Sorumlu oynayın!
              </Text>
            </View>
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
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', paddingHorizontal: 20, marginBottom: 10, marginTop: 8 },
  filterRow: { paddingLeft: 20, marginBottom: 16 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2a2a4a', backgroundColor: '#16213e', marginRight: 8 },
  filterBtnText: { color: '#999', fontSize: 13, fontWeight: '600' },
  errorCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: '#FF6B6B11', borderWidth: 1, borderColor: '#FF6B6B44', borderRadius: 16, padding: 20, alignItems: 'center', gap: 12 },
  errorEmoji: { fontSize: 36 },
  errorText: { color: '#FF6B6B', fontSize: 14, textAlign: 'center' },
  retryBtn: { backgroundColor: '#FF6B6B22', borderWidth: 1, borderColor: '#FF6B6B', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: '#FF6B6B', fontSize: 14, fontWeight: 'bold' },
  summaryCard: { marginHorizontal: 20, padding: 20, borderRadius: 16, borderWidth: 1, backgroundColor: '#16213e', marginBottom: 16 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  summaryIcon: { fontSize: 28 },
  summaryInfo: { flex: 1 },
  summaryGameName: { fontSize: 16, fontWeight: 'bold' },
  summaryMeta: { color: '#999', fontSize: 12, marginTop: 2 },
  summaryCounter: { alignItems: 'center', paddingVertical: 12, backgroundColor: '#0f0f23', borderRadius: 12 },
  summaryCounterValue: { fontSize: 42, fontWeight: 'bold' },
  summaryCounterLabel: { color: '#999', fontSize: 13, marginTop: 4 },
  summaryEmptyArea: { alignItems: 'center', gap: 12, marginTop: 12 },
  summaryEmptyHint: { color: '#999', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  summaryEmptyBtn: { backgroundColor: '#6C63FF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  summaryEmptyBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  tabScroll: { marginBottom: 16 },
  tabScrollContent: { paddingHorizontal: 20, gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#16213e', alignItems: 'center', borderWidth: 1, borderColor: '#2a2a4a' },
  tabText: { color: '#999', fontSize: 12, fontWeight: 'bold' },
  loadingContainer: { alignItems: 'center', padding: 40, gap: 12 },
  loadingText: { color: '#999', fontSize: 14 },
  statRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 10, gap: 10 },
  rankBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  rankText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  numberBall: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  numberText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  barContainer: { flex: 1, height: 10, backgroundColor: '#2a2a4a', borderRadius: 5, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 5 },
  countContainer: { alignItems: 'flex-end', width: 50 },
  countText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  percentText: { color: '#999', fontSize: 11 },
  emptyContainer: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#999', fontSize: 14 },
  distributionContainer: { paddingHorizontal: 20 },
  distCard: { backgroundColor: '#16213e', padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  distCardTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 16 },
  evenOddRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', height: 120, gap: 20 },
  evenOddItem: { alignItems: 'center', width: 80 },
  evenOddBar: { width: 60, borderRadius: 6, minHeight: 10 },
  evenOddPct: { fontSize: 20, fontWeight: 'bold', marginTop: 8 },
  evenOddLabel: { color: '#999', fontSize: 13, marginTop: 2 },
  evenOddDivider: { width: 1, height: '100%', backgroundColor: '#2a2a4a' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  rangeLabel: { color: '#ccc', fontSize: 12, width: 50 },
  rangeBarBg: { flex: 1, height: 18, backgroundColor: '#2a2a4a', borderRadius: 9, overflow: 'hidden' },
  rangeBar: { height: '100%', borderRadius: 9 },
  rangePct: { fontSize: 12, fontWeight: 'bold', width: 36, textAlign: 'right' },
  oddsContainer: { paddingHorizontal: 20 },
  oddsMainCard: { backgroundColor: '#16213e', padding: 20, borderRadius: 16, borderWidth: 1, alignItems: 'center', marginBottom: 16 },
  oddsTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  oddsValue: { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  oddsDesc: { color: '#999', fontSize: 13, textAlign: 'center' },
  couponCalc: { backgroundColor: '#16213e', padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#2a2a4a' },
  couponCalcTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 14 },
  couponInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  couponBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  couponBtnText: { fontSize: 22, fontWeight: 'bold' },
  couponInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 10, fontSize: 20, fontWeight: 'bold' },
  adjustedOdds: { padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  adjustedLabel: { color: '#999', fontSize: 13, marginBottom: 4 },
  adjustedValue: { fontSize: 22, fontWeight: 'bold' },
  infoBox: { backgroundColor: '#0f0f23', padding: 14, borderRadius: 12, marginTop: 4, marginBottom: 20 },
  infoText: { color: '#999', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  summaryItem: { alignItems: 'center' },
  summaryBigNum: { fontSize: 28, fontWeight: 'bold' },
  summaryItemLabel: { color: '#999', fontSize: 12, marginTop: 4 },
  distSubTitle: { color: '#ccc', fontSize: 13, marginBottom: 10 },
  // Geciken sayılar stilleri (sade tasarım)
  coldInfoBox: { marginHorizontal: 20, marginBottom: 12, backgroundColor: '#16213e', padding: 12, borderRadius: 10 },
  coldInfoText: { color: '#999', fontSize: 12, lineHeight: 18 },
  coldRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 10, gap: 10 },
  coldLastSeen: { color: '#999', fontSize: 12 },
  coldMissingSince: { color: '#ccc', fontSize: 13, marginTop: 2 },
  coldTotalCount: { color: '#666', fontSize: 11, marginTop: 2 },
});