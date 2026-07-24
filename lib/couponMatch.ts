// lib/couponMatch.ts — kupon ↔ çekiliş eşleştirme (Joker 5+1, ikramiye eşikleri, SüperStar)

export type DrawSnapshot = {
  numbers: string;
  bonus: string;
  superstar?: number | null;
  draw_date?: string;
  draw_no?: string;
};

export type CouponMatchInput = {
  game: string;
  numbers: number[];
  bonus: number[];
  superStar?: number | null;
};

export type CouponMatchResult = {
  matchedNumbers: number[];
  matchedBonus: number[];
  matchedJoker: boolean;
  jokerHitNumber: number | null;
  matchedSuperStar: boolean;
  mainMatchCount: number;
  rank: number;
  categoryLabel: string;
};

export type MatchDisplayInput = {
  game: string;
  mainMatchCount: number;
  matchedJoker?: boolean;
  matchedSuperStar?: boolean;
  matchedBonusCount?: number;
  playedSuperStar?: boolean;
};

/** Altın / yeşil / gri / soluk gri */
export type MatchDisplayTier = 'jackpot' | 'winner' | 'partial' | 'none';

export type MatchDisplay = {
  label: string;
  tier: MatchDisplayTier;
  hasPrize: boolean;
  sub: string;
};

export function toMatchDisplayInput(coupon: {
  game: string;
  matchedCount?: number | null;
  matchedNumbers?: number[];
  matchedJoker?: boolean;
  matchedSuperStar?: boolean;
  matchedBonus?: number[];
  superStar?: number | null;
}): MatchDisplayInput {
  return {
    game: coupon.game,
    mainMatchCount: coupon.matchedNumbers?.length ?? coupon.matchedCount ?? 0,
    matchedJoker: coupon.matchedJoker,
    matchedSuperStar: coupon.matchedSuperStar,
    matchedBonusCount: coupon.matchedBonus?.length ?? 0,
    playedSuperStar: coupon.superStar != null,
  };
}

export function parseDrawNumbers(str: string): number[] {
  return str.split(' - ').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
}

export function parseDrawBonus(bonus: string): number[] {
  if (!bonus || bonus === '-') return [];
  return bonus.split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
}

export function hasMainPrize(input: MatchDisplayInput): boolean {
  const { game, mainMatchCount, matchedJoker, matchedBonusCount = 0 } = input;
  const bonusHit = matchedBonusCount > 0;
  const joker = !!matchedJoker;

  switch (game) {
    case 'On Numara':
      return mainMatchCount === 0 || mainMatchCount >= 6;
    case 'Çılgın Sayısal Loto':
      if (mainMatchCount === 6) return true;
      if (mainMatchCount === 5 && joker) return true;
      return mainMatchCount >= 2 && mainMatchCount <= 5;
    case 'Süper Loto':
      return mainMatchCount >= 2;
    case 'Şans Topu':
      if (bonusHit) return true;
      return mainMatchCount >= 3 && mainMatchCount <= 5;
    default:
      return false;
  }
}

export function hasSuperStarPrize(input: MatchDisplayInput): boolean {
  return input.game === 'Çılgın Sayısal Loto' && !!input.playedSuperStar && !!input.matchedSuperStar;
}

export function isJackpotTier(input: MatchDisplayInput): boolean {
  const { game, mainMatchCount, matchedJoker, matchedBonusCount = 0 } = input;
  const bonusHit = matchedBonusCount > 0;

  switch (game) {
    case 'On Numara':
      return mainMatchCount === 10;
    case 'Çılgın Sayısal Loto':
      return mainMatchCount === 6 || (mainMatchCount === 5 && !!matchedJoker);
    case 'Süper Loto':
      return mainMatchCount === 6;
    case 'Şans Topu':
      return mainMatchCount === 5 && bonusHit;
    default:
      return false;
  }
}

function buildMainLabel(input: MatchDisplayInput): string {
  const { game, mainMatchCount, matchedJoker, matchedBonusCount = 0 } = input;
  const bonusHit = matchedBonusCount > 0;

  if (game === 'On Numara') {
    if (mainMatchCount === 0) return '0 bilen';
    if (mainMatchCount === 10) return '10 tutturdu';
    if (mainMatchCount > 0) return `${mainMatchCount} tutturdu`;
    return 'Tutmadı';
  }

  if (game === 'Çılgın Sayısal Loto') {
    if (mainMatchCount === 6) return '6 tutturdu';
    if (mainMatchCount === 5 && matchedJoker) return '5+1 tutturdu';
    if (mainMatchCount > 0) return `${mainMatchCount} tutturdu`;
    return 'Tutmadı';
  }

  if (game === 'Şans Topu') {
    if (mainMatchCount === 5 && bonusHit) return '5+1 tutturdu';
    if (mainMatchCount > 0 || bonusHit) {
      const parts: string[] = [];
      if (mainMatchCount > 0) parts.push(`${mainMatchCount} ana`);
      if (bonusHit) parts.push('bonus');
      return `${parts.join(' + ')} tuttu`;
    }
    return 'Tutmadı';
  }

  if (mainMatchCount > 0) return `${mainMatchCount} tutturdu`;
  return 'Tutmadı';
}

