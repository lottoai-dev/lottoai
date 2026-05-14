// tabs_generate.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GAMES, GAME_COLORS } from '../../lib/games';
import GameSelector from '../../lib/GameSelector';
import { t } from '../../lib/i18n';

// ─── Yardımcı fonksiyonlar ────────────────────────────────────

function generateNumbers(count: number, max: number): number[] {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

function generateWithEvenOdd(count: number, max: number, evenCount: number): number[] {
  const oddCount = count - evenCount;
  const evens = Array.from({ length: max }, (_, i) => i + 1).filter(n => n % 2 === 0);
  const odds = Array.from({ length: max }, (_, i) => i + 1).filter(n => n % 2 !== 0);
  if (evens.length < evenCount || odds.length < oddCount) return generateNumbers(count, max);
  const selectedEvens = [...evens].sort(() => Math.random() - 0.5).slice(0, evenCount);
  const selectedOdds = [...odds].sort(() => Math.random() - 0.5).slice(0, oddCount);
  return [...selectedEvens, ...selectedOdds].sort((a, b) => a - b);
}

function generateBalanced(count: number, max: number): number[] {
  const sliceSize = max / count;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor(i * sliceSize) + 1;
    const to = Math.floor((i + 1) * sliceSize);
    const candidates = Array.from({ length: to - from + 1 }, (_, j) => from + j);
    result.push(candidates[Math.floor(Math.random() * candidates.length)]);
  }
  return result.sort((a, b) => a - b);
}

function countConsecutivePairs(nums: number[]): number {
  let pairs = 0;
  for (let i = 0; i < nums.length - 1; i++) {
    if (nums[i + 1] - nums[i] === 1) pairs++;
  }
  return pairs;
}

function parseNumberList(input: string, max: number): number[] {
  return input
    .split(/[\s,]+/)
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n) && n >= 1 && n <= max);
}

function calcMinSum(count: number, max: number): number {
  let sum = 0;
  for (let i = 1; i <= count; i++) sum += i;
  return sum;
}
function calcMaxSum(count: number, max: number): number {
  let sum = 0;
  for (let i = max; i > max - count; i--) sum += i;
  return sum;
}

