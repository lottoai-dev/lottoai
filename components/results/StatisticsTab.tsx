// components/results/StatisticsTab.tsx
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTheme } from '../../constants/theme';
import { GameEmblem } from '../../lib/emblems';
import { getGameAccentColor, type Game } from '../../lib/games';
import { softHaptic } from '../../lib/haptics';
import { CloseIcon, DiceIcon } from '../../lib/icons';
import { safeQuery, supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';
import { NumberBall } from '../ui/number-ball';
import { EmptyState, ErrorState, LoadingState } from '../ui/states';
import { Surface } from '../ui/surface';

type DrawRow = { numbers: string; draw_date: string };
type NumberStat = { number: number; count: number; percentage: number };
/** Recency: missingSince = kaç çekiliştir gelmedi (0 = en son çekilişte var). */
type RecencyStat = { number: number; missingSince: number };
type NumberDetail = {
  number: number;
  count: number;
  percentage: number;
  lastSeen: string;
  missingSince: number;
  topPairs: number[];
  recentDates: string[];
};

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
] as const;
type SubKey = (typeof SUBTABS)[number]['key'];

const TAB_EXPLANATIONS: Record<SubKey, string> = {
  most: 'Seçilen çekiliş aralığında en sık çıkan sayılar.',
  least: 'Seçilen çekiliş aralığında en az çıkan veya hiç çıkmayan sayılar.',
  hot: 'Seçilen aralıkta yakın çekilişlerde görülmüş sayılar.',
  cold: 'Seçilen aralıkta daha uzun süredir görülmeyen sayılar.',
};

function parseNumbers(str: string): number[] {
  return str.split(' - ').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
}

function buildNumberDetail(num: number, draws: DrawRow[], max: number): NumberDetail {
  let count = 0;
  let lastSeen = 'Hiç çıkmadı';
  let missingSince = 0;
  const pairFreq: Record<number, number> = {};
  const recentDates: string[] = [];

  for (let i = 0; i < draws.length; i++) {
    const drawn = parseNumbers(draws[i].numbers).filter((n) => n >= 1 && n <= max);
    if (drawn.includes(num)) {
      count++;
      if (lastSeen === 'Hiç çıkmadı') lastSeen = draws[i].draw_date;
      if (recentDates.length < 5) recentDates.push(draws[i].draw_date);
      drawn.forEach((p) => {
        if (p !== num) pairFreq[p] = (pairFreq[p] || 0) + 1;
      });
    } else if (lastSeen === 'Hiç çıkmadı') {
      missingSince++;
    }
  }

  const topPairs = Object.entries(pairFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([n]) => parseInt(n, 10));

  return {
    number: num,
    count,
    percentage: draws.length > 0 ? Math.round((count / draws.length) * 100) : 0,
    lastSeen,
    missingSince: lastSeen === 'Hiç çıkmadı' ? draws.length : missingSince,
    topPairs,
    recentDates,
  };
}

