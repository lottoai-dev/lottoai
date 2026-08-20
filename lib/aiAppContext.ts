// lib/aiAppContext.ts
// AI asistanına uygulama yapısı (statik) ve kullanıcı durumu (dinamik) sağlar.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '../constants/storage-keys';

/** Ekranlar nadiren değişir — prompt'a sabit olarak eklenir. */
export const APP_SCREEN_MAP = `Uygulama yapısı (alt menü ve erişilebilir ekranlar):
- Ana Sayfa: Yaklaşan çekilişler, son sonuçlar özeti, AI asistanına kısayol ve bildirim zili.
- Sonuçlar: Geçmiş çekiliş sonuçları, istatistikler ve sayı analizi (Sonuçlar / İstatistik / Analiz sekmeleri).
- Kupon Üret (ortadaki + butonu): Manuel veya rastgele kupon oluşturma, gelişmiş filtreler, üretim geçmişi.
- Kuponlarım: Kayıtlı kuponları listeleme ve sonuç takibi. Kontrol OTOMATİKTİR — çekiliş
  sonuçları uygulamaya girildiğinde kuponlar kendiliğinden güncellenir; "Kontrol Et" gibi bir
  buton YOKTUR. Üstte Tümü / Bekleyen / Kontrol filtreleri vardır. Bekleyen kuponlarda "Bekliyor"
  rozeti görünür; sonuçlananlarda eşleşme rozeti ve renkli sayılar. Her kupon kartında Geçmiş,
  Paylaş ve Sil butonları vardır (sonuç rozeti detay modalını açar).
- Profil: İsim düzenleme, bildirim ayarları, uygulama istatistikleri, yasal bilgiler, çıkış.
- AI Asistan (Lota): Şu an konuşulan ekran — sohbet ve kupon üretimi burada yapılır.
- Bildirimler: Uygulama içi bildirim geçmişi (Ana Sayfa'daki zilden erişilir).
- Yasal: Gizlilik ve kullanım koşulları (Profil'den erişilir).

Kullanıcıyı yönlendirirken bu ekran adlarını kullan. Sen ekranları canlı göremezsin ve kullanıcı adına gezinme yapamazsın; sadece nereye gitmesi gerektiğini söylersin.`;

type SavedCouponRow = {
  game: string;
  matchedCount?: number | null;
};

export type AppContextSnapshot = {
  userName: string | null;
  savedCouponTotal: number;
  savedCouponsByGame: Record<string, number>;
  pendingCheckCount: number;
  checkedCount: number;
  bestMatchCount: number;
  notificationsEnabled: boolean;
  unreadNotificationCount: number;
  generationHistoryCount: number;
};

function isCouponPending(cp: SavedCouponRow): boolean {
  return cp.matchedCount === undefined || cp.matchedCount === null;
}

function summarizeCoupons(coupons: SavedCouponRow[]) {
  const byGame: Record<string, number> = {};
  let pending = 0;
  let checked = 0;
  let bestMatch = 0;

  for (const cp of coupons) {
    byGame[cp.game] = (byGame[cp.game] || 0) + 1;
    if (isCouponPending(cp)) pending++;
    else checked++;
    bestMatch = Math.max(bestMatch, cp.matchedCount ?? 0);
  }

  return { byGame, pending, checked, bestMatch };
}

/** Her sohbet mesajında güncel kullanıcı verisini okur. */
export async function buildAppContextSnapshot(): Promise<AppContextSnapshot> {
  const [nameRaw, couponsRaw, notifRaw, historyRaw, bildirimRaw] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.USER_NAME),
    AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS),
    AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_SETTINGS),
    AsyncStorage.getItem(STORAGE_KEYS.GENERATION_HISTORY),
    AsyncStorage.getItem(STORAGE_KEYS.BILDIRIMLER),
  ]);

  let coupons: SavedCouponRow[] = [];
  try {
    if (couponsRaw) coupons = JSON.parse(couponsRaw);
  } catch {
    coupons = [];
  }

  const { byGame, pending, checked, bestMatch } = summarizeCoupons(coupons);

  let notificationsEnabled = false;
  try {
    if (notifRaw) {
      const settings = JSON.parse(notifRaw) as Record<string, { before?: boolean; after?: boolean }>;
      notificationsEnabled = Object.values(settings).some((v) => v?.before === true || v?.after === true);
    }
  } catch {
    notificationsEnabled = false;
  }

  let unreadNotificationCount = 0;
  try {
    if (bildirimRaw) {
      const list = JSON.parse(bildirimRaw) as { isRead?: boolean }[];
      unreadNotificationCount = list.filter((b) => !b.isRead).length;
    }
  } catch {
    unreadNotificationCount = 0;
  }

  let generationHistoryCount = 0;
  try {
    if (historyRaw) {
      const history = JSON.parse(historyRaw);
      generationHistoryCount = Array.isArray(history) ? history.length : 0;
    }
  } catch {
    generationHistoryCount = 0;
  }

  return {
    userName: nameRaw?.trim() || null,
    savedCouponTotal: coupons.length,
    savedCouponsByGame: byGame,
    pendingCheckCount: pending,
    checkedCount: checked,
    bestMatchCount: bestMatch,
    notificationsEnabled,
    unreadNotificationCount,
    generationHistoryCount,
  };
}

function formatGameBreakdown(byGame: Record<string, number>): string {
  const entries = Object.entries(byGame);
  if (entries.length === 0) return 'yok';
  return entries.map(([game, count]) => `${game}: ${count}`).join(', ');
}

/** Dinamik snapshot'ı prompt metnine çevirir. */
export function formatAppContextForPrompt(snapshot: AppContextSnapshot): string {
  const lines = [
    'Kullanıcının güncel durumu (bu mesaj gönderildiği anda okunan veriler — burada yazmayan bir şeyi bilmiyorsan uydurma):',
    `- Kullanıcı şu an AI Asistan ekranında sohbet ediyor.`,
    snapshot.userName
      ? `- Profil adı: ${snapshot.userName}`
      : '- Profil adı: henüz girilmemiş',
    `- Kayıtlı kupon sayısı: ${snapshot.savedCouponTotal}`,
  ];

  if (snapshot.savedCouponTotal > 0) {
    lines.push(`  Oyunlara göre dağılım: ${formatGameBreakdown(snapshot.savedCouponsByGame)}`);
    lines.push(`  Henüz kontrol edilmemiş: ${snapshot.pendingCheckCount}, kontrol edilmiş: ${snapshot.checkedCount}`);
    if (snapshot.bestMatchCount > 0) {
      lines.push(`  En iyi eşleşme (kontrol edilen kuponlarda): ${snapshot.bestMatchCount} sayı`);
    }
  }

  lines.push(
    `- Çekiliş bildirimleri: ${snapshot.notificationsEnabled ? 'açık' : 'kapalı'}`,
    `- Okunmamış uygulama bildirimi: ${snapshot.unreadNotificationCount}`,
    `- Kupon Üret ekranındaki üretim geçmişi kaydı: ${snapshot.generationHistoryCount} adet`
  );

  return lines.join('\n');
}
