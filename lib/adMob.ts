// lib/adMob.ts
// Ödüllü (rewarded) reklam yükleme ve gösterme mantığı. Bu uygulamada
// SADECE ödüllü reklam kullanılır — açılış/interstitial/banner YOK
// (bilinçli ürün kararı: kullanıcı reklamı kendi isteğiyle, bir ödül
// karşılığında izler, asla zorla karşısına çıkmaz).
//
// Geliştirme boyunca (__DEV__) HER ZAMAN Google'ın test reklam
// kimlikleri kullanılır — gerçek AdMob birim kimlikleriyle geliştirme
// yapmak (henüz yayınlanmamış, gerçek kullanıcısı olmayan bir
// uygulamada) "geçersiz trafik" sayılıp AdMob hesabının kalıcı olarak
// banlanmasına yol açabilir. Bu satırı ASLA atlama.

import { Platform } from 'react-native';
import {
    AdEventType,
    RewardedAd,
    RewardedAdEventType,
    TestIds,
} from 'react-native-google-mobile-ads';
import type { FeatureKey } from './featureQuota';

// Gerçek (production) reklam birimi kimlikleri — sadece __DEV__ false
// iken (yani gerçek bir yayın/TestFlight/internal test build'inde)
// kullanılır. Geliştirme/Expo Go/development client'ta HER ZAMAN
// TestIds.REWARDED kullanılır.
const PROD_AD_UNIT_IDS: Record<FeatureKey, { ios: string; android: string }> = {
  filtered_coupon: {
    android: 'ca-app-pub-6473293791186582/2534120377',
    ios: 'ca-app-pub-6473293791186582/4945447711',
  },
  report: {
    android: 'ca-app-pub-6473293791186582/8907957039',
    ios: 'ca-app-pub-6473293791186582/3169331613',
  },
  // GEÇİCİ: Lota için ayrı AdMob birimi yok; filtreli kolon birimleri paylaşılıyor.
  // Ads açılmadan önce Lota'ya özel birimler oluşturup burayı güncelle.
  lota: {
    android: 'ca-app-pub-6473293791186582/2534120377',
    ios: 'ca-app-pub-6473293791186582/4945447711',
  },
};

function getAdUnitId(feature: FeatureKey): string {
  if (__DEV__) return TestIds.REWARDED;
  const ids = PROD_AD_UNIT_IDS[feature];
  return Platform.OS === 'ios' ? ids.ios : ids.android;
}

export type ShowRewardedAdOptions = {
  /**
   * Supabase kullanici kimligi. Google, SSV cagrisinda bunu geri gonderir;
   * admob-ssv fonksiyonu odulu bu kullaniciya yazar. Verilmezse odul
   * sunucuda islenemez.
   */
  userId: string;
};

export type ShowRewardedAdResult =
  | { status: 'earned' }
  | { status: 'closed_without_reward' }
  | { status: 'failed_to_load' }
  | { status: 'not_supported' };

/**
 * Bir ödüllü reklamı yükler ve gösterir. Kullanıcı reklamı sonuna kadar
 * izlerse 'earned' döner — ancak hak İSTEMCİDE eklenmez: Google'ın SSV
 * çağrısı admob-ssv Edge Function'ına ulaşınca sunucuda yazılır. Çağıran
 * taraf 'earned' sonrası waitForRewardGrant ile kotanın güncellenmesini
 * beklemeli. Web'de reklam SDK'sı çalışmadığı için 'not_supported' döner
 * (react-native-google-mobile-ads web'de no-op).
 *
 * Basitlik için reklam İSTEK ÜZERİNE yüklenir (önceden ön-yükleme yok) —
 * bu, kullanıcının "Reklam izle" butonuna bastığı an ile reklamın
 * göstermeye başlaması arasında 1-3 saniyelik bir bekleme yaratır.
 * İlk sürüm için kabul edilebilir; ileride performans sorun olursa
 * ekran açılışında ön-yükleme eklenebilir.
 */
export function showRewardedAd(
  feature: FeatureKey,
  options: ShowRewardedAdOptions,
): Promise<ShowRewardedAdResult> {
  if (Platform.OS === 'web') {
    return Promise.resolve({ status: 'not_supported' });
  }

  return new Promise((resolve) => {
    const adUnitId = getAdUnitId(feature);
    // NPA: kişiselleştirilmiş reklam / IDFA / ATT kullanmıyoruz.
    const rewarded = RewardedAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
      serverSideVerificationOptions: {
        userId: options.userId,
        customData: JSON.stringify({ feature }),
      },
    });

    let earned = false;
    let settled = false;

    const finish = (result: ShowRewardedAdResult) => {
      if (settled) return;
      settled = true;
      unsubscribeLoaded();
      unsubscribeEarned();
      unsubscribeClosed();
      unsubscribeError();
      resolve(result);
    };

    const unsubscribeLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      rewarded.show();
    });

    const unsubscribeEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      earned = true;
    });

    // AdEventType.CLOSED, RewardedAdEventType'ta yok — reklam kapanışı
    // temel AdEventType üzerinden dinlenir.
    const unsubscribeClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      finish(earned ? { status: 'earned' } : { status: 'closed_without_reward' });
    });

    const unsubscribeError = rewarded.addAdEventListener(AdEventType.ERROR, () => {
      finish({ status: 'failed_to_load' });
    });

    rewarded.load();

    // Reklam 15 saniye içinde hiç yüklenmezse (yavaş bağlantı, envanter
    // yok vb.) kullanıcıyı sonsuza kadar bekletmeyiz.
    setTimeout(() => finish({ status: 'failed_to_load' }), 15000);
  });
}