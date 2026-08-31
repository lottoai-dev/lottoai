// lib/review-prompt.ts
// Uygulama içi mağaza değerlendirme istemi.
//
// Apple ve Google bu istemi yılda üç gösterimle sınırlar ve isteği sessizce
// yutabilir — yani "istedik" demek "gösterildi" demek değil. Bu yüzden ne
// zaman istediğimiz kritik: hakkı, kullanıcının uygulamadan fayda gördüğü
// bir ana saklıyoruz. İlk açılışta, hata sonrasında veya kota dolduğunda
// asla sorulmaz.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

import { logError } from './logger';

const FIRST_SEEN_KEY = 'review:firstSeenAt';
const GOOD_MOMENT_KEY = 'review:goodMoments';
const LAST_ASKED_KEY = 'review:lastAskedAt';

/** Kurulumdan sonra bu kadar beklenir — yeni kullanıcıya sorulmaz. */
const MIN_DAYS_SINCE_FIRST_USE = 3;
/** Bu kadar olumlu an biriktikten sonra sorulur. */
const MIN_GOOD_MOMENTS = 5;
/** İki istem arasındaki en kısa süre. */
const MIN_DAYS_BETWEEN_ASKS = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

async function readTime(key: string): Promise<number | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Kullanıcının uygulamadan fayda gördüğü bir anı sayar ve koşullar
 * uyuyorsa değerlendirme istemini açar. Çağıran taraf beklemez.
 */
export async function recordGoodMoment(): Promise<void> {
  try {
    const now = Date.now();

    const firstSeen = await readTime(FIRST_SEEN_KEY);
    if (firstSeen === null) {
      await AsyncStorage.setItem(FIRST_SEEN_KEY, String(now));
      return;
    }
    if (now - firstSeen < MIN_DAYS_SINCE_FIRST_USE * DAY_MS) return;

    const lastAsked = await readTime(LAST_ASKED_KEY);
    if (lastAsked !== null && now - lastAsked < MIN_DAYS_BETWEEN_ASKS * DAY_MS) return;

    const moments = Number(await AsyncStorage.getItem(GOOD_MOMENT_KEY)) || 0;
    const next = moments + 1;
    if (next < MIN_GOOD_MOMENTS) {
      await AsyncStorage.setItem(GOOD_MOMENT_KEY, String(next));
      return;
    }

    if (!(await StoreReview.hasAction())) return;

    // Sayaç istemden önce sıfırlanır: istem gösterilemese bile aynı anda
    // tekrar tekrar denenmesin.
    await AsyncStorage.multiSet([
      [GOOD_MOMENT_KEY, '0'],
      [LAST_ASKED_KEY, String(now)],
    ]);

    await StoreReview.requestReview();
  } catch (err) {
    logError('recordGoodMoment', err);
  }
}
