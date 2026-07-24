// lib/couponGenerator.ts
// Rastgele kupon üretici.
// Sayı seçimi burada, kod tarafında yapılır — AI hiçbir sayı seçmez,
// sadece seçilen sayılar için açıklama yazar.
//
// Temel prensip: her zaman GERÇEK RASTGELELİK (Math.random()) kullanılır.
// Kısıtlamalar (toplam aralığı, çakışmama vb.) rastgeleliği ortadan kaldırmaz,
// sadece uygun olmayan rastgele sonuçları eleyip yeniden dener — yani hâlâ
// zar atıyoruz, sadece "kabul edilebilir" zarları arıyoruz.

export type FrequencyMap = Record<number, number>;

/* ─────────────────────────── temel üretim (mevcut, değişmedi) ─────────────────────────── */

/**
 * 1..max aralığından, tekrarsız `count` adet sayı seçer.
 * `frequency` ileride istatistik tabanlı stratejiler için ayrıldı; şimdilik kullanılmaz.
 */
export function pickWeightedNumbers(count: number, max: number, _frequency: FrequencyMap = {}): number[] {
  const picked = new Set<number>();

  while (picked.size < count) {
    const n = Math.floor(Math.random() * max) + 1;
    picked.add(n);
  }

  return Array.from(picked).sort((a, b) => a - b);
}

/**
 * SüperStar / Şans Topu gibi ana numaralardan bağımsız tek ek sayı seçer.
 */
export function pickSingleNumber(max: number): number {
  return Math.floor(Math.random() * max) + 1;
}

/* ─────────────────────────── kısıtlamalı üretim ─────────────────────────── */

export type NumberConstraints = {
  /** Sayıların toplamının bu aralıkta olması istenir. Ör: "toplam 250-300 arası". */
  sumRange?: { min: number; max: number };
  /** En fazla kaç ardışık sayıya izin verilir. Ör: 2 → 23,24 olur ama 23,24,25 olmaz. */
  maxConsecutive?: number;
  /** Sayılar oyunun aralığını 3 bölgeye ayırıp her bölgeden en az 1 sayı gelmesini ister. */
  spreadAcrossZones?: boolean;
  /** Çift/tek dengesi istenir (4+ sayılık kuponlarda en az 2 tek + en az 2 çift). */
  balanceEvenOdd?: boolean;
  /** Mutlaka bulunması gereken sayılar. Ör: kullanıcının şanslı sayısı. */
  mustInclude?: number[];
  /** Kesinlikle bulunmaması gereken sayılar. */
  mustExclude?: number[];
  /** 1-2-3-4-5-6 gibi düz diziler, hepsi aynı son haneyle bitenler veya sabit
   *  aralıklı (5,10,15,20 gibi) diziler reddedilir. */
  avoidObviousPatterns?: boolean;
  /** Kupon sadece asal sayılardan oluşur (2, 3, 5, 7, 11...). */
  onlyPrimes?: boolean;
  /** Kupon sadece çift sayılardan oluşur. */
  onlyEven?: boolean;
  /** Kupon sadece tek sayılardan oluşur. */
  onlyOdd?: boolean;
};

/** Bir sayının asal olup olmadığını kontrol eder. */
export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

export type GenerateResult = {
  numbers: number[];
  /** true ise istenen kısıtlamaların TAMAMI karşılanamadı, en yakın/geçerli
   *  sonuç döndürüldü (ör. çok katı bir toplam aralığı + çakışmama isteği
   *  birlikte imkansız hale geldiyse). Arayüz bu durumda kullanıcıya
   *  "tam istediğin gibi olmadı ama en yakınını buldum" diyebilir. */
  relaxed: boolean;
};

/** Sıralanmış sayı dizisini karşılaştırma/anahtar için tek bir string'e çevirir. */
export function numbersKey(numbers: number[]): string {
  return [...numbers].sort((a, b) => a - b).join('-');
}

/** Bir dizi geçmiş kombinasyondan (çekiliş sonuçları, kayıtlı kuponlar vb.)
 *  hızlı karşılaştırma için bir "kaçınılacaklar" kümesi oluşturur. */
export function buildAvoidSet(numberArrays: number[][]): Set<string> {
  return new Set(numberArrays.map(numbersKey));
}

function hasConsecutiveRunLongerThan(numbers: number[], limit: number): boolean {
  const sorted = [...numbers].sort((a, b) => a - b);
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      run++;
      if (run > limit) return true;
    } else {
      run = 1;
    }
  }
  return false;
}

