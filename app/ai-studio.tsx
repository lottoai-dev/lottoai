// app/ai-studio.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/ui/app-button';
import { AiGeneratingPreview } from '../components/ai/AiGeneratingPreview';
import {
  AiNumberBall,
  AI_THINK_EXTRA_MS,
  AI_THINK_MIN_MS,
  aiRevealDurationMs,
} from '../components/ai/AiNumberBall';
import { NumberBall } from '../components/ui/number-ball';
import { PressableScale, Surface } from '../components/ui/surface';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { AppTheme } from '../constants/theme';
import { useAlert } from '../contexts/AlertContext';
import { useAuth } from '../contexts/AuthContext';
import { mainBallLayout } from '../lib/ballLayout';
import { markCouponsDirty } from '../lib/couponsStore';
import { GameEmblem } from '../lib/emblems';
import { GAMES, getGameAccentColor } from '../lib/games';
import GameSelector from '../lib/GameSelector';
import { softHaptic } from '../lib/haptics';
import { BackIcon, BookmarkIcon, CheckIcon, ClockIcon, CloseIcon, SparkIcon, TrashIcon } from '../lib/icons';
import { generateLotaCoupon, LotaGenerateError } from '../lib/lotaGenerate';
import { recordGoodMoment } from '../lib/review-prompt';
import { buildSavedCoupon, isDuplicateCoupon, loadSavedCoupons, persistSavedCoupon } from '../lib/saveCoupon';
import { useTheme } from '../lib/theme';

type HistoryEntry = {
  game: string;
  gameId: string;
  numbers: number[];
  bonus: number[];
  superStar?: number;
  comment?: string;
  timestamp: number;
};

const MAX_HISTORY = 5;

