// app/(tabs)/generate.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../../components/ui/app-button';
import { NumberBall } from '../../components/ui/number-ball';
import { PressableScale, Surface } from '../../components/ui/surface';
import { Toggle } from '../../components/ui/toggle';
import { STORAGE_KEYS } from '../../constants/storage-keys';
import { AppTheme, GameAccent } from '../../constants/theme';
import { useAlert } from '../../contexts/AlertContext';
import { useAuth } from '../../contexts/AuthContext';
import { GameEmblem } from '../../lib/emblems';
import { GAMES } from '../../lib/games';
import GameSelector from '../../lib/GameSelector';
import {
  BookmarkIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  DiceIcon,
  InfoIcon,
  SlidersIcon,
  TrashIcon,
} from '../../lib/icons';
import { useTheme } from '../../lib/theme';

function softHaptic() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

/* ───────────────────────── number logic ───────────────────────── */
function generateNumbers(count: number, max: number): number[] {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

function countConsecutivePairs(nums: number[]): number {
  let pairs = 0;
  for (let i = 0; i < nums.length - 1; i++) if (nums[i + 1] - nums[i] === 1) pairs++;
  return pairs;
}

function parseNumberList(input: string, max: number): number[] {
  return input
    .split(/[\s,]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= max);
}

function calcMinSum(count: number): number {
  let sum = 0;
  for (let i = 1; i <= count; i++) sum += i;
  return sum;
}

function calcMaxSum(count: number, max: number): number {
  let sum = 0;
  for (let i = max; i > max - count; i--) sum += i;
  return sum;
}

function validateSumRange(count: number, max: number, sumMin: number | null, sumMax: number | null): string | null {
  const theoreticalMin = calcMinSum(count);
  const theoreticalMax = calcMaxSum(count, max);
  if (sumMin !== null && sumMin > theoreticalMax) return `Alt sınır çok yüksek! Bu oyunda maksimum toplam ${theoreticalMax}'dir.`;
  if (sumMax !== null && sumMax < theoreticalMin) return `Üst sınır çok düşük! Bu oyunda minimum toplam ${theoreticalMin}'dir.`;
  if (sumMin !== null && sumMax !== null && sumMin > sumMax) return 'Alt sınır üst sınırdan büyük olamaz.';
  return null;
}

function generateWithConstraints(
  count: number,
  max: number,
  constraints: {
    noConsecutive: boolean;
    sumMin: number | null;
    sumMax: number | null;
    evenCount: number | null;
    balanced: boolean;
    includeNumbers: number[];
    excludeNumbers: number[];
  }
): number[] | null {
  const MAX_ATTEMPTS = 500;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (constraints.includeNumbers.length > count) return null;
    const pool = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !constraints.excludeNumbers.includes(n));
    let nums: number[] = [];

    if (constraints.balanced) {
      const sliceSize = max / count;
      const remaining = count - constraints.includeNumbers.length;
      const usedRanges = new Set<number>();
      constraints.includeNumbers.forEach((num) => {
        usedRanges.add(Math.min(Math.floor((num - 1) / sliceSize), count - 1));
      });
      const availableRanges: number[][] = [];
      for (let i = 0; i < count; i++) {
        if (usedRanges.has(i)) continue;
        const from = Math.floor(i * sliceSize) + 1;
        const to = Math.floor((i + 1) * sliceSize);
        availableRanges.push(
          Array.from({ length: to - from + 1 }, (_, j) => from + j).filter(
            (n) => !constraints.excludeNumbers.includes(n)
          )
        );
      }
      if (availableRanges.length < remaining) continue;
      const shuffledRanges = availableRanges.sort(() => Math.random() - 0.5);
      const picks: number[] = [];
      for (let i = 0; i < remaining; i++) {
        const range = shuffledRanges[i];
        if (!range || range.length === 0) continue;
        picks.push(range[Math.floor(Math.random() * range.length)]);
      }
      nums = [...constraints.includeNumbers, ...picks].sort((a, b) => a - b);
    } else if (constraints.evenCount !== null) {
      const remaining = count - constraints.includeNumbers.length;
      const includeEvens = constraints.includeNumbers.filter((n) => n % 2 === 0).length;
      const neededEvens = Math.max(0, constraints.evenCount - includeEvens);
      const neededOdds = Math.max(0, remaining - neededEvens);
      const evens = pool.filter((n) => n % 2 === 0 && !constraints.includeNumbers.includes(n));
      const odds = pool.filter((n) => n % 2 !== 0 && !constraints.includeNumbers.includes(n));
      if (evens.length < neededEvens || odds.length < neededOdds) continue;
      const selEvens = [...evens].sort(() => Math.random() - 0.5).slice(0, neededEvens);
      const selOdds = [...odds].sort(() => Math.random() - 0.5).slice(0, neededOdds);
      nums = [...constraints.includeNumbers, ...selEvens, ...selOdds].sort((a, b) => a - b);
    } else {
      const remaining = count - constraints.includeNumbers.length;
      const poolFiltered = pool.filter((n) => !constraints.includeNumbers.includes(n));
      if (poolFiltered.length < remaining) continue;
      const picks = [...poolFiltered].sort(() => Math.random() - 0.5).slice(0, remaining);
      nums = [...constraints.includeNumbers, ...picks].sort((a, b) => a - b);
    }

    if (constraints.noConsecutive && countConsecutivePairs(nums) > 1) continue;
    const total = nums.reduce((a, b) => a + b, 0);
    if (constraints.sumMin !== null && total < constraints.sumMin) continue;
    if (constraints.sumMax !== null && total > constraints.sumMax) continue;
    return nums;
  }
  return null;
}

