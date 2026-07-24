// components/results/AnalyzeTab.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppTheme } from '../../constants/theme';
import { getGameAccentColor, type Game } from '../../lib/games';
import { SearchIcon } from '../../lib/icons';
import { safeQuery, supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';
import { AppButton } from '../ui/app-button';
import { NumberBall } from '../ui/number-ball';
import { EmptyState, ErrorState, LoadingState } from '../ui/states';
import { Surface } from '../ui/surface';

type DrawRow = { numbers: string; draw_date: string };

function parseNumbers(str: string): number[] {
  return str.split(' - ').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
}

type Stat = { number: number; count: number; lastSeen: string; missingSince: number; topPairs: number[] };

export function AnalyzeTab({ game, refreshKey = 0 }: { game: Game; refreshKey?: number }) {
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const mainColor = getGameAccentColor(game.id);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draws, setDraws] = useState<DrawRow[]>([]);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<{ stats: Stat[] } | null>(null);

  const fetchDraws = useCallback(async () => {
    setError(null);
    setLoading(true);
    setResult(null);
    setInput('');
    setDraws([]);

    const { data, error: err } = await safeQuery(
      () =>
        supabase
          .from('draws')
          .select('numbers, draw_date')
          .eq('game', game.name)
          .order('draw_date_parsed', { ascending: false }),
      'Veriler yüklenirken bir sorun oluştu.'
    );

    if (err) {
      setError(err);
    } else if (data) {
      setDraws(data);
    }
    setLoading(false);
  }, [game.name]);

  useEffect(() => {
    fetchDraws();
  }, [game.id]);

  useEffect(() => {
    if (refreshKey === 0) return;
    (async () => {
      const { data, error: err } = await safeQuery(
        () =>
          supabase
            .from('draws')
            .select('numbers, draw_date')
            .eq('game', game.name)
            .order('draw_date_parsed', { ascending: false }),
        'Veriler yüklenirken bir sorun oluştu.'
      );
      if (err) setError(err);
      else if (data) setDraws(data);
    })();
  }, [refreshKey, game.name]);

  const analyze = () => {
    Keyboard.dismiss();
    const numbers = input
      .split(/[\s,]+/)
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= game.max);
    if (numbers.length === 0) return;

    const stats: Stat[] = numbers.map((num) => {
      let count = 0;
      let lastSeen = 'Hiç çıkmadı';
      let missingSince = 0;
      const pairFreq: Record<number, number> = {};
      for (let i = 0; i < draws.length; i++) {
        const drawn = parseNumbers(draws[i].numbers).filter((n) => n >= 1 && n <= game.max);
        if (drawn.includes(num)) {
          count++;
          if (lastSeen === 'Hiç çıkmadı') lastSeen = draws[i].draw_date;
          drawn.forEach((p) => {
            if (p !== num) pairFreq[p] = (pairFreq[p] || 0) + 1;
          });
        } else if (lastSeen === 'Hiç çıkmadı') {
          missingSince++;
        }
      }
      const topPairs = Object.entries(pairFreq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => parseInt(n, 10));
      return { number: num, count, lastSeen, missingSince, topPairs };
    });
    setResult({ stats });
  };

  if (error) return <ErrorState message={error} onRetry={fetchDraws} />;
  if (loading) return <LoadingState label="Veriler yükleniyor…" />;

  return (
    <View>
      <Surface style={s.inputCard}>
        <View style={[s.drawAccent, { backgroundColor: mainColor }]} />
        <Text style={s.inputTitle}>Sayı analizi</Text>
        <Text style={s.inputLabel}>1–{game.max} arası sayıları virgülle ayırarak gir</Text>
        <TextInput
          style={[s.input, { backgroundColor: c.surfaceAlt, color: c.text }]}
          value={input}
          onChangeText={setInput}
          placeholder="Örn: 3, 15, 27, 42"
          placeholderTextColor={c.text3}
          keyboardType="numeric"
        />
        <AppButton
          label="Analiz et"
          accent={mainColor}
          onPress={analyze}
          iconLeft={(color, size) => <SearchIcon color={color} size={size} />}
          style={{ marginTop: 12 }}
        />
      </Surface>

      {result ? (
        <>
          <View style={s.infoLine}>
            <Text style={s.infoLineText}>{draws.length} çekiliş analiz edildi · {game.name}</Text>
          </View>
          {result.stats.map((stat) => (
            <Surface key={stat.number} style={s.statCard}>
              <View style={[s.drawAccent, { backgroundColor: mainColor }]} />
              <NumberBall value={stat.number} color={mainColor} variant="matched" size={46} />
              <View style={s.statInfo}>
                <Row label="Toplam çıkış" accent={mainColor} value={`${stat.count} kez`} theme={theme} />
                <Row label="Son çıkış" value={stat.lastSeen} theme={theme} />
                {stat.missingSince > 0 ? (
                  <Row label="Gecikme" value={`${stat.missingSince} çekiliş`} theme={theme} />
                ) : null}
                {stat.topPairs.length > 0 ? (
                  <View style={s.pairsBlock}>
                    <Text style={s.statLabel}>En çok birlikte çıktığı</Text>
                    <View style={s.pairsRow}>
                      {stat.topPairs.map((p, i) => (
                        <NumberBall key={i} value={p} color={mainColor} variant="matched" size={30} />
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            </Surface>
          ))}
        </>
      ) : (
        <EmptyState
          icon={<SearchIcon color={c.brand} size={28} />}
          title="Sayı analizi"
          desc="Yukarıya birkaç sayı gir; her birinin geçmiş sıklığını, gecikmesini ve birlikte çıktığı sayıları göster."
        />
      )}
    </View>
  );
}

function Row({
  label,
  value,
  accent,
  theme,
}: {
  label: string;
  value: string;
  accent?: string;
  theme: AppTheme;
}) {
  const c = theme.colors;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
      <Text style={{ ...theme.typography.caption, color: c.text3 }}>{label}</Text>
      <Text
        style={{
          ...theme.typography.bodySemibold,
          color: accent ?? c.text,
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
    inputCard: {
      marginHorizontal: 20,
      padding: spacing.lg,
      paddingLeft: spacing.lg + 4,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    drawAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    inputTitle: { ...ty.h3, color: c.text, marginBottom: 3 },
    inputLabel: { ...ty.caption, color: c.text2, marginBottom: 12 },
    input: { height: 52, borderRadius: radius.pill, paddingHorizontal: 18, fontFamily: theme.font.semibold, fontSize: 15 },
    infoLine: { marginHorizontal: 20, marginBottom: 12 },
    infoLineText: { ...ty.caption, color: c.text3 },
    statCard: {
      marginHorizontal: 20,
      marginBottom: 10,
      padding: spacing.lg,
      paddingLeft: spacing.lg + 4,
      flexDirection: 'row',
      gap: 14,
      alignItems: 'flex-start',
      overflow: 'hidden',
    },
    statInfo: { flex: 1 },
    statLabel: { ...ty.caption, color: c.text3 },
    pairsBlock: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.hairline },
    pairsRow: { flexDirection: 'row', gap: 6, marginTop: 7 },
  });
}
