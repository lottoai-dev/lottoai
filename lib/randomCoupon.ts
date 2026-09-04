import { pickSingleNumber, pickWeightedNumbers } from './couponGenerator';
import type { Game } from './games';

export type RandomCouponResult = {
  numbers: number[];
  bonus: number[];
  superStar?: number;
};

/** Filtresiz adil rastgele kupon — AI Studio ve klasik üretimde ortak. */
export function generateRandomCoupon(game: Game): RandomCouponResult {
  const numbers = pickWeightedNumbers(game.count, game.max);
  const bonus = game.bonus ? pickWeightedNumbers(game.bonus.count, game.bonus.max) : [];
  const superStar = game.superStar ? pickSingleNumber(game.superStar.max) : undefined;
  return { numbers, bonus, superStar };
}
