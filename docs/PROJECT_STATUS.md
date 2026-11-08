# LottoAI — Proje Durumu

> Son güncelleme: 8 Kasım 2026
> Bu dosya her tamamlanan işten sonra güncellenir. Yeni bir sohbete başlarken
> "durum dosyasını oku" demek yeterli.

## Uygulama hakkında

Türkiye loto oyunları (Çılgın Sayısal Loto, Süper Loto, Şans Topu, On Numara)
için kupon üretme, çekiliş sonucu takibi, istatistik ve bildirim sunan React
Native / Expo uygulaması.

| | |
| --- | --- |
| Backend | Supabase (Postgres + Auth + Edge Functions), proje ref `tsxzukctomvnyzalgxap` (panelde adı: LuckyPick) |
| AI | **Kaldırıldı (1 Eyl)** — Lota sohbet asistanı tamamen söküldü; ileride dar kapsamlı "cümleyle kolon" düşünülebilir |
| Reklam | **İptal (11 Eyl 2026)** — AdMob gelir yolu kapatıldı. `ADS_REWARDS_ENABLED` kapalı kalır; yeniden başvuru yok. Kod şimdilik durur, ayrı sürümde sökülmez. |
| Tasarım | "Calm Emerald" — koyu tema `#0A0C10`, marka yeşili koyu temada `#3DD68C` / açık temada `#1C9E73`, Plus Jakarta Sans |
| Uygulama deposu | `C:\Dev\LottoAI` → github.com/lottoai-dev/lottoai |
| Web sitesi deposu | `C:\Users\vatan\lottoai-web` → github.com/lottoai-dev/lottoai-web (Vercel'e bağlı, otomatik deploy) |

### Kimlik bilgileri

| | |
| --- | --- |
| Geliştirici | İbrahim Kaya, bireysel, Şanlıurfa / Türkiye |
| İletişim | support@getlottoai.app · getlottoai.app |
| Apple Team ID | PMN6Z259PJ (Enrollment 67A8HL27ZY) |
| iOS | `app.getlottoai.ios` — App Store ID 6798183647 |
| Android | `app.getlottoai.android` |
| AdMob yayıncı | `pub-6473293791186582` |

## Genel durum

| Platform | Sürüm | Durum |
| --- | --- | --- |
| iOS | 1.1.0 | App Store'da yayında (30 Ağu 2026, build 6) |
| Android | 1.1.0 | Google Play'de yayında (30 Ağu 2026, build 7) |
| Website | — | getlottoai.app yayında, git + otomatik deploy kurulu |
| Apple Search Ads | — | Aktif ($25/ay, $0.64 max CPI) |
| AdMob | — | Hesap 4 kez reddedildi. **Reklam gelir yolu iptal** (11 Eyl 2026). Flag açılmaz, yeni başvuru yok. |

### Mağaza hesapları

Apple Developer Program kurulu ve doğrulanmış; Small Business Program onaylı
(15 Ağu 2026, komisyon %15). Google Play üretim erişimi onaylı (kapalı test
9–25 Ağu tamamlandı). Kullanıcı Android'de alpha kanalında beta testçisi olarak
kalıyor, kendi güncellemelerini önce orada test ediyor.

## Bekleyen işler

### Pro abonelik (planlandı — 8 Kas 2026)

Hedef 1.2.0. Filtreli kolon, geçmiş ve Lota Pro'da sınırsız; ücretsiz kullanıcıya
her biri için günde 5 hak, sınır Supabase'e taşınacak. Ayrıntılı plan ve açık
kararlar: [PRO_PLAN.md](PRO_PLAN.md).

### Reklam / AdMob — iptal (11 Eyl 2026)

AdMob hesap onayı 4 kez reddedildi. **Ödüllü reklam gelir yolu tamamen iptal.**
Yeniden başvuru yok. `ADS_REWARDS_ENABLED` `false` kalır; onay beklenmez, flag
açılmaz. Kota ücretsiz günlük hak olarak durur.

SDK, SSV ve kota dalları şimdilik kodda kalır — sırf temizlik için mağaza
sürümü çıkarılmaz. Abonelik bu kararla öne çekilmez; ücretsiz temel + ileride
premium ayrı karardır.

### SSV dağıtımı (tamamlandı — 1 Eyl)

`admob-ssv` Edge Function ve `admob_ssv_rewards` tablosu + kota koruma trigger'ı
canlıya alındı. Reklam yolu iptal olduğu için konsolda SSV birimi tanımlanmaz.

### 1.1.2 — hazırlanıyor (8 Kas 2026)

`app.json` sürümü `1.1.2` (build numarası EAS `autoIncrement`). İçerik: filtre
özeti + zorunlu sayı halkası, "filtresiz devam et" düzeltmesi, çakışma
filtresinin kaldırılması, İstatistik'e **Tek/Çift** sekmesi.

**Toplam** ve **Ardışık** sekmeleri kodda hazır ama `PRO_STATS_ENABLED = false`
(`lib/drawStats.ts`) ile gizli — Pro'ya ayrıldılar; önce ücretsiz verip sonra
kilitlememek için 1.2.0'da Pro ile açılır.

Yayın: telefonda test → iOS + Android production build (aynı commit) →
mağaza sürüm notları.

Android'de `com.android.vending.BILLING` izni denendi ve **geri alındı**: Play,
izni olup Play Billing Library içermeyen paketi "AIDL faturalandırma kullanıyor,
8.0.0'a geçin" hatasıyla yayından engelliyor (versionCode 9 bu yüzden
kullanılamaz). Android 1.1.2 izinsiz yeniden build alındı (versionCode 10).
iOS 1.1.2 (build 8) etkilenmedi. Play abonelikleri 1.2.0'a kaldı.

