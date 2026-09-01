# LottoAI — Proje Durumu

> Son güncelleme: 1 Eylül 2026
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
| Reklam | Google AdMob (ödüllü), NPA modunda — **hesap onayı bekleniyor** |
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
| AdMob | — | Android uygulaması doğrulandı (31 Ağu); reklam sunumu incelemesi sürüyor (2–3 gün) |

### Mağaza hesapları

Apple Developer Program kurulu ve doğrulanmış; Small Business Program onaylı
(15 Ağu 2026, komisyon %15). Google Play üretim erişimi onaylı (kapalı test
9–25 Ağu tamamlandı). Kullanıcı Android'de alpha kanalında beta testçisi olarak
kalıyor, kendi güncellemelerini önce orada test ediyor.

## Bekleyen işler

### Google onayı bekliyor

Android uygulaması 31 Ağustos akşamı `app-ads.txt` ile başarıyla doğrulandı.
Şimdi reklam gösterimine hazır olup olmadığına dair ayrı bir inceleme sürüyor;
2–3 gün sürmesi bekleniyor, o bitene kadar reklam sunumu sınırlı. Sonuç
e-postayla bildirilecek.

iOS uygulaması hâlâ doğrulanmadı — App Store'daki Marketing URL boş olduğu için
AdMob tarayacak alan adı bulamıyor. 1.1.1 ile çözülecek.

AEA / CMP uyarısı bizi ilgilendirmiyor: uygulama yalnızca Türkiye'de yayında ve
reklamlar NPA modunda planlanıyor.

İnceleme olumlu sonuçlanınca: fazladan AdMob kaydını (`ca-app-pub-...~4015509427`) sil,
`ADS_REWARDS_ENABLED` değerini `true` yap, `FREE_DAILY_LIMIT` değerini 3'e
döndür, `admob-ssv` fonksiyonunu dağıt ve dört reklam biriminin SSV alanına
adresini gir.

**Karar (31 Ağu):** 1.1.1 sürümü AdMob incelemesi bitene kadar bekletiliyor;
böylece mağaza metinleri, reklam bayrağı ve hazır düzeltmeler tek sürümde
çıkar. Cuma akşamına kadar onay gelmezse reklamlar 1.1.2'ye bırakılıp 1.1.1
elimizdekilerle yayınlanacak.

### SSV dağıtımı (tamamlandı — 1 Eyl)

`admob-ssv` Edge Function ve `admob_ssv_rewards` tablosu + kota koruma trigger'ı
canlıya alındı. AdMob onayı gelince yalnızca konsol adımı kalır:

1. Dört ödüllü reklam biriminin SSV alanına şu adresi gir:
   `https://tsxzukctomvnyzalgxap.supabase.co/functions/v1/admob-ssv`

### 1.1.1 sürümünde yapılacaklar

Kod tarafı hazır (çıkışta push token temizliği, değerlendirme istemi, **Lota
kaldırıldı**). Yayın öncesi:

1. `app.json` sürümünü `1.1.1` yap, production build al (iOS + Android aynı commit)
2. Supabase'ten canlı `ai-chat` fonksiyonunu sil: `npx supabase functions delete ai-chat`
3. Mağaza metinlerinden Lota / AI asistan bölümlerini çıkar (aşağıdaki tablo)

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
