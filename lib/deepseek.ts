// lib/deepseek.ts
// API anahtarı Edge Function'da saklanıyor.
// Kimlik doğrulama: kullanıcının kendi oturum token'ı (JWT) ile yapılır —
// böylece yalnızca giriş yapmış kullanıcılar AI'a erişebilir.
//
// Dayanıklılık:
//  - 20 saniye timeout (sunucudaki 18 sn'den uzun, uyumlu çalışırlar)
//  - Başarısız ilk denemeden sonra sessiz 1 tekrar (kullanıcı fark etmez)
//  - Hata türü döndürülür; arayüz türe göre farklı mesaj gösterebilir

import { logError } from './logger';
import { supabase } from './supabase';

const AI_FUNCTION_URL = "https://tsxzukctomvnyzalgxap.supabase.co/functions/v1/ai-chat";
const TIMEOUT_MS = 20000;

export type AIErrorType = 'network' | 'timeout' | 'auth' | 'server';

export type AIResult = {
  reply: string | null;
  errorType?: AIErrorType;
};

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

type ChatOptions = {
  /** 0 (kararlı/deterministik) ile 1 (yaratıcı) arası. Belirtilmezse sunucu varsayılanı (0.7) kullanılır. */
  temperature?: number;
  maxTokens?: number;
};

async function callOnce(
  messages: ChatMsg[],
  accessToken: string,
  options?: ChatOptions
): Promise<AIResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(AI_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messages,
        ...(options?.temperature != null ? { temperature: options.temperature } : {}),
        ...(options?.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
      }),
      signal: controller.signal,
    });

    if (response.status === 401) {
      return { reply: null, errorType: 'auth' };
    }
    if (!response.ok) {
      logError('chatWithAI', new Error(`Edge Function returned ${response.status}`));
      return { reply: null, errorType: 'server' };
    }

    const data = await response.json();
    return { reply: data.reply || null };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return { reply: null, errorType: 'timeout' };
    }
    logError('chatWithAI', err);
    return { reply: null, errorType: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

export async function chatWithAI(messages: ChatMsg[], options?: ChatOptions): Promise<AIResult> {
  // Kullanıcının oturum token'ını al — Supabase istemcisi süresi dolan
  // token'ı burada otomatik olarak yeniler.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { reply: null, errorType: 'auth' };
  }

  const first = await callOnce(messages, session.access_token, options);
  if (first.reply) return first;

  // Oturum hatasında tekrar denemek anlamsız (aynı token, aynı sonuç).
  if (first.errorType === 'auth') return first;

  // Sessiz tek tekrar — geçici ağ/sunucu sorunlarının çoğunu görünmeden çözer.
  return callOnce(messages, session.access_token, options);
}

import { stripMarkdown } from './stripMarkdown';

export { stripMarkdown };

/* ─────────────────────────── kupon niyeti sınıflandırma ─────────────────────────── */

