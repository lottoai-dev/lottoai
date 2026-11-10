// components/results/StatisticsTab.tsx
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../ui/text';

import { AppTheme } from '../../constants/theme';
import { usePro } from '../../contexts/ProContext';
import {
  consecutiveDistribution,
  parityDistribution,
  sumDistribution,
  supportsParityStats,
  supportsSumStats,
  type ConsecutiveDistribution,
  type ParityDistribution,
  type SumDistribution,
} from '../../lib/drawStats';
import { GameEmblem } from '../../lib/emblems';
import { getGameAccentColor, type Game } from '../../lib/games';
import { softHaptic } from '../../lib/haptics';
import { DiceIcon, LockIcon, LotaMark } from '../../lib/icons';
import { safeQuery, supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';
import { AppButton } from '../ui/app-button';
import { NumberBall } from '../ui/number-ball';
import { EmptyState, ErrorState, LoadingState } from '../ui/states';
import { Surface } from '../ui/surface';

type NumberStat = { number: number; count: number; percentage: number };
/** Recency: missingSince = kaç çekiliştir gelmedi (0 = en son çekilişte var). */
type RecencyStat = { number: number; missingSince: number };

const FILTERS = [
  { label: 'Son 10', value: 10 },
  { label: 'Son 50', value: 50 },
  { label: 'Son 100', value: 100 },
  { label: 'Tümü', value: 0 },
];
const SUBTABS = [
  { key: 'most', label: 'En Çok' },
  { key: 'least', label: 'En Az' },
  { key: 'hot', label: 'Sıcak' },
  { key: 'cold', label: 'Soğuk' },
  { key: 'parity', label: 'Tek/Çift' },
  { key: 'sum', label: 'Toplam', pro: true },
  { key: 'consecutive', label: 'Ardışık', pro: true },
] as const;
type SubKey = (typeof SUBTABS)[number]['key'];

/** Pro sekmeleri ücretsiz kullanıcıda kilitli görünür; dokununca ne gösterdiği anlatılır. */
const PRO_TAB_INFO: Partial<Record<SubKey, { title: string; desc: string }>> = {
  sum: {
    title: 'Toplam dağılımı',
    desc: 'Seçili dönemde çekilişlerin ana sayı toplamlarının hangi aralıklarda yoğunlaştığını ve ortalama toplamı gösterir.',
  },
  consecutive: {
    title: 'Ardışık sayı sıklığı',
    desc: 'Seçili dönemde çekilişlerin kaçında ardışık sayı olmadığını, kaçında 1, 2 ya da daha fazla ardışık çift çıktığını gösterir.',
  },
};

function isProTab(key: SubKey): boolean {
  return SUBTABS.some((t) => t.key === key && 'pro' in t);
}

/** Tek/Çift ve Toplam sekmelerinin ortak satırı: etiket · çubuk · adet + yüzde. */
type DistRow = { key: string | number; label: string; count: number; percentage: number };

function DistributionList({
  rows,
  maxCount,
  accent,
  styles: s,
  theme,
}: {
  rows: DistRow[];
  maxCount: number;
  accent: string;
  styles: ReturnType<typeof makeStyles>;
  theme: AppTheme;
}) {
  const c = theme.colors;
  return (
    <>
      {rows.map((row) => {
        const top = row.count > 0 && row.count === maxCount;
        return (
          <View key={row.key} style={s.barRow}>
            <Text style={[s.distLabel, top && { color: accent, fontFamily: theme.font.bold }]} numberOfLines={1}>
              {row.label}
            </Text>
            <View style={[s.track, { backgroundColor: c.hairline }]}>
              <View
                style={[
                  s.fill,
                  {
                    width: `${maxCount > 0 ? (row.count / maxCount) * 100 : 0}%`,
                    backgroundColor: top ? accent : `${accent}59`,
                  },
                ]}
              />
            </View>
            <View style={s.barVal}>
              <Text style={[s.barCount, top && { color: accent }]}>{row.count}</Text>
              <Text style={s.barPct}>%{row.percentage}</Text>
            </View>
          </View>
        );
      })}
    </>
  );
}

function parseNumbers(str: string): number[] {
  return str.split(' - ').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
}

export function StatisticsTab({ game, refreshKey = 0 }: { game: Game; refreshKey?: number }) {
  const theme = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { isPro } = usePro();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const mainColor = getGameAccentColor(game.id);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalDraws, setTotalDraws] = useState(0);
  const [mostCommon, setMostCommon] = useState<NumberStat[]>([]);
  const [leastCommon, setLeastCommon] = useState<NumberStat[]>([]);
  const [hotNumbers, setHotNumbers] = useState<RecencyStat[]>([]);
  const [coldNumbers, setColdNumbers] = useState<RecencyStat[]>([]);
  const [parity, setParity] = useState<ParityDistribution | null>(null);
  const [sums, setSums] = useState<SumDistribution | null>(null);
  const [consecutive, setConsecutive] = useState<ConsecutiveDistribution | null>(null);
  const [activeTab, setActiveTab] = useState<SubKey>('most');
  const [filterValue, setFilterValue] = useState(0);

  const fetchStats = useCallback(
    async (limit: number) => {
      setError(null);
      setLoading(true);
      try {
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
          setMostCommon([]);
          setLeastCommon([]);
          setHotNumbers([]);
          setColdNumbers([]);
          setParity(null);
          setSums(null);
          setConsecutive(null);
          return;
        }

        if (!data || data.length === 0) {
          setTotalDraws(0);
          setMostCommon([]);
          setLeastCommon([]);
          setHotNumbers([]);
          setColdNumbers([]);
          setParity(null);
          setSums(null);
          setConsecutive(null);
          return;
        }

        setTotalDraws(data.length);

        const countMap: Record<number, number> = {};
        const missingMap: Record<number, number> = {};
        const drawNumbers: number[][] = [];

        data.forEach((row, idx) => {
          const nums = parseNumbers(row.numbers).filter((n) => n >= 1 && n <= game.max);
          drawNumbers.push(nums);
          nums.forEach((num) => {
            countMap[num] = (countMap[num] || 0) + 1;
            if (missingMap[num] === undefined) missingMap[num] = idx;
          });
        });

        const stats: NumberStat[] = Array.from({ length: game.max }, (_, index) => {
          const number = index + 1;
          const count = countMap[number] ?? 0;
          return {
            number,
            count,
            percentage: Math.round((count / data.length) * 100),
          };
        });
        stats.sort((a, b) => b.count - a.count);
        setMostCommon(stats.slice(0, 10));
        setLeastCommon(
          [...stats]
            .sort((a, b) => (a.count !== b.count ? a.count - b.count : a.number - b.number))
            .slice(0, 10),
        );

        const ranked: RecencyStat[] = [];
        for (let num = 1; num <= game.max; num++) {
          ranked.push({
            number: num,
            missingSince: missingMap[num] ?? data.length,
          });
        }
        ranked.sort((a, b) => {
          if (a.missingSince !== b.missingSince) return a.missingSince - b.missingSince;
          return a.number - b.number;
        });
        setHotNumbers(ranked.slice(0, 10));
        setColdNumbers([...ranked].reverse().slice(0, 10));
        setParity(supportsParityStats(game.id) ? parityDistribution(drawNumbers, game.count) : null);
        setSums(sumDistribution(drawNumbers, game.count, game.id));
        setConsecutive(supportsParityStats(game.id) ? consecutiveDistribution(drawNumbers, game.count) : null);
      } finally {
        setLoading(false);
      }
    },
    [game.name, game.max, game.id, game.count],
  );

  useEffect(() => {
    void fetchStats(filterValue);
  }, [game.id, filterValue, refreshKey, fetchStats]);

  const isFrequency = activeTab === 'most' || activeTab === 'least';
  const frequencyStats = activeTab === 'most' ? mostCommon : leastCommon;
  const recencyStats = activeTab === 'hot' ? hotNumbers : coldNumbers;
  const maxCount = frequencyStats.length > 0 ? Math.max(...frequencyStats.map((d) => d.count)) : 1;
  const maxMissing =
    recencyStats.length > 0 ? Math.max(...recencyStats.map((d) => d.missingSince), 1) : 1;

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
              const locked = !isPro && isProTab(tab.key);
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => {
                    if (!active) softHaptic();
                    setActiveTab(tab.key);
                  }}
                  style={[s.subtab, s.subtabInner, { backgroundColor: active ? mainColor : c.surface }]}
                  accessibilityLabel={locked ? `${tab.label}, Pro` : tab.label}
                >
                  {locked ? <LockIcon color={active ? '#fff' : c.text3} size={12} strokeWidth={2.4} /> : null}
                  <Text style={[s.subtabText, { color: active ? '#fff' : c.text2 }]}>{tab.label}</Text>
                </Pressable>
              );
            })}
            <View style={{ width: 8 }} />
          </ScrollView>

          {!isPro && isProTab(activeTab) ? (
            <Surface style={s.proTeaser}>
              <View style={[s.proTeaserIcon, { backgroundColor: `${mainColor}14` }]}>
                <LockIcon color={mainColor} size={22} />
              </View>
              <Text style={s.proTeaserTitle}>{PRO_TAB_INFO[activeTab]?.title}</Text>
              <Text style={s.proTeaserDesc}>{PRO_TAB_INFO[activeTab]?.desc}</Text>
              <AppButton
                label="Pro ile aç"
                onPress={() => {
                  softHaptic();
                  router.push('/pro' as never);
                }}
                iconLeft={(color, size) => <LotaMark color={color} size={size} />}
                style={{ marginTop: 14, alignSelf: 'stretch' }}
              />
            </Surface>
          ) : activeTab === 'parity' || activeTab === 'sum' || activeTab === 'consecutive' ? (
            game.id === 'onnumara' ? (
              <Text style={s.note}>
                On Numara{"'"}da çekilişte 22 sayı çıktığı için bu istatistik gösterilmiyor.
              </Text>
            ) : activeTab === 'parity' ? (
              parity && parity.total > 0 ? (
                <DistributionList
                  rows={parity.rows.map((r) => ({
                    key: r.odd,
                    label: `${r.odd} tek – ${r.even} çift`,
                    count: r.count,
                    percentage: r.percentage,
                  }))}
                  maxCount={parity.maxCount}
                  accent={mainColor}
                  styles={s}
                  theme={theme}
                />
              ) : (
                <Text style={s.note}>Bu dönem için tek/çift verisi bulunamadı.</Text>
              )
            ) : activeTab === 'consecutive' ? (
              consecutive && consecutive.total > 0 ? (
                <DistributionList
                  rows={consecutive.rows.map((r) => ({
                    key: r.pairs,
                    label: r.label,
                    count: r.count,
                    percentage: r.percentage,
                  }))}
                  maxCount={consecutive.maxCount}
                  accent={mainColor}
                  styles={s}
                  theme={theme}
                />
              ) : (
                <Text style={s.note}>Bu dönem için ardışık sayı verisi bulunamadı.</Text>
              )
            ) : sums && sums.total > 0 && supportsSumStats(game.id) ? (
              <>
                <Text style={s.distHeader}>
                  Ortalama toplam: <Text style={{ color: mainColor }}>{sums.average}</Text>
                </Text>
                <DistributionList
                  rows={sums.rows.map((r) => ({ key: r.label, label: r.label, count: r.count, percentage: r.percentage }))}
                  maxCount={sums.maxCount}
                  accent={mainColor}
                  styles={s}
                  theme={theme}
                />
              </>
            ) : (
              <Text style={s.note}>Bu dönem için toplam verisi bulunamadı.</Text>
            )
          ) : isFrequency
            ? frequencyStats.map((stat, i) => (
                <View key={stat.number} style={s.barRow}>
                  <View style={[s.rank, { backgroundColor: c.surfaceAlt }]}>
                    <Text style={s.rankText}>{i + 1}</Text>
                  </View>
                  <NumberBall value={stat.number} color={mainColor} variant="matched" size={38} />
                  <View style={[s.track, { backgroundColor: c.hairline }]}>
                    <View
                      style={[s.fill, { width: `${(stat.count / maxCount) * 100}%`, backgroundColor: mainColor }]}
                    />
                  </View>
                  <View style={s.barVal}>
                    <Text style={s.barCount}>{stat.count}</Text>
                    <Text style={s.barPct}>%{stat.percentage}</Text>
                  </View>
                </View>
              ))
            : recencyStats.map((item, i) => {
                const heat =
                  activeTab === 'hot'
                    ? ((maxMissing - item.missingSince) / maxMissing) * 100
                    : (item.missingSince / maxMissing) * 100;
                return (
                  <View key={item.number} style={s.barRow}>
                    <View style={[s.rank, { backgroundColor: c.surfaceAlt }]}>
                      <Text style={s.rankText}>{i + 1}</Text>
                    </View>
                    <NumberBall value={item.number} color={mainColor} variant="matched" size={38} />
                    <View style={[s.track, { backgroundColor: c.hairline }]}>
                      <View style={[s.fill, { width: `${Math.max(heat, 4)}%`, backgroundColor: mainColor }]} />
                    </View>
                    <View style={s.barVal}>
                      <Text style={s.barCount}>{item.missingSince}</Text>
                      <Text style={s.barPct}>çekiliş</Text>
                    </View>
                  </View>
                );
              })}
        </>
      )}
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
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
    subtab: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: radius.pill },
    subtabText: { ...ty.caption, fontFamily: theme.font.semibold },
    subtabInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    proTeaser: { marginHorizontal: 20, padding: 20, alignItems: 'center' },
    proTeaserIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    proTeaserTitle: { ...ty.h3, color: c.text, textAlign: 'center' },
    proTeaserDesc: { ...ty.body, color: c.text2, textAlign: 'center', marginTop: 6 },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 11 },
    rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    rankText: { ...ty.caption, fontFamily: theme.font.semibold, color: c.text3, fontSize: 11 },
    track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 4 },
    barVal: { width: 50, alignItems: 'flex-end' },
    barCount: { ...ty.bodySemibold, color: c.text, fontVariant: ['tabular-nums'], fontSize: 13 },
    barPct: { ...ty.caption, color: c.text3, fontSize: 11 },
    distLabel: { ...ty.bodySemibold, color: c.text, fontSize: 13, width: 116, fontVariant: ['tabular-nums'] },
    distHeader: { ...ty.bodySemibold, color: c.text2, fontSize: 13, marginHorizontal: 20, marginBottom: spacing.md, fontVariant: ['tabular-nums'] },
    note: { ...ty.caption, color: c.text3, textAlign: 'center', marginHorizontal: 20, marginTop: spacing.md },
  });
}
