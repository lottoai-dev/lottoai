// components/results/StatisticsTab.tsx
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppTheme } from '../../constants/theme';
import { GameEmblem } from '../../lib/emblems';
import { getGameAccentColor, type Game } from '../../lib/games';
import { softHaptic } from '../../lib/haptics';
import { DiceIcon } from '../../lib/icons';
import { safeQuery, supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';
import { NumberBall } from '../ui/number-ball';
import { EmptyState, ErrorState, LoadingState } from '../ui/states';
import { Surface } from '../ui/surface';

/* ---------------- odds math ---------------- */
function combination(n: number, r: number): number {
  if (r > n) return 0;
  if (r === 0 || r === n) return 1;
  let result = 1;
  for (let i = 0; i < r; i++) {
    result *= n - i;
    result /= i + 1;
  }
  return Math.round(result);
}
const ON_NUMARA_DRAWN = 22;
function calcOdds(game: Game): number {
  if (game.id === 'onnumara') return combination(game.max, game.count) / combination(ON_NUMARA_DRAWN, game.count);
  const mainOdds = combination(game.max, game.count);
  return game.bonus ? mainOdds * combination(game.bonus.max, game.bonus.count) : mainOdds;
}
function formatOdds(n: number): string {
  if (n >= 1e9) return `1 / ${(n / 1e9).toFixed(1)} milyar`;
  if (n >= 1e6) return `1 / ${(n / 1e6).toFixed(1)} milyon`;
  if (n >= 1e3) return `1 / ${(n / 1e3).toFixed(0)} bin`;
  return `1 / ${n.toFixed(0)}`;
}

type NumberStat = { number: number; count: number; percentage: number };
type ColdNumber = { number: number; count: number; missingSince: number };
type Dist = { label: string; count: number; pct: number };

const FILTERS = [
  { label: 'Son 10', value: 10 },
  { label: 'Son 50', value: 50 },
  { label: 'Son 100', value: 100 },
  { label: 'Tümü', value: 0 },
];
const SUBTABS = [
  { key: 'most', label: 'En Çok' },
  { key: 'least', label: 'En Az' },
  { key: 'cold', label: 'Geciken' },
  { key: 'distribution', label: 'Dağılım' },
  { key: 'consecutive', label: 'Ardışık' },
  { key: 'sum', label: 'Toplam' },
  { key: 'odds', label: 'İhtimal' },
] as const;
type SubKey = (typeof SUBTABS)[number]['key'];

function parseNumbers(str: string): number[] {
  return str.split(' - ').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
}

export function StatisticsTab({ game, refreshKey = 0 }: { game: Game; refreshKey?: number }) {
  const theme = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const mainColor = getGameAccentColor(game.id);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalDraws, setTotalDraws] = useState(0);
  const [mostCommon, setMostCommon] = useState<NumberStat[]>([]);
  const [leastCommon, setLeastCommon] = useState<NumberStat[]>([]);
  const [coldNumbers, setColdNumbers] = useState<ColdNumber[]>([]);
  const [activeTab, setActiveTab] = useState<SubKey>('most');
  const [filterValue, setFilterValue] = useState(0);
  const [couponCount, setCouponCount] = useState('1');
  const [evenOdd, setEvenOdd] = useState({ even: 0, odd: 0 });
  const [rangeStats, setRangeStats] = useState<Dist[]>([]);
  const [consecutive, setConsecutive] = useState({ avg: 0, max: 0, distribution: [] as Dist[] });
  const [sumStats, setSumStats] = useState({ avg: 0, min: 0, max: 0, distribution: [] as Dist[] });

  const fetchStats = useCallback(
    async (limit: number) => {
      setError(null);
      setLoading(true);
      let query = supabase
        .from('draws')
        .select('numbers, draw_date')
        .eq('game', game.name)
        .order('draw_date_parsed', { ascending: false });
      if (limit > 0) query = query.limit(limit);

      const { data, error: err } = await safeQuery(() => query, 'İstatistikler yüklenirken bir sorun oluştu.');

      if (err) {
        setError(err);
        setTotalDraws(0);
        return;
      }

      if (!data || data.length === 0) {
        setTotalDraws(0);
        setMostCommon([]);
        setLeastCommon([]);
        setColdNumbers([]);
        setEvenOdd({ even: 0, odd: 0 });
        setRangeStats([]);
        setConsecutive({ avg: 0, max: 0, distribution: [] });
        setSumStats({ avg: 0, min: 0, max: 0, distribution: [] });
        return;
      }

      setTotalDraws(data.length);

      const countMap: Record<number, number> = {};
      const missingMap: Record<number, number> = {};
      let totalNumbers = 0;
      let evenCount = 0;

      data.forEach((row, idx) => {
        const nums = parseNumbers(row.numbers).filter((n) => n >= 1 && n <= game.max);
        nums.forEach((num) => {
          countMap[num] = (countMap[num] || 0) + 1;
          totalNumbers++;
          if (num % 2 === 0) evenCount++;
          if (missingMap[num] === undefined) missingMap[num] = idx;
        });
      });

      const coldList: ColdNumber[] = [];
      for (let num = 1; num <= game.max; num++) {
        coldList.push({ number: num, count: countMap[num] || 0, missingSince: missingMap[num] ?? data.length });
      }
      coldList.sort((a, b) => b.missingSince - a.missingSince);
      setColdNumbers(coldList.slice(0, 10));

      const stats: NumberStat[] = Object.entries(countMap).map(([num, count]) => ({
        number: parseInt(num, 10),
        count,
        percentage: Math.round((count / data.length) * 100),
      }));
      stats.sort((a, b) => b.count - a.count);
      setMostCommon(stats.slice(0, 10));
      setLeastCommon([...stats].sort((a, b) => a.count - b.count).slice(0, 10));

      setEvenOdd({
        even: Math.round((evenCount / totalNumbers) * 100),
        odd: Math.round(((totalNumbers - evenCount) / totalNumbers) * 100),
      });

      const rangeSize = Math.ceil(game.max / 5);
      const ranges = Array.from({ length: 5 }, (_, i) => {
        const from = i * rangeSize + 1;
        const to = Math.min((i + 1) * rangeSize, game.max);
        let count = 0;
        for (let n = from; n <= to; n++) count += countMap[n] || 0;
        return { label: `${from}-${to}`, count, pct: totalNumbers > 0 ? Math.round((count / totalNumbers) * 100) : 0 };
      });
      setRangeStats(ranges);

      const consDist: Record<number, number> = {};
      let totalCons = 0;
      let maxCons = 0;
      data.forEach((row) => {
        const nums = parseNumbers(row.numbers).sort((a, b) => a - b);
        let pairs = 0;
        for (let i = 0; i < nums.length - 1; i++) if (nums[i + 1] - nums[i] === 1) pairs++;
        consDist[pairs] = (consDist[pairs] || 0) + 1;
        totalCons += pairs;
        if (pairs > maxCons) maxCons = pairs;
      });
      const avgCons = data.length > 0 ? Math.round((totalCons / data.length) * 10) / 10 : 0;
      const consArr = Array.from({ length: maxCons + 1 }, (_, i) => ({
        label: i === 0 ? 'Yok' : `${i} çift`,
        count: consDist[i] || 0,
        pct: data.length > 0 ? Math.round(((consDist[i] || 0) / data.length) * 100) : 0,
      }));
      setConsecutive({ avg: avgCons, max: maxCons, distribution: consArr });

      const sums: number[] = [];
      data.forEach((row) => {
        const nums = parseNumbers(row.numbers).filter((n) => n >= 1 && n <= game.max);
        if (nums.length > 0) sums.push(nums.reduce((a, b) => a + b, 0));
      });
      if (sums.length > 0) {
        const avgSum = Math.round(sums.reduce((a, b) => a + b, 0) / sums.length);
        const minSum = Math.min(...sums);
        const maxSum = Math.max(...sums);
        const rangeWidth = Math.ceil((maxSum - minSum) / 5) || 1;
        const sumDist = Array.from({ length: 5 }, (_, i) => {
          const from = minSum + i * rangeWidth;
          const to = i === 4 ? maxSum : from + rangeWidth - 1;
          const count = sums.filter((x) => x >= from && x <= to).length;
          return { label: `${from}-${to}`, count, pct: Math.round((count / sums.length) * 100) };
        });
        setSumStats({ avg: avgSum, min: minSum, max: maxSum, distribution: sumDist });
      }

      setLoading(false);
    },
    [game.name, game.max, game.count]
  );

  useEffect(() => {
    fetchStats(filterValue);
  }, [game.id, filterValue, refreshKey]);

  const displayStats = activeTab === 'most' ? mostCommon : activeTab === 'least' ? leastCommon : [];
  const maxCount = displayStats.length > 0 ? Math.max(...displayStats.map((d) => d.count)) : 1;
  const maxRangeCount = rangeStats.length > 0 ? Math.max(...rangeStats.map((r) => r.count)) : 1;
  const maxMissing = coldNumbers.length > 0 ? coldNumbers[0].missingSince : 1;
  const odds = calcOdds(game);
  const count = parseInt(couponCount, 10) || 1;
  const adjustedOdds = odds / count;

  if (error) return <ErrorState message={error} onRetry={() => fetchStats(filterValue)} />;

  return (
    <View>
      <Surface style={s.summary}>
        <View style={[s.drawAccent, { backgroundColor: mainColor }]} />
        <View style={s.summaryHead}>
          <View style={[s.summaryEmblem, { backgroundColor: `${mainColor}14` }]}>
            <GameEmblem game={game.id} size={32} color={mainColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.summaryName, { color: mainColor }]}>{game.name}</Text>
            <Text style={s.summaryMeta}>{filterValue > 0 ? `Son ${filterValue} çekiliş` : 'Tüm çekilişler'}</Text>
          </View>
          <View style={s.counter}>
            <Text style={s.counterNum}>{totalDraws}</Text>
            <Text style={s.counterLabel}>çekiliş</Text>
          </View>
        </View>
        <View style={s.filterRow}>
          {FILTERS.map((f) => {
            const active = filterValue === f.value;
            return (
              <Pressable
                key={f.value}
                onPress={() => {
                  if (!active) softHaptic();
                  setFilterValue(f.value);
                }}
                style={[s.filterBtn, { backgroundColor: active ? mainColor : c.surface }]}
              >
                <Text style={[s.filterText, { color: active ? '#fff' : c.text2 }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Surface>

      {loading ? (
        <LoadingState label="İstatistikler hesaplanıyor…" />
      ) : totalDraws === 0 ? (
        <EmptyState
          icon={<DiceIcon color={c.brand} size={28} />}
          title="Henüz veri yok"
          desc="Bu oyun için çekiliş verisi bulunamadı."
          action="Kolon üret"
          onAction={() => router.push('/(tabs)/generate')}
        />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.subtabRow}>
            {SUBTABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => {
                    if (!active) softHaptic();
                    setActiveTab(tab.key);
                  }}
                  style={[s.subtab, { backgroundColor: active ? mainColor : c.surface }]}
                >
                  <Text style={[s.subtabText, { color: active ? '#fff' : c.text2 }]}>{tab.label}</Text>
                </Pressable>
              );
            })}
            <View style={{ width: 8 }} />
          </ScrollView>

          {(activeTab === 'most' || activeTab === 'least') &&
            displayStats.map((stat, i) => (
              <View key={stat.number} style={s.barRow}>
                <View style={[s.rank, { backgroundColor: c.surfaceAlt }]}>
                  <Text style={s.rankText}>{i + 1}</Text>
                </View>
                <NumberBall value={stat.number} color={mainColor} variant="matched" size={38} />
                <View style={[s.track, { backgroundColor: c.hairline }]}>
                  <View style={[s.fill, { width: `${(stat.count / maxCount) * 100}%`, backgroundColor: mainColor }]} />
                </View>
                <View style={s.barVal}>
                  <Text style={s.barCount}>{stat.count}</Text>
                  <Text style={s.barPct}>%{stat.percentage}</Text>
                </View>
              </View>
            ))}

          {activeTab === 'cold' && (
            <>
              {coldNumbers.map((item, i) => (
                <View key={item.number} style={s.barRow}>
                  <View style={[s.rank, { backgroundColor: c.surfaceAlt }]}>
                    <Text style={s.rankText}>{i + 1}</Text>
                  </View>
                  <NumberBall value={item.number} color={mainColor} variant="matched" size={38} />
                  <View style={[s.track, { backgroundColor: c.hairline }]}>
                    <View style={[s.fill, { width: `${(item.missingSince / maxMissing) * 100}%`, backgroundColor: mainColor }]} />
                  </View>
                  <View style={s.barVal}>
                    <Text style={s.barCount}>{item.missingSince}</Text>
                    <Text style={s.barPct}>çekiliş</Text>
                  </View>
                </View>
              ))}
              <View style={s.pad}>
                <StatNote text="Bir sayının uzun süredir çıkmamış olması, bir sonraki çekilişte çıkma ihtimalini ARTIRMAZ — her çekiliş bağımsızdır, geçmiş sonuçları 'hatırlamaz'." theme={theme} />
              </View>
            </>
          )}

          {activeTab === 'distribution' && (
            <View style={s.pad}>
              <Surface style={s.distCard}>
                <Text style={s.distTitle}>Çift / Tek dağılımı</Text>
                <View style={s.eoRow}>
                  <View style={s.eoItem}>
                    <View style={[s.eoBar, { backgroundColor: mainColor, height: `${evenOdd.even}%` }]} />
                    <Text style={[s.eoPct, { color: mainColor }]}>%{evenOdd.even}</Text>
                    <Text style={s.eoLabel}>Çift</Text>
                  </View>
                  <View style={[s.eoDivider, { backgroundColor: c.hairline }]} />
                  <View style={s.eoItem}>
                    <View style={[s.eoBar, { backgroundColor: c.gold, height: `${evenOdd.odd}%` }]} />
                    <Text style={[s.eoPct, { color: c.gold }]}>%{evenOdd.odd}</Text>
                    <Text style={s.eoLabel}>Tek</Text>
                  </View>
                </View>
              </Surface>
              <Surface style={s.distCard}>
                <Text style={s.distTitle}>Sayı aralığı dağılımı</Text>
                {rangeStats.map((r, i) => (
                  <View key={i} style={s.distRow}>
                    <Text style={s.distLabel}>{r.label}</Text>
                    <View style={[s.distTrack, { backgroundColor: c.hairline }]}>
                      <View style={[s.distFill, { width: `${(r.count / maxRangeCount) * 100}%`, backgroundColor: mainColor, opacity: 0.5 + i * 0.1 }]} />
                    </View>
                    <Text style={[s.distPct, { color: mainColor }]}>%{r.pct}</Text>
                  </View>
                ))}
              </Surface>
              <StatNote text="İstatistikler geçmiş verilere dayanır ve gelecek sonuçları tahmin etmez." theme={theme} />
            </View>
          )}

          {activeTab === 'consecutive' && (
            <View style={s.pad}>
              <Surface style={s.distCard}>
                <Text style={s.distTitle}>Ardışık sayı analizi</Text>
                <View style={s.bigRow}>
                  <Big value={consecutive.avg} label="Ortalama çift" theme={theme} />
                  <Big value={consecutive.max} label="Maks. çift" theme={theme} />
                </View>
                <Text style={s.distSub}>Çekiliş başına ardışık çift dağılımı:</Text>
                {consecutive.distribution.map((r, i) => (
                  <View key={i} style={s.distRow}>
                    <Text style={s.distLabel}>{r.label}</Text>
                    <View style={[s.distTrack, { backgroundColor: c.hairline }]}>
                      <View style={[s.distFill, { width: `${r.pct}%`, backgroundColor: mainColor }]} />
                    </View>
                    <Text style={[s.distPct, { color: mainColor }]}>%{r.pct}</Text>
                  </View>
                ))}
              </Surface>
              <StatNote text="Ardışık çift: 23-24 gibi yan yana sayılar." theme={theme} />
            </View>
          )}

          {activeTab === 'sum' && (
            <View style={s.pad}>
              <Surface style={s.distCard}>
                <Text style={s.distTitle}>Çekilen sayıların toplamı</Text>
                <View style={s.bigRow}>
                  <Big value={sumStats.avg} label="Ortalama" theme={theme} />
                  <Big value={sumStats.min} label="En düşük" theme={theme} />
                  <Big value={sumStats.max} label="En yüksek" theme={theme} />
                </View>
                <Text style={s.distSub}>Toplam aralığı dağılımı:</Text>
                {sumStats.distribution.map((r, i) => (
                  <View key={i} style={s.distRow}>
                    <Text style={[s.distLabel, { width: 70 }]}>{r.label}</Text>
                    <View style={[s.distTrack, { backgroundColor: c.hairline }]}>
                      <View style={[s.distFill, { width: `${r.pct}%`, backgroundColor: mainColor, opacity: 0.5 + i * 0.1 }]} />
                    </View>
                    <Text style={[s.distPct, { color: mainColor }]}>%{r.pct}</Text>
                  </View>
                ))}
              </Surface>
              <StatNote text="Toplamlar geçmiş çekilişlere aittir; hiçbir toplam diğerinden daha olası ya da 'doğru' değildir, her çekiliş bağımsızdır." theme={theme} />
            </View>
          )}

          {activeTab === 'odds' && (
            <View style={s.pad}>
              <Surface style={[s.distCard, { alignItems: 'center' }]}>
                <Text style={s.oddsTitle}>Büyük ikramiye ihtimali</Text>
                <Text style={[s.oddsValue, { color: mainColor }]}>{formatOdds(odds)}</Text>
                <Text style={s.oddsDesc}>
                  {game.count} doğru / {game.max} top{game.bonus ? ` + 1/${game.bonus.max} şans topu` : ''}
                </Text>
              </Surface>
              <Surface style={s.distCard}>
                <Text style={s.distTitle}>Kaç kolon oynarsan?</Text>
                <View style={s.couponRow}>
                  <Pressable onPress={() => { softHaptic(); setCouponCount(String(Math.max(1, count - 1))); }} style={[s.couponBtn, { backgroundColor: mainColor + '18' }]}>
                    <Text style={[s.couponBtnText, { color: mainColor }]}>−</Text>
                  </Pressable>
                  <TextInput
                    style={[s.couponInput, { backgroundColor: mainColor + '14', color: mainColor }]}
                    value={couponCount}
                    onChangeText={setCouponCount}
                    keyboardType="numeric"
                    textAlign="center"
                  />
                  <Pressable onPress={() => { softHaptic(); setCouponCount(String(count + 1)); }} style={[s.couponBtn, { backgroundColor: mainColor + '18' }]}>
                    <Text style={[s.couponBtnText, { color: mainColor }]}>+</Text>
                  </Pressable>
                </View>
                <View style={[s.adjusted, { backgroundColor: mainColor + '14' }]}>
                  <Text style={s.adjustedLabel}>{count} kolon ile şansın</Text>
                  <Text style={[s.adjustedValue, { color: mainColor }]}>{formatOdds(adjustedOdds)}</Text>
                </View>
              </Surface>
              <StatNote text="Şans oyunları tamamen rastgeledir. Sorumlu oyna." theme={theme} />
            </View>
          )}
        </>
      )}
    </View>
  );
}

