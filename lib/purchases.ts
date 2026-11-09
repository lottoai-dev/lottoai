// lib/purchases.ts
// RevenueCat SDK kurulumu ve kullanici eslestirmesi (Pro, 1.2.0).
//
// - RevenueCat'te kullanici kimligi = Supabase user.id. Boylece sunucudaki
//   revenuecat-webhook, olaylari dogrudan Supabase kullanicisina yazar.
// - Giris yapmamis kullanici satin alma yapamaz (paywall girisi ister);
//   SDK yine de anonim kimlikle yapilandirilir, girişte logIn ile birlesir.
// - Android icin RevenueCat'te henuz Play uygulamasi yok: anahtar bos oldugu
//   surece SDK Android'de yapilandirilmaz ve Pro durumu yalnizca sunucudan
//   (user_entitlements) okunur.

import { Linking, Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  INTRO_ELIGIBILITY_STATUS,
  LOG_LEVEL,
  type PurchasesPackage,
} from 'react-native-purchases';

/** RevenueCat entitlement kimligi (panel > Product catalog > Entitlements). */
export const PRO_ENTITLEMENT_ID = 'lottoai_pro';

/**
 * RevenueCat public SDK anahtarlari. Bunlar gizli DEGIL: uygulamaya gomulmek
 * icin tasarlandi. Secret anahtar (sk_...) asla buraya yazilmaz.
 */
const REVENUECAT_API_KEYS: Partial<Record<typeof Platform.OS, string>> = {
  ios: 'appl_jlMxnyyCtCtKhtMpfvbjhTtPeCk',
  // android: 'goog_...', // Play abonelikleri olusunca RevenueCat'ten eklenecek
};

let configured = false;

/** SDK'yi bir kez yapilandirir. Bu platform icin anahtar yoksa false doner. */
export function initPurchases(): boolean {
  if (configured) return true;
  const apiKey = REVENUECAT_API_KEYS[Platform.OS];
  if (!apiKey) return false;
  try {
    if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey });
    configured = true;
  } catch (err) {
    console.warn('[purchases] configure basarisiz', err);
    configured = false;
  }
  return configured;
}

export function isPurchasesConfigured(): boolean {
  return configured;
}

/**
 * RevenueCat kullanicisini Supabase oturumuyla eslestirir.
 * userId verilirse logIn; null ise (cikis) anonim degilse logOut.
 * Hata olursa yutulur: satin alma akisi bunu ayrica ele alir.
 */
export async function identifyPurchasesUser(userId: string | null): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try {
    if (userId) {
      const { customerInfo } = await Purchases.logIn(userId);
      return customerInfo;
    }
    if (!(await Purchases.isAnonymous())) {
      return await Purchases.logOut();
    }
    return await Purchases.getCustomerInfo();
  } catch (err) {
    console.warn('[purchases] kullanici eslestirilemedi', err);
    return null;
  }
}

/** Bu musteri bilgisinde Pro yetkisi aktif mi? */
export function hasProEntitlement(info: CustomerInfo | null | undefined): boolean {
  return !!info?.entitlements.active[PRO_ENTITLEMENT_ID];
}

/* ───────────────────────── Paywall yardımcıları ───────────────────────── */

export type ProPlan = {
  /** RevenueCat paketi (satın alma bununla yapılır). */
  pkg: PurchasesPackage;
  kind: 'monthly' | 'annual';
  /** Mağazanın yerel para birimiyle biçimlendirdiği fiyat: "₺79,99". */
  priceString: string;
  price: number;
  currencyCode: string;
  /** Bu kullanıcı için ücretsiz deneme sunuluyor mu (yalnızca yıllıkta tanımlı). */
  trialAvailable: boolean;
  /** Deneme süresi gün olarak (bilinmiyorsa 0). */
  trialDays: number;
};

export type ProOffer = {
  monthly: ProPlan | null;
  annual: ProPlan | null;
};

function periodToDays(unit: string | undefined, count: number | undefined): number {
  const n = count ?? 0;
  switch ((unit ?? '').toUpperCase()) {
    case 'DAY':
      return n;
    case 'WEEK':
      return n * 7;
    case 'MONTH':
      return n * 30;
    default:
      return 0;
  }
}