function validateSumRange(
  count: number,
  max: number,
  sumMin: number | null,
  sumMax: number | null
): string | null {
  const theoreticalMin = calcMinSum(count, max);
  const theoreticalMax = calcMaxSum(count, max);

  if (sumMin !== null && sumMin > theoreticalMax) {
    return `Alt sınır çok yüksek! Bu oyunda maksimum toplam ${theoreticalMax}'dir.`;
  }
  if (sumMax !== null && sumMax < theoreticalMin) {
    return `Üst sınır çok düşük! Bu oyunda minimum toplam ${theoreticalMin}'dir.`;
  }
  if (sumMin !== null && sumMax !== null && sumMin > sumMax) {
    return 'Alt sınır üst sınırdan büyük olamaz.';
  }
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

    const pool = Array.from({ length: max }, (_, i) => i + 1)
      .filter(n => !constraints.excludeNumbers.includes(n));

    let nums: number[] = [];

    if (constraints.balanced) {
      const sliceSize = max / count;
      const remaining = count - constraints.includeNumbers.length;
      const usedRanges = new Set<number>();

      constraints.includeNumbers.forEach(num => {
        const rangeIdx = Math.min(Math.floor((num - 1) / sliceSize), count - 1);
        usedRanges.add(rangeIdx);
      });

      const availableRanges: number[][] = [];
      for (let i = 0; i < count; i++) {
        if (usedRanges.has(i)) continue;
        const from = Math.floor(i * sliceSize) + 1;
        const to = Math.floor((i + 1) * sliceSize);
        availableRanges.push(
          Array.from({ length: to - from + 1 }, (_, j) => from + j)
            .filter(n => !constraints.excludeNumbers.includes(n))
        );
      }

      if (availableRanges.length < remaining) continue;

      const shuffledRanges = availableRanges.sort(() => Math.random() - 0.5);
      const picks: number[] = [];
      for (let i = 0; i < remaining; i++) {
        const range = shuffledRanges[i];
        if (range.length === 0) continue;
        picks.push(range[Math.floor(Math.random() * range.length)]);
      }

      nums = [...constraints.includeNumbers, ...picks].sort((a, b) => a - b);
    } else if (constraints.evenCount !== null) {
      const remaining = count - constraints.includeNumbers.length;
      const includeEvens = constraints.includeNumbers.filter(n => n % 2 === 0).length;
      const neededEvens = Math.max(0, constraints.evenCount - includeEvens);
      const neededOdds = Math.max(0, remaining - neededEvens);

      const evens = pool.filter(n => n % 2 === 0 && !constraints.includeNumbers.includes(n));
      const odds = pool.filter(n => n % 2 !== 0 && !constraints.includeNumbers.includes(n));

      if (evens.length < neededEvens || odds.length < neededOdds) continue;

      const selEvens = [...evens].sort(() => Math.random() - 0.5).slice(0, neededEvens);
      const selOdds = [...odds].sort(() => Math.random() - 0.5).slice(0, neededOdds);

      nums = [...constraints.includeNumbers, ...selEvens, ...selOdds].sort((a, b) => a - b);
    } else {
      const remaining = count - constraints.includeNumbers.length;
      const poolFiltered = pool.filter(n => !constraints.includeNumbers.includes(n));
      if (poolFiltered.length < remaining) continue;

      const shuffled = [...poolFiltered].sort(() => Math.random() - 0.5);
      const picks = shuffled.slice(0, remaining);

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

// ─── Geçmiş tipi (SüperStar eklendi) ──────────────────────────
type HistoryEntry = {
  game: string;
  gameId: string;
  numbers: number[];
  bonus: number[];
  superStar?: number;
  timestamp: number;
};

const HISTORY_KEY = 'generationHistory';
const MAX_HISTORY = 5;

// ─── Ekran ────────────────────────────────────────────────────
export default function GenerateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ game?: string }>();
  const [selectedGame, setSelectedGame] = useState(GAMES[0]);
  const [generatedNumbers, setGeneratedNumbers] = useState<number[]>([]);
  const [bonusNumbers, setBonusNumbers] = useState<number[]>([]);
  const [superStarNumber, setSuperStarNumber] = useState<number | null>(null); // YENİ
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
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const gc = GAME_COLORS[selectedGame.name as keyof typeof GAME_COLORS];
  const mainColor = gc?.main || '#6C63FF';
  const bonusColor = gc?.bonus || '#FF6B6B';

  const includeNumbers = parseNumberList(includeText, selectedGame.max);
  const excludeNumbers = parseNumberList(excludeText, selectedGame.max);

  const theoreticalMin = calcMinSum(selectedGame.count, selectedGame.max);
  const theoreticalMax = calcMaxSum(selectedGame.count, selectedGame.max);

  const filterActive =
    evenCount !== null ||
    balanced ||
    noConsecutive ||
    (sumMin.trim() !== '' && !isNaN(parseInt(sumMin))) ||
    (sumMax.trim() !== '' && !isNaN(parseInt(sumMax))) ||
    includeNumbers.length > 0 ||
    excludeNumbers.length > 0;

  const filterOptions = Array.from({ length: selectedGame.count + 1 }, (_, i) => i);
  const oddCount = evenCount !== null ? selectedGame.count - evenCount : null;

  useEffect(() => {
    if (params.game) {
      const game = GAMES.find(g => g.id === params.game);
      if (game) {
        setSelectedGame(game);
        setGeneratedNumbers([]);
        setBonusNumbers([]);
        setSuperStarNumber(null);
      }
    }
  }, [params.game]);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then(data => {
      if (data) setHistory(JSON.parse(data));
    });
  }, []);

  const saveToHistory = useCallback(async (entry: HistoryEntry) => {
    const updated = [entry, ...history].slice(0, MAX_HISTORY);
    setHistory(updated);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  }, [history]);

  const animateNumbers = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  };

  const handleGenerate = () => {
    const sumMinNum = sumMin.trim() !== '' ? parseInt(sumMin) : null;
    const sumMaxNum = sumMax.trim() !== '' ? parseInt(sumMax) : null;

    const sumError = validateSumRange(selectedGame.count, selectedGame.max, sumMinNum, sumMaxNum);
    if (sumError) {
      Alert.alert('Geçersiz Toplam Aralığı', 
        `${sumError}\n\nBu oyun için geçerli toplam aralığı: ${theoreticalMin} – ${theoreticalMax}`);
      return;
    }

    if (includeNumbers.length > selectedGame.count) {
      Alert.alert('Filtre Hatası', `En fazla ${selectedGame.count} zorunlu sayı belirleyebilirsiniz.`);
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
      Alert.alert(
        'Üretim Başarısız',
        'Seçili filtrelerle uygun bir kombinasyon bulunamadı.\n\nFiltreleri gevşetin veya daha geniş bir toplam aralığı girin.'
      );
      return;
    }

    if (nums.length === 0) {
      Alert.alert('Filtre Hatası', 'Zorunlu sayılar çok fazla. Lütfen sayı adedini azaltın.');
      return;
    }

    const bonus = selectedGame.bonus
      ? generateNumbers(selectedGame.bonus.count, selectedGame.bonus.max)
      : [];

    // SüperStar üretimi
    let ss: number | undefined;
    if (selectedGame.superStar) {
      ss = generateNumbers(1, selectedGame.superStar.max)[0];
    }

    setGeneratedNumbers(nums);
    setBonusNumbers(bonus);
    setSuperStarNumber(ss ?? null);
    animateNumbers();

    saveToHistory({
      game: selectedGame.name,
      gameId: selectedGame.id,
      numbers: nums,
      bonus,
      superStar: ss,
      timestamp: Date.now(),
    });
  };

  const handleGameSelect = (game: typeof GAMES[0]) => {
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
    const game = GAMES.find(g => g.name === entry.game);
    if (game) setSelectedGame(game);
    setGeneratedNumbers(entry.numbers);
    setBonusNumbers(entry.bonus);
    setSuperStarNumber(entry.superStar ?? null);
    setHistoryModal(false);
  };

  const handleClearHistory = async () => {
    setHistory([]);
    await AsyncStorage.removeItem(HISTORY_KEY);
  };

  const handleSaveAllHistory = async () => {
    setSavingAll(true);
    try {
      const existing = await AsyncStorage.getItem('savedCoupons');
      const coupons = existing ? JSON.parse(existing) : [];
      let savedCount = 0;

      for (const entry of currentGameHistory) {
        const isDuplicate = coupons.some((c: any) => {
          if (c.game !== entry.game) return false;
          const sameNumbers = c.numbers.length === entry.numbers.length &&
            c.numbers.every((n: number) => entry.numbers.includes(n));
          if (!sameNumbers) return false;
          if (entry.bonus.length > 0 && c.bonus && c.bonus.length > 0) {
            return c.bonus.length === entry.bonus.length &&
              c.bonus.every((n: number) => entry.bonus.includes(n));
          }
          if (entry.superStar && c.superStar) {
            if (entry.superStar !== c.superStar) return false;
          } else if (entry.superStar !== c.superStar) return false;
          return true;
        });

        if (isDuplicate) continue;

        const gcEntry = GAME_COLORS[entry.game as keyof typeof GAME_COLORS];
        coupons.unshift({
          id: Date.now() + savedCount,
          game: entry.game,
          icon: GAMES.find(g => g.name === entry.game)?.icon || '🎱',
          color: gcEntry?.main || '#6C63FF',
          numbers: entry.numbers,
          bonus: entry.bonus,
          superStar: entry.superStar,
          date: new Date().toLocaleDateString('tr-TR'),
          matchedCount: undefined,
        });
        savedCount++;
      }

      if (savedCount > 0) {
        await AsyncStorage.setItem('savedCoupons', JSON.stringify(coupons));
        Alert.alert('✅ Kaydedildi!', `${savedCount} kupon Kuponlarım'a eklendi.`, [
          { text: 'Tamam' },
          { text: 'Kuponlarıma Git', onPress: () => { setHistoryModal(false); router.push('/(tabs)/saved'); } },
        ]);
      } else {
        Alert.alert('ℹ️ Bilgi', 'Geçmişteki tüm kuponlar zaten kayıtlı.');
      }
    } catch (e) {
      Alert.alert('Hata', 'Kuponlar kaydedilemedi!');
    } finally {
      setSavingAll(false);
    }
  };

  const handleSave = async () => {
    if (generatedNumbers.length === 0) {
      Alert.alert('Uyarı', 'Önce bir kupon üretin!');
      return;
    }
    try {
      const existing = await AsyncStorage.getItem('savedCoupons');
      const coupons = existing ? JSON.parse(existing) : [];

      const duplicate = coupons.find((c: any) => {
        if (c.game !== selectedGame.name) return false;
        const sameNumbers =
          c.numbers.length === generatedNumbers.length &&
          c.numbers.every((n: number) => generatedNumbers.includes(n));
        if (!sameNumbers) return false;
        if (bonusNumbers.length > 0 && c.bonus && c.bonus.length > 0) {
          return c.bonus.length === bonusNumbers.length &&
            c.bonus.every((n: number) => bonusNumbers.includes(n));
        }
        if (superStarNumber !== null && c.superStar) {
          if (superStarNumber !== c.superStar) return false;
        } else if (superStarNumber !== (c.superStar ?? null)) return false;
        return true;
      });

      if (duplicate) {
        Alert.alert(
          'Aynı Kupon Zaten Kayıtlı!',
          'Bu sayı kombinasyonu daha önce kaydedilmiş. Yine de kaydetmek ister misiniz?',
          [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Yine de Kaydet',
              onPress: async () => {
                coupons.unshift({
                  id: Date.now(),
                  game: selectedGame.name,
                  icon: selectedGame.icon,
                  color: mainColor,
                  numbers: generatedNumbers,
                  bonus: bonusNumbers,
                  superStar: superStarNumber,
                  date: new Date().toLocaleDateString('tr-TR'),
                  matchedCount: undefined,
                });
                await AsyncStorage.setItem('savedCoupons', JSON.stringify(coupons));
                Alert.alert(t('savedSuccess'), t('savedSuccessMsg'), [
                  { text: 'Tamam' },
                  { text: 'Kuponlarıma Git', onPress: () => router.push('/(tabs)/saved') },
                ]);
              },
            },
          ]
        );
        return;
      }

      coupons.unshift({
        id: Date.now(),
        game: selectedGame.name,
        icon: selectedGame.icon,
        color: mainColor,
        numbers: generatedNumbers,
        bonus: bonusNumbers,
        superStar: superStarNumber,
        date: new Date().toLocaleDateString('tr-TR'),
        matchedCount: undefined,
      });
      await AsyncStorage.setItem('savedCoupons', JSON.stringify(coupons));
      Alert.alert(t('savedSuccess'), t('savedSuccessMsg'), [
        { text: 'Tamam' },
        { text: 'Kuponlarıma Git', onPress: () => router.push('/(tabs)/saved') },
      ]);
    } catch (e) {
      Alert.alert('Hata', 'Kupon kaydedilemedi!');
    }
  };

  const filterSummary = (): string => {
    const parts: string[] = [];
    if (balanced) parts.push('⚖️ Dengeli');
    if (evenCount !== null) parts.push(`${evenCount} çift · ${oddCount} tek`);
    if (noConsecutive) parts.push('🔗 Ardışık yok');
    if (sumMin.trim() !== '' && !isNaN(parseInt(sumMin)) && sumMax.trim() !== '' && !isNaN(parseInt(sumMax))) {
      parts.push(`∑ ${sumMin}–${sumMax}`);
    } else if (sumMin.trim() !== '' && !isNaN(parseInt(sumMin))) {
      parts.push(`∑ ≥ ${sumMin}`);
    } else if (sumMax.trim() !== '' && !isNaN(parseInt(sumMax))) {
      parts.push(`∑ ≤ ${sumMax}`);
    }
    if (includeNumbers.length > 0) parts.push(`✅ ${includeNumbers.join(',')}`);
    if (excludeNumbers.length > 0) parts.push(`❌ ${excludeNumbers.join(',')}`);
    return parts.join(' | ');
  };

  const currentGameHistory = history.filter(h => h.gameId === selectedGame.id);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('generate')}</Text>
          <Text style={styles.headerSub}>{t('tryYourLuck')}</Text>
        </View>

        <Text style={styles.sectionTitle}>{t('selectGame')}</Text>
        <GameSelector selectedGame={selectedGame} onSelect={handleGameSelect} />

        <LinearGradient
          colors={[mainColor + '22', '#16213e']}
          style={[styles.numbersCard, { borderColor: mainColor + '44' }]}>
          {generatedNumbers.length === 0 ? (
            <View style={styles.emptyNumbers}>
              <Text style={styles.emptyNumbersEmoji}>🎲</Text>
              <Text style={styles.emptyNumbersText}>Kupon üretmek için butona bas</Text>
            </View>
          ) : (
            <>
              <Animated.View style={[styles.ballsContainer, { transform: [{ scale: scaleAnim }] }]}>
                {generatedNumbers.map((num, i) => {
                  const isIncluded = includeNumbers.includes(num);
                  return (
                    <View key={i} style={[styles.ball, isIncluded ? { backgroundColor: '#FFD700' } : { backgroundColor: mainColor }]}>
                      <Text style={[styles.ballText, isIncluded && { color: '#000' }]}>{num}</Text>
                    </View>
                  );
                })}
              </Animated.View>
              {bonusNumbers.length > 0 && (
                <>
                  <Text style={styles.bonusLabel}>
                    {selectedGame.name === 'Çılgın Sayısal Loto' ? '🎯 Joker' : t('bonusLabel')}
                  </Text>
                  <Animated.View style={[styles.ballsContainer, { transform: [{ scale: scaleAnim }] }]}>
                    {bonusNumbers.map((num, i) => (
                      <View key={i} style={[styles.ball, { backgroundColor: bonusColor }]}>
                        <Text style={styles.ballText}>{num}</Text>
                      </View>
                    ))}
                  </Animated.View>
                </>
              )}
              {/* SüperStar gösterimi */}
              {superStarNumber !== null && selectedGame.superStar && (
                <>
                  <Text style={styles.bonusLabel}>⭐ SüperStar</Text>
                  <Animated.View style={[styles.ballsContainer, { transform: [{ scale: scaleAnim }] }]}>
                    <View style={[styles.ball, { backgroundColor: '#FFD700' }]}>
                      <Text style={[styles.ballText, { color: '#000' }]}>{superStarNumber}</Text>
                    </View>
                  </Animated.View>
                </>
              )}
              {filterActive && (
                <View style={styles.filterBadge}>
                  <Text style={[styles.filterBadgeText, { color: mainColor }]}>⚙️ {filterSummary()}</Text>
                </View>
              )}
            </>
          )}
        </LinearGradient>

        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.generateBtn, { backgroundColor: mainColor }]} onPress={handleGenerate}>
            <Text style={styles.generateBtnEmoji}>🎲</Text>
            <Text style={styles.generateBtnText}>Kupon Üret</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterToggleBtn, filterActive && { backgroundColor: mainColor + '33', borderColor: mainColor }]}
            onPress={() => setShowFilter(!showFilter)}>
            <Ionicons name="options-outline" size={20} color={filterActive ? mainColor : '#999'} />
            {filterActive && <View style={[styles.filterDot, { backgroundColor: mainColor }]} />}
          </TouchableOpacity>
        </View>

        {currentGameHistory.length > 0 && (
          <TouchableOpacity
            style={[styles.historyBtn, { borderColor: mainColor + '44' }]}
            onPress={() => setHistoryModal(true)}>
            <Text style={styles.historyBtnEmoji}>⏱</Text>
            <Text style={[styles.historyBtnText, { color: mainColor }]}>Geçmiş ({currentGameHistory.length})</Text>
          </TouchableOpacity>
        )}

        {showFilter && (
          <View style={[styles.filterPanel, { borderColor: mainColor + '44' }]}>

            <TouchableOpacity
              style={[styles.balancedBtn, balanced && { backgroundColor: mainColor + '22', borderColor: mainColor }]}
              onPress={() => { setBalanced(!balanced); if (!balanced) setEvenCount(null); }}>
              <View style={styles.balancedBtnLeft}>
                <Text style={styles.balancedBtnEmoji}>⚖️</Text>
                <View>
                  <Text style={[styles.balancedBtnTitle, balanced && { color: mainColor }]}>Dengeli Dağılım</Text>
                  <Text style={styles.balancedBtnDesc}>Düşük, orta ve yüksek sayılardan eşit oranda seçer</Text>
                </View>
              </View>
              {balanced && <Ionicons name="checkmark-circle" size={20} color={mainColor} />}
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.filterSubHeader}>
              <Text style={styles.filterTitle}>⚖️ Çift / Tek</Text>
              {evenCount !== null && (
                <TouchableOpacity onPress={() => setEvenCount(null)}>
                  <Text style={[styles.filterClearBtn, { color: mainColor }]}>Temizle</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.filterDesc}>{selectedGame.count} sayıdan kaç tanesi çift olsun?</Text>
            <View style={styles.filterOptions}>
              {filterOptions.map((n) => {
                const isSelected = evenCount === n;
                const odd = selectedGame.count - n;
                return (
                  <TouchableOpacity
                    key={n}
                    style={[styles.filterOption, isSelected && { backgroundColor: mainColor, borderColor: mainColor }]}
                    onPress={() => { setEvenCount(n); setBalanced(false); }}>
                    <Text style={[styles.filterOptionTop, isSelected && { color: '#fff' }]}>{n} çift</Text>
                    <Text style={[styles.filterOptionBot, isSelected && { color: 'rgba(255,255,255,0.7)' }]}>{odd} tek</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={[styles.balancedBtn, noConsecutive && { backgroundColor: mainColor + '22', borderColor: mainColor }]}
              onPress={() => setNoConsecutive(!noConsecutive)}>
              <View style={styles.balancedBtnLeft}>
                <Text style={styles.balancedBtnEmoji}>🔗</Text>
                <View>
                  <Text style={[styles.balancedBtnTitle, noConsecutive && { color: mainColor }]}>Ardışık Sayıları Engelle</Text>
                  <Text style={styles.balancedBtnDesc}>Yan yana 2'den fazla ardışık sayı olmasın</Text>
                </View>
              </View>
              {noConsecutive && <Ionicons name="checkmark-circle" size={20} color={mainColor} />}
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.filterSubHeader}>
              <Text style={styles.filterTitle}>∑ Toplam Aralığı</Text>
              {(sumMin.trim() !== '' || sumMax.trim() !== '') && (
                <TouchableOpacity onPress={() => { setSumMin(''); setSumMax(''); }}>
                  <Text style={[styles.filterClearBtn, { color: mainColor }]}>Temizle</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={[styles.filterDesc, { color: mainColor + 'cc' }]}>
              Bu oyun için geçerli aralık: {theoreticalMin} – {theoreticalMax}
            </Text>
            <Text style={styles.filterDesc}>Sayıların toplamı hangi aralıkta olsun?</Text>
            <View style={styles.sumRow}>
              <TextInput
                style={[styles.sumInput, { borderColor: mainColor + '44', color: '#fff' }]}
                value={sumMin}
                onChangeText={setSumMin}
                placeholder={`Alt (min ${theoreticalMin})`}
                placeholderTextColor="#555"
                keyboardType="numeric"
              />
              <Text style={styles.sumSeparator}>—</Text>
              <TextInput
                style={[styles.sumInput, { borderColor: mainColor + '44', color: '#fff' }]}
                value={sumMax}
                onChangeText={setSumMax}
                placeholder={`Üst (max ${theoreticalMax})`}
                placeholderTextColor="#555"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.filterSubHeader}>
              <Text style={styles.filterTitle}>✅ Zorunlu Sayılar</Text>
              {includeText.trim() !== '' && (
                <TouchableOpacity onPress={() => setIncludeText('')}>
                  <Text style={[styles.filterClearBtn, { color: mainColor }]}>Temizle</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.filterDesc}>Hangi sayılar mutlaka kuponda olsun? (1-{selectedGame.max} arası, virgülle ayırın)</Text>
            <TextInput
              style={[styles.sumInput, { borderColor: mainColor + '44', color: '#fff' }]}
              value={includeText}
              onChangeText={setIncludeText}
              placeholder="Örn: 7, 19, 23"
              placeholderTextColor="#555"
              keyboardType="numeric"
            />

            <View style={styles.divider} />

            <View style={styles.filterSubHeader}>
              <Text style={styles.filterTitle}>❌ Hariç Tutulan Sayılar</Text>
              {excludeText.trim() !== '' && (
                <TouchableOpacity onPress={() => setExcludeText('')}>
                  <Text style={[styles.filterClearBtn, { color: mainColor }]}>Temizle</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.filterDesc}>Hangi sayılar asla kuponda olmasın? (1-{selectedGame.max} arası, virgülle ayırın)</Text>
            <TextInput
              style={[styles.sumInput, { borderColor: mainColor + '44', color: '#fff' }]}
              value={excludeText}
              onChangeText={setExcludeText}
              placeholder="Örn: 13, 42"
              placeholderTextColor="#555"
              keyboardType="numeric"
            />

            <Text style={styles.filterNote}>
              💡 "Kupon Üret" aktif filtrelere göre çalışır. Çok kısıtlayıcı filtreler üretimi engelleyebilir.
            </Text>
          </View>
        )}

        {generatedNumbers.length > 0 && (
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: mainColor }]} onPress={handleSave}>
            <Ionicons name="bookmark-outline" size={20} color="#fff" />
            <Text style={styles.saveBtnText}>{t('saveBtn')}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {filterActive ? `⚙️ ${filterSummary()}` : t('luckyInfo')}
          </Text>
        </View>
      </ScrollView>

      <Modal visible={historyModal} transparent animationType="slide" onRequestClose={() => setHistoryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⏱ Kupon Geçmişi</Text>
              <Text style={styles.modalSubtitle}>{selectedGame.name} · Son {MAX_HISTORY} üretim</Text>
            </View>

            {currentGameHistory.map((entry, index) => {
              const entryGame = GAMES.find(g => g.name === entry.game);
              const entryColor = GAME_COLORS[entry.game as keyof typeof GAME_COLORS]?.main || '#6C63FF';
              const timeAgo = Math.floor((Date.now() - entry.timestamp) / 60000);
              const timeStr = timeAgo < 1 ? 'az önce' : timeAgo < 60 ? `${timeAgo} dk önce` : '1+ saat önce';

              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.historyEntry, { borderLeftColor: entryColor }]}
                  onPress={() => handleRestore(entry)}>
                  <View style={styles.historyEntryHeader}>
                    <Text style={styles.historyEntryGame}>{entryGame?.icon} {entry.game}</Text>
                    <Text style={styles.historyEntryTime}>{timeStr}</Text>
                  </View>
                  <View style={styles.historyEntryNumbers}>
                    {entry.numbers.map((num, i) => (
                      <View key={i} style={[styles.historyEntryBall, { backgroundColor: entryColor }]}>
                        <Text style={styles.historyEntryBallText}>{num}</Text>
                      </View>
                    ))}
                    {entry.bonus.length > 0 && (
                      <>
                        <Text style={styles.historyEntryBonusLabel}>+</Text>
                        {entry.bonus.map((num, i) => (
                          <View key={`b${i}`} style={[styles.historyEntryBall, { backgroundColor: GAME_COLORS[entry.game as keyof typeof GAME_COLORS]?.bonus || '#FF6B6B' }]}>
                            <Text style={styles.historyEntryBallText}>{num}</Text>
                          </View>
                        ))}
                      </>
                    )}
                    {entry.superStar && (
                      <>
                        <Text style={styles.historyEntryBonusLabel}>⭐</Text>
                        <View style={[styles.historyEntryBall, { backgroundColor: '#FFD700' }]}>
                          <Text style={[styles.historyEntryBallText, { color: '#000' }]}>{entry.superStar}</Text>
                        </View>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalSaveAllBtn, savingAll && { opacity: 0.6 }]}
                onPress={handleSaveAllHistory}
                disabled={savingAll}>
                <Text style={styles.modalSaveAllBtnText}>{savingAll ? '⏳ Kaydediliyor...' : '💾 Tümünü Kaydet'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalClearBtn} onPress={handleClearHistory}>
                <Text style={styles.modalClearBtnText}>🗑 Geçmişi Temizle</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalClose} onPress={() => setHistoryModal(false)}>
                <Text style={styles.modalCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { padding: 20, paddingTop: 20 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  headerSub: { color: '#999', fontSize: 14, marginTop: 4 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', paddingHorizontal: 20, marginBottom: 10 },
  numbersCard: { marginHorizontal: 20, borderRadius: 20, borderWidth: 1, padding: 20, marginBottom: 16, minHeight: 120, justifyContent: 'center' },
  emptyNumbers: { alignItems: 'center', gap: 10, paddingVertical: 10 },
  emptyNumbersEmoji: { fontSize: 40 },
  emptyNumbersText: { color: '#666', fontSize: 13, textAlign: 'center' },
  ballsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  ball: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
  ballText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  bonusLabel: { color: '#999', fontSize: 12, marginTop: 12, marginBottom: 8, textAlign: 'center' },
  filterBadge: { marginTop: 10, alignItems: 'center' },
  filterBadgeText: { fontSize: 11, fontWeight: 'bold' },
  btnRow: { flexDirection: 'row', marginHorizontal: 20, gap: 10, marginBottom: 10 },
  generateBtn: { flex: 1, padding: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  generateBtnEmoji: { fontSize: 18 },
  generateBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  filterToggleBtn: { width: 52, borderRadius: 14, borderWidth: 1.5, borderColor: '#2a2a4a', backgroundColor: '#16213e', justifyContent: 'center', alignItems: 'center' },
  filterDot: { width: 7, height: 7, borderRadius: 4, position: 'absolute', top: 8, right: 8 },
  historyBtn: { marginHorizontal: 20, padding: 14, borderRadius: 12, borderWidth: 1, backgroundColor: '#16213e', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 },
  historyBtnEmoji: { fontSize: 18 },
  historyBtnText: { fontSize: 14, fontWeight: 'bold' },
  filterPanel: { marginHorizontal: 20, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12, backgroundColor: '#16213e' },
  balancedBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#2a2a4a' },
  balancedBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  balancedBtnEmoji: { fontSize: 22 },
  balancedBtnTitle: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  balancedBtnDesc: { color: '#666', fontSize: 11, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#2a2a4a', marginVertical: 12 },
  filterSubHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  filterTitle: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  filterClearBtn: { fontSize: 12, fontWeight: '600' },
  filterDesc: { color: '#999', fontSize: 12, marginBottom: 10 },
  filterOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  filterOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#2a2a4a', alignItems: 'center', minWidth: 60 },
  filterOptionTop: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  filterOptionBot: { color: '#666', fontSize: 10, marginTop: 2 },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sumInput: { flex: 1, backgroundColor: '#0f0f23', borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  sumSeparator: { color: '#666', fontSize: 18, fontWeight: 'bold' },
  filterNote: { color: '#555', fontSize: 11, lineHeight: 16, marginTop: 4 },
  saveBtn: { marginHorizontal: 20, padding: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  infoBox: { marginHorizontal: 20, padding: 12, borderRadius: 10, backgroundColor: '#0f0f23', marginBottom: 20 },
  infoText: { color: '#666', fontSize: 12, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1a1a2e', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader: { marginBottom: 16 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  modalSubtitle: { color: '#999', fontSize: 13, marginTop: 4 },
  historyEntry: { backgroundColor: '#16213e', padding: 10, borderRadius: 12, marginBottom: 10, borderLeftWidth: 4 },
  historyEntryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  historyEntryGame: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  historyEntryTime: { color: '#666', fontSize: 11 },
  historyEntryNumbers: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, alignItems: 'center' },
  historyEntryBall: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  historyEntryBallText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  historyEntryBonusLabel: { color: '#666', fontSize: 13, marginHorizontal: 2 },
  modalActions: { marginTop: 8, gap: 8 },
  modalSaveAllBtn: { backgroundColor: '#6C63FF22', borderWidth: 1, borderColor: '#6C63FF', padding: 12, borderRadius: 10, alignItems: 'center' },
  modalSaveAllBtnText: { color: '#6C63FF', fontSize: 14, fontWeight: 'bold' },
  modalClearBtn: { backgroundColor: '#FF6B6B11', borderWidth: 1, borderColor: '#FF6B6B44', padding: 12, borderRadius: 10, alignItems: 'center' },
  modalClearBtnText: { color: '#FF6B6B', fontSize: 13, fontWeight: '600' },
  modalClose: { backgroundColor: '#2a2a4a', padding: 14, borderRadius: 10, alignItems: 'center' },
  modalCloseText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
});