function Big({ value, label, theme }: { value: number; label: string; theme: AppTheme }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontFamily: theme.font.extrabold, fontSize: 26, color: theme.colors.text }}>{value}</Text>
      <Text style={{ ...theme.typography.caption, color: theme.colors.text3, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

function StatNote({ text, theme }: { text: string; theme: AppTheme }) {
  return (
    <View style={{ backgroundColor: theme.colors.surfaceAlt, padding: 13, borderRadius: theme.radius.lg, marginBottom: theme.spacing.xxl }}>
      <Text style={{ ...theme.typography.caption, color: theme.colors.text2, lineHeight: 18, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    pad: { paddingHorizontal: 20 },
    summary: { marginHorizontal: 20, padding: spacing.lg, paddingLeft: spacing.lg + 4, marginBottom: spacing.lg, overflow: 'hidden' },
    drawAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.lg },
    summaryEmblem: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    summaryName: { ...ty.h3, color: c.text },
    summaryMeta: { ...ty.caption, color: c.text3, marginTop: 2 },
    counter: { alignItems: 'flex-end' },
    counterNum: { fontFamily: theme.font.extrabold, fontSize: 28, fontVariant: ['tabular-nums'], color: c.text },
    counterLabel: { ...ty.caption, color: c.text3 },
    filterRow: { flexDirection: 'row', gap: 8 },
    filterBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill },
    filterText: { ...ty.caption, fontFamily: theme.font.semibold },
    subtabRow: { paddingHorizontal: 20, gap: 8, marginBottom: spacing.lg },
    subtab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 15, paddingVertical: 9, borderRadius: radius.pill },
    subtabText: { ...ty.caption, fontFamily: theme.font.semibold },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 11 },
    rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    rankText: { ...ty.caption, fontFamily: theme.font.semibold, color: c.text3, fontSize: 11 },
    track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 4 },
    barVal: { width: 50, alignItems: 'flex-end' },
    barCount: { ...ty.bodySemibold, color: c.text, fontVariant: ['tabular-nums'], fontSize: 13 },
    barPct: { ...ty.caption, color: c.text3, fontSize: 11 },
    distCard: { padding: spacing.lg, marginBottom: spacing.lg },
    distTitle: { ...ty.title, color: c.text, marginBottom: spacing.lg },
    distSub: { ...ty.caption, color: c.text2, marginBottom: 10, marginTop: 4 },
    distRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    distLabel: { ...ty.caption, color: c.text, width: 50 },
    distTrack: { flex: 1, height: 18, borderRadius: 9, overflow: 'hidden' },
    distFill: { height: '100%', borderRadius: 9 },
    distPct: { ...ty.caption, fontFamily: theme.font.semibold, width: 36, textAlign: 'right' },
    eoRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', height: 120, gap: 20 },
    eoItem: { alignItems: 'center', width: 80, justifyContent: 'flex-end', height: '100%' },
    eoBar: { width: 56, borderRadius: 6, minHeight: 10 },
    eoPct: { fontFamily: theme.font.bold, fontSize: 20, marginTop: 8 },
    eoLabel: { ...ty.caption, color: c.text2, marginTop: 2 },
    eoDivider: { width: 1, height: '100%' },
    bigRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.lg },
    oddsTitle: { ...ty.title, color: c.text, marginBottom: 12 },
    oddsValue: { fontFamily: theme.font.bold, fontSize: 26, marginBottom: 8, letterSpacing: -0.5 },
    oddsDesc: { ...ty.caption, color: c.text2, textAlign: 'center' },
    couponRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    couponBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    couponBtnText: { fontFamily: theme.font.semibold, fontSize: 22 },
    couponInput: { flex: 1, height: 46, borderRadius: radius.lg, backgroundColor: c.surfaceAlt, fontFamily: theme.font.bold, fontSize: 20, textAlign: 'center' },
    adjusted: { padding: 14, borderRadius: radius.lg, alignItems: 'center' },
    adjustedLabel: { ...ty.caption, color: c.text2, marginBottom: 4 },
    adjustedValue: { fontFamily: theme.font.bold, fontSize: 22 },
  });
}