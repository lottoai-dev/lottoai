// lib/deepseek.ts
// API anahtarı Edge Function'da saklanıyor.
// Kimlik doğrulama: kullanıcının kendi oturum token'ı (JWT) ile yapılır —
// böylece yalnızca giriş yapmış kullanıcılar AI'a erişebilir.
//
// Dayanıklılık:
//  - 20 saniye timeout (sunucudaki 18 sn'den uzun, uyumlu çalışırlar)
//  - Başarısız ilk denemeden sonra sessiz 1 tekrar (kullanıcı fark etmez)
//  - Hata türü döndürülür; arayüz türe göre farklı mesaj gösterebilir

// expo/fetch: React Native'in yerleşik fetch'i akışı (response.body)
// desteklemez; Expo'nun WinterCG uyumlu fetch'i destekler.
import { fetch as expoFetch } from 'expo/fetch';

import { logError } from './logger';
import { supabase } from './supabase';

const AI_FUNCTION_URL = "https://tsxzukctomvnyzalgxap.supabase.co/functions/v1/ai-chat";
const TIMEOUT_MS = 20000;

export type AIErrorType = 'network' | 'timeout' | 'auth' | 'server' | 'quota';

/** Sunucunun SSE / JSON cevabında ilettiği ham tool çağrısı. */
export type AIToolCallRaw = {
  id?: string;
  name: string;
  /** JSON string — henüz parse edilmemiş. */
  arguments: string;
};

export type AIToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type AIResult = {
  reply: string | null;
  errorType?: AIErrorType;
  /** Sunucunun bildirdiği, o gün için kalan token. Yalnızca başarılı
   *  çağrılarda dolar; 0 ise bir sonraki istek kotaya takılacak demektir. */
  remaining?: number;
  /** Model generate_coupon vb. bir araç çağırdıysa burada döner. */
  toolCalls?: AIToolCall[];
};

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

type ChatOptions = {
  /** 0 (kararlı/deterministik) ile 1 (yaratıcı) arası. Belirtilmezse sunucu varsayılanı (0.7) kullanılır. */
  temperature?: number;
  maxTokens?: number;
  /** true ise sunucu generate_coupon tool şemasını DeepSeek'e ekler. */
  enableCouponTool?: boolean;
};

function parseToolCalls(raw: unknown): AIToolCall[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const parsed: AIToolCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const name = typeof (item as AIToolCallRaw).name === 'string' ? (item as AIToolCallRaw).name : '';
    if (!name) continue;
    const argStr = typeof (item as AIToolCallRaw).arguments === 'string'
      ? (item as AIToolCallRaw).arguments
      : '';
    let args: Record<string, unknown> = {};
    if (argStr.trim()) {
      try {
        const value = JSON.parse(argStr);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          args = value as Record<string, unknown>;
        }
      } catch {
        logError('parseToolCalls', new Error(`Unparseable tool args for ${name}: ${argStr.slice(0, 120)}`));
      }
    }
    parsed.push({ name, arguments: args });
  }
  return parsed.length > 0 ? parsed : undefined;
}

function hasUsefulResult(result: AIResult): boolean {
  return Boolean(result.reply || (result.toolCalls && result.toolCalls.length > 0));
}

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
        ...(options?.enableCouponTool ? { enable_coupon_tool: true } : {}),
      }),
      signal: controller.signal,
    });

    if (response.status === 401) {
      return { reply: null, errorType: 'auth' };
    }
    // 429: günlük token kotası doldu (sunucuda kullanıcı başına sayılıyor).
    if (response.status === 429) {
      return { reply: null, errorType: 'quota' };
    }
    if (!response.ok) {
      // Sunucu 502'de DeepSeek'in gerçek status/mesajını da gönderiyor —
      // logda görünsün ki "502 ama neden?" tek bakışta anlaşılsın.
      let detail = '';
      try {
        const errBody = await response.json();
        if (errBody?.upstream_status) {
          detail = ` (upstream ${errBody.upstream_status}: ${errBody.upstream_body ?? ''})`;
        }
      } catch {
        // gövde JSON değilse status yeterli
      }
      logError('chatWithAI', new Error(`Edge Function returned ${response.status}${detail}`));
      return { reply: null, errorType: 'server' };
    }

    const data = await response.json();
    return {
      reply: data.reply || null,
      remaining: typeof data.remaining === 'number' ? data.remaining : undefined,
      toolCalls: parseToolCalls(data.tool_calls),
    };
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
  if (hasUsefulResult(first)) return first;

  // Oturum ve kota hatalarında tekrar denemek anlamsız (aynı sonuç döner).
  if (first.errorType === 'auth' || first.errorType === 'quota') return first;

  // Sessiz tek tekrar — geçici ağ/sunucu sorunlarının çoğunu görünmeden çözer.
  return callOnce(messages, session.access_token, options);
}