function isSpreadAcrossZones(numbers: number[], max: number): boolean {
  const zoneSize = Math.ceil(max / 3);
  const zones = [0, 0, 0];
  numbers.forEach((n) => {
    const zoneIndex = Math.min(2, Math.floor((n - 1) / zoneSize));
    zones[zoneIndex]++;
  });
  return zones.every((z) => z > 0);
}

function isEvenOddBalanced(numbers: number[]): boolean {
  const evens = numbers.filter((n) => n % 2 === 0).length;
  const odds = numbers.length - evens;
  const minRequired = numbers.length <= 3 ? 1 : 2;
  return evens >= minRequired && odds >= minRequired;
}

function isObviousPattern(numbers: number[]): boolean {
  const sorted = [...numbers].sort((a, b) => a - b);

  const fullyConsecutive = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  if (fullyConsecutive) return true;

  const lastDigits = new Set(sorted.map((n) => n % 10));
  if (lastDigits.size === 1) return true;

  if (sorted.length >= 3) {
    const diff = sorted[1] - sorted[0];
    if (diff > 0) {
      const isArithmetic = sorted.every((n, i) => i === 0 || n - sorted[i - 1] === diff);
      if (isArithmetic) return true;
    }
  }

  return false;
}

function satisfiesConstraints(numbers: number[], max: number, constraints: NumberConstraints): boolean {
  if (constraints.sumRange) {
    const sum = numbers.reduce((a, b) => a + b, 0);
    if (sum < constraints.sumRange.min || sum > constraints.sumRange.max) return false;
  }
  if (constraints.maxConsecutive != null && hasConsecutiveRunLongerThan(numbers, constraints.maxConsecutive)) {
    return false;
  }
  if (constraints.spreadAcrossZones && numbers.length >= 3 && !isSpreadAcrossZones(numbers, max)) {
    return false;
  }
  if (constraints.balanceEvenOdd && !isEvenOddBalanced(numbers)) {
    return false;
  }
  if (constraints.avoidObviousPatterns && isObviousPattern(numbers)) {
    return false;
  }
  if (constraints.onlyPrimes && !numbers.every(isPrime)) {
    return false;
  }
  if (constraints.onlyEven && !numbers.every((n) => n % 2 === 0)) {
    return false;
  }
  if (constraints.onlyOdd && !numbers.every((n) => n % 2 !== 0)) {
    return false;
  }
  return true;
}

function sumSmallestK(sortedPool: number[], excludeValue: number, k: number): number {
  if (k <= 0) return 0;
  let sum = 0;
  let count = 0;
  for (const n of sortedPool) {
    if (n === excludeValue) continue;
    sum += n;
    count++;
    if (count === k) break;
  }
  return sum;
}

function sumLargestK(sortedPool: number[], excludeValue: number, k: number): number {
  if (k <= 0) return 0;
  let sum = 0;
  let count = 0;
  for (let i = sortedPool.length - 1; i >= 0; i--) {
    const n = sortedPool[i];
    if (n === excludeValue) continue;
    sum += n;
    count++;
    if (count === k) break;
  }
  return sum;
}

/**
 * Bir toplam aralığına uyan sayıları ADIM ADIM, her adımda "kalan sayılarla
 * hedefe ulaşmak hâlâ mümkün mü?" kontrolü yaparak seçer. Bu, "genel bir
 * eğilim ver" yönteminden çok daha güçlüdür — özellikle 55-60 gibi son
 * derece dar aralıklarda, kör/genel ağırlıklandırma neredeyse hiç işe
 * yaramazken bu yöntem güvenilir şekilde çalışır. Seçim hâlâ Math.random()
 * ile yapılır (uygun adaylar arasından hedefe eğilimli ağırlıklı seçim) —
 * sonuç asla sabit değildir, sadece "imkansız dallara" hiç girilmez.
 */
