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

import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, LOG_LEVEL } from 'react-native-purchases';

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