type HistoryEntry = {
  game: string;
  gameId: string;
  numbers: number[];
  bonus: number[];
  superStar?: number;
  timestamp: number;
  aiExplanation?: string;
};

const MAX_HISTORY = 5;

/* ───────────────────────── animated ball ───────────────────────── */
function DrawBall({ index, children }: { index: number; children: React.ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, {
      toValue: 1,
      duration: 300,
      delay: index * 55,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();
  }, [a, index]);
  return (
    <Animated.View style={{ opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }}>
      {children}
    </Animated.View>
  );
}

/* ───────────────────────── screen ───────────────────────── */
export default function GenerateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ game?: string }>();
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const { showAlert } = useAlert();
  const { user } = useAuth();

  const [selectedGame, setSelectedGame] = useState(GAMES[0]);
  const [generatedNumbers, setGeneratedNumbers] = useState<number[]>([]);
  const [bonusNumbers, setBonusNumbers] = useState<number[]>([]);
  const [superStarNumber, setSuperStarNumber] = useState<number | null>(null);
  const [genId, setGenId] = useState(0);
  const [showFilter, setShowFilter] = useState(false);
  const [evenCount, setEvenCount] = useState<number | null>(null);
  const [balanced, setBalanced] = useState(false);
  const [noConsecutive, setNoConsecutive] = useState(false);
  const [sumMin, setSumMin] = useState('');
  const [sumMax, setSumMax] = useState('');
  const [includeText, setIncludeText] = useState('');
  const [excludeText, setExcludeText] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyModal, setHistoryModal] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  const mainColor = GameAccent[selectedGame.id] ?? c.brand;

  const includeNumbers = parseNumberList(includeText, selectedGame.max);
  const excludeNumbers = parseNumberList(excludeText, selectedGame.max);
  const theoreticalMin = calcMinSum(selectedGame.count);
  const theoreticalMax = calcMaxSum(selectedGame.count, selectedGame.max);

  const filterActive =
    evenCount !== null ||
    balanced ||
    noConsecutive ||
    (sumMin.trim() !== '' && !isNaN(parseInt(sumMin, 10))) ||
    (sumMax.trim() !== '' && !isNaN(parseInt(sumMax, 10))) ||
    includeNumbers.length > 0 ||
    excludeNumbers.length > 0;

  const filterOptions = Array.from({ length: selectedGame.count + 1 }, (_, i) => i);
  const oddCount = evenCount !== null ? selectedGame.count - evenCount : null;
  const currentGameHistory = history.filter((h) => h.gameId === selectedGame.id);

  const total = generatedNumbers.reduce((a, b) => a + b, 0);
  const evensInResult = generatedNumbers.filter((n) => n % 2 === 0).length;

  useEffect(() => {
    if (params.game) {
      const game = GAMES.find((g) => g.id === params.game);
      if (game) {
        setSelectedGame(game);
        setGeneratedNumbers([]);
        setBonusNumbers([]);
        setSuperStarNumber(null);
      }
    }
  }, [params.game]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.GENERATION_HISTORY).then((data) => {
      if (data) setHistory(JSON.parse(data));
    });
  }, []);

  const saveToHistory = useCallback(
    async (entry: HistoryEntry) => {
      const updated = [entry, ...history].slice(0, MAX_HISTORY);
      setHistory(updated);
      await AsyncStorage.setItem(STORAGE_KEYS.GENERATION_HISTORY, JSON.stringify(updated));
    },
    [history]
  );

  const handleGenerate = () => {
    const sumMinNum = sumMin.trim() !== '' ? parseInt(sumMin, 10) : null;
    const sumMaxNum = sumMax.trim() !== '' ? parseInt(sumMax, 10) : null;

    const sumError = validateSumRange(selectedGame.count, selectedGame.max, sumMinNum, sumMaxNum);
    if (sumError) {
      showAlert('Geçersiz toplam aralığı', `${sumError}\n\nGeçerli aralık: ${theoreticalMin} – ${theoreticalMax}`);
      return;
    }
    if (includeNumbers.length > selectedGame.count) {
      showAlert('Filtre hatası', `En fazla ${selectedGame.count} zorunlu sayı belirleyebilirsiniz.`);
      return;
    }

    const nums = generateWithConstraints(selectedGame.count, selectedGame.max, {
      noConsecutive,
      sumMin: sumMinNum,
      sumMax: sumMaxNum,
      evenCount,
      balanced,
      includeNumbers,
      excludeNumbers,
    });

    if (nums === null) {
      showAlert('Üretim başarısız', 'Seçili filtrelerle uygun bir kombinasyon bulunamadı. Filtreleri gevşetmeyi deneyin.');
      return;
    }
    if (nums.length === 0) {
      showAlert('Filtre hatası', 'Zorunlu sayılar çok fazla. Lütfen sayı adedini azaltın.');
      return;
    }

    const bonus = selectedGame.bonus ? generateNumbers(selectedGame.bonus.count, selectedGame.bonus.max) : [];
    let ss: number | undefined;
    if (selectedGame.superStar) {
      ss = generateNumbers(1, selectedGame.superStar.max)[0];
    }

    softHaptic();

    setGeneratedNumbers(nums);
    setBonusNumbers(bonus);
    setSuperStarNumber(ss ?? null);
    setGenId((g) => g + 1);

    saveToHistory({
      game: selectedGame.name,
      gameId: selectedGame.id,
      numbers: nums,
      bonus,
      superStar: ss,
      timestamp: Date.now(),
    });
  };

  const handleGameSelect = (game: (typeof GAMES)[0]) => {
    softHaptic();
    setSelectedGame(game);
    setGeneratedNumbers([]);
    setBonusNumbers([]);
    setSuperStarNumber(null);
    setEvenCount(null);
    setBalanced(false);
    setNoConsecutive(false);
    setSumMin('');
    setSumMax('');
    setIncludeText('');
    setExcludeText('');
    setShowFilter(false);
  };

  const handleRestore = (entry: HistoryEntry) => {
    softHaptic();
    const game = GAMES.find((g) => g.name === entry.game);
    if (game) setSelectedGame(game);
    setGeneratedNumbers(entry.numbers);
    setBonusNumbers(entry.bonus);
    setSuperStarNumber(entry.superStar ?? null);
    setGenId((g) => g + 1);
    setHistoryModal(false);
  };

  const handleClearHistory = async () => {
    softHaptic();
    setHistory([]);
    await AsyncStorage.removeItem(STORAGE_KEYS.GENERATION_HISTORY);
  };

  const buildCoupon = (
    entry: { game: string; numbers: number[]; bonus: number[]; superStar?: number | null },
    idOffset = 0
  ) => ({
    id: Date.now() + idOffset,
    game: entry.game,
    icon: GAMES.find((g) => g.name === entry.game)?.icon || '',
    color: GameAccent[GAMES.find((g) => g.name === entry.game)?.id ?? 'cilgin'] ?? c.brand,
    numbers: entry.numbers,
    bonus: entry.bonus,
    superStar: entry.superStar ?? null,
    date: new Date().toLocaleDateString('tr-TR'),
    timestamp: new Date().toISOString(),
    matchedCount: undefined,
  });

  const isDup = (
    coupons: any[],
    entry: { game: string; numbers: number[]; bonus: number[]; superStar?: number | null }
  ) =>
    coupons.some((cp: any) => {
      if (cp.game !== entry.game) return false;
      const sameNumbers =
        cp.numbers.length === entry.numbers.length &&
        cp.numbers.every((n: number) => entry.numbers.includes(n));
      if (!sameNumbers) return false;
      const sameBonus =
        entry.bonus.length === 0 && (!cp.bonus || cp.bonus.length === 0)
          ? true
          : cp.bonus?.length === entry.bonus.length &&
            cp.bonus.every((n: number) => entry.bonus.includes(n));
      if (!sameBonus) return false;
      return (entry.superStar ?? null) === (cp.superStar ?? null);
    });

    const handleSaveAllHistory = async () => {
      if (!user) {
        softHaptic();
        setHistoryModal(false);
        router.push('/login' as any);
        return;
      }
      setSavingAll(true);
      try {
      const existing = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS);
      const coupons = existing ? JSON.parse(existing) : [];
      let savedCount = 0;
      for (const entry of currentGameHistory) {
        if (isDup(coupons, entry)) continue;
        coupons.unshift(buildCoupon(entry, savedCount));
        savedCount++;
      }
      if (savedCount > 0) {
        await AsyncStorage.setItem(STORAGE_KEYS.SAVED_COUPONS, JSON.stringify(coupons));
        softHaptic();
        showAlert('Kaydedildi', `${savedCount} kupon Kuponlarım'a eklendi.`, [
          { text: 'Tamam' },
          {
            text: 'Kuponlarıma git',
            onPress: () => {
              setHistoryModal(false);
              router.push('/(tabs)/saved');
            },
          },
        ]);
      } else {
        showAlert('Bilgi', 'Geçmişteki tüm kuponlar zaten kayıtlı.');
      }
    } catch {
      showAlert('Hata', 'Kuponlar kaydedilemedi.');
    } finally {
      setSavingAll(false);
    }
  };

  const handleSave = async () => {
    if (generatedNumbers.length === 0) {
      showAlert('Uyarı', 'Önce bir kupon üretin.');
      return;
    }
    if (!user) {
      softHaptic();
      router.push('/login' as any);
      return;
    }
    const entry = {
      game: selectedGame.name,
      numbers: generatedNumbers,
      bonus: bonusNumbers,
      superStar: superStarNumber,
    };
    try {
      const existing = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS);
      const coupons = existing ? JSON.parse(existing) : [];
      const persist = async () => {
        coupons.unshift(buildCoupon(entry));
        await AsyncStorage.setItem(STORAGE_KEYS.SAVED_COUPONS, JSON.stringify(coupons));
        softHaptic();
        showAlert('Kaydedildi', "Kuponunuz Kuponlarım'a eklendi.", [
          { text: 'Tamam' },
          { text: 'Kuponlarıma git', onPress: () => router.push('/(tabs)/saved') },
        ]);
      };
      if (isDup(coupons, entry)) {
        showAlert(
          'Aynı kupon zaten kayıtlı',
          'Bu kombinasyon daha önce kaydedilmiş. Yine de kaydetmek ister misiniz?',
          [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Yine de kaydet', onPress: persist },
          ]
        );
        return;
      }
      await persist();
    } catch {
      showAlert('Hata', 'Kupon kaydedilemedi.');
    }
  };

  const filterChips = (): string[] => {
    const parts: string[] = [];
    if (balanced) parts.push('Dengeli');
    if (evenCount !== null) parts.push(`${evenCount} çift · ${oddCount} tek`);
    if (noConsecutive) parts.push('Ardışık yok');
    if (sumMin.trim() !== '' && sumMax.trim() !== '') parts.push(`∑ ${sumMin}–${sumMax}`);
    else if (sumMin.trim() !== '') parts.push(`∑ ≥ ${sumMin}`);
    else if (sumMax.trim() !== '') parts.push(`∑ ≤ ${sumMax}`);
    if (includeNumbers.length > 0) parts.push(`Zorunlu: ${includeNumbers.join(',')}`);
    if (excludeNumbers.length > 0) parts.push(`Hariç: ${excludeNumbers.join(',')}`);
    return parts;
  };

  const inputStyle = [s.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }];

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 90 }}
      >
        <View style={s.header}>
          <Text style={s.title}>Kupon Üret</Text>
          <Text style={s.subtitle}>Sayılarını sistem senin için seçsin</Text>
        </View>

        <Text style={s.sectionLabel}>OYUN SEÇ</Text>
        <GameSelector selectedGame={selectedGame} onSelect={handleGameSelect} />

        <Surface style={s.resultCard} elevated>
          {generatedNumbers.length === 0 ? (
            <View style={s.empty}>
              <View style={[s.emptyIcon, { backgroundColor: mainColor + '15' }]}>
                <DiceIcon color={mainColor} size={30} />
              </View>
              <Text style={s.emptyText}>Kupon üretmek için aşağıdaki butona dokun</Text>
            </View>
          ) : (
            <>
              <View style={s.balls} key={`n-${genId}`}>
                {generatedNumbers.map((num, i) => (
                  <DrawBall key={`${genId}-${i}`} index={i}>
                    <NumberBall
                      value={num}
                      color={includeNumbers.includes(num) ? c.gold : mainColor}
                      size={46}
                      variant={includeNumbers.includes(num) ? 'bonus' : 'game'}
                    />
                  </DrawBall>
                ))}
              </View>

              {bonusNumbers.length > 0 ? (
                <View style={s.bonusBlock}>
                  <Text style={s.bonusLabel}>ŞANS TOPU</Text>
                  <View style={s.balls}>
                    {bonusNumbers.map((num, i) => (
                      <DrawBall key={`b-${genId}-${i}`} index={generatedNumbers.length + i}>
                        <NumberBall value={num} variant="bonus" size={46} />
                      </DrawBall>
                    ))}
                  </View>
                </View>
              ) : null}

              {superStarNumber !== null && selectedGame.superStar ? (
                <View style={s.bonusBlock}>
                  <Text style={s.bonusLabel}>SÜPERSTAR</Text>
                  <View style={s.balls}>
                    <DrawBall index={generatedNumbers.length} key={`ss-${genId}`}>
                      <NumberBall value={superStarNumber} variant="star" size={46} />
                    </DrawBall>
                  </View>
                </View>
              ) : null}

              <View style={s.resultFooter}>
                <Text style={s.resultFooterLabel}>TOPLAM</Text>
                <Text style={s.resultFooterValue}>
                  {total} · {evensInResult} çift / {generatedNumbers.length - evensInResult} tek
                </Text>
              </View>

              {filterActive ? (
                <View style={s.chipRow}>
                  {filterChips().map((chip, i) => (
                    <View key={i} style={[s.chip, { backgroundColor: mainColor + '14' }]}>
                      <Text style={[s.chipText, { color: mainColor }]}>{chip}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </Surface>

        <View style={s.btnRow}>
          <AppButton
            label={generatedNumbers.length > 0 ? 'Yeniden üret' : 'Kupon üret'}
            accent={mainColor}
            onPress={handleGenerate}
            iconLeft={(color, size) => <DiceIcon color={color} size={size} />}
            fullWidth={false}
            style={{ flex: 1 }}
          />
          <PressableScale
            onPress={() => { softHaptic(); setShowFilter((v) => !v); }}
            style={[
              s.filterBtn,
              {
                backgroundColor: filterActive ? mainColor + '1A' : c.surface,
                borderColor: filterActive ? mainColor : c.border,
              },
            ]}
          >
            <SlidersIcon color={filterActive ? mainColor : c.text2} size={22} />
            {filterActive ? <View style={[s.filterDot, { backgroundColor: mainColor }]} /> : null}
          </PressableScale>
        </View>

        {generatedNumbers.length > 0 ? (
          <AppButton
            label="Kuponu kaydet"
            onPress={handleSave}
            iconLeft={(color, size) => <BookmarkIcon color={color} size={size} />}
            fullWidth={false}
            style={s.saveBtn}
          />
        ) : null}

        {currentGameHistory.length > 0 ? (
          <PressableScale
            onPress={() => { softHaptic(); setHistoryModal(true); }}
            style={[s.historyBtn, { backgroundColor: c.surface, borderColor: c.border }]}
          >
            <ClockIcon color={c.brand} size={17} />
            <Text style={[s.historyBtnText, { color: c.brand }]}>Geçmiş ({currentGameHistory.length})</Text>
          </PressableScale>
        ) : null}

        {showFilter ? (
          <Surface style={s.filterPanel}>
            <Text style={s.filterPanelTitle}>AKILLI FİLTRELER</Text>

            <Pressable
              onPress={() => { softHaptic(); setBalanced((b) => !b); if (!balanced) setEvenCount(null); }}
              style={[s.toggleRow, { borderColor: balanced ? c.brand : c.border, backgroundColor: balanced ? c.brandSoft : 'transparent' }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.toggleTitle, balanced && { color: c.brand }]}>Dengeli dağılım</Text>
                <Text style={s.toggleDesc}>Düşük, orta ve yüksek sayılardan eşit oranda seçer</Text>
              </View>
              <Toggle value={balanced} onChange={(v) => { softHaptic(); setBalanced(v); if (v) setEvenCount(null); }} />
            </Pressable>

            <View style={s.divider} />

            <View style={s.subHeader}>
              <Text style={s.subTitle}>Çift / Tek dengesi</Text>
              {evenCount !== null ? (
                <Pressable onPress={() => { softHaptic(); setEvenCount(null); }} hitSlop={8}>
                  <Text style={[s.clearBtn, { color: c.brand }]}>Temizle</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={s.subDesc}>{selectedGame.count} sayıdan kaçı çift olsun?</Text>
            <View style={s.segmentWrap}>
              {filterOptions.map((n) => {
                const sel = evenCount === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => { softHaptic(); setEvenCount(n); setBalanced(false); }}
                    style={[s.segment, { borderColor: sel ? mainColor : c.border, backgroundColor: sel ? mainColor : 'transparent' }]}
                  >
                    <Text style={[s.segmentTop, { color: sel ? '#fff' : c.text }]}>{n}</Text>
                    <Text style={[s.segmentBot, { color: sel ? 'rgba(255,255,255,0.75)' : c.text3 }]}>çift</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={s.divider} />

            <Pressable
              onPress={() => { softHaptic(); setNoConsecutive((v) => !v); }}
              style={[s.toggleRow, { borderColor: noConsecutive ? c.brand : c.border, backgroundColor: noConsecutive ? c.brandSoft : 'transparent' }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.toggleTitle, noConsecutive && { color: c.brand }]}>Ardışık sayıları engelle</Text>
                <Text style={s.toggleDesc}>Yan yana 2{"'"}den fazla ardışık sayı olmasın</Text>
              </View>
              <Toggle value={noConsecutive} onChange={(v) => { softHaptic(); setNoConsecutive(v); }} />
            </Pressable>

            <View style={s.divider} />

            <View style={s.subHeader}>
              <Text style={s.subTitle}>Toplam aralığı</Text>
              {sumMin.trim() !== '' || sumMax.trim() !== '' ? (
                <Pressable onPress={() => { softHaptic(); setSumMin(''); setSumMax(''); }} hitSlop={8}>
                  <Text style={[s.clearBtn, { color: c.brand }]}>Temizle</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={[s.subDesc, { color: c.brand }]}>Geçerli aralık: {theoreticalMin} – {theoreticalMax}</Text>
            <View style={s.sumRow}>
              <TextInput style={inputStyle} value={sumMin} onChangeText={setSumMin} placeholder="Alt sınır" placeholderTextColor={c.text3} keyboardType="numeric" />
              <Text style={[s.sumDash, { color: c.text3 }]}>—</Text>
              <TextInput style={inputStyle} value={sumMax} onChangeText={setSumMax} placeholder="Üst sınır" placeholderTextColor={c.text3} keyboardType="numeric" />
            </View>

            <View style={s.divider} />

            <View style={s.subHeader}>
              <Text style={s.subTitle}>Zorunlu sayılar</Text>
              {includeText.trim() !== '' ? (
                <Pressable onPress={() => { softHaptic(); setIncludeText(''); }} hitSlop={8}>
                  <Text style={[s.clearBtn, { color: c.brand }]}>Temizle</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={s.subDesc}>Mutlaka kuponda olacak sayılar (1–{selectedGame.max}, virgülle ayır)</Text>
            <TextInput style={[...inputStyle, s.fullInput]} value={includeText} onChangeText={setIncludeText} placeholder="Örn: 7, 19, 23" placeholderTextColor={c.text3} keyboardType="numeric" />

            <View style={s.divider} />

            <View style={s.subHeader}>
              <Text style={s.subTitle}>Hariç tutulan sayılar</Text>
              {excludeText.trim() !== '' ? (
                <Pressable onPress={() => { softHaptic(); setExcludeText(''); }} hitSlop={8}>
                  <Text style={[s.clearBtn, { color: c.brand }]}>Temizle</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={s.subDesc}>Asla kuponda olmayacak sayılar (1–{selectedGame.max}, virgülle ayır)</Text>
            <TextInput style={[...inputStyle, s.fullInput]} value={excludeText} onChangeText={setExcludeText} placeholder="Örn: 13, 42" placeholderTextColor={c.text3} keyboardType="numeric" />
          </Surface>
        ) : null}

        <View style={[s.note, { backgroundColor: c.surfaceAlt, borderColor: c.hairline }]}>
          <InfoIcon color={c.text3} size={15} />
          <Text style={s.noteText}>Sayılar tamamen rastgele üretilir. Eğlence amaçlıdır, kazanç garantisi yoktur.</Text>
        </View>
      </ScrollView>

      <Modal visible={historyModal} transparent animationType="slide" onRequestClose={() => setHistoryModal(false)}>
        <View style={[s.modalOverlay, { backgroundColor: c.overlay }]}>
          <View style={[s.modalSheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={s.modalGrabber} />
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>Kupon geçmişi</Text>
                <Text style={s.modalSubtitle}>{selectedGame.name} · son {MAX_HISTORY} üretim</Text>
              </View>
              <Pressable
                onPress={() => { softHaptic(); setHistoryModal(false); }}
                style={[s.modalClose, { backgroundColor: c.surfaceAlt }]}
                hitSlop={8}
              >
                <CloseIcon color={c.text2} size={20} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {currentGameHistory.map((entry, index) => {
                const entryColor = GameAccent[entry.gameId] ?? c.brand;
                const timeAgo = Math.floor((Date.now() - entry.timestamp) / 60000);
                const timeStr = timeAgo < 1 ? 'az önce' : timeAgo < 60 ? `${timeAgo} dk önce` : '1+ saat önce';
                return (
                  <PressableScale
                    key={index}
                    onPress={() => handleRestore(entry)}
                    style={[s.historyEntry, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
                  >
                    <View style={s.historyEntryHead}>
                      <View style={s.historyEntryGameRow}>
                        <GameEmblem game={entry.gameId} size={22} />
                        <Text style={s.historyEntryGame}>{entry.game}</Text>
                      </View>
                      <Text style={s.historyEntryTime}>{timeStr}</Text>
                    </View>
                    <View style={s.historyEntryBalls}>
                      {entry.numbers.map((num, i) => (
                        <NumberBall key={i} value={num} color={entryColor} size={28} />
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
                label={savingAll ? 'Kaydediliyor…' : 'Tümünü kaydet'}
                onPress={handleSaveAllHistory}
                disabled={savingAll}
                iconLeft={(color, size) => <CheckIcon color={color} size={size} />}
              />
              <AppButton
                label="Geçmişi temizle"
                variant="ghost"
                accent={c.danger}
                onPress={handleClearHistory}
                iconLeft={(color, size) => <TrashIcon color={color} size={size} />}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ───────────────────────── styles ───────────────────────── */
function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: spacing.xl, paddingTop: 4, paddingBottom: 14 },
    title: { ...ty.h1, color: c.text },
    subtitle: { ...ty.bodyMedium, color: c.text2, marginTop: 3 },
    sectionLabel: { ...ty.micro, color: c.text2, paddingHorizontal: spacing.xl, marginBottom: 10 },

    resultCard: { marginHorizontal: spacing.xl, marginTop: spacing.lg, borderRadius: radius.xxl, paddingVertical: 24, paddingHorizontal: spacing.xl },
    empty: { alignItems: 'center', gap: spacing.md, paddingVertical: 8 },
    emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    emptyText: { ...ty.bodyMedium, color: c.text3, textAlign: 'center', maxWidth: 220 },
    balls: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
    bonusBlock: { alignItems: 'center', marginTop: spacing.lg },
    bonusLabel: { ...ty.micro, color: c.text3, marginBottom: 10 },
    resultFooter: { alignItems: 'center', marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: c.hairline },
    resultFooterLabel: { ...ty.micro, color: c.text3 },
    resultFooterValue: { fontFamily: theme.font.extrabold, fontSize: 15, color: c.text, marginTop: 3, fontVariant: ['tabular-nums'] },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: spacing.md },
    chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
    chipText: { ...ty.caption, fontFamily: theme.font.semibold },

    btnRow: { flexDirection: 'row', gap: 10, marginHorizontal: spacing.xl, marginTop: spacing.lg },
    filterBtn: { width: 52, height: 52, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    filterDot: { position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4 },

    saveBtn: { marginHorizontal: spacing.xl, marginTop: 10, alignSelf: 'stretch' },

    historyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginHorizontal: spacing.xl, marginTop: 10, paddingVertical: 13, borderRadius: radius.lg, borderWidth: 1 },
    historyBtnText: { ...ty.label },

    filterPanel: { marginHorizontal: spacing.xl, marginTop: spacing.md, padding: spacing.lg },
    filterPanelTitle: { ...ty.micro, color: c.text2, marginBottom: spacing.md },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 14, borderRadius: radius.md, borderWidth: 1 },
    toggleTitle: { ...ty.title, color: c.text },
    toggleDesc: { ...ty.caption, color: c.text3, marginTop: 3 },
    divider: { height: 1, backgroundColor: c.hairline, marginVertical: spacing.lg },
    subHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    subTitle: { ...ty.title, color: c.text },
    clearBtn: { ...ty.label, fontSize: 12 },
    subDesc: { ...ty.caption, color: c.text3, marginBottom: 10 },
    segmentWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    segment: { flexGrow: 1, minWidth: 42, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm, borderWidth: 1 },
    segmentTop: { fontFamily: theme.font.bold, fontSize: 13 },
    segmentBot: { fontFamily: theme.font.medium, fontSize: 9, marginTop: 1 },
    sumRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sumDash: { fontFamily: theme.font.bold, fontSize: 16 },
    input: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1, textAlign: 'center', fontFamily: theme.font.bold, fontSize: 14 },
    fullInput: { flex: 0, width: '100%', textAlign: 'left', paddingHorizontal: 14 },

    note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: 13, borderRadius: radius.md, borderWidth: 1 },
    noteText: { ...ty.caption, color: c.text2, flex: 1, lineHeight: 17 },

    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl },
    modalGrabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: spacing.lg },
    modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
    modalTitle: { ...ty.h2, color: c.text },
    modalSubtitle: { ...ty.caption, color: c.text2, marginTop: 3 },
    modalClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    historyEntry: { padding: 12, borderRadius: radius.lg, borderWidth: 1, marginBottom: 10 },
    historyEntryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    historyEntryGameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    historyEntryGame: { ...ty.title, color: c.text },
    historyEntryTime: { ...ty.caption, color: c.text3 },
    historyEntryBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
    modalActions: { marginTop: spacing.md, gap: spacing.sm },
  });
}