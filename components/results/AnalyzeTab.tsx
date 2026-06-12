// components/results/AnalyzeTab.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppTheme, GameAccent } from '../../constants/theme';
import type { Game } from '../../lib/games';
import { FlameIcon, SearchIcon, SnowflakeIcon } from '../../lib/icons';
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

type Stat = { number: number; count: number; lastSeen: string; hot: boolean; missingSince: number; topPairs: number[] };

export function AnalyzeTab({ game }: { game: Game }) {
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const mainColor = GameAccent[game.id] ?? c.brand;

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

  const analyze = () => {
    Keyboard.dismiss();
    const numbers = input
      .split(/[\s,]+/)
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= game.max);
    if (numbers.length === 0) return;

    const avgExpected = draws.length > 0 ? draws.length / game.max : 0;
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
      return { number: num, count, lastSeen, hot: count > avgExpected, missingSince, topPairs };
    });
    setResult({ stats });
  };

  if (error) return <ErrorState message={error} onRetry={fetchDraws} />;
  if (loading) return <LoadingState label="Veriler yükleniyor…" />;

  return (
    <View>
      <Surface style={s.inputCard}>
        <Text style={s.inputLabel}>Analiz etmek istediğin sayıları gir (1–{game.max}, virgülle ayır)</Text>
        <TextInput
          style={[s.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
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
              <NumberBall value={stat.number} color={stat.hot ? mainColor : c.text3} size={46} />
              <View style={s.statInfo}>
                <Row label="Toplam çıkış" valueColor={mainColor} value={`${stat.count} kez`} theme={theme} />
                <Row label="Son çıkış" valueColor={c.text} value={stat.lastSeen} theme={theme} />
                <View style={s.statRow}>
                  <Text style={s.statLabel}>Durum</Text>
                  <View style={s.statusVal}>
                    {stat.hot ? <FlameIcon color={c.warning} size={14} /> : <SnowflakeIcon color={c.text3} size={14} />}
                    <Text style={[s.statValue, { color: stat.hot ? c.warning : c.text3 }]}>{stat.hot ? 'Sıcak' : 'Soğuk'}</Text>
                  </View>
                </View>
                {stat.missingSince > 0 ? (
                  <Row label="Gecikme" valueColor={c.warning} value={`${stat.missingSince} çekiliş`} theme={theme} />
                ) : null}
                {stat.topPairs.length > 0 ? (
                  <View style={s.pairsBlock}>
                    <Text style={s.statLabel}>En çok birlikte çıktığı</Text>
                    <View style={s.pairsRow}>
                      {stat.topPairs.map((p, i) => (
                        <View key={i} style={[s.pairBall, { backgroundColor: mainColor + '14', borderColor: mainColor + '33' }]}>
                          <Text style={[s.pairText, { color: mainColor }]}>{p}</Text>
                        </View>
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

function Row({ label, value, valueColor, theme }: { label: string; value: string; valueColor: string; theme: AppTheme }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 }}>
      <Text style={{ ...theme.typography.caption, color: theme.colors.text2 }}>{label}</Text>
      <Text style={{ ...theme.typography.caption, fontFamily: theme.font.bold, color: valueColor }}>{value}</Text>
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    inputCard: { marginHorizontal: 20, padding: spacing.lg, marginBottom: spacing.lg },
    inputLabel: { ...ty.bodyMedium, color: c.text2, marginBottom: 12 },
    input: { height: 50, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 16, fontFamily: theme.font.bold, fontSize: 15 },
    infoLine: { marginHorizontal: 20, marginBottom: 12 },
    infoLineText: { ...ty.caption, color: c.text3 },
    statCard: { marginHorizontal: 20, marginBottom: 10, padding: spacing.lg, flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
    statInfo: { flex: 1 },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statLabel: { ...ty.caption, color: c.text2 },
    statValue: { ...ty.caption, fontFamily: theme.font.bold },
    statusVal: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    pairsBlock: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.hairline },
    pairsRow: { flexDirection: 'row', gap: 6, marginTop: 7 },
    pairBall: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    pairText: { fontFamily: theme.font.bold, fontSize: 12 },
  });
}