export function StatisticsTab({ game, refreshKey = 0 }: { game: Game; refreshKey?: number }) {
  const theme = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const mainColor = getGameAccentColor(game.id);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draws, setDraws] = useState<DrawRow[]>([]);
  const [totalDraws, setTotalDraws] = useState(0);
  const [mostCommon, setMostCommon] = useState<NumberStat[]>([]);
  const [leastCommon, setLeastCommon] = useState<NumberStat[]>([]);
  const [hotNumbers, setHotNumbers] = useState<RecencyStat[]>([]);
  const [coldNumbers, setColdNumbers] = useState<RecencyStat[]>([]);
  const [activeTab, setActiveTab] = useState<SubKey>('most');
  const [filterValue, setFilterValue] = useState(0);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);

  const rangeLabel = filterValue > 0 ? `Son ${filterValue} çekiliş` : 'Tüm çekilişler';

  const fetchStats = useCallback(
    async (limit: number) => {
      setError(null);
      setLoading(true);
      setSelectedNumber(null);
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
          setDraws([]);
          setTotalDraws(0);
          setMostCommon([]);
          setLeastCommon([]);
          setHotNumbers([]);
          setColdNumbers([]);
          return;
        }

        if (!data || data.length === 0) {
          setDraws([]);
          setTotalDraws(0);
          setMostCommon([]);
          setLeastCommon([]);
          setHotNumbers([]);
          setColdNumbers([]);
          return;
        }

        setDraws(data);
        setTotalDraws(data.length);

        const countMap: Record<number, number> = {};
        const missingMap: Record<number, number> = {};

        data.forEach((row, idx) => {
          const nums = parseNumbers(row.numbers).filter((n) => n >= 1 && n <= game.max);
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
      } finally {
        setLoading(false);
      }
    },
    [game.name, game.max],
  );

  useEffect(() => {
    void fetchStats(filterValue);
  }, [game.id, filterValue, refreshKey, fetchStats]);

  const detail = useMemo(
    () => (selectedNumber == null ? null : buildNumberDetail(selectedNumber, draws, game.max)),
    [selectedNumber, draws, game.max],
  );

  const openDetail = (num: number) => {
    softHaptic();
    setSelectedNumber(num);
  };

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
            <Text style={s.summaryMeta}>{rangeLabel}</Text>
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

          <Surface style={s.explanation}>
            <Text style={s.explanationText}>{TAB_EXPLANATIONS[activeTab]}</Text>
            <Text style={s.explanationHint}>Sayıya dokunarak ayrıntıya bak.</Text>
          </Surface>

          {isFrequency
            ? frequencyStats.map((stat, i) => (
                <Pressable key={stat.number} onPress={() => openDetail(stat.number)} style={s.barRow}>
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
                </Pressable>
              ))
            : recencyStats.map((item, i) => {
                const heat =
                  activeTab === 'hot'
                    ? ((maxMissing - item.missingSince) / maxMissing) * 100
                    : (item.missingSince / maxMissing) * 100;
                return (
                  <Pressable key={item.number} onPress={() => openDetail(item.number)} style={s.barRow}>
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
                  </Pressable>
                );
              })}
        </>
      )}

      <Modal
        visible={detail != null}
        transparent
        animationType="none"
        onRequestClose={() => setSelectedNumber(null)}
      >
        <View style={[s.overlay, { backgroundColor: c.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedNumber(null)} />
          <View style={[s.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={s.grabber} />
            {detail ? (
              <>
                <View style={s.sheetHead}>
                  <NumberBall value={detail.number} color={mainColor} variant="matched" size={46} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.sheetTitle}>{detail.number} sayısı</Text>
                    <Text style={s.sheetSub}>{game.name} · {rangeLabel}</Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      softHaptic();
                      setSelectedNumber(null);
                    }}
                    style={[s.close, { backgroundColor: c.surfaceAlt }]}
                    hitSlop={8}
                  >
                    <CloseIcon color={c.text2} size={20} />
                  </Pressable>
                </View>

                <View style={s.statsGrid}>
                  <DetailStat
                    value={String(detail.count)}
                    label="Çıkış"
                    sub={`%${detail.percentage}`}
                    color={mainColor}
                    theme={theme}
                  />
                  <DetailStat
                    value={String(detail.missingSince)}
                    label="Gecikme"
                    sub="çekiliş"
                    color={c.text}
                    theme={theme}
                  />
                </View>

                <View style={[s.detailCard, { backgroundColor: c.surfaceAlt }]}>
                  <DetailRow label="Son çıkış" value={detail.lastSeen} theme={theme} />
                  <DetailRow
                    label="Seçilen aralık"
                    value={`${totalDraws} çekiliş`}
                    theme={theme}
                    last
                  />
                </View>

                {detail.topPairs.length > 0 ? (
                  <View style={s.sectionBlock}>
                    <Text style={s.sectionTitle}>En çok birlikte</Text>
                    <View style={s.pairsRow}>
                      {detail.topPairs.map((p) => (
                        <NumberBall key={p} value={p} color={mainColor} variant="matched" size={34} />
                      ))}
                    </View>
                  </View>
                ) : null}

                {detail.recentDates.length > 0 ? (
                  <View style={s.sectionBlock}>
                    <Text style={s.sectionTitle}>Son çıkışlar</Text>
                    <View style={[s.detailCard, { backgroundColor: c.surfaceAlt }]}>
                      {detail.recentDates.map((date, i) => (
                        <DetailRow
                          key={`${date}-${i}`}
                          label={`${i + 1}.`}
                          value={date}
                          theme={theme}
                          last={i === detail.recentDates.length - 1}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetailStat({
  value,
  label,
  sub,
  color,
  theme,
}: {
  value: string;
  label: string;
  sub: string;
  color: string;
  theme: AppTheme;
}) {
  const c = theme.colors;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.surfaceAlt,
        borderRadius: theme.radius.md,
        padding: 12,
        alignItems: 'center',
      }}
    >
      <Text style={{ fontFamily: theme.font.extrabold, fontSize: 24, color, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text style={{ ...theme.typography.caption, fontFamily: theme.font.bold, color: c.text, marginTop: 4 }}>
        {label}
      </Text>
      <Text style={{ ...theme.typography.micro, color: c.text3, marginTop: 2 }}>{sub}</Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  theme,
  last,
}: {
  label: string;
  value: string;
  theme: AppTheme;
  last?: boolean;
}) {
  const c = theme.colors;
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 11,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: c.hairline,
      }}
    >
      <Text style={{ ...theme.typography.caption, color: c.text3 }}>{label}</Text>
      <Text
        style={{
          ...theme.typography.bodySemibold,
          color: c.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
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
    explanation: {
      marginHorizontal: 20,
      marginBottom: spacing.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    explanationText: { ...ty.bodyMedium, color: c.text },
    explanationHint: { ...ty.caption, color: c.text3, marginTop: 6 },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 11 },
    rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    rankText: { ...ty.caption, fontFamily: theme.font.semibold, color: c.text3, fontSize: 11 },
    track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 4 },
    barVal: { width: 50, alignItems: 'flex-end' },
    barCount: { ...ty.bodySemibold, color: c.text, fontVariant: ['tabular-nums'], fontSize: 13 },
    barPct: { ...ty.caption, color: c.text3, fontSize: 11 },
    overlay: { flex: 1, justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      marginBottom: spacing.lg,
    },
    sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.lg },
    sheetTitle: { ...ty.h2, color: c.text },
    sheetSub: { ...ty.caption, color: c.text2, marginTop: 3 },
    close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    statsGrid: { flexDirection: 'row', gap: 10, marginBottom: spacing.lg },
    detailCard: { borderRadius: radius.lg, paddingHorizontal: 14, marginBottom: spacing.lg },
    sectionBlock: { marginBottom: spacing.lg },
    sectionTitle: { ...ty.title, color: c.text, marginBottom: 10 },
    pairsRow: { flexDirection: 'row', gap: 8 },
  });
}