export default function AiStudioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ game?: string }>();
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const { showAlert } = useAlert();
  const { user } = useAuth();

  const [selectedGame, setSelectedGame] = useState(GAMES[0]);
  const [generatedNumbers, setGeneratedNumbers] = useState<number[]>([]);
  const [bonusNumbers, setBonusNumbers] = useState<number[]>([]);
  const [superStarNumber, setSuperStarNumber] = useState<number | null>(null);
  const [lotaComment, setLotaComment] = useState('');
  const [genId, setGenId] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [savingCoupon, setSavingCoupon] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyModal, setHistoryModal] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const generatingRef = useRef(false);
  const savingCouponRef = useRef(false);

  const mainColor = getGameAccentColor(selectedGame.id);
  const ballLayout = useMemo(
    () => mainBallLayout(generatedNumbers.length || selectedGame.count, windowWidth),
    [generatedNumbers.length, selectedGame.count, windowWidth],
  );

  const hasResult = generatedNumbers.length > 0;
  const currentGameHistory = history.filter((h) => h.gameId === selectedGame.id);

  useEffect(() => {
    if (params.game) {
      const game = GAMES.find((g) => g.id === params.game);
      if (game) {
        setSelectedGame(game);
        setGeneratedNumbers([]);
        setBonusNumbers([]);
        setSuperStarNumber(null);
        setLotaComment('');
      }
    }
  }, [params.game]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.AI_GENERATION_HISTORY).then((data) => {
      if (data) setHistory(JSON.parse(data));
    });
  }, []);

  const saveToHistory = useCallback(
    async (entry: HistoryEntry) => {
      const updated = [entry, ...history].filter((h, idx, arr) => {
        const sameGameBefore = arr.slice(0, idx).filter((x) => x.gameId === h.gameId).length;
        return sameGameBefore < MAX_HISTORY;
      });
      setHistory(updated);
      await AsyncStorage.setItem(STORAGE_KEYS.AI_GENERATION_HISTORY, JSON.stringify(updated));
    },
    [history],
  );

  const handleGameSelect = (game: (typeof GAMES)[0]) => {
    setSelectedGame(game);
    setGeneratedNumbers([]);
    setBonusNumbers([]);
    setSuperStarNumber(null);
    setLotaComment('');
  };

  const handleGenerate = async () => {
    if (generatingRef.current) return;
    if (!user) {
      showAlert('Giriş gerekli', 'Lota ile üretmek için giriş yapman gerekiyor.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Giriş yap', onPress: () => router.push('/login') },
      ]);
      return;
    }

    softHaptic();
    generatingRef.current = true;
    setGenerating(true);
    setGeneratedNumbers([]);
    setBonusNumbers([]);
    setSuperStarNumber(null);
    setLotaComment('');

    const thinkMs = AI_THINK_MIN_MS + Math.floor(Math.random() * AI_THINK_EXTRA_MS);

    try {
      const [result] = await Promise.all([
        generateLotaCoupon(selectedGame.id),
        new Promise<void>((resolve) => setTimeout(resolve, thinkMs)),
      ]);

      setGeneratedNumbers(result.numbers);
      setBonusNumbers(result.bonus);
      setSuperStarNumber(result.superStar ?? null);
      setLotaComment(result.comment);
      setGenId((g) => g + 1);

      void saveToHistory({
        game: selectedGame.name,
        gameId: selectedGame.id,
        numbers: result.numbers,
        bonus: result.bonus,
        superStar: result.superStar,
        comment: result.comment,
        timestamp: Date.now(),
      });

      const totalBalls =
        result.numbers.length + result.bonus.length + (result.superStar != null ? 1 : 0);
      await new Promise((resolve) => setTimeout(resolve, aiRevealDurationMs(totalBalls)));

      void recordGoodMoment();
    } catch (err) {
      const message =
        err instanceof LotaGenerateError
          ? err.message
          : 'Lota şu an kolon üretemedi. Biraz sonra tekrar dene.';
      const isAuth = err instanceof LotaGenerateError && err.code === 'auth';
      showAlert(
        isAuth ? 'Giriş gerekli' : 'Lota yanıt vermedi',
        message,
        isAuth
          ? [
              { text: 'Vazgeç', style: 'cancel' },
              { text: 'Giriş yap', onPress: () => router.push('/login') },
            ]
          : [{ text: 'Tamam' }],
      );
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  const handleRestore = (entry: HistoryEntry) => {
    softHaptic();
    const game = GAMES.find((g) => g.id === entry.gameId);
    if (game) setSelectedGame(game);
    setGeneratedNumbers(entry.numbers);
    setBonusNumbers(entry.bonus);
    setSuperStarNumber(entry.superStar ?? null);
    setLotaComment(entry.comment ?? '');
    setGenId((g) => g + 1);
    setHistoryModal(false);
  };

  const handleClearHistory = () => {
    softHaptic();
    const count = currentGameHistory.length;
    if (count === 0) return;

    showAlert(
      'Geçmişi temizle',
      `${selectedGame.name} Lota geçmişindeki ${count} kolon silinecek. Emin misin?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Temizle',
          style: 'destructive',
          onPress: async () => {
            const updated = history.filter((h) => h.gameId !== selectedGame.id);
            setHistory(updated);
            if (updated.length === 0) {
              await AsyncStorage.removeItem(STORAGE_KEYS.AI_GENERATION_HISTORY);
            } else {
              await AsyncStorage.setItem(STORAGE_KEYS.AI_GENERATION_HISTORY, JSON.stringify(updated));
            }
            setHistoryModal(false);
            showAlert('Temizlendi', `${selectedGame.name} Lota geçmişi temizlendi.`);
          },
        },
      ],
    );
  };

  const handleSaveAllHistory = async () => {
    softHaptic();
    if (!user) {
      setHistoryModal(false);
      router.push('/login' as any);
      return;
    }
    setSavingAll(true);
    try {
      const coupons = await loadSavedCoupons();
      let savedCount = 0;
      for (const entry of currentGameHistory) {
        const couponEntry = {
          game: entry.game,
          numbers: entry.numbers,
          bonus: entry.bonus,
          superStar: entry.superStar ?? null,
        };
        if (isDuplicateCoupon(coupons, couponEntry)) continue;
        coupons.unshift(buildSavedCoupon(couponEntry, savedCount));
        savedCount++;
      }
      if (savedCount > 0) {
        await AsyncStorage.setItem(STORAGE_KEYS.SAVED_COUPONS, JSON.stringify(coupons));
        markCouponsDirty();
      }
      const updatedHistory = history.filter((h) => h.gameId !== selectedGame.id);
      setHistory(updatedHistory);
      if (updatedHistory.length === 0) {
        await AsyncStorage.removeItem(STORAGE_KEYS.AI_GENERATION_HISTORY);
      } else {
        await AsyncStorage.setItem(STORAGE_KEYS.AI_GENERATION_HISTORY, JSON.stringify(updatedHistory));
      }
      setHistoryModal(false);
      if (savedCount > 0) {
        showAlert('Kaydedildi', `${savedCount} kolon Kolonlarım'a eklendi.`, [
          { text: 'Tamam' },
          { text: 'Kolonlarıma git', onPress: () => router.push('/(tabs)/saved') },
        ]);
      } else {
        showAlert('Bilgi', 'Geçmişteki tüm kolonlar zaten kayıtlı. Liste temizlendi.');
      }
    } catch {
      showAlert('Hata', 'Kolonlar kaydedilemedi.');
    } finally {
      setSavingAll(false);
    }
  };

  const handleSave = async () => {
    if (savingCouponRef.current || savingCoupon) return;
    softHaptic();
    if (generatedNumbers.length === 0) {
      showAlert('Uyarı', 'Önce bir kolon üretin.');
      return;
    }
    if (!user) {
      router.push('/login' as any);
      return;
    }

    savingCouponRef.current = true;
    setSavingCoupon(true);
    const entry = {
      game: selectedGame.name,
      numbers: generatedNumbers,
      bonus: bonusNumbers,
      superStar: superStarNumber,
    };

    try {
      const coupons = await loadSavedCoupons();
      const persist = async () => {
        await persistSavedCoupon(entry);
        showAlert('Kaydedildi', "Kolonunuz Kolonlarım'a eklendi.", [
          { text: 'Tamam' },
          { text: 'Kolonlarıma git', onPress: () => router.push('/(tabs)/saved') },
        ]);
      };

      if (isDuplicateCoupon(coupons, entry)) {
        showAlert(
          'Aynı kolon zaten kayıtlı',
          'Bu kombinasyon daha önce kaydedilmiş. Yine de kaydetmek ister misiniz?',
          [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Yine de kaydet',
              onPress: async () => {
                if (savingCouponRef.current) return;
                savingCouponRef.current = true;
                setSavingCoupon(true);
                try {
                  await persist();
                } catch {
                  showAlert('Hata', 'Kolon kaydedilemedi.');
                } finally {
                  savingCouponRef.current = false;
                  setSavingCoupon(false);
                }
              },
            },
          ],
        );
        return;
      }

      await persist();
    } catch {
      showAlert('Hata', 'Kolon kaydedilemedi.');
    } finally {
      savingCouponRef.current = false;
      setSavingCoupon(false);
    }
  };

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 6,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <View style={s.header}>
          <PressableScale
            haptic={false}
            onPress={() => { softHaptic(); router.back(); }}
            style={[s.backBtn, { backgroundColor: c.surface }]}
          >
            <BackIcon color={c.text} size={20} />
          </PressableScale>
          <View style={s.headerText}>
            <View style={s.eyebrowRow}>
              <SparkIcon color={c.brand} size={14} />
              <Text style={[s.eyebrow, { color: c.brand }]}>LOTA AI</Text>
            </View>
            <Text style={s.title}>Lota ile Üret</Text>
            <Text style={s.subtitle}>Tek dokunuşla kolon + analiz</Text>
          </View>
          <PressableScale
            haptic={false}
            onPress={() => { softHaptic(); setHistoryModal(true); }}
            style={[s.historyHeaderBtn, { backgroundColor: c.surface }]}
          >
            <ClockIcon color={c.brand} size={18} />
            <Text style={[s.historyHeaderBtnText, { color: c.brand }]}>Geçmiş</Text>
            {currentGameHistory.length > 0 ? (
              <View style={[s.historyBadge, { backgroundColor: c.brand }]}>
                <Text style={s.historyBadgeText}>{currentGameHistory.length}</Text>
              </View>
            ) : null}
          </PressableScale>
        </View>

        <Text style={s.sectionLabel}>OYUN SEÇ</Text>
        <GameSelector selectedGame={selectedGame} onSelect={handleGameSelect} />

        <Surface style={s.resultCard} elevated>
          {generating && !hasResult ? (
            <AiGeneratingPreview
              game={selectedGame}
              ballLayout={ballLayout}
              accentColor={c.brand}
            />
          ) : !hasResult ? (
            <View style={s.empty}>
              <View style={[s.emptyIcon, { backgroundColor: c.brandSoft }]}>
                <SparkIcon color={c.brand} size={30} />
              </View>
              <Text style={s.emptyTitle}>Hazır mısın?</Text>
              <Text style={s.emptyText}>
                {selectedGame.name} için Lota ile üret&apos;e dokun — her basışta tek kolon.
              </Text>
            </View>
          ) : (
            <>
              <View style={[s.resultAccent, { backgroundColor: c.brand }]} />
              <Text style={s.resultEyebrow}>LOTA KOLONUN</Text>
              <View
                style={[
                  s.balls,
                  { gap: ballLayout.gap },
                  ballLayout.nowrap ? s.ballsNowrap : null,
                ]}
                key={`n-${genId}`}
              >
                {generatedNumbers.map((num, i) => (
                  <AiNumberBall
                    key={`${genId}-${i}`}
                    value={num}
                    color={mainColor}
                    size={ballLayout.size}
                    variant="matched"
                    revealIndex={i}
                    revealKey={genId}
                  />
                ))}
              </View>

              {bonusNumbers.length > 0 ? (
                <View style={s.bonusBlock}>
                  <Text style={s.bonusLabel}>ŞANS TOPU</Text>
                  <View style={s.balls}>
                    {bonusNumbers.map((num, i) => (
                      <AiNumberBall
                        key={`b-${genId}-${i}`}
                        value={num}
                        variant="bonus"
                        size={ballLayout.size}
                        revealIndex={generatedNumbers.length + i}
                        revealKey={genId}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {superStarNumber !== null && selectedGame.superStar ? (
                <View style={s.bonusBlock}>
                  <Text style={s.bonusLabel}>SÜPERSTAR</Text>
                  <View style={s.balls}>
                    <AiNumberBall
                      key={`ss-${genId}`}
                      value={superStarNumber}
                      variant="star"
                      size={ballLayout.size}
                      revealIndex={generatedNumbers.length + bonusNumbers.length}
                      revealKey={genId}
                    />
                  </View>
                </View>
              ) : null}

              {lotaComment ? (
                <View style={[s.commentBox, { backgroundColor: c.brandSoft }]}>
                  <Text style={[s.commentLabel, { color: c.brand }]}>LOTA ANALİZİ</Text>
                  {lotaComment
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line, i) => {
                      const body = line.replace(/^[.•\-–—]\s*/, '');
                      return (
                        <Text key={i} style={[s.commentText, { color: c.text }]}>
                          {`. ${body}`}
                        </Text>
                      );
                    })}
                </View>
              ) : null}
            </>
          )}
        </Surface>

        <AppButton
          haptic={false}
          label={generating ? 'Lota üretiyor…' : hasResult ? 'Yeniden üret' : 'Lota ile üret'}
          accent={c.brand}
          onPress={handleGenerate}
          disabled={generating}
          loading={generating}
          iconLeft={(color, size) => <SparkIcon color={color} size={size} />}
          fullWidth={false}
          style={s.generateBtn}
        />

        {hasResult ? (
          <AppButton
            haptic={false}
            label={savingCoupon ? 'Kaydediliyor…' : 'Kolonu kaydet'}
            onPress={handleSave}
            disabled={savingCoupon || generating}
            loading={savingCoupon}
            iconLeft={(color, size) => <BookmarkIcon color={color} size={size} />}
            fullWidth={false}
            style={s.saveBtn}
          />
        ) : null}
      </ScrollView>

      <Modal visible={historyModal} transparent animationType="none" onRequestClose={() => setHistoryModal(false)}>
        <View style={[s.modalOverlay, { backgroundColor: c.overlay }]}>
          <View style={[s.modalSheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={s.modalGrabber} />
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>Lota geçmişi</Text>
                <Text style={s.modalSubtitle}>
                  {selectedGame.name}
                  {currentGameHistory.length > 0
                    ? ` · son ${Math.min(currentGameHistory.length, MAX_HISTORY)} / ${MAX_HISTORY}`
                    : ` · oyun başına ${MAX_HISTORY}`}
                </Text>
              </View>
              <Pressable
                onPress={() => { softHaptic(); setHistoryModal(false); }}
                style={[s.modalClose, { backgroundColor: c.surfaceAlt }]}
                hitSlop={8}
              >
                <CloseIcon color={c.text2} size={20} />
              </Pressable>
            </View>

            {currentGameHistory.length === 0 ? (
              <View style={s.historyEmpty}>
                <View style={[s.historyEmptyIcon, { backgroundColor: c.brandSoft }]}>
                  <ClockIcon color={c.brand} size={28} />
                </View>
                <Text style={s.historyEmptyTitle}>Henüz geçmiş yok</Text>
                <Text style={s.historyEmptyText}>Lota ile ürettiğin son kolonlar burada görünür.</Text>
              </View>
            ) : (
              <>
                <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                  {currentGameHistory.map((entry, index) => {
                    const entryColor = getGameAccentColor(entry.gameId);
                    const timeAgo = Math.floor((Date.now() - entry.timestamp) / 60000);
                    const timeStr = timeAgo < 1 ? 'az önce' : timeAgo < 60 ? `${timeAgo} dk önce` : '1+ saat önce';
                    return (
                      <PressableScale
                        haptic={false}
                        key={`${entry.timestamp}-${index}`}
                        onPress={() => handleRestore(entry)}
                        style={[s.historyEntry, { backgroundColor: c.surfaceAlt }]}
                      >
                        <View style={[s.panelAccent, { backgroundColor: entryColor }]} />
                        <View style={s.historyEntryHead}>
                          <View style={s.historyEntryGameRow}>
                            <View style={[s.historyEntryEmblem, { backgroundColor: `${entryColor}14` }]}>
                              <GameEmblem game={entry.gameId} size={22} color={entryColor} />
                            </View>
                            <Text style={[s.historyEntryGame, { color: entryColor }]}>{entry.game}</Text>
                          </View>
                          <Text style={s.historyEntryTime}>{timeStr}</Text>
                        </View>
                        <View style={s.historyEntryBalls}>
                          {entry.numbers.map((num, i) => (
                            <NumberBall key={i} value={num} color={entryColor} variant="matched" size={28} />
                          ))}
                          {entry.bonus.map((num, i) => (
                            <NumberBall key={`b${i}`} value={num} variant="bonus" size={28} />
                          ))}
                          {entry.superStar ? <NumberBall value={entry.superStar} variant="star" size={28} /> : null}
                        </View>
                      </PressableScale>
                    );
                  })}
                </ScrollView>

                <View style={s.modalActions}>
                  <AppButton
                    haptic={false}
                    label={savingAll ? 'Kaydediliyor…' : 'Tümünü kaydet'}
                    onPress={handleSaveAllHistory}
                    disabled={savingAll}
                    iconLeft={(color, size) => <CheckIcon color={color} size={size} />}
                  />
                  <AppButton
                    haptic={false}
                    label="Geçmişi temizle"
                    variant="secondary"
                    size="md"
                    accent={c.danger}
                    onPress={handleClearHistory}
                    iconLeft={(color, size) => <TrashIcon color={color} size={size} />}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing: sp, radius, typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: sp.xl,
      paddingTop: 4,
      paddingBottom: 14,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: { flex: 1, minWidth: 0 },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
    eyebrow: { ...ty.micro, fontFamily: theme.font.extrabold, letterSpacing: 1 },
    title: { ...ty.h1, color: c.text },
    subtitle: { ...ty.bodyMedium, color: c.text2, marginTop: 3 },
    historyHeaderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: radius.lg,
    },
    historyHeaderBtnText: { ...ty.label },
    historyBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    historyBadgeText: { fontFamily: theme.font.semibold, fontSize: 11, color: '#fff' },
    sectionLabel: { ...ty.micro, color: c.text2, paddingHorizontal: sp.xl, marginBottom: 10 },

    resultCard: {
      marginHorizontal: sp.xl,
      marginTop: sp.lg,
      borderRadius: radius.xxl,
      paddingVertical: 24,
      paddingHorizontal: sp.xl,
      paddingLeft: sp.xl + 4,
      overflow: 'hidden',
    },
    resultAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    resultEyebrow: {
      ...ty.micro,
      fontSize: 9,
      letterSpacing: 0.8,
      color: c.text3,
      textAlign: 'center',
      marginBottom: 14,
    },
    empty: { alignItems: 'center', gap: sp.sm, paddingVertical: 12 },
    emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { ...ty.title, color: c.text, marginTop: 4 },
    emptyText: { ...ty.bodyMedium, color: c.text3, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
    balls: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
    ballsNowrap: { flexWrap: 'nowrap' },
    bonusBlock: { alignItems: 'center', marginTop: sp.lg },
    bonusLabel: { ...ty.micro, color: c.text3, marginBottom: 10 },
    commentBox: {
      marginTop: sp.lg,
      borderRadius: radius.lg,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 6,
      alignSelf: 'stretch',
    },
    commentLabel: { ...ty.micro, fontSize: 9, letterSpacing: 0.7 },
    commentText: { ...ty.bodyMedium, lineHeight: 20 },

    generateBtn: { marginHorizontal: sp.xl, marginTop: sp.lg, alignSelf: 'stretch' },
    saveBtn: { marginHorizontal: sp.xl, marginTop: 10, alignSelf: 'stretch' },

    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: sp.xl },
    modalGrabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.elevated, marginBottom: sp.lg },
    modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: sp.lg },
    modalTitle: { ...ty.h2, color: c.text },
    modalSubtitle: { ...ty.caption, color: c.text2, marginTop: 3 },
    modalClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    historyEmpty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: sp.lg, gap: 10 },
    historyEmptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    historyEmptyTitle: { ...ty.title, color: c.text },
    historyEmptyText: { ...ty.bodyMedium, color: c.text3, textAlign: 'center', maxWidth: 240 },
    historyEntry: { padding: 12, paddingLeft: 16, borderRadius: radius.lg, marginBottom: 10, overflow: 'hidden' },
    historyEntryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    historyEntryGameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    historyEntryEmblem: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyEntryGame: { ...ty.title },
    historyEntryTime: { ...ty.caption, color: c.text3 },
    historyEntryBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
    panelAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    modalActions: { marginTop: sp.md, gap: sp.sm },
  });
}
