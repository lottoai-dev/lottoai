// lib/drawStats.ts
// Geçmiş çekilişlerden betimleyici istatistikler (İstatistik sekmesi).
// Yalnızca ana sayılar kullanılır; Şans Topu +1 / SuperStar / Joker dahil değildir.
// Bu değerler geçmişi özetler, gelecek çekiliş hakkında bir şey söylemez.

import { countConsecutivePairs } from './kolonFacts';

export type ParityRow = {
  odd: number;
  even: number;
  /** Bu bileşimde çıkan çekiliş adedi. */
  count: number;
  /** count / geçerli çekiliş sayısı, tam sayıya yuvarlanmış. */
  percentage: number;
};

export type ParityDistribution = {
  rows: ParityRow[];
  /** Hesaba katılan çekiliş sayısı (ana sayı adedi oyunla uyuşmayan satırlar atlanır). */
  total: number;
  /** En çok görülen adet (vurgulama için; hiç veri yoksa 0). */
  maxCount: number;
};

/**
 * Her çekilişteki ana sayıların tek/çift bileşimini sayar.
 * Satırlar "count tek – 0 çift"ten "0 tek – count çift"e doğru, tüm olası
 * bileşimleri içerir (hiç görülmemişler 0 ile).
 */
export function parityDistribution(draws: number[][], count: number): ParityDistribution {
  const counts = new Array<number>(count + 1).fill(0); // index = tek adedi
  let total = 0;

  for (const nums of draws) {
    if (nums.length !== count) continue;
    const odd = nums.filter((n) => n % 2 === 1).length;
    counts[odd] += 1;
    total += 1;
  }

  const rows: ParityRow[] = [];
  for (let odd = count; odd >= 0; odd--) {
    const c = counts[odd];
    rows.push({
      odd,
      even: count - odd,
      count: c,
      percentage: total > 0 ? Math.round((c / total) * 100) : 0,
    });
  }

  return { rows, total, maxCount: Math.max(0, ...counts) };
}

/**
 * Tek/çift dağılımı On Numara'da gösterilmez: çekilişte 22 sayı çıkar,
 * kullanıcı 10 sayı oynar; tablo kolonla karşılaştırılamaz.
 */
export function supportsParityStats(gameId: string): boolean {
  return gameId !== 'onnumara';
}

/* ─────────────── Toplam dağılımı ─────────────── */

/**
 * Oyun başına sabit toplam aralıkları (tüm geçmiş çekilişlere bakılarak seçildi,
 * Kasım 2026): ortada eşit genişlikte `buckets` aralık, uçlarda "≤ lowMax" ve
 * "≥ highMin". Dönem değişince satırlar aynı kalır, yalnızca sayılar değişir.
 */
const SUM_BUCKETS: Record<string, { lowMax: number; width: number; buckets: number }> = {
  cilgin: { lowMax: 170, width: 30, buckets: 7 }, // ≤170, 171–200 … 351–380, ≥381
  superloto: { lowMax: 120, width: 20, buckets: 7 }, // ≤120, 121–140 … 241–260, ≥261
  sanstopu: { lowMax: 50, width: 10, buckets: 7 }, // ≤50, 51–60 … 111–120, ≥121
};

export type SumRow = {
  /** Ekranda görünen aralık: "≤ 120", "121 – 140", "≥ 261". */
  label: string;
  count: number;
  percentage: number;
};

export type SumDistribution = {
  rows: SumRow[];
  total: number;
  maxCount: number;
  /** Seçili dönemdeki ortalama toplam (yuvarlanmış; veri yoksa 0). */
  average: number;
};

export function supportsSumStats(gameId: string): boolean {
  return gameId in SUM_BUCKETS;
}

export function sumDistribution(draws: number[][], count: number, gameId: string): SumDistribution | null {
  const cfg = SUM_BUCKETS[gameId];
  if (!cfg) return null;

  const highMin = cfg.lowMax + cfg.width * cfg.buckets + 1;
  const rows: SumRow[] = [{ label: `≤ ${cfg.lowMax}`, count: 0, percentage: 0 }];
  for (let i = 0; i < cfg.buckets; i++) {
    const from = cfg.lowMax + 1 + i * cfg.width;
    const to = from + cfg.width - 1;
    rows.push({ label: `${from} – ${to}`, count: 0, percentage: 0 });
  }
  rows.push({ label: `≥ ${highMin}`, count: 0, percentage: 0 });

  let total = 0;
  let sumOfSums = 0;
  for (const nums of draws) {
    if (nums.length !== count) continue;
    const s = nums.reduce((a, b) => a + b, 0);
    total += 1;
    sumOfSums += s;
    const idx = s <= cfg.lowMax ? 0 : s >= highMin ? rows.length - 1 : 1 + Math.floor((s - cfg.lowMax - 1) / cfg.width);
    rows[idx].count += 1;
  }

  for (const row of rows) row.percentage = total > 0 ? Math.round((row.count / total) * 100) : 0;

  return {
    rows,
    total,
    maxCount: Math.max(0, ...rows.map((r) => r.count)),
    average: total > 0 ? Math.round(sumOfSums / total) : 0,
  };
}

/* ─────────────── Ardışık sayı sıklığı ─────────────── */

/** "3+ ardışık çift" satırı; tüm geçmişte 3'ten fazlası neredeyse hiç görülmedi. */
const MAX_PAIR_ROW = 3;

export type ConsecutiveRow = {
  /** Ardışık çift adedi (son satırda "en az" anlamında). */
  pairs: number;
  /** Kolon Üret filtresi ve sonuç etiketiyle aynı dil. */
  label: string;
  count: number;
  percentage: number;
};

export type ConsecutiveDistribution = {
  rows: ConsecutiveRow[];
  total: number;
  maxCount: number;
};

/**
 * Her çekilişteki yan yana sayı çiftlerini sayar (5-6 → 1 çift; 5-6-7 → 2 çift),
 * Kolon Üret'teki "Ardışık sayıları engelle" filtresiyle aynı kural.
 */
export function consecutiveDistribution(draws: number[][], count: number): ConsecutiveDistribution {
  const counts = new Array<number>(MAX_PAIR_ROW + 1).fill(0);
  let total = 0;

  for (const nums of draws) {
    if (nums.length !== count) continue;
    const pairs = countConsecutivePairs([...nums].sort((a, b) => a - b));
    counts[Math.min(pairs, MAX_PAIR_ROW)] += 1;
    total += 1;
  }

  const rows: ConsecutiveRow[] = counts.map((c, pairs) => ({
    pairs,
    label:
      pairs === 0 ? 'Ardışık yok' : pairs === MAX_PAIR_ROW ? `${MAX_PAIR_ROW}+ ardışık çift` : `${pairs} ardışık çift`,
    count: c,
    percentage: total > 0 ? Math.round((c / total) * 100) : 0,
  }));

  return { rows, total, maxCount: Math.max(0, ...counts) };
}
