// lib/featureQuota.ts
// Filtreli kupon üretimi ve "Geçmiş" (rapor) görüntüleme için günlük,
// kullanıcı bazlı kullanım kotası. Sunucuda (Supabase) tutulur, istemci
// sıfırlayamaz; "gün" Türkiye saatine göre hesaplanır (kalıcı UTC+3).
//
/**
 * Kota sistemi: sunucu öncelikli, cache yedek.
 * Sunucu okunamazsa güvenilir bugünkü cache kullanılır; yoksa fail-closed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '../constants/storage-keys';
import { supabase } from './supabase';

export type FeatureKey = 'filtered_coupon' | 'report';

const FREE_DAILY_LIMIT = 10; // GEÇİCİ: AdMob onayı bekleniyor, onaylanınca 3'e geri döndürülecek
const REWARD_AMOUNT = 3;

/**
 * GEÇİCİ: AdMob uygulama/reklam birimleri onaylanana kadar ödüllü reklam
 * ile ek hak kapalı. Onay gelince true yap — kota kartlarında "Reklam izle"
 * butonu geri gelir. FREE_DAILY_LIMIT'i de tekrar 3'e çekmeyi unutma.
 */
export const ADS_REWARDS_ENABLED = false;

const FIELD_BY_FEATURE: Record<FeatureKey, 'filtered_coupon_count' | 'report_count'> = {
  filtered_coupon: 'filtered_coupon_count',
  report: 'report_count',
};

type QuotaCacheEntry = {
  day: string;
  used: number;
};

