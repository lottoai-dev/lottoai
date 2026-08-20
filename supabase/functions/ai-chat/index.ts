// Supabase Edge Function: ai-chat
// Güvenlik katmanları:
//  1. JWT doğrulaması — yalnızca giriş yapmış kullanıcılar istek atabilir
//  2. İstek boyutu sınırı — şişirilmiş isteklerle maliyet saldırısını engeller
//  3. Günlük token kotası — kullanıcı başına DAILY_TOKEN_LIMIT token/gün;
//     sayım sunucuda (ai_usage_daily tablosu) tutulur, istemci sıfırlayamaz
//  4. DeepSeek timeout (18 sn) — uygulamadaki 20 sn'den kısa, böylece sunucu
//     önce pes edip uygulamaya düzgün bir hata dönebilir

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY")!;
// Bu değişkenler Supabase tarafından her Edge Function'a otomatik sağlanır.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Uygulama artık genel sohbette TÜM oturum geçmişini gönderiyor (bilinçli
// bir karar — "AI unutmasın" istendi, bkz. ai-assistant.tsx). Bu yüzden bu
// sınırlar eski, düşük değerlerinde (15 mesaj / 16.000 karakter) kalırsa,
// normal bir kullanıcı birkaç mesajdan sonra "too_many_messages" ile
// tıkanıyor (yaşanmış bir hataydı — bkz. ai_conversations kayıtları,
// msg_no >= 16 olan her yerde sunucu isteği reddediyordu).
// DeepSeek'in gerçek bağlam penceresi (deepseek-v4-flash)
// bunu rahatça kaldırıyor; buradaki sınırlar hâlâ var ama artık gerçekçi
// bir üst tavan — normal kullanım asla buraya ulaşmaz, sadece gerçekten
// anormal (muhtemelen kötüye kullanım/bug kaynaklı) istekleri engeller.
const MAX_MESSAGES = 200;
const MAX_TOTAL_CHARS = 200000;
const DEEPSEEK_TIMEOUT_MS = 18000;

// Kullanıcı başına günlük token kotası (100.000; prompt + cevap dahil,
// DeepSeek'in bildirdiği total_tokens üzerinden). Premium geldiğinde bu
// sınır kullanıcı planına göre farklılaşacak.
const DAILY_TOKEN_LIMIT = 100000;

/**
 * Kupon üretimi istemci tarafında (adil rastgele algoritma) yapılır.
 * Model yalnızca bu aracı çağırarak niyeti ve kısıtları bildirir — ayrı bir
 * sınıflandırma turuna gerek kalmaz. Şema sunucuda sabit tutulur; istemci
 * keyfi tool enjekte edemez.
 */
const GENERATE_COUPON_TOOL = {
  type: "function",
  function: {
    name: "generate_coupon",
    description:
      "Kullanıcı açıkça kupon/sayı üretmek, hazırlamak veya önermek istediğinde çağır. " +
      "Sayıları sen üretme — uygulama üretir; üretim yöntemini kullanıcıya anlatma. " +
      "Oyun belli değilse gameId'yi atla. " +
      "Kısa onaylar (evet/tamam/oluştur) YALNIZCA önceki asistan mesajı kupon üretimi teklif " +
      "ettiyse çağır; istatistik/bilgi bağlamındaki onaylarda çağırma. Şüphede araç çağırma, sohbet et.",
    parameters: {
      type: "object",
      properties: {
        gameId: {
          type: "string",
          enum: ["cilgin", "superloto", "sanstopu", "onnumara"],
          description:
            "cilgin=Çılgın Sayısal/Sayısal Loto, superloto=Süper Loto, sanstopu=Şans Topu, onnumara=On Numara. Bilinmiyorsa bu alanı yazma.",
        },
        count: {
          type: "integer",
          description: "Kaç kupon istendiği. Belirtilmediyse yazma (varsayılan 1).",
          minimum: 1,
          maximum: 5,
        },
        sumMin: {
          type: "integer",
          description:
            "Toplam alt sınırı — yalnızca kullanıcı açıkça toplam istediğinde. " +
            "'700'den büyük/üzerinde' gibi tek taraflı isteklerde sadece bunu yaz, sumMax yazma " +
            "(uygulama üst sınırı oyunun max toplamına tamamlar). '700'den büyük' → 700.",
        },
        sumMax: {
          type: "integer",
          description:
            "Toplam üst sınırı — yalnızca kullanıcı açıkça toplam istediğinde. " +
            "'200'den küçük/altında' gibi tek taraflı isteklerde sadece bunu yaz, sumMin yazma. " +
            "'200-300 arası' gibi iki taraflı isteklerde ikisini birden yaz.",
        },
        mustInclude: {
          type: "array",
          items: { type: "integer" },
          description: "Mutlaka bulunması istenen tekil sayılar.",
        },
        mustExclude: {
          type: "array",
          items: { type: "integer" },
          description: "Kesinlikle bulunmaması istenen tekil sayılar (aralık için excludeRange kullan).",
        },
        excludeRangeMin: {
          type: "integer",
          description: "Hariç tutulacak aralığın alt sınırı (örn. 1-20 olmasın → 1).",
        },
        excludeRangeMax: {
          type: "integer",
          description: "Hariç tutulacak aralığın üst sınırı.",
        },
        noOverlap: {
          type: "boolean",
          description: "Birden fazla kuponda ortak sayı olmasın isteği.",
        },
        avoidPreviousCoupons: {
          type: "boolean",
          description: "Önceki/kayıtlı kuponlardan farklı olsun isteği.",
        },
        onlyPrimes: {
          type: "boolean",
          description: "Sadece asal sayılar — kullanıcı 'asal' demediyse yazma.",
        },
        onlyEven: {
          type: "boolean",
          description: "Sadece çift sayılar — açıkça istenmediyse yazma.",
        },
        onlyOdd: {
          type: "boolean",
          description: "Sadece tek sayılar — açıkça istenmediyse yazma. onlyEven ile birlikte olmaz.",
        },
        balanceEvenOdd: {
          type: "boolean",
          description: "Çift/tek dengeli olsun isteği.",
        },
        avoidPatterns: {
          type: "boolean",
          description: "Ardışık/sıradan/örüntü olmasın isteği.",
        },
        spreadZones: {
          type: "boolean",
          description: "Sayılar aralığa yayılsın isteği.",
        },
        maxConsecutive: {
          type: "integer",
          description: "En fazla kaç ardışık sayı — yalnızca net sayı söylendiyse.",
        },
      },
    },
  },
};

