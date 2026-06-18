// lib/CouponHistory.tsx
// "Geçmiş performans" — scans all past draws for a coupon and shows how often
// it would have matched. Now uses safeQuery for timeout handling.

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NumberBall } from '../components/ui/number-ball';
import { LoadingState } from '../components/ui/states';
import { AppTheme, GameAccent } from '../constants/theme';
import { getGameByName } from './games';
import { CloseIcon } from './icons';
import { safeQuery, supabase } from './supabase';
import { useTheme } from './theme';

type Props = {
  game: string;
  numbers: number[];
  bonus: number[];
  superStar?: number;
  visible: boolean;
  onClose: () => void;
};

type HistoryResult = {
  totalDraws: number;
  bestMatch: number;
  bestMatchDate: string;
  averageMatch: number;
  matchDistribution: Record<number, number>;
  recentMatches: { date: string; matched: number; draw_no: string; superStarMatched?: boolean }[];
};

function parseNumbers(str: string): number[] {
  return str.split(' - ').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
}

export default function CouponHistory({ game, numbers, bonus, superStar, visible, onClose }: Props) {
  const theme = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const s = makeStyles(theme);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gameId = getGameByName(game)?.id ?? 'cilgin';
  const mainColor = GameAccent[gameId] ?? c.brand;
  const gameConfig = getGameByName(game);
  const maxNum = gameConfig?.max || 90;
  const bonusMaxNum = gameConfig?.bonus?.max || 90;
  const maxPossibleMatch = numbers.length + (bonus.length > 0 ? 1 : 0) + (superStar != null ? 1 : 0);

  const matchColor = (m: number) => (m >= 5 ? c.gold : m >= 3 ? mainColor : m >= 1 ? c.text2 : c.text3);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    type DrawRow = {
      numbers: string;
      bonus: string;
      superstar: number | null;
      draw_date: string;
      draw_no: string;
    };
    
    const { data, error: err } = await safeQuery<DrawRow[]>(
      async () =>
        supabase
          .from('draws')
          .select('numbers, bonus, superstar, draw_date, draw_no')
          .eq('game', game)
          .order('draw_date_parsed', { ascending: false }),
      'Geçmiş veriler yüklenirken bir sorun oluştu.'
    );

    if (err || !data) {
      setError(err || 'Veri bulunamadı.');
      setLoading(false);
      return;
    }

    const distribution: Record<number, number> = {};
    let bestMatch = 0;
    let bestMatchDate = '';
    let totalMatched = 0;
    const recentMatches: HistoryResult['recentMatches'] = [];

    data.forEach((draw) => {
      const drawnNumbers = parseNumbers(draw.numbers).filter((n) => n >= 1 && n <= maxNum);
      const drawnBonus =
        draw.bonus && draw.bonus !== '-'
          ? draw.bonus.split(',').map((n: string) => parseInt(n.trim(), 10)).filter((n: number) => !isNaN(n) && n >= 1 && n <= bonusMaxNum)
          : [];
      const matchedMain = numbers.filter((n) => drawnNumbers.includes(n)).length;
      const matchedBonus = bonus.filter((n) => drawnBonus.includes(n)).length;
      const matchedSuperStar = superStar != null && draw.superstar != null && superStar === draw.superstar;
      const total = matchedMain + matchedBonus + (matchedSuperStar ? 1 : 0);
      distribution[total] = (distribution[total] || 0) + 1;
      totalMatched += total;
      if (total > bestMatch) {
        bestMatch = total;
        bestMatchDate = draw.draw_date;
      }
      if (recentMatches.length < 5) {
        recentMatches.push({ date: draw.draw_date, matched: total, draw_no: draw.draw_no, superStarMatched: matchedSuperStar || undefined });
      }
    });

    setResult({
      totalDraws: data.length,
      bestMatch,
      bestMatchDate,
      averageMatch: data.length > 0 ? totalMatched / data.length : 0,
      matchDistribution: distribution,
      recentMatches,
    });
    setLoading(false);
  };

  useEffect(() => {
    if (visible) {
      analyze();
    } else {
      setResult(null);
      setError(null);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[s.overlay, { backgroundColor: c.overlay }]}>
        <View style={[s.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={s.grabber} />
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Geçmiş performans</Text>
              <Text style={s.subtitle}>{game}</Text>
            </View>
            <Pressable onPress={onClose} style={[s.close, { backgroundColor: c.surfaceAlt }]} hitSlop={8}>
              <CloseIcon color={c.text2} size={20} />
            </Pressable>
          </View>

          {loading ? (
            <LoadingState label="Geçmiş çekilişler taranıyor…" />
          ) : error ? (
            <Text style={[s.scanned, { color: c.danger }]}>{error}</Text>
          ) : result ? (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              <Text style={s.scanned}>{result.totalDraws} geçmiş çekiliş tarandı</Text>
              <View style={s.statsGrid}>
                <Stat value={String(result.bestMatch)} label="En iyi" sub={result.bestMatchDate} color={c.gold} theme={theme} />
                <Stat value={result.averageMatch.toFixed(1)} label="Ortalama" sub="tutuş" color={mainColor} theme={theme} />
                <Stat value={String(result.matchDistribution[0] || 0)} label="0 tutuş" sub="çekiliş" color={c.text2} theme={theme} />
              </View>

              <Text style={s.section}>Tutuş dağılımı</Text>
              <View style={s.distCard}>
                {Array.from({ length: maxPossibleMatch + 1 }, (_, i) => i)
                  .filter((i) => (result.matchDistribution[i] || 0) > 0)
                  .sort((a, b) => b - a)
                  .map((m) => {
                    const count = result.matchDistribution[m] || 0;
                    const pct = (count / result.totalDraws) * 100;
                    return (
                      <View key={m} style={s.distRow}>
                        <NumberBall value={m} color={matchColor(m)} size={30} />
                        <View style={[s.distTrack, { backgroundColor: c.hairline }]}>
                          <View style={[s.distFill, { width: `${pct}%`, backgroundColor: matchColor(m) }]} />
                        </View>
                        <Text style={s.distCount}>{count}x</Text>
                        <Text style={s.distPct}>%{pct.toFixed(1)}</Text>
                      </View>
                    );
                  })}
              </View>

              <Text style={s.section}>Son çekilişler</Text>
              <View style={s.recentCard}>
                {result.recentMatches.map((m, i) => (
                  <View key={i} style={[s.recentRow, i < result.recentMatches.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.hairline }]}>
                    <Text style={s.recentDate}>{m.date}</Text>
                    <Text style={s.recentNo}>No: {m.draw_no}</Text>
                    <View style={[s.recentBadge, { backgroundColor: matchColor(m.matched) + '15' }]}>
                      <Text style={[s.recentBadgeText, { color: matchColor(m.matched) }]}>{m.matched} tutuş</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function Stat({ value, label, sub, color, theme }: { value: string; label: string; sub: string; color: string; theme: AppTheme }) {
  const c = theme.colors;
  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: theme.radius.md, padding: 12, alignItems: 'center' }}>
      <Text style={{ fontFamily: theme.font.extrabold, fontSize: 24, color }}>{value}</Text>
      <Text style={{ ...theme.typography.caption, fontFamily: theme.font.bold, color: c.text, marginTop: 4 }}>{label}</Text>
      <Text style={{ ...theme.typography.micro, color: c.text3, marginTop: 2, letterSpacing: 0 }} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: spacing.lg },
    head: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
    title: { ...ty.h2, color: c.text },
    subtitle: { ...ty.caption, color: c.text2, marginTop: 3 },
    close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    scanned: { ...ty.bodyMedium, color: c.text2, textAlign: 'center', marginBottom: spacing.lg },
    statsGrid: { flexDirection: 'row', gap: 10, marginBottom: spacing.xl },
    section: { ...ty.title, color: c.text, marginBottom: 10 },
    distCard: { backgroundColor: c.surfaceAlt, borderRadius: radius.lg, padding: 14, gap: 8, marginBottom: spacing.xl },
    distRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    distTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
    distFill: { height: '100%', borderRadius: 4 },
    distCount: { ...ty.caption, color: c.text, width: 32, textAlign: 'right', fontFamily: theme.font.bold },
    distPct: { ...ty.caption, color: c.text3, width: 44, textAlign: 'right' },
    recentCard: { backgroundColor: c.surfaceAlt, borderRadius: radius.lg, paddingHorizontal: 14, marginBottom: spacing.lg },
    recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
    recentDate: { ...ty.caption, color: c.text, flex: 1 },
    recentNo: { ...ty.caption, color: c.text3 },
    recentBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    recentBadgeText: { ...ty.caption, fontFamily: theme.font.bold },
  });
}