import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '../constants/storage-keys';
import { markCouponsDirty } from './couponsStore';
import { GAMES, getGameAccentColor } from './games';

export type CouponEntry = {
  game: string;
  numbers: number[];
  bonus: number[];
  superStar?: number | null;
};

export function buildSavedCoupon(entry: CouponEntry, idOffset = 0) {
  const gameDef = GAMES.find((g) => g.name === entry.game);
  return {
    id: Date.now() + idOffset,
    game: entry.game,
    icon: gameDef?.icon || '',
    color: getGameAccentColor(gameDef?.id ?? 'cilgin'),
    numbers: entry.numbers,
    bonus: entry.bonus,
    superStar: entry.superStar ?? null,
    date: new Date().toLocaleDateString('tr-TR'),
    timestamp: new Date().toISOString(),
    matchedCount: undefined,
  };
}

export function isDuplicateCoupon(coupons: any[], entry: CouponEntry): boolean {
  return coupons.some((cp: any) => {
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
}

export async function loadSavedCoupons(): Promise<any[]> {
  const existing = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS);
  return existing ? JSON.parse(existing) : [];
}

export async function persistSavedCoupon(entry: CouponEntry): Promise<void> {
  const coupons = await loadSavedCoupons();
  coupons.unshift(buildSavedCoupon(entry));
  await AsyncStorage.setItem(STORAGE_KEYS.SAVED_COUPONS, JSON.stringify(coupons));
  markCouponsDirty();
}