export type CouponIntent = {
  intent: 'chat' | 'generate_coupon';
  gameId: 'cilgin' | 'superloto' | 'sanstopu' | 'onnumara' | null;
  /** Kaç kupon isteniyor. Belirtilmediyse null (arayüz 1 kabul eder). */
  count: number | null;
  /** Kullanıcı 5'ten fazla kupon istediyse (ör. "1000 tane kupon üret"),
   *  liste sessizce kırpılmaz — burada orijinal (kırpılmadan önceki) sayı
   *  tutulur ki arayüz kullanıcıyı bilgilendirebilsin. Kırpma olmadıysa
   *  null. (mustInclude/mustExclude'daki aynı desenin count karşılığı —
   *  gerçek bir kullanıcı sohbetinde bu uyarının eksikliği kafa karışıklığı
   *  yaratmıştı: "1000 istedim, 5 üretti" şikayeti.) */
  countRequestedRaw: number | null;
  sumMin: number | null;
  sumMax: number | null;
  /** Mutlaka bulunması istenen sayılar. Ör: "37 mutlaka olsun". */
  mustInclude: number[] | null;
  /** Kesinlikle bulunmaması istenen sayılar. Ör: "13 olmasın". */
  mustExclude: number[] | null;
  /** "1 ile 20 arası olmasın" gibi bir ARALIĞIN tamamen hariç tutulması
   *  istendiğinde kullanılır — mustExclude'a tek tek 20 sayı yazdırmak yerine
   *  (hem token israfı hem de dizi sınırına takılma riski var) bu iki sayı
   *  yeterlidir. */
  excludeRangeMin: number | null;
  excludeRangeMax: number | null;
  /** Kullanıcı mustInclude/mustExclude için 30'dan fazla TEKİL sayı yazdıysa,
   *  liste sessizce kırpılmaz — burada orijinal (kırpılmadan önceki) sayı
   *  adedi tutulur ki arayüz kullanıcıyı bilgilendirebilsin. Kırpma
   *  olmadıysa null. */
  mustIncludeTruncatedFrom: number | null;
  mustExcludeTruncatedFrom: number | null;
  /** Birden fazla kupon isteniyorsa, aralarında hiç ortak sayı olmasın. */
  noOverlap: boolean | null;
  /** Kullanıcının daha önce kaydettiği kuponlardan tamamen farklı olsun. */
  avoidPreviousCoupons: boolean | null;
  /** Kupon sadece asal sayılardan oluşsun. */
  onlyPrimes: boolean | null;
  /** Kupon sadece çift sayılardan oluşsun. */
  onlyEven: boolean | null;
  /** Kupon sadece tek sayılardan oluşsun. */
  onlyOdd: boolean | null;
  /** Çift/tek dengesi istensin mi. */
  balanceEvenOdd: boolean | null;
  /** Bariz desenlerden (1-2-3-4-5-6, hepsi aynı son hane vb.) kaçınılsın mı. */
  avoidPatterns: boolean | null;
  /** Sayılar oyunun aralığına yayılsın mı (hepsi birbirine yakın olmasın). */
  spreadZones: boolean | null;
  /** En fazla kaç ardışık sayıya izin verilsin. */
  maxConsecutive: number | null;
};

const VALID_GAME_IDS = ['cilgin', 'superloto', 'sanstopu', 'onnumara'] as const;

type SanitizedArray = { list: number[] | null; truncatedFrom: number | null };

function sanitizeNumberArray(value: unknown, maxItems = 30): SanitizedArray {
  if (!Array.isArray(value)) return { list: null, truncatedFrom: null };
  const nums = value
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0 && Number.isInteger(v));
  if (nums.length === 0) return { list: null, truncatedFrom: null };
  if (nums.length > maxItems) {
    return { list: nums.slice(0, maxItems), truncatedFrom: nums.length };
  }
  return { list: nums, truncatedFrom: null };
}

type SanitizedCount = { count: number | null; requestedRaw: number | null };

function sanitizeCount(value: unknown): SanitizedCount {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return { count: null, requestedRaw: null };
  const CAP = 5; // makul üst sınır — kötüye kullanımı ve UI şişmesini önler
  if (n > CAP) return { count: CAP, requestedRaw: n };
  return { count: n, requestedRaw: null };
}

function sanitizePositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

/**
 * sumMin/sumMax için özel sağlamlaştırıcı. Bir kuponun toplamı gerçekte
 * ASLA 0 olamaz (en düşük olası toplam bile her zaman pozitiftir) — yani
 * "0" değeri, kullanıcının gerçekten istediği bir şey değil, sınıflandırıcı
 * modelin (prompta rağmen) UYDURDUĞU bir varsayılan değerdir. Gerçek bir
 * vakada tam olarak bu yaşandı: kullanıcı "toplam" kelimesini hiç
 * kullanmadığı halde model sumMin:0, sumMax:0 üretti, sistem de kullanıcıya
 * hiç istenmeyen bir "toplamı 0-0 olan kupon imkansız" mesajı gösterdi. Bu
 * fonksiyon, 0 (ya da altı) gelen değerleri sessizce null'a çevirerek bu
 * sınıfın tekrarını koddan da engeller — sadece prompt talimatına güvenmiyoruz.
 */
