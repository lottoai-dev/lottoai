// lib/CouponHistory.tsx
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GAME_COLORS, getGameByName } from './games';
import { t } from './i18n';
import { logError } from './logger';
import { supabase } from './supabase';

type Props = {
  game: string;
  numbers: number[];
  bonus: number[];
  superStar?: number;
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
  return str.split(' - ').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
}

export default function CouponHistory({ game, numbers, bonus, superStar }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const gc = GAME_COLORS[game as keyof typeof GAME_COLORS];
  const mainColor = gc?.main || '#6C63FF';
  const bonusColor = gc?.bonus || '#FF6B6B';
  const gameConfig = getGameByName(game);
  const maxNum = gameConfig?.max || 90;
  const bonusMaxNum = gameConfig?.bonus?.max || 90;

  const analyze = async () => {
    setLoading(true);
    setModalVisible(true);
    setResult(null);

    try {
      const { data, error } = await supabase
        .from('draws')
        .select('numbers, bonus, superstar, draw_date, draw_no')
        .eq('game', game)
        .order('draw_date_parsed', { ascending: false });

      if (error || !data) return;

      const distribution: Record<number, number> = {};
      let bestMatch = 0;
      let bestMatchDate = '';
      let totalMatched = 0;
      const recentMatches: { date: string; matched: number; draw_no: string; superStarMatched?: boolean }[] = [];

      data.forEach((draw) => {
        const drawnNumbers = parseNumbers(draw.numbers)
          .filter((n: number) => n >= 1 && n <= maxNum);

        const drawnBonus = draw.bonus && draw.bonus !== '-'
          ? draw.bonus.split(',')
              .map((n: string) => parseInt(n.trim()))
              .filter((n: number) => !isNaN(n) && n >= 1 && n <= bonusMaxNum)
          : [];

        const drawnSuperStar = draw.superstar ?? null;

        const matchedMain = numbers.filter(n => drawnNumbers.includes(n)).length;
        const matchedBonus = bonus.filter(n => drawnBonus.includes(n)).length;
        const matchedSuperStar = superStar != null && drawnSuperStar != null && superStar === drawnSuperStar;
        const total = matchedMain + matchedBonus + (matchedSuperStar ? 1 : 0);

        distribution[total] = (distribution[total] || 0) + 1;
        totalMatched += total;

        if (total > bestMatch) {
          bestMatch = total;
          bestMatchDate = draw.draw_date;
        }

        if (recentMatches.length < 5) {
          recentMatches.push({
            date: draw.draw_date,
            matched: total,
            draw_no: draw.draw_no,
            superStarMatched: matchedSuperStar || undefined,
          });
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
    } catch (e) {
      logError('CouponHistory', e, { game, numbers, bonus, superStar });
    } finally {
      setLoading(false);
    }
  };

  const getMatchColor = (matched: number) => {
    if (matched >= 5) return '#FFD700';
    if (matched >= 3) return mainColor;
    if (matched >= 1) return '#8E8E93';
    return '#C7C7CC';
  };

  const maxPossibleMatch = numbers.length + (bonus.length > 0 ? 1 : 0) + (superStar != null ? 1 : 0);

  return (
    <>
      <TouchableOpacity
        style={[styles.btn, { borderColor: mainColor + '33' }]}
        onPress={analyze}>
        <Text style={styles.btnEmoji}>📊</Text>
        <View>
          <Text style={[styles.btnTitle, { color: mainColor }]}>{t('historyTitle')}</Text>
          <Text style={styles.btnSub}>{t('historySubtitle')}</Text>
        </View>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📊 {t('historyTitle')}</Text>
              <Text style={styles.modalSubtitle}>{game}</Text>
            </View>

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={mainColor} />
                <Text style={styles.loadingText}>{t('historyAnalyzing')}</Text>
                <Text style={styles.loadingSubText}>{t('historyAnalyzingSub')}</Text>
              </View>
            )}

            {!loading && result && (
              <ScrollView showsVerticalScrollIndicator={false}>

                <View style={[styles.summaryCard, { borderColor: mainColor + '33' }]}>
                  <Text style={styles.summaryTotal}>
                    {t('historyScanned', { count: result.totalDraws })}
                  </Text>
                </View>

                <View style={styles.statsGrid}>
                  <View style={[styles.statCard, { borderColor: '#FFD70033' }]}>
                    <Text style={[styles.statValue, { color: '#FFD700' }]}>{result.bestMatch}</Text>
                    <Text style={styles.statLabel}>{t('historyBest')}</Text>
                    <Text style={styles.statDate}>{result.bestMatchDate}</Text>
                  </View>
                  <View style={[styles.statCard, { borderColor: mainColor + '33' }]}>
                    <Text style={[styles.statValue, { color: mainColor }]}>
                      {result.averageMatch.toFixed(1)}
                    </Text>
                    <Text style={styles.statLabel}>{t('historyAverage')}</Text>
                    <Text style={styles.statDate}>{t('historyMatchUnit')}</Text>
                  </View>
                  <View style={[styles.statCard, { borderColor: '#6BCB7733' }]}>
                    <Text style={[styles.statValue, { color: '#6BCB77' }]}>
                      {result.matchDistribution[0] || 0}
                    </Text>
                    <Text style={styles.statLabel}>{t('historyZero')}</Text>
                    <Text style={styles.statDate}>{t('historyMatchNone')}</Text>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>{t('historyDistribution')}</Text>
                <View style={styles.distributionCard}>
                  {Array.from({ length: maxPossibleMatch + 1 }, (_, i) => i)
                    .filter(i => (result.matchDistribution[i] || 0) > 0)
                    .sort((a, b) => b - a)
                    .map((matched) => {
                      const count = result.matchDistribution[matched] || 0;
                      const pct = ((count / result.totalDraws) * 100).toFixed(1);
                      const barWidth = (count / result.totalDraws) * 100;
                      return (
                        <View key={matched} style={styles.distRow}>
                          <View style={[styles.distBall, { backgroundColor: getMatchColor(matched) }]}>
                            <Text style={styles.distBallText}>{matched}</Text>
                          </View>
                          <View style={styles.distBarContainer}>
                            <View style={[styles.distBar, { width: `${barWidth}%`, backgroundColor: getMatchColor(matched) }]} />
                          </View>
                          <Text style={styles.distCount}>{count}x</Text>
                          <Text style={styles.distPct}>%{pct}</Text>
                        </View>
                      );
                    })}
                </View>

                <Text style={styles.sectionTitle}>{t('historyRecent')}</Text>
                <View style={styles.recentCard}>
                  {result.recentMatches.map((match, i) => (
                    <View key={i} style={styles.recentRow}>
                      <Text style={styles.recentDate}>📅 {match.date}</Text>
                      <Text style={styles.recentNo}>No: {match.draw_no}</Text>
                      <View style={[styles.recentBadge, { backgroundColor: getMatchColor(match.matched) + '15', borderColor: getMatchColor(match.matched) + '33' }]}>
                        <Text style={[styles.recentBadgeText, { color: getMatchColor(match.matched) }]}>
                          {t('historyMatchesFound', { count: match.matched })}
                          {match.superStarMatched ? ' ⭐' : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                <Text style={styles.sectionTitle}>{t('historyNumbers')}</Text>
                <View style={styles.numbersCard}>
                  <View style={styles.numberBalls}>
                    {numbers.map((num, i) => (
                      <View key={i} style={[styles.ball, { backgroundColor: mainColor }]}>
                        <Text style={styles.ballText}>{num}</Text>
                      </View>
                    ))}
                  </View>
                  {bonus.length > 0 && (
                    <View style={[styles.numberBalls, { marginTop: 8 }]}>
                      {bonus.map((num, i) => (
                        <View key={i} style={[styles.ball, { backgroundColor: bonusColor }]}>
                          <Text style={styles.ballText}>{num}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {superStar != null && (
                    <View style={[styles.numberBalls, { marginTop: 8 }]}>
                      <View style={[styles.ball, { backgroundColor: '#FFD700' }]}>
                        <Text style={[styles.ballText, { color: '#000' }]}>{superStar}</Text>
                      </View>
                    </View>
                  )}
                </View>

              </ScrollView>
            )}

            <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.closeBtnText}>{t('historyClose')}</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 14, marginHorizontal: 20, marginBottom: 12, backgroundColor: '#FFFFFF' },
  btnEmoji: { fontSize: 28 },
  btnTitle: { fontSize: 15, fontWeight: 'bold' },
  btnSub: { color: '#8E8E93', fontSize: 12, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  modalHeader: { marginBottom: 16 },
  modalTitle: { color: '#1a1a2e', fontSize: 22, fontWeight: 'bold' },
  modalSubtitle: { color: '#8E8E93', fontSize: 13, marginTop: 4 },
  loadingContainer: { alignItems: 'center', padding: 40, gap: 12 },
  loadingText: { color: '#1a1a2e', fontSize: 16, fontWeight: 'bold' },
  loadingSubText: { color: '#8E8E93', fontSize: 13 },
  summaryCard: { backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 16, alignItems: 'center' },
  summaryTotal: { color: '#1a1a2e', fontSize: 15 },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: 'bold' },
  statLabel: { color: '#1a1a2e', fontSize: 12, fontWeight: 'bold', marginTop: 4 },
  statDate: { color: '#8E8E93', fontSize: 10, marginTop: 2, textAlign: 'center' },
  sectionTitle: { color: '#1a1a2e', fontSize: 15, fontWeight: 'bold', marginBottom: 10 },
  distributionCard: { backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12, marginBottom: 16, gap: 8, borderWidth: 1, borderColor: '#E5E5EA' },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  distBall: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  distBallText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  distBarContainer: { flex: 1, height: 8, backgroundColor: '#E5E5EA', borderRadius: 4, overflow: 'hidden' },
  distBar: { height: '100%', borderRadius: 4 },
  distCount: { color: '#1a1a2e', fontSize: 12, width: 35, textAlign: 'right' },
  distPct: { color: '#8E8E93', fontSize: 11, width: 45, textAlign: 'right' },
  recentCard: { backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12, marginBottom: 16, gap: 10, borderWidth: 1, borderColor: '#E5E5EA' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recentDate: { color: '#1a1a2e', fontSize: 12, flex: 1 },
  recentNo: { color: '#8E8E93', fontSize: 11 },
  recentBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  recentBadgeText: { fontSize: 11, fontWeight: 'bold' },
  numbersCard: { backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#E5E5EA' },
  numberBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ball: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  ballText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  closeBtn: { backgroundColor: '#F5F5F7', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  closeBtnText: { color: '#1a1a2e', fontSize: 15, fontWeight: 'bold' },
});