### 1.1.1 — yayında

Kullanıcı 8 Kas 2026'da yayında olduğunu bildirdi. Canlı `ai-chat` fonksiyonu
silinmiş (8 Kas 2026 kontrol: `functions/v1/ai-chat` → 404 NOT_FOUND).
Aşağıdaki tablo 1.1.1 için hazırlanan mağaza metinleridir.

**App Store Connect (1.1.1):**

| Alan | Değer |
| --- | --- |
| Uygulama adı | `LottoAI: Sayısal Loto Kupon` |
| Alt başlık | `Kupon, sonuç, istatistik — 4 oyun` |
| Anahtar kelimeler | `şans topu,on numara,süper,çekiliş,istatistik,tahmin,rastgele,numara,şans,oyun` |
| Marketing URL | `https://getlottoai.app` |
| Description | LOTA / AI asistan paragrafını kaldır |
| What's New | Lota kaldırıldı + diğer 1.1.1 maddeleri |
| Review Notes | DeepSeek / Lota maddesini kaldır |

**Google Play:** Kısa/tam açıklamada değişiklik zorunlu değil (Lota zaten
ayrı blok değil); sürüm notlarına Lota kaldırma ekle.

### Açık maddeler

| Öncelik | Madde |
| --- | --- |
| Düşük | `push_tokens` varsayılanı `true`→`false` (tek satır ALTER) |
| Düşük | `push_tokens` unique constraint hatası (arka planda, UX'i etkilemiyor) |
| Düşük | Offline kota kartının gecikmeli görünmesi (UX pürüzü) |
| Düşük | App Store'da büyük harf "IBRAHIM KAYA" görünmesi |
| İleride | Dar kapsamlı AI: Kupon üret ekranında tek turluk "cümleyle kolon" (sohbet değil) |
| İleride | Çekiliş girişinin otomatikleştirilmesi — aşağıya bakınız |

### Çekiliş verisi (bilinçli karar)

Sonuçlar elle giriliyor; kullanıcı sayısı arttıkça daha düzenli girilecek.
`fetch-draws` fonksiyonu bu işi doğru yapamıyor: HTML'i basit regex'lerle
kazıyor, `bonus` alanını hep `'-'` yazıyor, `superstar` ve `estimated_prize`
alanlarına hiç dokunmuyor. Ayrıca oyun adını `'Çılgın Sayısal'` olarak yazıyor
— uygulama `'Çılgın Sayısal Loto'` bekliyor, yani kayıt görünmez olurdu.
Otomasyona geçilecekse bu fonksiyon düzeltilerek değil, sıfırdan yazılmalı.

## Büyüme durumu

App Store Analytics (90 gün, 29 Ağu): 411 gösterim → 151 ürün sayfası
görüntüleme → 4 ilk kez indirme.

Gösterimden sayfaya geçiş %37 ile sağlıklı — ad ve ikon işini yapıyor. Sayfadan
indirmeye geçiş ise %2,6, asıl kırık halka burası. Ekran görüntüleri kaliteli
(beş görsel, tutarlı tasarım, net başlıklar), dolayısıyla en olası sebep sıfır
puan: her iki mağazada da hiç değerlendirme yok. Aynı aramada rakip
"LotoAI Süper Loto Analiz" 4,2 puan ve 500+ indirmeyle listeleniyor.

Bu yüzden 1.1.1'e uygulama içi değerlendirme istemi eklendi. Puanlar gelmeden
reklam bütçesini artırmak veya ekran görüntülerini elden geçirmek erken olur;
önce dönüşüm düzelmeli, sonra aynı metrikler yeniden ölçülmeli.

Rakip adına benzer bir isim kullanmama kararı alındı — karışıklık riski ve Play
politikaları nedeniyle; ayrıca taklit edilecek özgün bir kalıp yok.

## Tamamlananlar

### 11 Eylül 2026

- **Reklam gelir yolu iptal:** AdMob 4 ret sonrası gelir planından çıkarıldı.
  Flag kapalı, yeniden başvuru yok; kod şimdilik durur.

### 1 Eylül 2026

- **Lota tamamen kaldırıldı:** `ai-assistant` ekranı, ana sayfa AI ikonu,
  `deepseek.ts`, `aiAppContext.ts`, `ai-chat` Edge Function (repodan), ilgili
  ikon ve bileşenler. Kota sıfırlama yardımcıları `featureQuota.ts`'e taşındı.
- SSV canlıya alındı (`admob-ssv` + migration)
- Fazladan AdMob Android kaydı gizlendi (konsol)

### 31 Ağustos 2026

- `lottoai-web` git deposuna bağlandı, GitHub'a gönderildi, Vercel'e bağlandı —
  `main` dalına her commit otomatik yayına gidiyor
- Tablo temizleme (retention) kuruldu: `purge_old_records()` fonksiyonu +
  gecelik `pg_cron` işi (03:30 UTC). Okunmuş bildirimler 30, okunmamışlar ve AI
  sohbet kayıtları 90, app log'ları 30 gün. Çakışan eski
  `app_logs_retention_daily` işi kaldırıldı. Migration olarak repoda
- Çıkışta push token temizliği eklendi (`unregisterPushToken`) — çıkmış
  kullanıcıya bildirim gitmesi ve aynı cihazda ikinci hesapta çift bildirim
  sorunu çözüldü
- Uygulama içi değerlendirme istemi eklendi (`lib/review-prompt.ts`) — ilk
  kullanımdan 3 gün sonra, 5 kupon üretiminden sonra, 120 günde bir
- Play uygulama adı `LottoAI: Sayısal Loto Kupon` olarak güncellendi ve yayına girdi
- AdMob Android uygulaması `app-ads.txt` ile doğrulandı
- AdMob SSV yazıldı: ödül artık istemcide değil, Google'ın imzalı çağrısıyla
  sunucuda veriliyor; kotanın istemciden düşürülmesi trigger ile engellendi
- Çekiliş verisinin güvenlik değişikliğinden etkilenmediği doğrulandı

### 30 Ağustos 2026

- iOS ve Android 1.1.0 yayınlandı (Türkçe dil desteği, yeni ekran görüntüleri,
  bildirim ve kota iyileştirmeleri)
- Website'e Google Play rozeti eklendi
- AdMob için `app-ads.txt` oluşturuldu ve yayınlandı; Vercel'de çıplak alan
  adının `www`'ye yönlendirmesi kaldırıldı (doğrulama yönlendirmeye takılabiliyor)
- 1.1.0 çalışmasının tamamı git'e commit edilip GitHub'a gönderildi

### Güvenlik denetimi — kapandı

Canlı veritabanı ve dağıtılmış fonksiyonlar üzerinden doğrulandı:

| Madde | Durum |
| --- | --- |
| `app_logs` anon INSERT | Saatlik hız sınırı (anon 500, kullanıcı 200) + zaman penceresi, `user_id` varsayılanı `auth.uid()` |
| `fetch-draws` auth | service_role kapısı — canlı kod yereldekiyle birebir doğrulandı |
| `send-push` | Repoda, service_role korumalı, canlıda doğrulandı |
| `draws` INSERT | Politika yok + RLS açık → authenticated yazamıyor |
| `notifications` | Oturum kontrolü ve `token` filtresi eklendi |
| `feature_usage_daily` | RPC kimlik (`auth.uid()`), miktar (`1` / `-3`), alan ve ödül tavanı (`-15`) kontrolü yapıyor |
| `push_tokens` | Sahip bazlı SELECT/INSERT/UPDATE/DELETE politikaları mevcut |

Üç tabloda da RLS açık. Servis anahtarı rotasyonu ve legacy API key geçişi
kullanıcı kararıyla iptal edildi — tekrar gündeme getirilmeyecek.

### 17 Ekim 2026

- Kolon üretiminde isteğe bağlı **önceki kolonlarla çakışmasın** filtresi: bu oturumda üretilen ana sayılar yeni kolona girmez (oyun başına, bellekte). Joker / şans topu / SuperStar serbest. Havuz bitince mesaj; oturum sıfırlanabilir. Kalan kolon tavanı (`havuz / kolon boyutu`) gösterilir; kombinasyon sayısı yok. Lota ve kayıtlı geçmişe dokunulmadı. Filtre açıkken kota diğer filtreler gibi işler.

### 7 Kasım 2026

- **Çakışma filtresi kaldırıldı** (17 Ekim'de eklenen "önceki kolonlarla çakışmasın" ve "oturumu sıfırla"). Kolon Üret filtrelerinde artık yok.
- Kolon sonucundaki eski "TOPLAM · çift / tek" satırı ve ayarları tekrar eden filtre etiketleri kaldırıldı (8 Kas).

### 8 Kasım 2026 — Filtre özeti

- Filtreli kolonda topların altında **yalnızca aktif filtreler** için sonuç etiketi: ✓ 3 çift · 3 tek, ✓ Toplam 143 (120–160), ✓ Ardışık sayı yok / 1 ardışık çift, ✓ 3 ve 40 dahil, ✓ 13 hariç, ✓ Dengeli dağılım. Filtresiz kolonda hiçbir şey yazmaz.
- Hesap `lib/kolonFacts.ts` (`kolonFacts`), görünüm `components/ui/kolon-facts.tsx`. Özet, kolonun üretildiği andaki filtrelerden çıkar (sonradan filtre değişse de doğru kalır). Geçmişten geri yüklenen kolonda özet yok (geçmiş filtre tutmuyor).
- Düzeltme: kota kartındaki "filtresiz devam et" eskiden temizlenmemiş filtrelerle üretip filtreli hak düşüyordu; artık gerçekten filtresiz üretir.
- Zorunlu tutulan sayılar sonuç kartında topun içinde ince bir halkayla işaretlenir (`NumberBall` `ring` prop'u; top boyutu ve aralıklar değişmez, varsayılan kapalı).
- Filtre özeti bilinçli olarak yalnızca Kolon Üret sonuç kartında; geçmiş ve Kaydedilenler'e taşınması denendi, kart kalabalığı nedeniyle geri alındı (8 Kas).

### 8 Kasım 2026 — İstatistik: Tek/Çift

- İstatistik sekmesine beşinci alt sekme **Tek/Çift**: seçili dönemde (Son 10/50/100/Tümü) her tek/çift bileşiminde kaç çekiliş çıktığı, yüzde ve çubukla. Tüm bileşimler listelenir (görülmeyenler 0); en sık olan oyun renginde vurgulanır.
- Yalnızca ana sayılar (Şans Topu +1, SuperStar dahil değil). On Numara'da gösterilmez (çekilişte 22 sayı, kolon 10 sayı) — kısa not çıkar.
- Hesap `lib/drawStats.ts` (`parityDistribution`); Toplam ve Ardışık istatistikleri de aynı dosyada.
- Ücretsiz: Pro planına göre yeni istatistiklerden ilki ücretsiz tanıtım olarak kalır; sonrakiler Pro adayı.

### 8 Kasım 2026 — İstatistik: Toplam

- Altıncı alt sekme **Toplam**: seçili dönemde ana sayı toplamlarının aralıklara göre dağılımı + üstte ortalama toplam. Tek/Çift ile aynı satır görünümü (`DistributionList`).
- Aralıklar oyun başına sabit, tüm geçmiş verisine göre seçildi (her oyunda 9 satır, uçlar birleşik): Çılgın ≤170 / 171–200 … 351–380 / ≥381 (30'luk), Süper Loto ≤120 / 121–140 … 241–260 / ≥261 (20'lik), Şans Topu ≤50 / 51–60 … 111–120 / ≥121 (10'luk). On Numara'da yok.
- Hesap `lib/drawStats.ts` (`sumDistribution`).
- Pro'ya ait; 1.2.0'a kadar `PRO_STATS_ENABLED = false` ile gizli (bkz. 1.1.2).

### 8 Kasım 2026 — İstatistik: Ardışık

- Yedinci alt sekme **Ardışık**: seçili dönemde çekilişlerin kaçında ardışık çift olmadığı / 1 / 2 / 3+ ardışık çift olduğu (5-6 → 1 çift, 5-6-7 → 2 çift; Kolon Üret filtresiyle aynı kural ve dil). Aynı satır görünümü; On Numara'da yok.
- Hesap `lib/drawStats.ts` (`consecutiveDistribution`, `countConsecutivePairs` ortak).
- Pro'ya ait; 1.2.0'a kadar `PRO_STATS_ENABLED = false` ile gizli (bkz. 1.1.2).
- Karar: İstatistiklerden Kolon Üret'e "bu aralıkla kolon üret" bağlantısı **yapılmayacak** — kullanıcı filtreyi Kolon Üret'ten kendisi ayarlar.

### Notlar

Kota davranışı **fail-closed**: sunucu okunamaz ve bugüne ait geçerli cache
yoksa kota dolu sayılıyor (veri silme / uçak modu ile limit atlatmayı engeller).

İngilizce gizlilik politikası maddesi listeden çıkarıldı: ortada eksik bir
İngilizce metin yok, Türkçe metin GDPR ve KVKK'ya açıkça atıf yapıyor ve
uygulama yalnızca Türkiye'de yayında.

`android/` klasörünün git'te görünmemesi sorun değil — `.gitignore`'da, Expo
prebuild ile üretiliyor.

## Çalışma tercihleri

- Kod açıklamaları sade, herkesin anlayabileceği dilde
- Kod değişiklikleri KALDIR / YERİNE YAPIŞTIR formatında (istenirse tam dosya)
- Büyük değişikliklerde önce plan netleşir, sonra kod tek seferde verilir
- Play Console / App Store Connect gibi arayüzlerde adım adım yönlendirme;
  bir adım bitmeden diğerine geçilmez, ekran görüntüsüyle teyit edilir
- Tahmin yerine gerçek kod / veritabanı / build-log durumu doğrulanır
- Web'de bulunan bilgiler eleştirel değerlendirilir (özellikle ticari kaynaklar)
- Güvenlik konularında öneri sunulur, ama kullanıcının risk/emek değerlendirmesine
  saygı gösterilir