/** Türkiye takvim günü (YYYY-MM-DD). Kota ve yerel "bugün görüldü" listesi için ortak. */
export function todayInTurkey(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Günlük kotanın yenilenmesine kalan süre (ms). Gün dönümünde 0'a iner. */
export function msUntilQuotaReset(now: number = Date.now()): number {
  const trNow = now + TR_OFFSET_MS;
  return Math.ceil(trNow / DAY_MS) * DAY_MS - trNow;
}

/** Kalan süreyi kısa metne çevirir: "7 sa 23 dk". */
export function formatQuotaResetIn(ms: number): string {
  if (ms <= 60_000) return '1 dakikadan az';

  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} dk`;
  if (minutes === 0) return `${hours} sa`;
  return `${hours} sa ${minutes} dk`;
}

export type FeatureQuotaStatus = {
  /** Bugün bu özellik için kaç kez kullanıldı. */
  used: number;
  /** Bugün kalan ücretsiz hak (0 olabilir, negatif olmaz). */
  remaining: number;
  /** used >= limit ise true — arayüz "reklam izle" kartını gösterir. */
  exhausted: boolean;
};

function statusFromUsed(used: number): FeatureQuotaStatus {
  const safeUsed = Math.max(used, 0);
  return {
    used: safeUsed,
    remaining: Math.max(FREE_DAILY_LIMIT - safeUsed, 0),
    exhausted: safeUsed >= FREE_DAILY_LIMIT,
  };
}

/**
 * Kullanıcı ID'sini yerel oturumdan okur (ağ yok). AuthContext ile aynı kaynak:
 * getSession() AsyncStorage'daki session'ı kullanır; offline'da da çalışır.
 * getUser() Auth sunucusuna gider ve offline'da null dönerek kota cache'ini
 * atlayıp fail-open'a düşüyordu — bu yüzden burada kullanılmaz.
 */
async function getLocalUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

function cacheKey(feature: FeatureKey, userId: string): string {
  return `${STORAGE_KEYS.FEATURE_QUOTA_CACHE_PREFIX}:${feature}:${userId}`;
}

async function readQuotaCache(feature: FeatureKey, userId: string): Promise<QuotaCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(feature, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QuotaCacheEntry>;
    if (typeof parsed?.day !== 'string' || typeof parsed?.used !== 'number') return null;
    return { day: parsed.day, used: parsed.used };
  } catch {
    return null;
  }
}

async function writeQuotaCache(feature: FeatureKey, userId: string, entry: QuotaCacheEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(feature, userId), JSON.stringify(entry));
  } catch {
    // Cache yazılamazsa kota sunucuya güvenir; sessizce devam.
  }
}

/**
 * Offline üretimlerde ve başarılı RPC sonrası yerel sayacı günceller.
 * Aynı gün değilse (yeni gün) used=1 ile başlar.
 */
async function incrementQuotaCache(feature: FeatureKey, userId: string, day: string): Promise<void> {
  const cached = await readQuotaCache(feature, userId);
  const used = cached && cached.day === day ? cached.used + 1 : 1;
  await writeQuotaCache(feature, userId, { day, used });
}

/**
 * Sunucu okunamazsa son bilinen bugünkü cache'e güvenir.
 * Cache yoksa veya gün eskiyse fail-closed (exhausted: true).
 */
async function statusFromCacheOrFailClosed(
  feature: FeatureKey,
  userId: string,
  day: string,
): Promise<FeatureQuotaStatus> {
  const cached = await readQuotaCache(feature, userId);
  // Yalnızca bugüne ait cache güvenilir; yokluğunda veya gün eskidiğinde
  // kotayı sıfır varsaymak limiti atlatmaya izin verir (veri silme / uçak modu).
  if (cached && cached.day === day) {
    return statusFromUsed(cached.used);
  }
  return statusFromUsed(FREE_DAILY_LIMIT);
}

/**
 * Bir özelliğin bugünkü kullanım durumunu okur.
 * Başarılı okumada sonuç AsyncStorage'a yazılır.
 * Okuma başarısız olursa bugünkü cache kullanılır; cache'de used >= limit
 * ise kilitli kalır. Cache yoksa / gün eskiyse fail-closed.
 */
export async function getFeatureQuotaStatus(feature: FeatureKey): Promise<FeatureQuotaStatus> {
  const userId = await getLocalUserId();
  if (!userId) return statusFromUsed(0);

  const day = todayInTurkey();
  const field = FIELD_BY_FEATURE[feature];

  const { data, error } = await supabase
    .from('feature_usage_daily')
    .select(field)
    .eq('user_id', userId)
    .eq('day', day)
    .maybeSingle();

  if (error) {
    return statusFromCacheOrFailClosed(feature, userId, day);
  }

  const used = (data as Record<string, number> | null)?.[field] ?? 0;
  await writeQuotaCache(feature, userId, { day, used });
  return statusFromUsed(used);
}

/**
 * Bir kullanımı sayaca ekler (kupon üretildi / geçmiş açıldı).
 * Yerel cache her çağrıda +1 artar (online başarı + offline üretim).
 * Sunucu yazımı başarısız olursa sessizce yutulur.
 */
export async function recordFeatureUsage(feature: FeatureKey): Promise<void> {
  const userId = await getLocalUserId();
  if (!userId) return;

  const day = todayInTurkey();
  const field = FIELD_BY_FEATURE[feature];

  // Önce yerel sayaç — offline art arda üretimler limitte kilitlensin.
  await incrementQuotaCache(feature, userId, day);

  try {
    const { error } = await supabase.rpc('increment_feature_usage', {
      p_user_id: userId,
      p_day: day,
      p_field: field,
      p_amount: 1,
    });
    if (error) {
      // Sunucu yazılamadı; yerel cache zaten güncel. Sessizce yut.
    }
  } catch {
    // Sessizce yutulur — yerel cache offline korumayı sürdürür.
  }
}

/**
 * Ödül, istemcide DEĞİL sunucuda verilir: reklam tamamlanınca Google,
 * admob-ssv Edge Function'ına imzalı bir çağrı yapar ve hak orada yazılır
 * (kullanımı REWARD_AMOUNT kadar azaltarak — limiti yükseltmek yerine tek
 * sayaç üzerinden gitmek organik ve reklamla kazanılan hakları aynı yerde
 * tutar). feature_usage_daily üzerindeki trigger, kotanın service_role
 * dışında azaltılmasını engeller; bu yüzden istemci tarafında ödül veren
 * bir fonksiyon kasıtlı olarak yoktur.
 *
 * Bu fonksiyon o çağrının gelmesini bekler: kullanım usedBefore'un altına
 * düşene kadar kotayı yoklar. Zaman aşımında null döner — çağıran taraf
 * kullanıcıya "birazdan yansıyacak" demeli, hakkı kendisi vermemeli.
 */
export async function waitForRewardGrant(
  feature: FeatureKey,
  usedBefore: number,
  timeoutMs = 12000,
): Promise<FeatureQuotaStatus | null> {
  const deadline = Date.now() + timeoutMs;
  // İlk yoklamadan önce kısa bir bekleme: SSV çağrısı reklam kapanmadan
  // hemen önce yola çıkar, genelde ilk saniyede ulaşır.
  let delay = 700;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const status = await getFeatureQuotaStatus(feature);
    if (status.used < usedBefore) return status;
    delay = 1500;
  }

  return null;
}

export const FEATURE_FREE_DAILY_LIMIT = FREE_DAILY_LIMIT;
export const FEATURE_REWARD_AMOUNT = REWARD_AMOUNT;