/* ─────────────────────────────── akış (streaming) ─────────────────────────────── */
// Cevabın tamamlanmasını beklemek yerine parçaları geldikçe göstermek, ilk
// kelimenin ekrana gelme süresini saniyelerce öne çeker. Sunucu (ai-chat)
// bize sadeleştirilmiş bir SSE gönderir: her satır `data: {"delta":"..."}`,
// en sonda `data: {"done":true,"remaining":N}`.

/** İlk parçaya kadar beklenen süre; sunucudaki 18 sn ile uyumlu. */
const STREAM_FIRST_CHUNK_TIMEOUT_MS = 20000;
/** İki parça arası kabul edilen en uzun sessizlik — akış donarsa kurtarır. */
const STREAM_IDLE_TIMEOUT_MS = 15000;

/**
 * Byte parçalarını UTF-8 metne çevirir. Bir parçanın sonunda yarım kalan
 * çok baytlı karakter (Türkçe'de sık: ğ, ş, ı...) bir sonraki parçaya
 * devredilir; aksi halde ekranda bozuk karakter belirir.
 *
 * TextDecoder her React Native sürümünde global olarak bulunmadığı için
 * varsa o kullanılır, yoksa elle çözen yedek devreye girer.
 */
function createUtf8Decoder(): (bytes: Uint8Array) => string {
  const NativeDecoder = (globalThis as { TextDecoder?: new (label?: string) => { decode: (input: Uint8Array, opts?: { stream?: boolean }) => string } }).TextDecoder;
  if (NativeDecoder) {
    const decoder = new NativeDecoder('utf-8');
    return (bytes) => decoder.decode(bytes, { stream: true });
  }

  let pending: number[] = [];
  return (bytes) => {
    const all = pending.length ? [...pending, ...Array.from(bytes)] : Array.from(bytes);

    // Sondan geriye doğru en fazla 4 bayt tarayıp yarım kalan diziyi bul.
    let end = all.length;
    for (let i = all.length - 1, steps = 0; i >= 0 && steps < 4; i--, steps++) {
      const byte = all[i];
      if (byte < 0x80) break; // tek baytlık karakter, dizi tam
      if ((byte & 0xc0) === 0x80) continue; // devam baytı, başını aramaya devam
      const needed = (byte & 0xe0) === 0xc0 ? 2 : (byte & 0xf0) === 0xe0 ? 3 : (byte & 0xf8) === 0xf0 ? 4 : 1;
      if (all.length - i < needed) end = i;
      break;
    }
    pending = all.slice(end);

    let out = '';
    for (let i = 0; i < end;) {
      const byte = all[i];
      let codePoint: number;
      if (byte < 0x80) {
        codePoint = byte;
        i += 1;
      } else if ((byte & 0xe0) === 0xc0) {
        codePoint = ((byte & 0x1f) << 6) | (all[i + 1] & 0x3f);
        i += 2;
      } else if ((byte & 0xf0) === 0xe0) {
        codePoint = ((byte & 0x0f) << 12) | ((all[i + 1] & 0x3f) << 6) | (all[i + 2] & 0x3f);
        i += 3;
      } else {
        codePoint = ((byte & 0x07) << 18) | ((all[i + 1] & 0x3f) << 12) | ((all[i + 2] & 0x3f) << 6) | (all[i + 3] & 0x3f);
        i += 4;
      }
      out += String.fromCodePoint(codePoint);
    }
    return out;
  };
}

type StreamOnceResult = AIResult & {
  /** Ekrana en az bir parça yazıldı mı — yazıldıysa sessiz tekrar yapılamaz
   *  (kullanıcı metnin baştan yeniden yazılmasını görürdü). */
  streamed: boolean;
};

