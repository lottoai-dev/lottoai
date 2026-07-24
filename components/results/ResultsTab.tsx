// components/results/ResultsTab.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppTheme } from '../../constants/theme';
import { GameEmblem } from '../../lib/emblems';
import { getGameAccentColor, type Game } from '../../lib/games';
import { CalendarIcon, ChevronDownIcon } from '../../lib/icons';
import { safeQuery, supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';
import { AppButton } from '../ui/app-button';
import { NumberBall } from '../ui/number-ball';
import { EmptyState, ErrorState, LoadingState } from '../ui/states';
import { PressableScale } from '../ui/surface';

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
const DRAW_SELECT = 'id, game, numbers, bonus, superstar, draw_date, draw_no';

function parseNumbers(str: string): number[] {
  return str.split(' - ').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
}

export function ResultsTab({
  game,
  onSeen,
  refreshKey = 0,
}: {
  game: Game;
  onSeen: (gameName: string) => void;
  refreshKey?: number;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const mainColor = getGameAccentColor(game.id);

  const [draws, setDraws] = useState<DrawResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchResults = useCallback(
    async (pageNum = 0, append = false): Promise<DrawResult[]> => {
      setError(null);
      setLoading(true);
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error: err } = await safeQuery(
        () =>
          supabase
            .from('draws')
            .select(DRAW_SELECT)
            .eq('game', game.name)
            .order('draw_date_parsed', { ascending: false })
            .range(from, to),
        'Sonuçlar yüklenirken bir sorun oluştu.',
      );

      if (err) {
        setError(err);
        if (!append) setDraws([]);
        setLoading(false);
        return [];
      }

      const rows = (data ?? []) as DrawResult[];
      setDraws((prev) => (append ? [...prev, ...rows] : rows));
      setHasMore(rows.length === PAGE_SIZE);
      setPage(pageNum);
      setLoading(false);
      return rows;
    },
    [game.name],
  );

  const markSeen = useCallback(
    async (latestDate?: string) => {
      onSeen(game.name);
      if (latestDate) {
        await AsyncStorage.setItem(LAST_SEEN_PREFIX + game.name, latestDate);
        return;
      }
    },
    [game.name, onSeen],
  );

  useEffect(() => {
    setDraws([]);
    setExpanded(null);
    setPage(0);
    setHasMore(true);
    void fetchResults(0, false).then((rows) => {
      void markSeen(rows[0]?.draw_date);
    });
  }, [game.id]);

  useEffect(() => {
    if (refreshKey === 0) return;
    void fetchResults(0, false).then((rows) => {
      void markSeen(rows[0]?.draw_date);
    });
  }, [refreshKey]);

  const toggle = useCallback((id: number) => {
    setExpanded((prev) => (prev === id ? null : id));
  }, []);

  const bonusLabel = game.name === 'Çılgın Sayısal Loto' ? 'Joker' : 'Şans Topu';

  const latest = draws[0];
  const historyDraws = draws.slice(1);

  const renderItem = useCallback(
    ({ item: draw }: { item: DrawResult }) => {
      const open = expanded === draw.id;
      return (
        <PressableScale onPress={() => toggle(draw.id)} style={s.historyCardWrap}>
          <View style={s.historyCard}>
            <View style={[s.drawAccent, { backgroundColor: mainColor }]} />
            <View style={s.historyHead}>
              <View style={[s.historyBadge, { backgroundColor: `${mainColor}14` }]}>
                <Text style={[s.historyBadgeText, { color: mainColor }]}>#{draw.draw_no}</Text>
              </View>
              <Text style={s.historyDate}>{draw.draw_date}</Text>
              <View style={open ? { transform: [{ rotate: '180deg' }] } : undefined}>
                <ChevronDownIcon color={c.text3} size={18} />
              </View>
            </View>
            {open ? (
              <View style={s.historyBalls}>
                {parseNumbers(draw.numbers).map((n, i) => (
                  <NumberBall key={i} value={n} color={mainColor} variant="matched" size={34} />
                ))}
                {draw.bonus && draw.bonus !== '-' ? <NumberBall value={draw.bonus} variant="bonus" size={34} /> : null}
                {draw.superstar != null && draw.superstar > 0 ? (
                  <NumberBall value={draw.superstar} variant="star" size={34} />
                ) : null}
              </View>
            ) : null}
          </View>
        </PressableScale>
      );
    },
    [c.text3, expanded, mainColor, s, toggle],
  );

  const keyExtractor = useCallback((item: DrawResult) => String(item.id), []);

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
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      extraData={expanded}
      ListHeaderComponent={
        <View>
          <View style={s.latestWrap}>
            <View style={s.drawCard}>
              <View style={[s.drawAccent, { backgroundColor: mainColor }]} />
              <View style={s.drawHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.drawEyebrow}>SON ÇEKİLİŞ</Text>
                  <Text style={[s.drawGame, { color: mainColor }]}>{game.name}</Text>
                  <View style={s.dateRow}>
                    <CalendarIcon color={c.text3} size={14} />
                    <Text style={s.dateText}>
                      {latest.draw_date} · {latest.draw_no}. çekiliş
                    </Text>
                  </View>
                </View>
                <View style={[s.drawEmblem, { backgroundColor: `${mainColor}14` }]}>
                  <GameEmblem game={game.id} size={36} color={mainColor} />
                </View>
              </View>
              <View style={s.drawNumbers}>
                {latestNums.map((n, i) => (
                  <NumberBall key={i} value={n} color={mainColor} variant="matched" size={40} />
                ))}
              </View>
              {(latest.bonus && latest.bonus !== '-') || (latest.superstar != null && latest.superstar > 0) ? (
                <View style={s.bonusRow}>
                  {latest.bonus && latest.bonus !== '-' ? (
                    <View style={s.bonusItem}>
                      <Text style={s.bonusLabel}>{bonusLabel}</Text>
                      <NumberBall value={latest.bonus} variant="bonus" size={40} />
                    </View>
                  ) : null}
                  {latest.superstar != null && latest.superstar > 0 ? (
                    <View style={s.bonusItem}>
                      <Text style={s.bonusLabel}>SüperStar</Text>
                      <NumberBall value={latest.superstar} variant="star" size={40} />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
          <Text style={s.sectionTitle}>Geçmiş çekilişler</Text>
        </View>
      }
      ListFooterComponent={
        hasMore ? (
          <View style={{ marginHorizontal: 20, marginTop: 8 }}>
            <AppButton
              label={loading ? 'Yükleniyor…' : 'Daha fazla göster'}
              variant="secondary"
              size="md"
              disabled={loading}
              onPress={() => !loading && hasMore && fetchResults(page + 1, true)}
            />
          </View>
        ) : (
          <View style={[s.note, { backgroundColor: c.surfaceAlt }]}>
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
    latestWrap: { marginHorizontal: 20, marginBottom: spacing.lg },
    drawCard: {
      borderRadius: radius.xxl,
      padding: 18,
      paddingLeft: 22,
      overflow: 'hidden',
      backgroundColor: c.surface,
      ...theme.shadowSm,
    },
    drawAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    drawHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    drawEyebrow: {
      fontFamily: theme.font.semibold,
      fontSize: 10.5,
      letterSpacing: 1.1,
      color: c.text3,
      marginBottom: 4,
    },
    drawGame: {
      fontFamily: theme.font.extrabold,
      fontSize: 20,
      lineHeight: 24,
      letterSpacing: -0.4,
    },
    drawEmblem: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    dateText: { fontFamily: theme.font.medium, fontSize: 12.5, color: c.text3 },
    drawNumbers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    bonusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 20,
      marginTop: spacing.lg,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: c.hairline,
    },
    bonusItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    bonusLabel: { ...ty.caption, color: c.text3, fontFamily: theme.font.semibold },
    sectionTitle: { ...ty.h3, color: c.text, paddingHorizontal: 20, marginBottom: 12 },
    historyCardWrap: { marginHorizontal: 20, marginBottom: 8 },
    historyCard: {
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      padding: 14,
      paddingLeft: 18,
      overflow: 'hidden',
    },
    historyHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    historyBadge: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: radius.pill,
      minWidth: 48,
      alignItems: 'center',
    },
    historyBadgeText: { ...ty.caption, fontFamily: theme.font.bold, fontSize: 11, fontVariant: ['tabular-nums'] },
    historyDate: { ...ty.bodyMedium, color: c.text2, flex: 1 },
    historyBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
    note: { marginHorizontal: 20, marginTop: spacing.md, marginBottom: spacing.xxl, padding: 13, borderRadius: radius.lg },
    noteText: { ...ty.caption, color: c.text2, lineHeight: 18 },
  });
}