function sanitizeSumBound(value: unknown): number | null {
  const n = sanitizePositiveInt(value);
  if (n === null || n === 0) return null;
  return n;
}

function sanitizeBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function normalizeCouponIntent(parsed: Record<string, unknown>): CouponIntent {
  const intent = parsed.intent === 'generate_coupon' ? 'generate_coupon' : 'chat';
  const gameId = VALID_GAME_IDS.includes(parsed.gameId as (typeof VALID_GAME_IDS)[number])
    ? (parsed.gameId as CouponIntent['gameId'])
    : null;

  const mustIncludeResult = sanitizeNumberArray(parsed.mustInclude);
  const mustExcludeResult = sanitizeNumberArray(parsed.mustExclude);
  const countResult = sanitizeCount(parsed.count);

  return {
    intent,
    gameId,
    count: countResult.count,
    countRequestedRaw: countResult.requestedRaw,
    sumMin: sanitizeSumBound(parsed.sumMin),
    sumMax: sanitizeSumBound(parsed.sumMax),
    mustInclude: mustIncludeResult.list,
    mustExclude: mustExcludeResult.list,
    mustIncludeTruncatedFrom: mustIncludeResult.truncatedFrom,
    mustExcludeTruncatedFrom: mustExcludeResult.truncatedFrom,
    excludeRangeMin: sanitizePositiveInt(parsed.excludeRangeMin),
    excludeRangeMax: sanitizePositiveInt(parsed.excludeRangeMax),
    noOverlap: sanitizeBool(parsed.noOverlap),
    avoidPreviousCoupons: sanitizeBool(parsed.avoidPreviousCoupons),
    onlyPrimes: sanitizeBool(parsed.onlyPrimes),
    onlyEven: sanitizeBool(parsed.onlyEven),
    onlyOdd: sanitizeBool(parsed.onlyOdd),
    balanceEvenOdd: sanitizeBool(parsed.balanceEvenOdd),
    avoidPatterns: sanitizeBool(parsed.avoidPatterns),
    spreadZones: sanitizeBool(parsed.spreadZones),
    maxConsecutive: sanitizePositiveInt(parsed.maxConsecutive),
  };
}

