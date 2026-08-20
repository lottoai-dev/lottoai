// lib/aiQuota.ts
// Günlük AI token kotasının ne zaman yenileneceğini hesaplar ve istemci
// tarafındaki kilit durumunu (AsyncStorage) yönetir.
//
// Gün tanımı sunucudaki sayaçla (ai-chat Edge Function, todayInTurkey)
// AYNI olmak zorunda — orası Türkiye saatine göre gün değiştirdiği için
// burada da UTC+3 kullanılır. İkisi ayrışırsa kullanıcıya "yenilendi"
// denip istek yine reddedilir.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '../constants/storage-keys';

const TR_OFFSET_MS = 3 * 60 * 60 * 1000; // Kalıcı UTC+3, yaz saati yok
const DAY_MS = 24 * 60 * 60 * 1000;

/** Bugünün Türkiye tarihini YYYY-MM-DD olarak döner (sunucuyla aynı formül). */
export function todayInTurkey(now: number = Date.now()): string {
  return new Date(now + TR_OFFSET_MS).toISOString().slice(0, 10);
}

/** Kotanın yenilenmesine kalan süre (ms). Gün dönümünde 0'a iner. */
export function msUntilQuotaReset(now: number = Date.now()): number {
  const trNow = now + TR_OFFSET_MS;
  return Math.ceil(trNow / DAY_MS) * DAY_MS - trNow;
}

/**
 * Kalan süreyi kullanıcıya gösterilecek kısa metne çevirir: "7 sa 23 dk".
 * Saniye bilinçli olarak gösterilmez — sürekli akan bir geri sayım hem
 * gereksiz render üretir hem de bu uygulamada istenmeyen bir "sayaç"
 * hissi verir.
 */
export function formatQuotaResetIn(ms: number): string {
  if (ms <= 60_000) return '1 dakikadan az';

  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} dk`;
  if (minutes === 0) return `${hours} sa`;
  return `${hours} sa ${minutes} dk`;
}

type QuotaDaysByUser = Record<string, string>;

async function readQuotaDays(): Promise<QuotaDaysByUser> {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.AI_QUOTA_EXHAUSTED_DAY);
  if (!stored) return {};

  try {
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as QuotaDaysByUser;
    }
  } catch {
    // Eski sürüm yalnızca "YYYY-MM-DD" tutuyordu ve bunun hangi hesaba ait
    // olduğu bilinemez. Başka hesabı kilitlememesi için bu kayıt taşınmaz.
  }

  await AsyncStorage.removeItem(STORAGE_KEYS.AI_QUOTA_EXHAUSTED_DAY);
  return {};
}

async function writeQuotaDays(days: QuotaDaysByUser): Promise<void> {
  if (Object.keys(days).length === 0) {
    await AsyncStorage.removeItem(STORAGE_KEYS.AI_QUOTA_EXHAUSTED_DAY);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEYS.AI_QUOTA_EXHAUSTED_DAY, JSON.stringify(days));
}

/**
 * Bu kullanıcının yerel kilidinin hâlâ geçerli olup olmadığını okur.
 * Diğer hesapların kaydı bu hesabı etkilemez.
 */
export async function loadQuotaExhausted(userId: string): Promise<boolean> {
  try {
    const days = await readQuotaDays();
    const today = todayInTurkey();
    if (days[userId] === today) return true;

    if (days[userId]) {
      delete days[userId];
      await writeQuotaDays(days);
    }
    return false;
  } catch {
    return false;
  }
}

/** Kotanın dolduğunu kullanıcı + TR günüyle kaydeder. */
export async function persistQuotaExhausted(userId: string): Promise<void> {
  try {
    const days = await readQuotaDays();
    days[userId] = todayInTurkey();
    await writeQuotaDays(days);
  } catch {
    // Kalıcı yazılamazsa ekran kilidi yine çalışır; sadece yeniden açılışta
    // bir kez daha 429 alınır — DeepSeek çağrılmadığı için maliyeti yok.
  }
}

/** Gün dönünce (veya kota yeniden açılınca) yalnızca bu hesabın kilidini temizler. */
export async function clearQuotaExhausted(userId: string): Promise<void> {
  try {
    const days = await readQuotaDays();
    delete days[userId];
    await writeQuotaDays(days);
  } catch {
    // yok say
  }
}
