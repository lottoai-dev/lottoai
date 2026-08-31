// app/(tabs)/generate.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../../components/ui/app-button';
import { NumberBall } from '../../components/ui/number-ball';
import { PressableScale, Surface } from '../../components/ui/surface';
import { Toggle } from '../../components/ui/toggle';
import { STORAGE_KEYS } from '../../constants/storage-keys';
import { AppTheme, spacing } from '../../constants/theme';
import { useAlert } from '../../contexts/AlertContext';
import { useAuth } from '../../contexts/AuthContext';
import { showRewardedAd } from '../../lib/adMob';
import { markCouponsDirty } from '../../lib/couponsStore';
import { GameEmblem } from '../../lib/emblems';
import { formatQuotaResetIn, msUntilQuotaReset } from '../../lib/aiQuota';
import {
  ADS_REWARDS_ENABLED,
  FEATURE_FREE_DAILY_LIMIT,
  FEATURE_REWARD_AMOUNT,
  getFeatureQuotaStatus,
  recordFeatureUsage,
  waitForRewardGrant,
} from '../../lib/featureQuota';
import { GAMES, getGameAccentColor } from '../../lib/games';
import GameSelector from '../../lib/GameSelector';
import { recordGoodMoment } from '../../lib/review-prompt';
import {
  BookmarkIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  DiceIcon,
  InfoIcon,
  PlayIcon,
  SlidersIcon,
  TrashIcon,
} from '../../lib/icons';
import { useTheme } from '../../lib/theme';

/**
 * Top boyutu Sayısal Loto (6 sayı) ile aynı: ekrana göre 30–42px.
 * 6 sayılı oyunlarda tek satır (nowrap); On Numara wrap eder.
 */
function mainBallLayout(count: number, screenWidth: number): { size: number; gap: number; nowrap: boolean } {
  // resultCard: margin xl*2 + paddingLeft (xl+4) + paddingRight xl
  const available = screenWidth - spacing.xl * 2 - (spacing.xl + 4) - spacing.xl;
  const sayisalGap = 6;
  const sayisalCount = 6;
  const size = Math.max(
    30,
    Math.min(42, Math.floor((available - sayisalGap * (sayisalCount - 1)) / sayisalCount)),
  );

  if (count < 6) return { size, gap: 10, nowrap: true };
  if (count > 6) return { size, gap: 6, nowrap: false };
  return { size, gap: 6, nowrap: true };
}

function softHaptic() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