// "Gün" Türkiye saatine göre hesaplanır (kalıcı UTC+3, yaz saati yok).
function todayInTurkey(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

type AccToolCall = { id: string; name: string; arguments: string };

/** OpenAI uyumlu akış parçalarından tool_calls biriktirir. */
function accumulateToolCallDelta(
  acc: AccToolCall[],
  deltas: Array<{
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }> | undefined,
): void {
  if (!Array.isArray(deltas)) return;
  for (const tc of deltas) {
    const idx = typeof tc.index === "number" ? tc.index : 0;
    if (!acc[idx]) acc[idx] = { id: "", name: "", arguments: "" };
    if (tc.id) acc[idx].id = tc.id;
    if (tc.function?.name) acc[idx].name = tc.function.name;
    if (typeof tc.function?.arguments === "string") {
      acc[idx].arguments += tc.function.arguments;
    }
  }
}

function finalizeToolCalls(acc: AccToolCall[]): AccToolCall[] {
  return acc.filter((t) => t && t.name);
}

/**
 * Kullanımı yazar ve o gün için kalan tokeni döndürür. Yazım başarısız
 * olursa cevap yine kullanıcıya gider (cezalandırma yok), sadece o çağrı
 * sayılmamış olur.
 */
async function recordUsage(
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
  day: string,
  tokensUsedBefore: number,
  totalTokens: number,
): Promise<number> {
  let remaining = Math.max(DAILY_TOKEN_LIMIT - tokensUsedBefore - totalTokens, 0);
  if (totalTokens <= 0) return remaining;

  const { data: newTotal, error } = await admin.rpc("increment_ai_usage", {
    p_user_id: userId,
    p_day: day,
    p_tokens: totalTokens,
  });
  if (error) {
    console.error("[ai-chat] usage increment failed:", error.message);
  } else if (typeof newTotal === "number") {
    remaining = Math.max(DAILY_TOKEN_LIMIT - newTotal, 0);
  }
  return remaining;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- 1. JWT doğrulaması ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    // ---- 2. Günlük token kotası ----
    // Kontrol istek ÖNCESİ yapılır; kullanım yazımı istek SONRASI yapılır.
    // Tek bir istek kotayı bir miktar aşabilir (son istek yarıda kesilmez),
    // bu bilinçli bir tercih — kullanıcı cevabın ortasında cezalandırılmaz.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const day = todayInTurkey();

    const { data: usageRow, error: usageError } = await admin
      .from("ai_usage_daily")
      .select("tokens_used")
      .eq("user_id", user.id)
      .eq("day", day)
      .maybeSingle();

    // Kota okunamazsa isteği engellemek yerine geçiriyoruz: geçici bir DB
    // sorunu tüm kullanıcıların AI'ını kilitlememeli (fail-open).
    if (usageError) {
      console.error("[ai-chat] usage read failed:", usageError.message);
    }
    const tokensUsedToday = usageRow?.tokens_used ?? 0;
    if (tokensUsedToday >= DAILY_TOKEN_LIMIT) {
      return jsonResponse({ error: "quota_exceeded", remaining: 0 }, 429);
    }

    // ---- 3. İstek boyutu kontrolü ----
    const body = await req.json();
    const { messages } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    if (messages.length > MAX_MESSAGES) {
      return jsonResponse({ error: "too_many_messages" }, 400);
    }
    const totalChars = messages.reduce(
      (sum: number, m: { content?: string }) => sum + (m?.content?.length ?? 0),
      0,
    );
    if (totalChars > MAX_TOTAL_CHARS) {
      return jsonResponse({ error: "request_too_large" }, 400);
    }

    // İstemci, sohbet için yaratıcı (temperature yüksek) ya da daha
    // deterministik davranış isteyebilir. Güvenlik için sunucu tarafında
    // makul sınırlar içinde tutulur.
    const temperature = typeof body.temperature === "number"
      ? Math.min(Math.max(body.temperature, 0), 1)
      : 0.7;
    const maxTokens = typeof body.max_tokens === "number"
      ? Math.min(Math.max(Math.floor(body.max_tokens), 50), 1500)
      : 1000;

    // Akış modu: cevap tamamlanmayı beklemeden parça parça iletilir.
    const wantsStream = body.stream === true;

    // Kupon aracı yalnızca istemci açıkça isterse eklenir (sohbet ekranı).
    // Şema sunucuda sabit — istemci kendi tool listesini gönderemez.
    const enableCouponTool = body.enable_coupon_tool === true;
    const tools = enableCouponTool ? [GENERATE_COUPON_TOOL] : undefined;

    // ---- 4. DeepSeek çağrısı (timeout ile) ----
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-v4-flash",
          messages,
          temperature,
          max_tokens: maxTokens,
          ...(tools ? { tools, tool_choice: "auto" } : {}),
          // include_usage: akışın son parçasında token sayımı gelir —
          // kotayı akış modunda da doğru işleyebilmemiz buna bağlı.
          ...(wantsStream ? { stream: true, stream_options: { include_usage: true } } : {}),
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      if ((fetchErr as Error).name === "AbortError") {
        return jsonResponse({ error: "upstream_timeout" }, 504);
      }
      throw fetchErr;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // DeepSeek'in gerçek hatasını hem logla hem cevaba ekle — "502 ama neden?"
      // sorusunu istemci terminalinden bile cevaplanabilir yapar (ör. 402
      // Insufficient Balance, 429 rate limit, 401 geçersiz anahtar).
      let upstreamBody = "";
      try {
        upstreamBody = (await response.text()).slice(0, 300);
      } catch {
        // gövde okunamadıysa status yeterli
      }
      console.error(`[ai-chat] DeepSeek error ${response.status}: ${upstreamBody}`);
      return jsonResponse(
        { error: "upstream_error", upstream_status: response.status, upstream_body: upstreamBody },
        502,
      );
    }

    // ---- 5a. Akış modu ----
    // DeepSeek'in SSE akışını sadeleştiriyoruz: her parça {"delta":"..."},
    // tool çağrıları biriktirilip sonda {"done":true,"tool_calls":[...],"remaining":N}.
    if (wantsStream) {
      const upstream = response.body;
      if (!upstream) {
        return jsonResponse({ error: "upstream_error", upstream_status: 0 }, 502);
      }

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const stream = new ReadableStream({
        async start(controller) {
          const reader = upstream.getReader();
          let buffer = "";
          let totalTokens = 0;
          const toolAcc: AccToolCall[] = [];

          const emit = (payload: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          };

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });

              // Son eleman yarım bir satır olabilir; tamponda bekletilir.
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;
                const payload = trimmed.slice(5).trim();
                if (!payload || payload === "[DONE]") continue;
                try {
                  const chunk = JSON.parse(payload);
                  const usageTokens = Number(chunk.usage?.total_tokens);
                  if (usageTokens > 0) totalTokens = usageTokens;
                  const choiceDelta = chunk.choices?.[0]?.delta;
                  const delta = choiceDelta?.content;
                  if (delta) emit({ delta });
                  accumulateToolCallDelta(toolAcc, choiceDelta?.tool_calls);
                } catch {
                  // Bozuk/yarım parça — akışı kesmeye değmez, atlanır.
                }
              }
            }
          } catch (streamErr) {
            console.error("[ai-chat] stream read failed:", (streamErr as Error).message);
            emit({ error: "stream_interrupted" });
          }

          const remaining = await recordUsage(admin, user.id, day, tokensUsedToday, totalTokens);
          const tool_calls = finalizeToolCalls(toolAcc);
          emit({
            done: true,
            remaining,
            ...(tool_calls.length > 0 ? { tool_calls } : {}),
          });
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          ...corsHeaders,
        },
      });
    }

    // ---- 5b. Tek parça mod ----
    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const reply = message?.content || "";
    const rawTools = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    const tool_calls = rawTools
      .map((tc: { id?: string; function?: { name?: string; arguments?: string } }) => ({
        id: tc.id ?? "",
        name: tc.function?.name ?? "",
        arguments: typeof tc.function?.arguments === "string" ? tc.function.arguments : "",
      }))
      .filter((t: AccToolCall) => t.name);

    // total_tokens = prompt + cevap.
    const totalTokens = Number(data.usage?.total_tokens) || 0;
    const remaining = await recordUsage(admin, user.id, day, tokensUsedToday, totalTokens);

    return jsonResponse({
      reply,
      remaining,
      ...(tool_calls.length > 0 ? { tool_calls } : {}),
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
