// components/results/ResultsTab.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import { NumberBall } from '../ui/number-ball';
import { AppButton } from '../ui/app-button';
import { PressableScale, Surface } from '../ui/surface';
import { EmptyState, ErrorState, LoadingState } from '../ui/states';
import { AppTheme, GameAccent } from '../../constants/theme';
import { GameEmblem } from '../../lib/emblems';
import type { Game } from '../../lib/games';
import { CalendarIcon, ChevronDownIcon } from '../../lib/icons';
import { safeQuery, supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type DrawResult = {
  id: number;
  game: string;
  numbers: string;
  bonus: string;
  superstar?: number | null;
  draw_date: string;
  draw_no: string;
};

const PAGE_SIZE = 20;
const LAST_SEEN_PREFIX = 'lastSeenResult_';

function parseNumbers(str: string): number[] {
  return str.split(' - ').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
}

export function ResultsTab({ game, onSeen }: { game: Game; onSeen: (gameName: string) => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const mainColor = GameAccent[game.id] ?? c.brand;

  const [draws, setDraws] = useState<DrawResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchResults = useCallback(
    async (pageNum = 0, append = false) => {
      setError(null);
      setLoading(true);
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error: err } = await safeQuery(
        () =>
          supabase
            .from('draws')
            .select('*')
            .eq('game', game.name)
            .order('draw_date_parsed', { ascending: false })
            .range(from, to),
        'Sonuçlar yüklenirken bir sorun oluştu.'
      );

      if (err) {
        setError(err);
        if (!append) setDraws([]);
      } else if (data) {
        setDraws((prev) => (append ? [...prev, ...data] : data));
        setHasMore(data.length === PAGE_SIZE);
        setPage(pageNum);
      }
      setLoading(false);
    },
    [game.name]
  );

  const markSeen = useCallback(async () => {
    onSeen(game.name);
    const { data } = await safeQuery(
      () =>
        supabase
          .from('draws')
          .select('draw_date')
          .eq('game', game.name)
          .order('draw_date_parsed', { ascending: false })
          .limit(1)
          .single()
    );
    if (data) await AsyncStorage.setItem(LAST_SEEN_PREFIX + game.name, data.draw_date);
  }, [game.name, onSeen]);

  useEffect(() => {
    setDraws([]);
    setExpanded(null);
    setPage(0);
    setHasMore(true);
    fetchResults(0, false);
    markSeen();
  }, [game.id]);

  const toggle = (id: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setExpanded(expanded === id ? null : id);
  };

  const bonusLabel = game.name === 'Çılgın Sayısal Loto' ? 'Joker' : 'Şans Topu';

  // İlk çekilişi en son (güncel) çekiliş olarak ayır, kalanları FlashList'te göster
  const latest = draws[0];
  const historyDraws = draws.slice(1);

  if (error) return <ErrorState message={error} onRetry={() => fetchResults(0, false)} />;
  if (loading && draws.length === 0) return <LoadingState label="Sonuçlar yükleniyor…" />;
  if (!loading && draws.length === 0)
    return (
      <EmptyState
        icon={<CalendarIcon color={c.brand} size={28} />}
        title="Henüz sonuç yok"
        desc="Bu oyun için sisteme henüz çekiliş sonucu girilmemiş."
        action="Yenile"
        onAction={() => fetchResults(0, false)}
      />
    );

  const latestNums = parseNumbers(latest.numbers);

  return (
    <FlashList
      data={historyDraws}
      renderItem={({ item: draw }) => {
        const open = expanded === draw.id;
        return (
          <PressableScale onPress={() => toggle(draw.id)} style={s.historyCard}>
            <View style={s.historyHead}>
              <View style={[s.historyDot, { backgroundColor: mainColor }]} />
              <Text style={s.historyDate}>{draw.draw_date}</Text>
              <Text style={s.historyNo}>No: {draw.draw_no}</Text>
              <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                <ChevronDownIcon color={c.text3} size={18} />
              </View>
            </View>
            {open ? (
              <View style={s.historyBalls}>
                {parseNumbers(draw.numbers).map((n, i) => (
                  <NumberBall key={i} value={n} color={mainColor} size={30} />
                ))}
                {draw.bonus && draw.bonus !== '-' ? <NumberBall value={draw.bonus} variant="bonus" size={30} /> : null}
                {draw.superstar != null && draw.superstar > 0 ? <NumberBall value={draw.superstar} variant="star" size={30} /> : null}
              </View>
            ) : null}
          </PressableScale>
        );
      }}
      keyExtractor={(item) => String(item.id)}
      estimatedItemSize={60}
      ListHeaderComponent={
        <View>
          {/* Latest draw */}
          <Surface elevated style={s.latest}>
            <View style={[s.accent, { backgroundColor: mainColor }]} />
            <View style={s.latestBody}>
              <View style={s.latestHead}>
                <View style={[s.badge, { backgroundColor: mainColor + '14' }]}>
                  <View style={[s.badgeDot, { backgroundColor: mainColor }]} />
                  <Text style={[s.badgeText, { color: mainColor }]}>SON ÇEKİLİŞ</Text>
                </View>
                <View style={s.dateRow}>
                  <CalendarIcon color={c.text3} size={14} />
                  <Text style={s.dateText}>{latest.draw_date} · {latest.draw_no}</Text>
                </View>
              </View>
              <View style={s.balls}>
                {latestNums.map((n, i) => (
                  <NumberBall key={i} value={n} color={mainColor} size={40} />
                ))}
              </View>
              {latest.bonus && latest.bonus !== '-' ? (
                <View style={s.bonusRow}>
                  <Text style={s.bonusLabel}>{bonusLabel}</Text>
                  <NumberBall value={latest.bonus} variant="bonus" size={36} />
                </View>
              ) : null}
              {latest.superstar != null && latest.superstar > 0 ? (
                <View style={s.bonusRow}>
                  <Text style={s.bonusLabel}>SüperStar</Text>
                  <NumberBall value={latest.superstar} variant="star" size={36} />
                </View>
              ) : null}
            </View>
          </Surface>
          <Text style={s.sectionTitle}>Geçmiş çekilişler</Text>
        </View>
      }
      ListFooterComponent={
        hasMore ? (
          <AppButton
            label={loading ? 'Yükleniyor…' : 'Daha fazla göster'}
            variant="secondary"
            size="md"
            disabled={loading}
            onPress={() => !loading && hasMore && fetchResults(page + 1, true)}
            style={{ marginHorizontal: 20, marginTop: 8 }}
          />
        ) : (
          <View style={[s.note, { backgroundColor: c.surfaceAlt, borderColor: c.hairline }]}>
            <Text style={s.noteText}>Sonuçlar resmî kaynaklardan derlenir. Resmî sonuç için Milli Piyango'yu esas alın.</Text>
          </View>
        )
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    latest: { marginHorizontal: 20, borderRadius: radius.xxl, overflow: 'hidden', marginBottom: spacing.lg },
    accent: { height: 4, width: '100%' },
    latestBody: { padding: spacing.lg },
    latestHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 5, borderRadius: radius.pill },
    badgeDot: { width: 7, height: 7, borderRadius: 4 },
    badgeText: { ...ty.micro },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dateText: { ...ty.caption, color: c.text3 },
    balls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    bonusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.lg, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.hairline },
    bonusLabel: { ...ty.caption, color: c.text2, fontFamily: theme.font.semibold },
    sectionTitle: { ...ty.h3, color: c.text, paddingHorizontal: 20, marginBottom: 12 },
    historyCard: { marginHorizontal: 20, marginBottom: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: 14, ...theme.shadowSm },
    historyHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    historyDot: { width: 8, height: 8, borderRadius: 4 },
    historyDate: { ...ty.bodySemibold, color: c.text, flex: 1 },
    historyNo: { ...ty.caption, color: c.text3 },
    historyBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    note: { marginHorizontal: 20, marginTop: spacing.md, marginBottom: spacing.xxl, padding: 13, borderRadius: radius.md, borderWidth: 1 },
    noteText: { ...ty.caption, color: c.text2, lineHeight: 18 },
  });
}