/* ───────────────────────── number logic ───────────────────────── */
function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function generateNumbers(count: number, max: number): number[] {
  const pool = new Array<number>(max);
  for (let i = 0; i < max; i++) pool[i] = i + 1;
  shuffleInPlace(pool);
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
  },
): number[] | null {
  if (constraints.includeNumbers.length > count) return null;

  const MAX_ATTEMPTS = 500;
  const excludeSet = new Set(constraints.excludeNumbers);
  const includeSet = new Set(constraints.includeNumbers);
  const basePool: number[] = [];
  for (let n = 1; n <= max; n++) {
    if (!excludeSet.has(n)) basePool.push(n);
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let nums: number[] = [];

    if (constraints.balanced) {
      const sliceSize = max / count;
      const remaining = count - constraints.includeNumbers.length;
      const usedRanges = new Set<number>();
      for (const num of constraints.includeNumbers) {
        usedRanges.add(Math.min(Math.floor((num - 1) / sliceSize), count - 1));
      }
      const availableRanges: number[][] = [];
      for (let i = 0; i < count; i++) {
        if (usedRanges.has(i)) continue;
        const from = Math.floor(i * sliceSize) + 1;
        const to = Math.floor((i + 1) * sliceSize);
        const range: number[] = [];
        for (let n = from; n <= to; n++) {
          if (!excludeSet.has(n)) range.push(n);
        }
        availableRanges.push(range);
      }
      if (availableRanges.length < remaining) continue;
      shuffleInPlace(availableRanges);
      const picks: number[] = [];
      for (let i = 0; i < remaining; i++) {
        const range = availableRanges[i];
        if (!range || range.length === 0) continue;
        picks.push(range[Math.floor(Math.random() * range.length)]);
      }
      nums = [...constraints.includeNumbers, ...picks].sort((a, b) => a - b);
    } else if (constraints.evenCount !== null) {
      const remaining = count - constraints.includeNumbers.length;
      const includeEvens = constraints.includeNumbers.filter((n) => n % 2 === 0).length;
      const neededEvens = Math.max(0, constraints.evenCount - includeEvens);
      const neededOdds = Math.max(0, remaining - neededEvens);
      const evens: number[] = [];
      const odds: number[] = [];
      for (const n of basePool) {
        if (includeSet.has(n)) continue;
        if (n % 2 === 0) evens.push(n);
        else odds.push(n);
      }
      if (evens.length < neededEvens || odds.length < neededOdds) continue;
      shuffleInPlace(evens);
      shuffleInPlace(odds);
      const selEvens = evens.slice(0, neededEvens);
      const selOdds = odds.slice(0, neededOdds);
      nums = [...constraints.includeNumbers, ...selEvens, ...selOdds].sort((a, b) => a - b);
    } else {
      const remaining = count - constraints.includeNumbers.length;
      const poolFiltered: number[] = [];
      for (const n of basePool) {
        if (!includeSet.has(n)) poolFiltered.push(n);
      }
      if (poolFiltered.length < remaining) continue;

      // Toplam aralığı isteniyorsa, sayı seçimi TAMAMEN RASTGELE kalmaya devam
      // eder (hâlâ Math.random() ile) ama "kör" değil, hedef ortalamaya hafifçe
      // eğilimli seçilir — her sayı hedefe olan uzaklığına göre bir ağırlık alır,
      // hiçbir sayı tamamen elenmez. Bu, dar toplam aralıklarını (ör. "50-100
      // arası") bulma ihtimalini büyük ölçüde artırır ama sonucu asla sabitlemez.
      let picks: number[];
      if ((constraints.sumMin !== null || constraints.sumMax !== null) && remaining > 0) {
        const includedSum = constraints.includeNumbers.reduce((a, b) => a + b, 0);
        const lo = constraints.sumMin ?? calcMinSum(count);
        const hi = constraints.sumMax ?? calcMaxSum(count, max);
        const targetAvg = ((lo + hi) / 2 - includedSum) / remaining;
        const spread = Math.max(max / 3, 10);

        const workingPool = poolFiltered.slice();
        picks = [];
        for (let i = 0; i < remaining; i++) {
          const weights = workingPool.map((n) => Math.max(1, spread - Math.abs(n - targetAvg)));
          const totalWeight = weights.reduce((a, b) => a + b, 0);
          let r = Math.random() * totalWeight;
          let chosenIdx = workingPool.length - 1;
          for (let j = 0; j < workingPool.length; j++) {
            r -= weights[j];
            if (r <= 0) {
              chosenIdx = j;
              break;
            }
          }
          picks.push(workingPool[chosenIdx]);
          workingPool.splice(chosenIdx, 1);
        }
      } else {
        picks = shuffleInPlace(poolFiltered.slice()).slice(0, remaining);
      }

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

/* ───────────────────────── screen ───────────────────────── */
export default function GenerateScreen() {
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
  const [savingCoupon, setSavingCoupon] = useState(false);
  const savingCouponRef = useRef(false);
  // Filtreli kupon üretimi günlük ücretsiz hakkı doldurduğunda bu kart
  // açılır: kullanıcı ya reklam izleyip +3 hak kazanır ya da filtresiz
  // üretime geçer. generateAfterAd, "reklam izlendi" sonrası hangi
  // isteğin otomatik tekrar deneneceğini tutar.
  const [quotaCardVisible, setQuotaCardVisible] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);
  const [checkingQuota, setCheckingQuota] = useState(false);
  const [generating, setGenerating] = useState(false);
  const generatingRef = useRef(false);

  const mainColor = getGameAccentColor(selectedGame.id);
  const ballLayout = useMemo(
    () => mainBallLayout(generatedNumbers.length || selectedGame.count, windowWidth),
    [generatedNumbers.length, selectedGame.count, windowWidth],
  );

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
      // Keep newest-first overall, but cap at MAX_HISTORY per game.
      const updated = [entry, ...history].filter((h, idx, arr) => {
        const sameGameBefore = arr.slice(0, idx).filter((x) => x.gameId === h.gameId).length;
        return sameGameBefore < MAX_HISTORY;
      });
      setHistory(updated);
      await AsyncStorage.setItem(STORAGE_KEYS.GENERATION_HISTORY, JSON.stringify(updated));
    },
    [history]
  );

  /**
   * Sayıları gerçekten üretip ekrana basan, geçmişe kaydeden asıl iş.
   * Kilit yönetmez — çağıran taraf (performGeneration veya handleGenerate
   * async yolu) generatingRef'i tutuyor olmalı.
   */
  const performGenerationCore = () => {
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

    // Filtreli üretim başarıyla tamamlandıysa günlük kullanımı işaretle.
    // Filtresiz üretim (filterActive false) bu kotaya hiç dahil değil.
    if (filterActive) {
      void recordFeatureUsage('filtered_coupon');
    }

    void recordGoodMoment();
  };

  /**
   * Üretim giriş noktası: generatingRef kilidi burada. handleWatchAd /
   * handleUseWithoutFilter / filtresiz handleGenerate bu fonksiyonu çağırır;
   * yeni çağıranlar da otomatik korunur.
   */
  const performGeneration = () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    try {
      performGenerationCore();
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  /**
   * "Kupon üret" butonuna basıldığında çağrılır. Filtresiz üretim her
   * zaman anında çalışır. Filtreli üretimde önce günlük hak kontrol
   * edilir — hak varsa direkt üretilir, yoksa reklam kartı açılır.
   * Kota await'i boyunca da kilidi tutar (çift tık → çift recordFeatureUsage önlenir).
   */
  const handleGenerate = async () => {
    if (generatingRef.current) return;
    softHaptic();

    if (!filterActive) {
      performGeneration();
      return;
    }

    if (!user) {
      router.push('/login' as any);
      return;
    }

    generatingRef.current = true;
    setGenerating(true);
    setCheckingQuota(true);
    try {
      const status = await getFeatureQuotaStatus('filtered_coupon');
      if (status.exhausted) {
        setQuotaCardVisible(true);
        return;
      }
      // Kilit zaten bizde — performGeneration tekrar kilitlemesin diye core çağrılır.
      performGenerationCore();
    } finally {
      setCheckingQuota(false);
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  /**
   * Kota kartındaki "Reklam izle" butonuna basıldığında çağrılır.
   * Hak, reklam bitince Google'ın sunucumuza yaptığı SSV çağrısıyla
   * eklenir; burada o çağrının kotaya yansımasını bekleriz. Yansıyınca
   * üretim otomatik tekrar denenir — kullanıcının "reklamı izledim, şimdi
   * tekrar dokunmam mı gerekiyor?" diye sormasına gerek kalmaz.
   */
  const handleWatchAd = async () => {
    if (!user) return;
    softHaptic();
    setWatchingAd(true);
    try {
      const before = await getFeatureQuotaStatus('filtered_coupon');
      const result = await showRewardedAd('filtered_coupon', { userId: user.id });
      if (result.status === 'earned') {
        const granted = await waitForRewardGrant('filtered_coupon', before.used);
        if (!granted) {
          showAlert(
            'Ödülün yolda',
            'Reklamı izledin ama hakkın henüz yansımadı. Birkaç saniye içinde eklenecek, sonra tekrar dener misin?',
          );
          return;
        }
        setQuotaCardVisible(false);
        performGeneration();
      } else if (result.status === 'closed_without_reward') {
        showAlert('Tamamlanmadı', 'Ödül kazanmak için reklamı sonuna kadar izlemen gerekiyor.');
      } else {
        showAlert('Reklam yüklenemedi', 'Şu an reklam gösterilemiyor, birazdan tekrar dener misin?');
      }
    } finally {
      setWatchingAd(false);
    }
  };

  const handleUseWithoutFilter = () => {
    softHaptic();
    setQuotaCardVisible(false);
    setEvenCount(null);
    setBalanced(false);
    setNoConsecutive(false);
    setSumMin('');
    setSumMax('');
    setIncludeText('');
    setExcludeText('');
    performGeneration();
  };

  const handleGameSelect = (game: (typeof GAMES)[0]) => {
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

  const handleClearHistory = () => {
    softHaptic();
    const count = currentGameHistory.length;
    if (count === 0) return;

    showAlert(
      'Geçmişi temizle',
      `${selectedGame.name} geçmişindeki ${count} kupon silinecek. Emin misin?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Temizle',
          style: 'destructive',
          onPress: async () => {
            const updated = history.filter((h) => h.gameId !== selectedGame.id);
            setHistory(updated);
            if (updated.length === 0) {
              await AsyncStorage.removeItem(STORAGE_KEYS.GENERATION_HISTORY);
            } else {
              await AsyncStorage.setItem(STORAGE_KEYS.GENERATION_HISTORY, JSON.stringify(updated));
            }
            setHistoryModal(false);
            showAlert('Temizlendi', `${selectedGame.name} geçmişi temizlendi.`);
          },
        },
      ]
    );
  };

  const buildCoupon = (
    entry: { game: string; numbers: number[]; bonus: number[]; superStar?: number | null },
    idOffset = 0
  ) => ({
    id: Date.now() + idOffset,
    game: entry.game,
    icon: GAMES.find((g) => g.name === entry.game)?.icon || '',
    color: getGameAccentColor(GAMES.find((g) => g.name === entry.game)?.id ?? 'cilgin'),
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
      softHaptic();
      if (!user) {
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
        markCouponsDirty();
      }
      const updatedHistory = history.filter((h) => h.gameId !== selectedGame.id);
      setHistory(updatedHistory);
      if (updatedHistory.length === 0) {
        await AsyncStorage.removeItem(STORAGE_KEYS.GENERATION_HISTORY);
      } else {
        await AsyncStorage.setItem(STORAGE_KEYS.GENERATION_HISTORY, JSON.stringify(updatedHistory));
      }
      setHistoryModal(false);
      if (savedCount > 0) {
        showAlert('Kaydedildi', `${savedCount} kupon Kuponlarım'a eklendi.`, [
          { text: 'Tamam' },
          {
            text: 'Kuponlarıma git',
            onPress: () => router.push('/(tabs)/saved'),
          },
        ]);
      } else {
        showAlert('Bilgi', 'Geçmişteki tüm kuponlar zaten kayıtlı. Liste temizlendi.');
      }
    } catch {
      showAlert('Hata', 'Kuponlar kaydedilemedi.');
    } finally {
      setSavingAll(false);
    }
  };

  const handleSave = async () => {
    if (savingCouponRef.current || savingCoupon) return;
    softHaptic();
    if (generatedNumbers.length === 0) {
      showAlert('Uyarı', 'Önce bir kupon üretin.');
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
      const existing = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS);
      const coupons = existing ? JSON.parse(existing) : [];
      const persist = async () => {
        coupons.unshift(buildCoupon(entry));
        await AsyncStorage.setItem(STORAGE_KEYS.SAVED_COUPONS, JSON.stringify(coupons));
        markCouponsDirty();
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
            {
              text: 'Yine de kaydet',
              onPress: async () => {
                if (savingCouponRef.current) return;
                savingCouponRef.current = true;
                setSavingCoupon(true);
                try {
                  await persist();
                } catch {
                  showAlert('Hata', 'Kupon kaydedilemedi.');
                } finally {
                  savingCouponRef.current = false;
                  setSavingCoupon(false);
                }
              },
            },
          ]
        );
        return;
      }
      await persist();
    } catch {
      showAlert('Hata', 'Kupon kaydedilemedi.');
    } finally {
      savingCouponRef.current = false;
      setSavingCoupon(false);
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

  const inputStyle = [s.input, { backgroundColor: c.surfaceAlt, color: c.text }];

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 90 }}
      >
        <View style={s.header}>
          <View style={s.headerText}>
            <View style={s.eyebrowRow}>
              <View style={[s.eyebrowDot, { backgroundColor: mainColor }]} />
              <Text style={[s.eyebrow, { color: mainColor }]}>KUPON STÜDYOSU</Text>
            </View>
            <Text style={s.title}>Kupon Üret</Text>
            <Text style={s.subtitle}>Sayılarını sistem senin için seçsin</Text>
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
          {generatedNumbers.length === 0 ? (
            <View style={s.empty}>
              <View style={[s.emptyIcon, { backgroundColor: `${mainColor}14` }]}>
                <DiceIcon color={mainColor} size={30} />
              </View>
              <Text style={s.emptyText}>Kupon üretmek için aşağıdaki butona dokun</Text>
            </View>
          ) : (
            <>
              <View style={[s.resultAccent, { backgroundColor: mainColor }]} />
              <Text style={s.resultEyebrow}>SENİN KUPONUN</Text>
              <View
                style={[
                  s.balls,
                  { gap: ballLayout.gap },
                  ballLayout.nowrap ? s.ballsNowrap : null,
                ]}
                key={`n-${genId}`}
              >
                {generatedNumbers.map((num, i) => (
                  <NumberBall
                    key={`${genId}-${i}`}
                    value={num}
                    color={mainColor}
                    size={ballLayout.size}
                    variant="matched"
                    revealIndex={i}
                  />
                ))}
              </View>

              {bonusNumbers.length > 0 ? (
                <View style={s.bonusBlock}>
                  <Text style={s.bonusLabel}>ŞANS TOPU</Text>
                  <View style={s.balls}>
                    {bonusNumbers.map((num, i) => (
                      <NumberBall
                        key={`b-${genId}-${i}`}
                        value={num}
                        variant="bonus"
                        size={ballLayout.size}
                        revealIndex={generatedNumbers.length + i}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {superStarNumber !== null && selectedGame.superStar ? (
                <View style={s.bonusBlock}>
                  <Text style={s.bonusLabel}>SÜPERSTAR</Text>
                  <View style={s.balls}>
                    <NumberBall
                      key={`ss-${genId}`}
                      value={superStarNumber}
                      variant="star"
                      size={ballLayout.size}
                      revealIndex={generatedNumbers.length + bonusNumbers.length}
                    />
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
            haptic={false}
            label={
              checkingQuota || generating
                ? 'Üretiliyor…'
                : generatedNumbers.length > 0
                  ? 'Yeniden üret'
                  : 'Kupon üret'
            }
            accent={mainColor}
            onPress={handleGenerate}
            disabled={checkingQuota || generating}
            iconLeft={(color, size) =>
              checkingQuota || generating ? (
                <ActivityIndicator color={color} size="small" />
              ) : (
                <DiceIcon color={color} size={size} />
              )
            }
            fullWidth={false}
            style={{ flex: 1 }}
          />
          <PressableScale
            haptic={false}
            onPress={() => { softHaptic(); setShowFilter((v) => !v); }}
            style={[
              s.filterBtn,
              {
                backgroundColor: filterActive ? mainColor + '1A' : c.surface,
              },
            ]}
          >
            <SlidersIcon color={filterActive ? mainColor : c.text2} size={22} />
            {filterActive ? <View style={[s.filterDot, { backgroundColor: mainColor }]} /> : null}
          </PressableScale>
        </View>

        {generatedNumbers.length > 0 ? (
          <AppButton
            haptic={false}
            label={savingCoupon ? 'Kaydediliyor…' : 'Kuponu kaydet'}
            onPress={handleSave}
            disabled={savingCoupon}
            loading={savingCoupon}
            iconLeft={(color, size) => <BookmarkIcon color={color} size={size} />}
            fullWidth={false}
            style={s.saveBtn}
          />
        ) : null}

        {showFilter ? (
          <Surface style={s.filterPanel}>
            <View style={[s.panelAccent, { backgroundColor: mainColor }]} />
            <Text style={s.filterPanelTitle}>AKILLI FİLTRELER</Text>

            <Pressable
              onPress={() => { softHaptic(); setBalanced((b) => !b); if (!balanced) setEvenCount(null); }}
              style={[s.toggleRow, { backgroundColor: balanced ? c.brandSoft : c.surfaceAlt }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.toggleTitle, balanced && { color: c.brand }]}>Dengeli dağılım</Text>
                <Text style={s.toggleDesc}>Düşük, orta ve yüksek sayılardan eşit oranda seçer</Text>
              </View>
              <View pointerEvents="none">
                <Toggle value={balanced} onChange={(v) => { setBalanced(v); if (v) setEvenCount(null); }} />
              </View>
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
            <View style={[s.segmentWrap, selectedGame.id === 'onnumara' && s.onNumaraSegmentWrap]}>
              {filterOptions.map((n) => {
                const sel = evenCount === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => { softHaptic(); setEvenCount(n); setBalanced(false); }}
                    style={[
                      s.segment,
                      selectedGame.id === 'onnumara' && s.onNumaraSegment,
                      { backgroundColor: sel ? mainColor : c.surfaceAlt },
                    ]}
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
              style={[s.toggleRow, { backgroundColor: noConsecutive ? c.brandSoft : c.surfaceAlt }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.toggleTitle, noConsecutive && { color: c.brand }]}>Ardışık sayıları engelle</Text>
                <Text style={s.toggleDesc}>Yan yana 2{"'"}den fazla ardışık sayı olmasın</Text>
              </View>
              <View pointerEvents="none">
                <Toggle value={noConsecutive} onChange={(v) => { setNoConsecutive(v); }} />
              </View>
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

        <View style={[s.note, { backgroundColor: c.surfaceAlt }]}>
          <InfoIcon color={c.text3} size={15} />
          <Text style={s.noteText}>Sayılar tamamen rastgele üretilir. Eğlence amaçlıdır, kazanç garantisi yoktur.</Text>
        </View>
      </ScrollView>

      <Modal visible={historyModal} transparent animationType="none" onRequestClose={() => setHistoryModal(false)}>
        <View style={[s.modalOverlay, { backgroundColor: c.overlay }]}>
          <View style={[s.modalSheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={s.modalGrabber} />
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>Kupon geçmişi</Text>
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
                <Text style={s.historyEmptyText}>Ürettiğin son kuponlar burada görünür.</Text>
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

      <Modal visible={quotaCardVisible} transparent animationType="fade" onRequestClose={() => setQuotaCardVisible(false)}>
        <View style={[s.modalOverlay, { backgroundColor: c.overlay }]}>
          <View style={[s.quotaCard, { backgroundColor: c.surface, marginBottom: insets.bottom + 24 }]}>
            <View style={[s.quotaIcon, { backgroundColor: `${mainColor}14` }]}>
              <SlidersIcon color={mainColor} size={26} />
            </View>
            <Text style={s.quotaTitle}>Filtreli üretim hakkın bitti</Text>
            {ADS_REWARDS_ENABLED ? (
              <>
                <Text style={s.quotaDesc}>
                  Bugün için {FEATURE_FREE_DAILY_LIMIT} filtreli kupon hakkını kullandın. Kısa bir reklam izleyip {FEATURE_REWARD_AMOUNT} hak daha kazanabilir, ya da filtresiz üretmeye devam edebilirsin.
                </Text>
                <AppButton
                  haptic={false}
                  label={watchingAd ? 'Reklam yükleniyor…' : `Reklam izle, +${FEATURE_REWARD_AMOUNT} hak kazan`}
                  accent={mainColor}
                  onPress={handleWatchAd}
                  disabled={watchingAd}
                  iconLeft={(color, size) =>
                    watchingAd ? <ActivityIndicator color={color} size="small" /> : <PlayIcon color={color} size={size} />
                  }
                  style={{ marginTop: 6 }}
                />
              </>
            ) : (
              <Text style={s.quotaDesc}>
                Bugün için {FEATURE_FREE_DAILY_LIMIT} filtreli kupon hakkını kullandın. Hakların {formatQuotaResetIn(msUntilQuotaReset())} sonra yenilenecek. İstersen filtresiz üretmeye devam edebilirsin.
              </Text>
            )}

            <AppButton
              haptic={false}
              label="Filtresiz üret"
              variant="secondary"
              onPress={handleUseWithoutFilter}
              iconLeft={(color, size) => <DiceIcon color={color} size={size} />}
              style={{ marginTop: 10 }}
            />
            <Pressable
              onPress={() => { softHaptic(); setQuotaCardVisible(false); }}
              style={{ marginTop: 14, alignItems: 'center' }}
              hitSlop={8}
            >
              <Text style={[s.quotaCancel, { color: c.text3 }]}>Vazgeç</Text>
            </Pressable>
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
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.xl, paddingTop: 4, paddingBottom: 14 },
    headerText: { flex: 1 },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
    eyebrowDot: { width: 7, height: 7, borderRadius: 4 },
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
    sectionLabel: { ...ty.micro, color: c.text2, paddingHorizontal: spacing.xl, marginBottom: 10 },

    resultCard: {
      marginHorizontal: spacing.xl,
      marginTop: spacing.lg,
      borderRadius: radius.xxl,
      paddingVertical: 24,
      paddingHorizontal: spacing.xl,
      paddingLeft: spacing.xl + 4,
      overflow: 'hidden',
    },
    resultAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    resultEyebrow: { ...ty.micro, fontSize: 9, letterSpacing: 0.8, color: c.text3, textAlign: 'center', marginBottom: 14 },
    empty: { alignItems: 'center', gap: spacing.md, paddingVertical: 8 },
    emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    emptyText: { ...ty.bodyMedium, color: c.text3, textAlign: 'center', maxWidth: 220 },
    balls: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
    ballsNowrap: { flexWrap: 'nowrap' },
    bonusBlock: { alignItems: 'center', marginTop: spacing.lg },
    bonusLabel: { ...ty.micro, color: c.text3, marginBottom: 10 },
    resultFooter: { alignItems: 'center', marginTop: spacing.lg, paddingTop: spacing.lg },
    resultFooterLabel: { ...ty.micro, color: c.text3 },
    resultFooterValue: { fontFamily: theme.font.bold, fontSize: 15, color: c.text, marginTop: 3, fontVariant: ['tabular-nums'] },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: spacing.md },
    chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
    chipText: { ...ty.caption, fontFamily: theme.font.semibold },

    btnRow: { flexDirection: 'row', gap: 10, marginHorizontal: spacing.xl, marginTop: spacing.lg },
    filterBtn: { width: 52, height: 52, borderRadius: radius.lg, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    filterDot: { position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4 },

    saveBtn: { marginHorizontal: spacing.xl, marginTop: 10, alignSelf: 'stretch' },

    filterPanel: { marginHorizontal: spacing.xl, marginTop: spacing.md, padding: spacing.lg, paddingLeft: spacing.lg + 4, overflow: 'hidden' },
    panelAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    filterPanelTitle: { ...ty.micro, color: c.text2, marginBottom: spacing.md },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 14, borderRadius: radius.lg, backgroundColor: c.surfaceAlt },
    toggleTitle: { ...ty.title, color: c.text },
    toggleDesc: { ...ty.caption, color: c.text3, marginTop: 3 },
    divider: { height: 1, backgroundColor: c.hairline, marginVertical: spacing.lg },
    subHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    subTitle: { ...ty.title, color: c.text },
    clearBtn: { ...ty.label, fontSize: 12 },
    subDesc: { ...ty.caption, color: c.text3, marginBottom: 10 },
    segmentWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    segment: { flexGrow: 1, minWidth: 42, alignItems: 'center', paddingVertical: 9, borderRadius: radius.md, backgroundColor: c.surfaceAlt },
    onNumaraSegmentWrap: { justifyContent: 'center' },
    onNumaraSegment: { flexGrow: 0, flexBasis: '15%', minWidth: 0 },
    segmentTop: { fontFamily: theme.font.semibold, fontSize: 13 },
    segmentBot: { fontFamily: theme.font.medium, fontSize: 9, marginTop: 1 },
    sumRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sumDash: { fontFamily: theme.font.semibold, fontSize: 16 },
    input: { flex: 1, height: 48, borderRadius: radius.lg, textAlign: 'center', fontFamily: theme.font.semibold, fontSize: 14 },
    fullInput: { flex: 0, width: '100%', textAlign: 'left', paddingHorizontal: 14 },

    note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: 13, borderRadius: radius.lg },
    noteText: { ...ty.caption, color: c.text2, flex: 1, lineHeight: 17 },

    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl },
    modalGrabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.elevated, marginBottom: spacing.lg },
    modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
    modalTitle: { ...ty.h2, color: c.text },
    modalSubtitle: { ...ty.caption, color: c.text2, marginTop: 3 },
    modalClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    historyEmpty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: spacing.lg, gap: 10 },
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
    modalActions: { marginTop: spacing.md, gap: spacing.sm },

    quotaCard: {
      marginHorizontal: 24,
      borderRadius: 28,
      padding: 24,
      alignItems: 'center',
    },
    quotaIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    quotaTitle: { ...ty.h2, color: c.text, textAlign: 'center' },
    quotaDesc: { ...ty.bodyMedium, color: c.text2, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    quotaCancel: { ...ty.label },
  });
}