function pickNumbersForSumRange(
  pool: number[],
  count: number,
  sumRange: { min: number; max: number }
): number[] | null {
  const sorted = [...pool].sort((a, b) => a - b);
  const picked: number[] = [];
  let remaining = sorted;

  for (let slot = 0; slot < count; slot++) {
    const slotsLeftAfterThis = count - slot - 1;
    const currentSum = picked.reduce((a, b) => a + b, 0);
    const neededMin = sumRange.min - currentSum;
    const neededMax = sumRange.max - currentSum;

    const eligible = remaining.filter((n) => {
      const restMin = sumSmallestK(remaining, n, slotsLeftAfterThis);
      const restMax = sumLargestK(remaining, n, slotsLeftAfterThis);
      const totalMin = n + restMin;
      const totalMax = n + restMax;
      // Bu sayıyı seçersek, kalan slotlarla hâlâ [neededMin, neededMax]
      // aralığına ulaşmak mümkün mü?
      return totalMax >= neededMin && totalMin <= neededMax;
    });

    if (eligible.length === 0) return null; // bu dal çıkmaza girdi, imkansız

    const targetAvg = slotsLeftAfterThis + 1 > 0 ? (neededMin + neededMax) / 2 / (slotsLeftAfterThis + 1) : 0;
    const weights = eligible.map((n) => Math.max(1, 50 - Math.abs(n - targetAvg)));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let chosen = eligible[eligible.length - 1];
    for (let i = 0; i < eligible.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosen = eligible[i];
        break;
      }
    }

    picked.push(chosen);
    remaining = remaining.filter((n) => n !== chosen);
  }

  return picked;
}

/**
 * mustInclude/mustExclude'a uyan tek bir rastgele aday üretir. İmkansızsa null döner.
 *
 * Toplam aralığı (sumRange) isteniyorsa, sayı seçimi hâlâ TAMAMEN RASTGELEDİR
 * (Math.random() ile) ama adım adım, her seçimden sonra hedefe ulaşmanın hâlâ
 * mümkün olduğundan emin olunarak ilerler — bkz. pickNumbersForSumRange.
 */
function generateCandidate(count: number, max: number, constraints: NumberConstraints): number[] | null {
  const mustInclude = constraints.mustInclude ?? [];
  const mustExclude = new Set(constraints.mustExclude ?? []);

  if (mustInclude.length > count) return null;
  if (mustInclude.some((n) => n < 1 || n > max || mustExclude.has(n))) return null;

  const picked = new Set<number>(mustInclude);
  let pool: number[] = [];
  for (let n = 1; n <= max; n++) {
    if (!picked.has(n) && !mustExclude.has(n)) pool.push(n);
  }
  // Sadece asal isteniyorsa, havuzu baştan asallara daraltıyoruz — aksi halde
  // 500 denemenin çoğu asal olmayan adaylar üretip boşa harcanır. mustInclude
  // içindeki asal olmayan sayılar burada elenmez (satisfiesConstraints zaten
  // bunu yakalayıp relaxed:true fallback'ine düşürür — çelişkili istek durumu).
  if (constraints.onlyPrimes) {
    pool = pool.filter(isPrime);
  }
  // Aynı verimlilik mantığı çift/tek için de geçerli — havuzu baştan
  // daraltmazsak, örn. On Numara'da (1-80) 500 denemenin yarısı boşa gider.
  if (constraints.onlyEven) {
    pool = pool.filter((n) => n % 2 === 0);
  }
  if (constraints.onlyOdd) {
    pool = pool.filter((n) => n % 2 !== 0);
  }
  if (pool.length < count - picked.size) return null; // yeterli sayı kalmadı

  if (constraints.sumRange) {
    const remainingSlots = count - picked.size;
    const includedSum = mustInclude.reduce((a, b) => a + b, 0);
    const adjustedRange = {
      min: constraints.sumRange.min - includedSum,
      max: constraints.sumRange.max - includedSum,
    };
    if (remainingSlots === 0) {
      // mustInclude zaten tüm slotları doldurdu, toplamın kendisi aralığa uyuyor mu?
      return includedSum >= constraints.sumRange.min && includedSum <= constraints.sumRange.max
        ? Array.from(picked).sort((a, b) => a - b)
        : null;
    }
    const rest = pickNumbersForSumRange(pool, remainingSlots, adjustedRange);
    if (!rest) return null;
    rest.forEach((n) => picked.add(n));
    return Array.from(picked).sort((a, b) => a - b);
  }

  while (picked.size < count) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.add(pool[idx]);
    pool[idx] = pool[pool.length - 1];
    pool.pop();
  }

  return Array.from(picked).sort((a, b) => a - b);
}