async function streamOnce(
  messages: ChatMsg[],
  accessToken: string,
  onDelta: (fullText: string) => void,
  options?: ChatOptions,
): Promise<StreamOnceResult> {
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), STREAM_FIRST_CHUNK_TIMEOUT_MS);
  const resetIdleTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);
  };

  let fullText = '';
  let streamed = false;
  let remaining: number | undefined;
  let toolCalls: AIToolCall[] | undefined;

  /** Sunucudan gelen ham metni satır satır işler; yarım satırı geri döndürür. */
  const consume = (chunk: string, carry: string): string => {
    const lines = (carry + chunk).split('\n');
    const leftover = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      try {
        const event = JSON.parse(payload);
        if (typeof event.delta === 'string') {
          fullText += event.delta;
          streamed = true;
          onDelta(fullText);
        } else if (event.done) {
          if (typeof event.remaining === 'number') remaining = event.remaining;
          toolCalls = parseToolCalls(event.tool_calls);
        }
      } catch {
        // Bozuk parça — akışı kesmeye değmez.
      }
    }
    return leftover;
  };

  try {
    const response = await expoFetch(AI_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messages,
        stream: true,
        ...(options?.temperature != null ? { temperature: options.temperature } : {}),
        ...(options?.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
        ...(options?.enableCouponTool ? { enable_coupon_tool: true } : {}),
      }),
      signal: controller.signal,
    });

    if (response.status === 401) return { reply: null, errorType: 'auth', streamed };
    if (response.status === 429) return { reply: null, errorType: 'quota', streamed };
    if (!response.ok) {
      logError('chatWithAIStream', new Error(`Edge Function returned ${response.status}`));
      return { reply: null, errorType: 'server', streamed };
    }

    const body = response.body;
    if (!body) {
      // Akış desteklenmiyorsa gövde tek parça gelir; aynı ayrıştırıcıyla
      // okunur — kullanıcı sadece canlı yazma efektini kaçırır, cevabı alır.
      consume(await response.text(), '');
      return { reply: fullText || null, remaining, streamed, toolCalls };
    }

    const reader = body.getReader();
    const decode = createUtf8Decoder();
    let carry = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdleTimer();
      if (value) carry = consume(decode(value), carry);
    }

    return { reply: fullText || null, remaining, streamed, toolCalls };
  } catch (err) {
    // Yarıda kesilse bile eldeki metni döndürüyoruz: kullanıcı zaten okumaya
    // başlamıştı, onu silip hata göstermek daha kötü bir deneyim olurdu.
    if (fullText || toolCalls?.length) {
      return { reply: fullText || null, remaining, streamed, toolCalls };
    }
    if ((err as Error)?.name === 'AbortError') {
      return { reply: null, errorType: 'timeout', streamed };
    }
    logError('chatWithAIStream', err);
    return { reply: null, errorType: 'network', streamed };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * chatWithAI'ın akışlı sürümü: cevabı beklerken `onDelta` her yeni parçada
 * o ana kadarki TAM metinle çağrılır. Dönen sonuç chatWithAI ile aynıdır.
 */
export async function chatWithAIStream(
  messages: ChatMsg[],
  onDelta: (fullText: string) => void,
  options?: ChatOptions,
): Promise<AIResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { reply: null, errorType: 'auth' };
  }

  const first = await streamOnce(messages, session.access_token, onDelta, options);
  if (hasUsefulResult(first)) return first;
  if (first.errorType === 'auth' || first.errorType === 'quota') return first;

  // Hiç parça / tool gösterilmediyse sessiz tek tekrar güvenli.
  return streamOnce(messages, session.access_token, onDelta, options);
}

import { stripMarkdown } from './stripMarkdown';

export { stripMarkdown };

/* ─────────────────────────── kupon tool argümanları ─────────────────────────── */

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

/** generate_coupon tool argümanlarını CouponIntent'e çevirir. */
export function couponIntentFromToolArgs(args: Record<string, unknown>): CouponIntent {
  return normalizeCouponIntent({ ...args, intent: 'generate_coupon' });
}

/** AIResult içinden ilk generate_coupon çağrısını çıkarır. */
export function extractCouponToolIntent(result: AIResult): CouponIntent | null {
  const call = result.toolCalls?.find((t) => t.name === 'generate_coupon');
  if (!call) return null;
  return couponIntentFromToolArgs(call.arguments);
}