export function getMatchDisplay(input: MatchDisplayInput): MatchDisplay {
  const mainPrize = hasMainPrize(input);
  const ssPrize = hasSuperStarPrize(input);
  const hasPrize = mainPrize || ssPrize;
  const ssHit = hasSuperStarPrize(input);

  let label = buildMainLabel(input);

  if (input.game === 'Çılgın Sayısal Loto' && input.playedSuperStar && ssHit) {
    if (input.mainMatchCount === 0 || label === 'Tutmadı') {
      label = 'SüperStar tuttu';
    } else {
      label = `${label.replace(' tutturdu', '')} + SS tutturdu`;
    }
  }

  if (label === 'Tutmadı') {
    return { label, tier: 'none', hasPrize: false, sub: 'Bir sonrakine!' };
  }

  if (isJackpotTier(input) || (input.game === 'Çılgın Sayısal Loto' && input.mainMatchCount === 6 && ssHit)) {
    return { label, tier: 'jackpot', hasPrize: true, sub: 'Tebrikler!' };
  }

  if (hasPrize) {
    return { label, tier: 'winner', hasPrize: true, sub: 'İkramiye kategorisi' };
  }

  return { label, tier: 'partial', hasPrize: false, sub: 'İkramiye yok' };
}

export function computeMatchRank(input: MatchDisplayInput): number {
  const { game, mainMatchCount, matchedJoker, matchedBonusCount = 0, matchedSuperStar, playedSuperStar } = input;
  const bonusHit = matchedBonusCount > 0;
  const joker = !!matchedJoker;
  const ssBoost = playedSuperStar && matchedSuperStar ? 8 : 0;

  if (game === 'On Numara') {
    if (mainMatchCount === 10) return 1000;
    if (mainMatchCount >= 6) return 600 + (mainMatchCount - 6) * 10;
    if (mainMatchCount === 0) return 605;
    return mainMatchCount;
  }

  if (game === 'Çılgın Sayısal Loto') {
    if (mainMatchCount === 6) return 600 + ssBoost;
    if (mainMatchCount === 5 && joker) return 550 + ssBoost;
    return mainMatchCount * 100 + ssBoost;
  }

  if (game === 'Süper Loto') {
    return mainMatchCount * 100;
  }

  if (game === 'Şans Topu') {
    if (mainMatchCount === 5 && bonusHit) return 550;
    return mainMatchCount * 100 + (bonusHit ? 5 : 0);
  }

  return mainMatchCount * 100;
}

export function formatMatchCategory(input: MatchDisplayInput): string {
  const { label } = getMatchDisplay(input);
  if (label === 'Tutmadı') return '—';
  return label
    .replace(' tutturdu', '')
    .replace(' tuttu', '')
    .replace(' bilen', ' bilen');
}

/** @deprecated getMatchDisplay().label kullan */
export function formatMatchLabel(input: MatchDisplayInput): string {
  return getMatchDisplay(input).label;
}

export function getCouponRank(coupon: {
  game: string;
  matchedCount?: number | null;
  matchedNumbers?: number[];
  matchedJoker?: boolean;
  matchedSuperStar?: boolean;
  matchedBonus?: number[];
  superStar?: number | null;
}): number {
  if (coupon.matchedCount === undefined || coupon.matchedCount === null) return -1;
  const input = toMatchDisplayInput(coupon);
  if (coupon.game === 'Şans Topu' && input.matchedJoker === undefined) {
    input.matchedJoker =
      input.mainMatchCount === 5 && (coupon.matchedBonus?.length ?? 0) > 0;
  }
  return computeMatchRank(input);
}

export function matchCouponToDraw(
  coupon: CouponMatchInput,
  draw: DrawSnapshot,
): CouponMatchResult {
  const drawnNumbers = parseDrawNumbers(draw.numbers);
  const drawnBonus = parseDrawBonus(draw.bonus);
  const matchedNumbers = coupon.numbers.filter((n) => drawnNumbers.includes(n));
  const matchedBonus = coupon.bonus.filter((n) => drawnBonus.includes(n));
  const mainMatchCount = matchedNumbers.length;

  let matchedJoker = false;
  let jokerHitNumber: number | null = null;

  if (coupon.game === 'Çılgın Sayısal Loto') {
    const joker = drawnBonus[0] ?? null;
    if (mainMatchCount === 5 && joker != null) {
      const missed = coupon.numbers.filter((n) => !drawnNumbers.includes(n));
      if (missed.length === 1 && missed[0] === joker) {
        matchedJoker = true;
        jokerHitNumber = joker;
      }
    }
  }

  if (coupon.game === 'Şans Topu') {
    matchedJoker = mainMatchCount === 5 && matchedBonus.length > 0;
  }

  const matchedSuperStar =
    coupon.superStar != null && draw.superstar != null && coupon.superStar === draw.superstar;

  const displayInput: MatchDisplayInput = {
    game: coupon.game,
    mainMatchCount,
    matchedJoker,
    matchedSuperStar,
    matchedBonusCount: matchedBonus.length,
    playedSuperStar: coupon.superStar != null,
  };

  const categoryLabel =
    coupon.game === 'Çılgın Sayısal Loto' && mainMatchCount === 5 && matchedJoker
      ? '5+1'
      : coupon.game === 'Şans Topu' && mainMatchCount === 5 && matchedBonus.length > 0
        ? '5+1'
        : String(mainMatchCount);

  return {
    matchedNumbers,
    matchedBonus,
    matchedJoker,
    jokerHitNumber,
    matchedSuperStar,
    mainMatchCount,
    rank: computeMatchRank(displayInput),
    categoryLabel,
  };
}
