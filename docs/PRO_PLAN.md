# LottoAI Pro — Uygulama Planı

> Hazırlandı: 8 Kasım 2026
> Durum: Plan aşamasında, kod yazılmadı. Hedef sürüm **1.2.0** (1.1.1 yayında; arada 1.1.2 çıkıyor).

## Kararlar

- **Pro = sınırsız kullanım:** filtreli kolon, kolon geçmişi (rapor) görüntüleme, Lota kolon; ayrıca İstatistik'te **Toplam** ve **Ardışık** sekmeleri.
- **Filtresiz kolon** herkese ücretsiz ve sınırsız kalır.
- **Ücretsiz kullanıcı:** üç özelliğin her biri için günde **5** hak (şu anki geçici 10'un yerine).
- 10 → 5 düşüşü **Pro ile aynı sürümde** yapılır, önce değil.
- Günlük sınır uygulama kodundan çıkar, **Supabase'de** tutulur; yeni sürüm çıkarmadan ayarlanabilir (projede `expo-updates` / OTA yok).
- Pro **"sınırsız kullanım / daha fazla kontrol"** olarak anlatılır; kazanma şansını artırdığı izlenimi verilmez (mağaza incelemesi ve yasal açıdan).

## Mağaza kurulumu — ilerleme

### App Store Connect (tamamlandı — 8 Kas 2026)

- Developer Program License Agreement ve güncel **Paid Apps** sözleşmesi kabul edildi; banka (USD) ve vergi formları (W-8BEN) zaten aktifti.
- Abonelik grubu **LottoAI Pro** (Group ID `22559002`), Türkçe görünen ad "LottoAI Pro", uygulama adı kullanılıyor.
- Ürünler (yalnızca Türkiye'de satışta):

| Seviye | Ürün | Product ID | Apple ID | Süre | Fiyat | Deneme |
|---|---|---|---|---|---|---|
| 1 | Pro Yıllık | `lottoai_pro_yearly` | 6832326156 | 1 yıl (peşin) | ₺599,99 | 7 gün ücretsiz |
| 2 | Pro Aylık | `lottoai_pro_monthly` | 6832323045 | 1 ay | ₺79,99 | — |

- Yıllık 1. seviyede: aylıktan yıllığa geçiş "yükseltme" sayılır, anında başlar.
- Family Sharing kapalı; "Monthly with a 12-Month Commitment" kullanılmıyor.
- **Kalan:** her iki ürüne paywall ekran görüntüsü (Review Information → Screenshot). İlk abonelik grubu **1.2.0 ile birlikte** incelemeye gönderilmeli — o zamana kadar "Add for Review"a basılmaz ve 1.1.2'ye eklenmez.

### RevenueCat (iOS tarafı tamamlandı — 9 Kas 2026)

- Proje **LottoAI**; ücretsiz plan (aylık takip edilen gelir 2.500 $'a kadar), kart eklenmedi.
- Uygulama **LottoAI (App Store)**, bundle `app.getlottoai.ios`: In-App Purchase Key (.p8) yüklendi, "Valid credentials"; Small Business Program başlangıcı 2026-08-15; App-Specific Shared Secret girildi (iOS 15 için).
- App Store Server Notifications (Production + Sandbox, Version 2) RevenueCat adresine yönlendirildi.
- App Store Connect API anahtarı **eklenmedi** (ürün içe aktarma gerekmiyor; ürünler elle eklendi, durum "Could not check" normal).
- Entitlement: **`lottoai_pro`** (görünen ad "LottoAI Pro").
- Ürünler: `lottoai_pro_monthly` (Pro Aylık), `lottoai_pro_yearly` (Pro Yıllık) — ikisi de `lottoai_pro`'ya bağlı.
- Offering **`default`** (geçerli): `$rc_monthly` → Pro Aylık, `$rc_annual` → Pro Yıllık (+ RevenueCat Test Store ürünleri).
- iOS public SDK anahtarı (uygulamaya gömülür, gizli değil): `appl_jlMxnyyCtCtKhtMpfvbjhTtPeCk`
- Kalan: Google Play uygulaması (Play abonelikleri oluşunca), webhook ayarı (adım 2).

### Google Play Console — 1.2.0'ın ilk test build'inden sonra

- Abonelik oluşturmak için Play'e **Play Billing Library (≥ 8.0.0) içeren** bir paket yüklenmiş olmalı. Yalnızca `com.android.vending.BILLING` izni yetmez: Play bunu eski AIDL faturalandırma sayıp paketi yayından engelliyor (1.1.2'de denendi, geri alındı). Sıra: 1.2.0'ın RevenueCat'li ilk build'i dahili teste → Play'de ürünleri oluştur → test.
- Yapı: tek abonelik (`lottoai_pro`), içinde iki temel plan (aylık ₺79,99, yıllık ₺599,99); yıllık plana 7 günlük ücretsiz deneme teklifi. Ödeme profili gerekiyorsa o adımda bağlanır.

## Mevcut durum (plan yazılırken)

- Üç özellik de giriş yapmış kullanıcıya açık; kota `feature_usage_daily` tablosunda sayılıyor.
- Sınır (`FREE_DAILY_LIMIT`) yalnızca istemcide, `lib/featureQuota.ts` içinde. Sunucu sayıyor ama sınırı bilmiyor; `lota-generate` de kota kontrolü yapmıyor.
- Abonelik / Pro durumu tutan bir tablo yok.
- AdMob iptal; `ADS_REWARDS_ENABLED = false`, reklam kodu ve `admob-ssv` hâlâ kodda.
- `feature_usage_daily` tablosunun şeması migration'larda yok (muhtemelen panelden oluşturuldu).

## Adımlar

### 0. Hesap ve mağaza hazırlığı (kullanıcı)

1. **App Store Connect:** Paid Apps sözleşmesi, banka ve vergi bilgileri. Bir abonelik grubu altında iki ürün: `lottoai_pro_monthly`, `lottoai_pro_yearly`.
2. **Google Play Console:** Ödeme profili ve aynı iki abonelik ürünü.
3. **RevenueCat:** Hesap; iOS için App Store Connect API anahtarı, Android için Google service account. Tek bir `pro` entitlement ve iki ürünü içeren bir offering.

### 1. Veritabanı (Supabase migration)

> **Durum (9 Kas 2026, `pro` dalı):** migration dosyaları yazıldı, canlıya uygulanmadı.
> - `20260831190000_feature_usage_daily_baseline.sql` — paneldeki tablonun canlı tanımı (kayıt amaçlı). Canlıya göndermeden önce `npx supabase migration repair --status applied 20260831190000` ile "uygulandı" işaretlenir.
> - `20261109120000_app_config.sql` — `feature_daily_limits` = 5/5/5.
> - `20261109120100_user_entitlements.sql` — `user_entitlements`, `is_pro()`, `revenuecat_events` (+180 gün temizlik).
> - Canlıya uygulama: webhook (adım 2) ile birlikte, kullanıcı onayıyla.

- **`app_config`:** Özellik başına günlük sınır (`filtered_coupon`, `report`, `lota` = 5). Herkes okuyabilir, yalnızca service_role yazar.
- **`user_entitlements`:** `user_id` (PK), `is_pro`, `expires_at`, `product_id`, `store`, `updated_at`. RLS: kullanıcı yalnızca kendi satırını okur; yazma yalnızca service_role.
- `feature_usage_daily` şemasını da bir migration'a almak.

### 2. Sunucu: `revenuecat-webhook` Edge Function

> **Durum (9 Kas 2026, `pro` dalı):** fonksiyon yazıldı (`supabase/functions/revenuecat-webhook/index.ts`, `config.toml`'da `verify_jwt = false`), canlıya gönderilmedi.
> - Olayın içeriğine güvenmez: olaydaki kullanıcı(lar)ın **güncel** durumunu RevenueCat REST API'den (`GET /v1/subscribers/{id}`) okuyup `user_entitlements`'a yazar → sırasız/tekrar gelen olaylarda da doğru. Ödeme sorununda ek süre (grace period) boyunca Pro kalır. TRANSFER'de iki taraf da güncellenir.
> - `Authorization` başlığı sabit süreli karşılaştırmayla doğrulanır; `TEST` olayı 200 döner; işlenen olay kimliği `revenuecat_events`'e yazılır; silinmiş kullanıcı (FK hatası) atlanır; RevenueCat'e ulaşılamazsa 502 → RevenueCat tekrar dener.
> - **Canlıya alma sırası:** (1) RevenueCat'te salt-okuma **secret API key** (`sk_…`) oluştur; (2) rastgele bir webhook parolası üret; (3) Supabase secret'ları: `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`; (4) migration'ları uygula (önce baseline için `migration repair`); (5) `npx supabase functions deploy revenuecat-webhook`; (6) RevenueCat → Integrations → Webhooks: URL `https://tsxzukctomvnyzalgxap.supabase.co/functions/v1/revenuecat-webhook`, Authorization = aynı parola; (7) panelden "Send test event" → 200.

- RevenueCat olaylarını (satın alma, yenileme, iptal, süre bitimi, ödeme sorunu, ürün değişikliği, transfer) işleyip `user_entitlements`'ı günceller.
- İstek gizli anahtarla (Authorization başlığı) doğrulanır.
- Olay kimliğiyle idempotent: aynı olay iki kez işlenmez (`admob_ssv_rewards` deseni).
- RevenueCat `app_user_id` = Supabase `user.id`.

### 3. Uygulama: SDK ve Pro durumu

- `react-native-purchases` eklenir → **native modül, yeni build gerekir.**
- `app/_layout.tsx` içinde SDK yapılandırması (platform anahtarları `app.config.js` / env üzerinden).
- Giriş/çıkışta `Purchases.logIn(user.id)` / `Purchases.logOut()` (`contexts/AuthContext.tsx`'teki push token mantığının yanında).
- Yeni **`ProContext`**: `isPro` RevenueCat `customerInfo`'dan; yedek kaynak `user_entitlements`. Abonelik değişince dinleyiciyle güncellenir.

### 4. Kota: `lib/featureQuota.ts`

- Sınır `app_config`'ten okunur; son değer AsyncStorage'da cache'lenir; o da yoksa varsayılan 5.
- Pro kullanıcıda `exhausted` her zaman false. Kullanım yine kaydedilir (analiz için).
- Reklam kodu temizliği: `ADS_REWARDS_ENABLED`, `waitForRewardGrant`, `REWARD_AMOUNT`, `lib/adMob.ts`, `react-native-google-mobile-ads`, `admob-ssv` fonksiyonu.

### 5. Ekranlar

- **Paywall (`app/pro.tsx`):** Aylık/yıllık (fiyatlar mağazadan, yerel para birimiyle), "Satın alımları geri yükle" (Apple zorunlu), otomatik yenileme açıklaması, Kullanım Şartları ve Gizlilik bağlantıları.
- **Giriş noktaları:** `generate.tsx`, `saved.tsx`, `ai-studio.tsx` içindeki "hakkın bitti" kartlarında reklam butonu yerine "Pro'ya geç". Profil ekranında Pro satırı/rozeti; Pro kullanıcıya "Aboneliği yönet" bağlantısı.
- Pro kullanıcıda kota kartları hiç görünmez.
- **İstatistik:** Toplam ve Ardışık sekmeleri (`components/results/StatisticsTab.tsx`) Pro'ya ait. 1.1.2'de `PRO_STATS_ENABLED = false` ile gizli; 1.2.0'da bayrak yerine `isPro` kontrolü: ücretsiz kullanıcıya kilitli sekme + "Pro ile aç". Tek/Çift ücretsiz kalır.

### 6. Hesap silme

- `delete-account` fonksiyonu `user_entitlements` satırını da siler.
- Silme ekranında uyarı: hesap silmek mağaza aboneliğini iptal etmez; App Store / Google Play'den iptal edilmeli.

### 7. Metinler ve yasal

- `app/(tabs)/legal.tsx` SSS: "abonelik yoktur" maddesi güncellenir, Pro soruları eklenir.
- Kullanım şartları, gizlilik politikası (RevenueCat veri işleyen olarak), KVKK metni.
- Mağaza açıklamaları ve review notları.

### 8. Test

- **Dev'de kota kapalı (`__DEV__`).** Sınır ve Pro'yu dev build'de test edebilmek için bu atlamayı geçici açıp kapatan bir ayar eklenir.
- iOS sandbox test hesabı; Android lisans test kullanıcısı + internal/alpha kanal.
- Senaryolar: satın alma, geri yükleme, iptal, süre bitimi, ödeme sorunu, aynı hesap farklı cihaz, Pro iken çıkış ve başka hesapla giriş, çevrimdışı.

### 9. Yayın (1.2.0)

- iOS ve Android production build, aynı commit'ten.
- Apple'da abonelik ürünleri ilk kez **build ile birlikte** incelemeye gönderilir.
- Eski sürümler sınırı koddan okuduğu için güncelleyene kadar 10 hak kullanır; kabul edilebilir. İleride sınır sunucuda da zorlanabilir (`increment_feature_usage` / `lota-generate`).

## Fiyat ve altyapı kararları (8 Kas 2026)

- **Altyapı:** RevenueCat.
- **Planlar:** aylık **₺79,99**, yıllık **₺599,99** (≈ 7,5 ay; yıllıkta ~%37 indirim). Mağazaların hazır fiyat listesinden en yakın değer seçilir.
- **Ücretsiz deneme:** 7 gün, yalnızca yıllık planda.
- Gerekçe: Türkiye mağazasında bu kategoride abonelik az; görülen örnekler ₺99,99–₺199,99/ay ve $1,99/ay. Tahmin iddiası olmadığı için alt-orta segment. Fiyat düşürmek kolay, mevcut abonelerde artırmak mağaza kurallarına tabi — ilk haftaların dönüşüm verisine göre gözden geçirilir.

## İş bölümü

- **Kod (Claude):** adımlar 1–5 ve 8.
- **Kullanıcı:** adım 0, mağaza metinleri ve inceleme gönderimi; 7. adımın yasal metinlerinin son onayı.