async function iosEligibleForIntro(productIds: string[]): Promise<Record<string, boolean>> {
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
    const out: Record<string, boolean> = {};
    for (const id of productIds) {
      out[id] = result[id]?.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
    }
    return out;
  } catch {
    // Belirlenemezse deneme vaat etmeyiz (yanlış "ücretsiz" demektense).
    return {};
  }
}

function toPlan(pkg: PurchasesPackage, kind: ProPlan['kind'], iosEligible: Record<string, boolean>): ProPlan {
  const p = pkg.product;
  let trialAvailable = false;
  let trialDays = 0;

  if (Platform.OS === 'ios') {
    const intro = p.introPrice;
    if (intro && intro.price === 0 && iosEligible[p.identifier]) {
      trialAvailable = true;
      trialDays = periodToDays(intro.periodUnit, intro.periodNumberOfUnits);
    }
  } else {
    // Google Play yalnızca kullanıcının hak kazandığı teklifi döndürür.
    const free = p.defaultOption?.freePhase;
    if (free) {
      trialAvailable = true;
      trialDays = periodToDays(free.billingPeriod?.unit, free.billingPeriod?.value);
    }
  }

  return {
    pkg,
    kind,
    priceString: p.priceString,
    price: p.price,
    currencyCode: p.currencyCode,
    trialAvailable,
    trialDays,
  };
}

/**
 * RevenueCat'teki geçerli offering'den (default) aylık ve yıllık planları getirir.
 * SDK bu platformda yapılandırılmamışsa ya da offering yoksa null.
 */
export async function getProOffer(): Promise<ProOffer | null> {
  if (!configured) return null;
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) return null;

  const ids = [current.monthly, current.annual].filter(Boolean).map((pkg) => pkg!.product.identifier);
  const iosEligible = Platform.OS === 'ios' && ids.length ? await iosEligibleForIntro(ids) : {};

  return {
    monthly: current.monthly ? toPlan(current.monthly, 'monthly', iosEligible) : null,
    annual: current.annual ? toPlan(current.annual, 'annual', iosEligible) : null,
  };
}

export type PurchaseOutcome =
  | { status: 'purchased'; isPro: boolean; customerInfo: CustomerInfo }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

function errorMessage(err: unknown): string {
  const e = err as { message?: string; readableErrorCode?: string } | null;
  return e?.message ?? 'Bilinmeyen hata';
}

function isUserCancelled(err: unknown): boolean {
  const e = err as { userCancelled?: boolean | null; code?: string } | null;
  return e?.userCancelled === true || e?.code === '1';
}

/** Seçilen planı satın alır. Kullanıcı vazgeçerse 'cancelled'. */
export async function purchaseProPlan(plan: ProPlan): Promise<PurchaseOutcome> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(plan.pkg);
    return { status: 'purchased', isPro: hasProEntitlement(customerInfo), customerInfo };
  } catch (err) {
    if (isUserCancelled(err)) return { status: 'cancelled' };
    return { status: 'error', message: errorMessage(err) };
  }
}

/** Mağazadaki önceki satın almaları geri yükler (Apple zorunlu tutar). */
export async function restoreProPurchases(): Promise<{ isPro: boolean } | { error: string }> {
  if (!configured) return { error: 'Satın alma bu cihazda henüz kullanılamıyor.' };
  try {
    const info = await Purchases.restorePurchases();
    return { isPro: hasProEntitlement(info) };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export type ProSubscriptionInfo = {
  expirationDate: string | null;
  willRenew: boolean;
  isTrial: boolean;
  managementURL: string | null;
};

/** Aktif Pro aboneliğinin ayrıntıları (Pro değilse null). */
export async function getProSubscriptionInfo(): Promise<ProSubscriptionInfo | null> {
  if (!configured) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    const ent = info.entitlements.active[PRO_ENTITLEMENT_ID];
    if (!ent) return null;
    return {
      expirationDate: ent.expirationDate,
      willRenew: ent.willRenew,
      isTrial: String(ent.periodType).toUpperCase() === 'TRIAL',
      managementURL: info.managementURL,
    };
  } catch {
    return null;
  }
}

/** Mağazanın abonelik yönetim sayfasını açar (iptal / plan değiştirme). */
export async function openSubscriptionManagement(managementURL?: string | null): Promise<void> {
  const fallback =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';
  await Linking.openURL(managementURL || fallback);
}