/**
 * Kısıtlamalara uyan bir kupon üretir. Rastgele denemeler yaparak
 * kısıtlamaların TAMAMINI karşılayan bir sonuç arar; bulamazsa (nadir,
 * genelde çok katı/çelişkili kısıtlamalarda) en azından mustInclude/
 * mustExclude'a uyan bir sonucu `relaxed: true` ile döndürür — kullanıcı
 * asla eli boş kalmaz.
 */
export function generateCouponWithConstraints(
  count: number,
  max: number,
  constraints: NumberConstraints = {},
  avoidExactMatches?: Set<string>,
  maxAttempts = 500
): GenerateResult {
  let fallback: number[] | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generateCandidate(count, max, constraints);
    if (!candidate) break; // mustInclude/mustExclude çelişkili, tekrar denemenin anlamı yok
    if (avoidExactMatches?.has(numbersKey(candidate))) continue;
    if (!fallback) fallback = candidate;
    if (satisfiesConstraints(candidate, max, constraints)) {
      return { numbers: candidate, relaxed: false };
    }
  }

  if (fallback) return { numbers: fallback, relaxed: true };

  // Temel kısıtlamalar (mustInclude/mustExclude) bile karşılanamadıysa
  // (havuz yetersiz kaldıysa), düz rastgele üretime düş — kullanıcı yine
  // bir kupon alır, sadece istediği ekstra kural uygulanamamış olur.
  const plain = generateCandidate(count, max, {});
  return { numbers: plain ?? pickWeightedNumbers(count, max), relaxed: true };
}

/**
 * Bir toplam aralığı isteğinin, seçilecek sayı adedine göre matematiksel
 * olarak MÜMKÜN olup olmadığını kontrol eder. Örneğin 10 farklı sayı
 * seçildiğinde en düşük olası toplam 1+2+...+10 = 55'tir — kullanıcı
 * "toplamı 50 olsun" derse bu durum SONSUZ deneme yapılsa bile asla
 * bulunamaz. Bu fonksiyon, boşuna deneme yapmadan bunu önceden tespit eder.
 */
export type SumRangeFeasibility = {
  feasible: boolean;
  minPossibleSum: number;
  maxPossibleSum: number;
};

export function checkSumRangeFeasibility(
  count: number,
  max: number,
  sumRange: { min: number; max: number }
): SumRangeFeasibility {
  const minPossibleSum = (count * (count + 1)) / 2; // 1+2+...+count
  const maxPossibleSum = count * max - (count * (count - 1)) / 2; // max + (max-1) + ... + (max-count+1)
  const feasible = sumRange.max >= minPossibleSum && sumRange.min <= maxPossibleSum;
  return { feasible, minPossibleSum, maxPossibleSum };
}

/**
 * Bir "sadece asal sayılar" isteğinin, seçilecek sayı adedine göre
 * matematiksel olarak MÜMKÜN olup olmadığını kontrol eder. Örneğin Şans
 * Topu'nda (1-34) 11 asal sayı vardır — 5 sayı seçmek mümkündür, ama On
 * Numara'da (1-80) 22 asal sayı varken 10 sayı istemek yine mümkündür.
 * Havuz sayı adedinden azsa (nadir ama olası bir kombinasyonda, örn. dar bir
 * `mustExclude` ile birlikte), boşuna deneme yapmadan bunu önceden tespit eder.
 */
export type PrimeFeasibility = {
  feasible: boolean;
  availablePrimes: number;
};

export function checkPrimeFeasibility(count: number, max: number): PrimeFeasibility {
  let availablePrimes = 0;
  for (let n = 2; n <= max; n++) {
    if (isPrime(n)) availablePrimes++;
  }
  return { feasible: availablePrimes >= count, availablePrimes };
}

/**
 * Aynı fizibilite kontrolünün "sadece çift" / "sadece tek" karşılığı.
 * Pratikte desteklenen oyunların hiçbirinde bu imkansız olmaz (1-90 gibi
 * aralıklarda her zaman yeterince çift/tek sayı var), ama tutarlılık ve
 * ileride küçük aralıklı bir oyun eklenirse güvenlik için hazır tutuyoruz.
 */
export type ParityFeasibility = {
  feasible: boolean;
  availableCount: number;
};

export function checkParityFeasibility(count: number, max: number, parity: 'even' | 'odd'): ParityFeasibility {
  let availableCount = 0;
  for (let n = 1; n <= max; n++) {
    if (parity === 'even' ? n % 2 === 0 : n % 2 !== 0) availableCount++;
  }
  return { feasible: availableCount >= count, availableCount };
}

