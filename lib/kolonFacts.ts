// lib/kolonFacts.ts
// Bir kolonun, üretildiği filtrelere göre "istediğin oldu mu?" özetini çıkarır.
// Yalnızca aktif filtreler için satır üretir; filtresiz kolonda boş liste döner.
// Kolon Üret sonuç kartında kullanılır; görünümü components/ui/kolon-facts.tsx.
// Özet yalnızca üretim anında gösterilir; geçmiş ve Kaydedilenler filtre saklamaz.

/** Bir kolonun üretilirken kullanıldığı filtreler (ekrandaki ayarların anlık kopyası). */
export type KolonFilters = {
  balanced: boolean;
  evenCount: number | null;
  noConsecutive: boolean;
  sumMin: number | null;
  sumMax: number | null;
  includeNumbers: number[];
  excludeNumbers: number[];
};

export const EMPTY_KOLON_FILTERS: KolonFilters = {
  balanced: false,
  evenCount: null,
  noConsecutive: false,
  sumMin: null,
  sumMax: null,
  includeNumbers: [],
  excludeNumbers: [],
};

export function hasActiveFilters(f: KolonFilters): boolean {
  return (
    f.balanced ||
    f.evenCount !== null ||
    f.noConsecutive ||
    f.sumMin !== null ||
    f.sumMax !== null ||
    f.includeNumbers.length > 0 ||
    f.excludeNumbers.length > 0
  );
}

/** Kolondaki yan yana (ardışık) sayı çiftlerinin adedi. Sayılar sıralı olmalı. */
export function countConsecutivePairs(nums: number[]): number {
  let pairs = 0;
  for (let i = 0; i < nums.length - 1; i++) if (nums[i + 1] - nums[i] === 1) pairs++;
  return pairs;
}

/** "Ardışık sayıları engelle" filtresinin izin verdiği en fazla ardışık çift. */
export const MAX_CONSECUTIVE_PAIRS = 1;

export type KolonFact = {
  key: 'balanced' | 'parity' | 'consecutive' | 'sum' | 'include' | 'exclude';
  label: string;
  /** Kolon bu filtreyi sağlıyor mu? Üretici yalnızca sağlayanı döndürür; yine de dürüstçe hesaplanır. */
  ok: boolean;
};

/** "7, 23 ve 41"; 4'ten fazla sayıda etiket uzamasın diye "6 sayı". */
function joinTr(nums: number[]): string {
  if (nums.length > 4) return `${nums.length} sayı`;
  if (nums.length <= 1) return nums.join('');
  return `${nums.slice(0, -1).join(', ')} ve ${nums[nums.length - 1]}`;
}

export function kolonFacts(
  numbers: number[],
  game: { count: number; max: number },
  filters: KolonFilters,
): KolonFact[] {
  if (numbers.length === 0) return [];
  const sorted = [...numbers].sort((a, b) => a - b);
  const set = new Set(sorted);
  const facts: KolonFact[] = [];

  if (filters.balanced) {
    // Üreticiyle aynı dilimleme: 1..max aralığı `count` eşit parçaya bölünür.
    const sliceSize = game.max / game.count;
    const slices = new Set(sorted.map((n) => Math.min(Math.floor((n - 1) / sliceSize), game.count - 1)));
    facts.push({ key: 'balanced', label: 'Dengeli dağılım', ok: slices.size === sorted.length });
  }

  if (filters.evenCount !== null) {
    const evens = sorted.filter((n) => n % 2 === 0).length;
    facts.push({
      key: 'parity',
      label: `${evens} çift · ${sorted.length - evens} tek`,
      ok: evens === filters.evenCount,
    });
  }

  if (filters.noConsecutive) {
    const pairs = countConsecutivePairs(sorted);
    facts.push({
      key: 'consecutive',
      label: pairs === 0 ? 'Ardışık sayı yok' : `${pairs} ardışık çift`,
      ok: pairs <= MAX_CONSECUTIVE_PAIRS,
    });
  }

  if (filters.sumMin !== null || filters.sumMax !== null) {
    const total = sorted.reduce((a, b) => a + b, 0);
    const range =
      filters.sumMin !== null && filters.sumMax !== null
        ? `${filters.sumMin}–${filters.sumMax}`
        : filters.sumMin !== null
          ? `≥ ${filters.sumMin}`
          : `≤ ${filters.sumMax}`;
    facts.push({
      key: 'sum',
      label: `Toplam ${total} (${range})`,
      ok: (filters.sumMin === null || total >= filters.sumMin) && (filters.sumMax === null || total <= filters.sumMax),
    });
  }

  if (filters.includeNumbers.length > 0) {
    const inc = [...filters.includeNumbers].sort((a, b) => a - b);
    facts.push({ key: 'include', label: `${joinTr(inc)} dahil`, ok: inc.every((n) => set.has(n)) });
  }

  if (filters.excludeNumbers.length > 0) {
    const exc = [...filters.excludeNumbers].sort((a, b) => a - b);
    facts.push({ key: 'exclude', label: `${joinTr(exc)} hariç`, ok: exc.every((n) => !set.has(n)) });
  }

  return facts;
}