/** Metin içinden dengeli süslü parantez bloğu çıkarır. */
function extractBalancedJsonObject(text: string): string | null {
  const codeBlock = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (codeBlock) return codeBlock[1].trim();

  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** JSON bozuk olsa bile temel intent/gameId alanlarını gevşek eşleşmeyle okur. */
function parseCouponIntentLoose(text: string): CouponIntent | null {
  const intentMatch = text.match(/"intent"\s*:\s*"(chat|generate_coupon)"/i);
  if (!intentMatch) return null;

  const gameMatch = text.match(/"gameId"\s*:\s*"(cilgin|superloto|sanstopu|onnumara)"/i);

  return normalizeCouponIntent({
    intent: intentMatch[1],
    gameId: gameMatch ? gameMatch[1] : null,
  });
}

function parseCouponIntentReply(reply: string): CouponIntent | null {
  const trimmed = reply.trim();
  if (!trimmed) return null;

  try {
    return normalizeCouponIntent(JSON.parse(trimmed) as Record<string, unknown>);
  } catch {
    // Tam metin JSON değilse süslü parantez bloğunu dene.
  }

  const jsonText = extractBalancedJsonObject(trimmed);
  if (jsonText) {
    try {
      return normalizeCouponIntent(JSON.parse(jsonText) as Record<string, unknown>);
    } catch {
      // JSON bloğu bozuksa gevşek ayrıştırmaya düş.
    }
  }

  return parseCouponIntentLoose(trimmed);
}

type IntentContextMessage = { role: 'user' | 'assistant'; content: string };

export async function classifyCouponIntent(
  content: string,
  recentContext?: IntentContextMessage[]
): Promise<CouponIntent | null> {
  const messages: ChatMsg[] = [
    {
      role: 'system',
      content: `Kullanıcının LottoAI asistanına yazdığı son mesajı sınıflandır. Önceki sohbet bağlam olarak verilmiştir.

Yanıtın YALNIZCA tek satır JSON olmalı. Başka hiçbir karakter, açıklama veya markdown ekleme.

Şema:
{"intent":"chat"|"generate_coupon","gameId":"cilgin"|"superloto"|"sanstopu"|"onnumara"|null,"count":number|null,"sumMin":number|null,"sumMax":number|null,"mustInclude":number[]|null,"mustExclude":number[]|null,"excludeRangeMin":number|null,"excludeRangeMax":number|null,"noOverlap":boolean|null,"avoidPreviousCoupons":boolean|null,"onlyPrimes":boolean|null,"onlyEven":boolean|null,"onlyOdd":boolean|null,"balanceEvenOdd":boolean|null,"avoidPatterns":boolean|null,"spreadZones":boolean|null,"maxConsecutive":number|null}

Alan açıklamaları:
- count: kaç kupon istendiği. Ör: "5 tane kupon üret" -> 5. Belirtilmediyse null.
- sumMin/sumMax: "toplamı 250 ile 300 arasında olsun" gibi açık bir istek varsa doldur, yoksa null.
- mustInclude: "37 mutlaka olsun", "içinde 7 olsun" gibi isteklerde belirtilen TEKİL sayılar.
- mustExclude: "13 olmasın", "7 hariç" gibi isteklerde belirtilen TEKİL (birkaç taneyi geçmeyen)
  sayılar. Genel/kategorik isteklerde ("çift sayı olmasın" gibi) bu alanı kullanma, boş bırak.
- excludeRangeMin/excludeRangeMax: "1 ile 20 arasındaki sayılar olmasın", "50'den büyük olmasın"
  gibi bir ARALIĞIN TAMAMEN hariç tutulması istendiğinde doldur. Bu durumda mustExclude'a bu
  aralıktaki sayıları TEK TEK YAZMA, sadece excludeRangeMin ve excludeRangeMax'ı doldur.
- noOverlap: birden fazla kupon isteniyorsa VE "hepsi farklı olsun", "ortak sayı olmasın" gibi
  bir istek varsa true.
- avoidPreviousCoupons: "önceki kuponlarımdan farklı olsun", "daha önce çıkanlardan olmasın",
  "hiç tekrar etmesin", "geçmişte ürettiklerinden farklı olsun" gibi bir istek varsa true.
- onlyPrimes: "sadece asal sayılardan olsun", "asal sayılar olsun" gibi AÇIK bir istek varsa true.
  Kullanıcı "asal" kelimesini kullanmadıysa bu alanı doldurma.
- onlyEven: "sadece çift sayılardan olsun", "hepsi çift olsun" gibi AÇIK bir istek varsa true.
  Kullanıcı "çift" kelimesini kullanmadıysa bu alanı doldurma.
- onlyOdd: "sadece tek sayılardan olsun", "hepsi tek olsun" gibi AÇIK bir istek varsa true.
  Kullanıcı "tek" kelimesini kullanmadıysa bu alanı doldurma. onlyEven ve onlyOdd AYNI ANDA true
  olamaz (kullanıcı ikisini birden istemez, biri true ise diğeri null kalmalı).
- balanceEvenOdd: "çift tek dengeli olsun" gibi kategorik bir istekte true.
- avoidPatterns: "ardışık olmasın", "sıra takip etmesin", "sıradan görünmesin" gibi isteklerde true.
- spreadZones: "sayılar aralığa yayılsın", "birbirine yakın olmasın" gibi isteklerde true.
- maxConsecutive: "en fazla 2 ardışık sayı olsun" gibi NET bir sayı belirtilmişse doldur.

Belirtilmeyen her alan için null kullan. Boolean alanları yalnızca açıkça istenmişse true yap,
hiçbir zaman false yazma (false yerine null kullan).

ÇOK ÖNEMLİ: sumMin, sumMax, maxConsecutive gibi sayısal alanları ASLA tahmin etme veya "makul bir
değer" uydurma. Kullanıcı "toplam", "aralık" gibi bir kelime kullanmadıysa sumMin/sumMax kesinlikle
null olmalı. Kullanıcı "ardışık" kelimesini kullanmadıysa maxConsecutive kesinlikle null olmalı.
Sadece kullanıcının AÇIKÇA yazdığı sayıları/isteği yansıt, kendi fikrini ekleme.
Örnek: kullanıcı "geçmişteki uygun kombinasyonlara göre bir kupon üret" derse — bu "toplam" veya
"aralık" kelimesi İÇERMEZ, bu yüzden sumMin ve sumMax MUTLAKA null olmalı. sumMin:0, sumMax:0 gibi
bir değer YAZMA — 0 hiçbir zaman gerçek bir toplam olamaz, böyle bir şey görürsen bu senin bir
hatan olur, kesinlikle üretme.

Diğer kurallar:
- Kullanıcı açıkça kupon/sayı üretmek, hazırlamak, çıkarmak veya önermek istiyorsa intent "generate_coupon" olsun.
- "Oluştur", "Evet", "Yap", "Tamam" gibi kısa onaylar SADECE şu durumda intent "generate_coupon"
  olsun: bir önceki ASİSTAN mesajı açıkça bir KUPON ÜRETİMİ teklif ediyorsa (örn. "kupon üretmemi
  ister misin?", "sana bir kupon hazırlayayım mı?", "deneyelim mi?" bir kupon bağlamında).
  Eğer önceki asistan mesajı sadece istatistik gösteriyor, genel bir soru soruyor ("ilginç değil
  mi?", "bakalım mı?" gibi istatistik/bilgi bağlamında) veya kupon üretimiyle İLGİSİZ bir konuda
  onay istiyorsa, kısa "evet/tamam" gibi cevaplar intent "chat" kalmalı. Şüpheye düşersen "chat"
  seç — yanlışlıkla istenmeyen bir kupon üretmek, kullanıcıyı üretmemekten daha kötü bir deneyimdir.
- Kullanıcı oyun kuralları, farklar, istatistikler, "nasıl", "nedir", "ne demek" gibi bilgi soruyorsa intent "chat" olsun.
- Mesajda "üretmek" kelimesi geçmesi tek başına kupon isteği değildir.
- Oyun adı son mesajda veya önceki sohbette geçiyorsa gameId doldur; hiçbir yerde geçmiyorsa null bırak.
- Önceki mesajlarda tek bir oyun konuşuluyorsa ve kullanıcı kupon istiyorsa gameId'yi o oyuna ayarla.
- Çılgın Sayısal, Çılgın Loto veya Sayısal Loto için gameId "cilgin".
- Süper Loto için "superloto", Şans Topu için "sanstopu", On Numara için "onnumara".`,
    },
    ...(recentContext ?? []).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content },
  ];

  // Sınıflandırma bir JSON şeması doldurma görevi — yaratıcılık burada
  // istenmez, düşük temperature ile daha tutarlı/kararlı sonuç alınır.
  // maxTokens büyütüldü: mustInclude/mustExclude artık 30 sayıya kadar
  // liste tutabiliyor, JSON cevabının yarıda kesilmemesi için pay bırakıldı.
  const result = await chatWithAI(messages, { temperature: 0.1, maxTokens: 700 });
  if (!result.reply) return null;

  const parsed = parseCouponIntentReply(result.reply);
  if (!parsed) {
    logError('classifyCouponIntent', new Error(`Unparseable intent reply: ${result.reply.slice(0, 120)}`));
  }
  return parsed;
}