/**
 * Bir kuponun hangi kısıtlamaları KARŞILAMADIĞINI tespit eder. `relaxed: true`
 * döndüğünde, kullanıcıya "bazı özel şartlar karşılanamadı" gibi genel bir
 * mesaj yerine, TAM OLARAK hangi isteğin karşılanamadığını söylemek için
 * kullanılır — bu, kullanıcının neyin yanlış gittiğini anlamasını sağlar.
 */
export type ConstraintKey =
  | 'sumRange'
  | 'maxConsecutive'
  | 'spreadAcrossZones'
  | 'balanceEvenOdd'
  | 'avoidObviousPatterns'
  | 'mustInclude'
  | 'mustExclude'
  | 'onlyPrimes'
  | 'onlyEven'
  | 'onlyOdd';

export function getViolatedConstraints(
  numbers: number[],
  max: number,
  constraints: NumberConstraints
): ConstraintKey[] {
  const violated: ConstraintKey[] = [];

  if (constraints.sumRange) {
    const sum = numbers.reduce((a, b) => a + b, 0);
    if (sum < constraints.sumRange.min || sum > constraints.sumRange.max) violated.push('sumRange');
  }
  if (constraints.maxConsecutive != null && hasConsecutiveRunLongerThan(numbers, constraints.maxConsecutive)) {
    violated.push('maxConsecutive');
  }
  if (constraints.spreadAcrossZones && numbers.length >= 3 && !isSpreadAcrossZones(numbers, max)) {
    violated.push('spreadAcrossZones');
  }
  if (constraints.balanceEvenOdd && !isEvenOddBalanced(numbers)) {
    violated.push('balanceEvenOdd');
  }
  if (constraints.avoidObviousPatterns && isObviousPattern(numbers)) {
    violated.push('avoidObviousPatterns');
  }
  if (constraints.mustInclude?.length) {
    const set = new Set(numbers);
    if (constraints.mustInclude.some((n) => !set.has(n))) violated.push('mustInclude');
  }
  if (constraints.mustExclude?.length) {
    const excludeSet = new Set(constraints.mustExclude);
    if (numbers.some((n) => excludeSet.has(n))) violated.push('mustExclude');
  }
  if (constraints.onlyPrimes && !numbers.every(isPrime)) {
    violated.push('onlyPrimes');
  }
  if (constraints.onlyEven && !numbers.every((n) => n % 2 === 0)) {
    violated.push('onlyEven');
  }
  if (constraints.onlyOdd && !numbers.every((n) => n % 2 !== 0)) {
    violated.push('onlyOdd');
  }

  return violated;
}

/* ─────────────────────────── çoklu kupon üretimi ─────────────────────────── */

export type MultiCouponOptions = {
  constraints?: NumberConstraints;
  avoidExactMatches?: Set<string>;
  maxAttempts?: number;
  /** true ise üretilen kuponlar arasında hiç ortak sayı olmaz
   *  (sayı havuzu yeterli olduğu sürece; yetersiz kalırsa o kuponlar
   *  relaxed:true ile, çakışmaya izin verilerek tamamlanır). */
  noOverlap?: boolean;
};

/**
 * Aynı anda birden fazla kupon üretir. `noOverlap: true` verilirse
 * kuponlar arasında hiç ortak sayı olmamasına çalışılır — kullanıcı
 * "5 tane üret ama hepsi farklı sayılardan oluşsun" dediğinde bu kullanılır.
 */
export function generateMultipleCoupons(
  count: number,
  max: number,
  howMany: number,
  options: MultiCouponOptions = {}
): GenerateResult[] {
  const results: GenerateResult[] = [];
  const usedNumbers = new Set<number>();
  const usedKeys = new Set<string>(options.avoidExactMatches ?? []);

  for (let i = 0; i < howMany; i++) {
    const localConstraints: NumberConstraints = { ...options.constraints };

    if (options.noOverlap) {
      const exclude = new Set([...(localConstraints.mustExclude ?? []), ...usedNumbers]);
      localConstraints.mustExclude = Array.from(exclude);
    }

    const result = generateCouponWithConstraints(
      count,
      max,
      localConstraints,
      usedKeys,
      options.maxAttempts
    );

    results.push(result);
    result.numbers.forEach((n) => usedNumbers.add(n));
    usedKeys.add(numbersKey(result.numbers));
  }

  return results;
}