// Lota AI: kolon crypto ile uretilir; DeepSeek yalnizca profesyonel istatistik yorumu yazar.
// API anahtari DEEPSEEK_API_KEY secret'inda; istemciye gitmez.
// verify_jwt = true — sadece giris yapmis kullanici cagirabilir.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type GameSpec = {
  id: string;
  name: string;
  count: number;
  max: number;
  bonus: { count: number; max: number } | null;
  superStar: { max: number } | null;
};

const GAMES: Record<string, GameSpec> = {
  cilgin: {
    id: "cilgin",
    name: "Çılgın Sayısal Loto",
    count: 6,
    max: 90,
    bonus: null,
    superStar: { max: 90 },
  },
  superloto: {
    id: "superloto",
    name: "Süper Loto",
    count: 6,
    max: 60,
    bonus: null,
    superStar: null,
  },
  sanstopu: {
    id: "sanstopu",
    name: "Şans Topu",
    count: 5,
    max: 34,
    bonus: { count: 1, max: 14 },
    superStar: null,
  },
  onnumara: {
    id: "onnumara",
    name: "On Numara",
    count: 10,
    max: 80,
    bonus: null,
    superStar: null,
  },
};

type CouponResult = {
  numbers: number[];
  bonus: number[];
  superStar?: number;
};

type CouponStats = {
  even: number;
  odd: number;
  low: number;
  high: number;
  sum: number;
  expectedSum: number;
  span: number;
  consecutivePairs: number;
  mid: number;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomInt(max: number): number {
  if (max <= 0) throw new Error("invalid max");
  const limit = 0x100000000 - (0x100000000 % max);
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return (buf[0] % max) + 1;
  }
}

function pickUnique(count: number, max: number): number[] {
  if (count > max) throw new Error("count > max");
  const picked = new Set<number>();
  while (picked.size < count) picked.add(randomInt(max));
  return [...picked].sort((a, b) => a - b);
}

function generateCoupon(game: GameSpec): CouponResult {
  const numbers = pickUnique(game.count, game.max);
  const bonus = game.bonus ? pickUnique(game.bonus.count, game.bonus.max) : [];
  if (game.superStar) {
    return { numbers, bonus, superStar: randomInt(game.superStar.max) };
  }
  return { numbers, bonus };
}

function computeStats(numbers: number[], max: number): CouponStats {
  const mid = Math.ceil(max / 2);
  let even = 0;
  let odd = 0;
  let low = 0;
  let high = 0;
  let consecutivePairs = 0;
  for (let i = 0; i < numbers.length; i++) {
    const n = numbers[i];
    if (n % 2 === 0) even++;
    else odd++;
    if (n <= mid) low++;
    else high++;
    if (i > 0 && numbers[i] === numbers[i - 1] + 1) consecutivePairs++;
  }
  const sum = numbers.reduce((a, b) => a + b, 0);
  // Uniform without-replacement: E[sum] = count * (max + 1) / 2
  const expectedSum = Math.round((numbers.length * (max + 1)) / 2);
  return {
    even,
    odd,
    low,
    high,
    sum,
    expectedSum,
    span: numbers[numbers.length - 1] - numbers[0],
    consecutivePairs,
    mid,
  };
}

function formatConsecutive(numbers: number[]): string {
  const pairs: string[] = [];
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] === numbers[i - 1] + 1) {
      pairs.push(`${numbers[i - 1]}-${numbers[i]}`);
    }
  }
  return pairs.length ? pairs.join(", ") : "yok";
}

const MIN_DRAWS_FOR_STATS = 10;

function parseDrawNumbers(str: string, max: number): number[] {
  return str
    .split(/[-–,]/)
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= max);
}

function theoreticalExpectedSum(count: number, max: number): number {
  return Math.round((count * (max + 1)) / 2);
}

/** Geçmiş çekilişlerde ana havuz sayılarının toplam ortalaması (bonus ayrı tutulmaz; max ile filtrelenir). */
function computeDrawSumAverage(
  drawRows: { numbers: string }[],
  max: number,
  minNumbersPerDraw = 1,
): number | null {
  if (drawRows.length < MIN_DRAWS_FOR_STATS) return null;
  const sums: number[] = [];
  for (const row of drawRows) {
    const nums = parseDrawNumbers(row.numbers, max);
    if (nums.length < minNumbersPerDraw) continue;
    sums.push(nums.reduce((a, b) => a + b, 0));
  }
  if (sums.length < MIN_DRAWS_FOR_STATS) return null;
  return Math.round(sums.reduce((a, b) => a + b, 0) / sums.length);
}

type AverageInfo = {
  /** Kolon toplamıyla karşılaştırılan ortalama */
  couponAvg: number;
  couponAvgSource: "historical" | "theoretical";
  /** On Numara: çekilişteki 22 sayının toplam ortalaması */
  onNumaraDrawAvg: number | null;
};

function resolveAverages(
  game: GameSpec,
  drawRows: { numbers: string }[],
): AverageInfo {
  const theoreticalCoupon = theoreticalExpectedSum(game.count, game.max);

  if (game.id === "onnumara") {
    // Kolon 10 sayı → teorik 405; çekiliş 22 sayı → geçmiş ortalama (yoksa 891)
    const histDrawAvg = computeDrawSumAverage(drawRows, game.max, 15);
    return {
      couponAvg: theoreticalCoupon,
      couponAvgSource: "theoretical",
      onNumaraDrawAvg: histDrawAvg ?? theoreticalExpectedSum(22, 80),
    };
  }

  const hist = computeDrawSumAverage(drawRows, game.max);
  return {
    couponAvg: hist ?? theoreticalCoupon,
    couponAvgSource: hist != null ? "historical" : "theoretical",
    onNumaraDrawAvg: null,
  };
}

type HotColdMatch = {
  drawCount: number;
  hotInCoupon: number[];
  coldInCoupon: number[];
};

/** Recency: missingSince = kaç çekiliştir gelmedi (0 = en son çekilişte var). */
function computeHotColdMatch(
  drawRows: { numbers: string }[],
  couponNumbers: number[],
  max: number,
): HotColdMatch | null {
  if (drawRows.length < MIN_DRAWS_FOR_STATS) return null;

  const missingMap: Record<number, number> = {};
  for (let idx = 0; idx < drawRows.length; idx++) {
    const nums = parseDrawNumbers(drawRows[idx].numbers, max);
    for (const num of nums) {
      if (missingMap[num] === undefined) missingMap[num] = idx;
    }
  }

  const ranked: { number: number; missingSince: number }[] = [];
  for (let num = 1; num <= max; num++) {
    ranked.push({
      number: num,
      missingSince: missingMap[num] ?? drawRows.length,
    });
  }

  const band = Math.max(1, Math.round(max * 0.25));

  // Tek sıralama: düşük gecikme = sıcak, yüksek = soğuk; eşitlikte küçük sayı önde
  const rankedAsc = [...ranked].sort((a, b) => {
    if (a.missingSince !== b.missingSince) return a.missingSince - b.missingSince;
    return a.number - b.number;
  });

  const hotSet = new Set(rankedAsc.slice(0, band).map((x) => x.number));
  const coldSet = new Set(
    rankedAsc.slice(Math.max(band, rankedAsc.length - band)).map((x) => x.number),
  );

  const hotInCoupon = couponNumbers.filter((n) => hotSet.has(n));
  const coldInCoupon = couponNumbers.filter((n) => coldSet.has(n));

  return {
    drawCount: drawRows.length,
    hotInCoupon,
    coldInCoupon,
  };
}

async function fetchAllDraws(
  client: ReturnType<typeof createClient>,
  gameName: string,
): Promise<{ numbers: string }[]> {
  const pageSize = 1000;
  const all: { numbers: string }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from("draws")
      .select("numbers")
      .eq("game", gameName)
      .order("draw_date_parsed", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("[lota-generate] draws fetch", error.message);
      return [];
    }
    if (!data?.length) break;
    all.push(...(data as { numbers: string }[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function formatHotColdLine(hc: HotColdMatch): string {
  const hot =
    hc.hotInCoupon.length > 0 ? hc.hotInCoupon.join(", ") : "yok";
  const cold =
    hc.coldInCoupon.length > 0 ? hc.coldInCoupon.join(", ") : "yok";
  return `. Sıcak: ${hot} — Soğuk: ${cold} (tüm çekilişler)`;
}

function fallbackComment(
  game: GameSpec,
  stats: CouponStats,
  consecutiveLabel: string,
  hotCold: HotColdMatch | null,
  averages: AverageInfo,
): string {
  const consecLine =
    consecutiveLabel === "yok"
      ? ". Ardışık sayı yok"
      : `. Ardışık: ${consecutiveLabel}`;
  const delta = stats.sum - averages.couponAvg;
  let sumLine =
    delta === 0
      ? `. Toplam ${stats.sum}, ortalama ${averages.couponAvg}`
      : delta > 0
      ? `. Toplam ${stats.sum}, ortalama ${averages.couponAvg} — ortalamanın üstünde`
      : `. Toplam ${stats.sum}, ortalama ${averages.couponAvg} — ortalamanın altında`;
  if (game.id === "onnumara" && averages.onNumaraDrawAvg != null) {
    sumLine += ` (çekilişte 22 sayı; onların ortalaması ≈${averages.onNumaraDrawAvg})`;
  }
  const lines = [
    `. ${stats.even} çift, ${stats.odd} tek`,
    `. ${stats.low} düşük (≤${stats.mid}), ${stats.high} yüksek (>${stats.mid})`,
    consecLine,
    sumLine,
  ];
  if (hotCold) lines.push(formatHotColdLine(hotCold));
  return lines.join("\n");
}

function sanitizeComment(comment: string): string {
  let text = comment.trim();
  // Model bazen system rolünü cevaba yapıştırır
  text = text.replace(
    /^(sen\s+lota['']?s[ıi]n[.;:!,\s-]*)+/i,
    "",
  );
  text = text.replace(/^(ben\s+lota['']?y[ıi]m[.;:!,\s-]*)+/i, "");
  text = text.replace(/^lota\s*:\s*/i, "");
  text = text.trim();
  if (!text) throw new Error("Empty comment after sanitize");
  return text.slice(0, 800);
}

function extractComment(text: string): string {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed) as { comment?: unknown };
    if (typeof parsed.comment === "string" && parsed.comment.trim()) {
      return sanitizeComment(parsed.comment);
    }
  } catch {
    // continue
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
        comment?: unknown;
      };
      if (typeof parsed.comment === "string" && parsed.comment.trim()) {
        return sanitizeComment(parsed.comment);
      }
    } catch {
      // ignore
    }
  }
  throw new Error("No comment in model response");
}

async function commentWithDeepSeek(
  game: GameSpec,
  coupon: CouponResult,
  stats: CouponStats,
  apiKey: string,
  hotCold: HotColdMatch | null,
  averages: AverageInfo,
): Promise<string> {
  const consecutiveLabel = formatConsecutive(coupon.numbers);
  const isOnNumara = game.id === "onnumara";
  const itemCount = hotCold ? 5 : 4;

  const avgLabel =
    averages.couponAvgSource === "historical"
      ? "geçmiş çekilişlerin toplam ortalaması"
      : "bu oyunun ortalaması";

  const sumRule = isOnNumara
    ? `- 4. madde: kolon toplamını kolon ortalamasıyla (${averages.couponAvg}) karşılaştır. "ortalama" kelimesini kullan; "beklenen" deme. Fark sayısını söyleme. Aynı maddenin sonunda parantez içinde ekle: çekilişte 22 sayı çıkar ve bu 22’nin toplam ortalaması ≈${averages.onNumaraDrawAvg}.`
    : `- 4. madde: kolon toplamını ${avgLabel} ile karşılaştır (${averages.couponAvg}). "ortalama" kelimesini kullan; "beklenen" deme. Fark sayısını söyleme.`;

  const hotColdRules = hotCold
    ? [
        "- 5. madde: kolondaki sıcak ve soğuk sayıları yaz (verilen listeler). Yoksa olmadığını söyle. Sonuna kısaca ekle: (tüm çekilişler). \"tahmin değil\" yazma.",
        "- Sıcak/soğuk için şans, tavsiye, gelecek iddiası YASAK.",
      ]
    : [];

  const jsonDots = Array.from({ length: itemCount }, () => ". ...").join("\\n");

  const userPrompt = [
    `Oyun: ${game.name}`,
    `Kolon: [${coupon.numbers.join(", ")}]`,
    "Veriler (doğru, kendin sayma veya hesaplama):",
    `- çift=${stats.even}, tek=${stats.odd}`,
    `- düşük (≤${stats.mid})=${stats.low}, yüksek (>${stats.mid})=${stats.high}`,
    `- ardışık çiftler=${consecutiveLabel}`,
    `- kolon toplamı=${stats.sum}`,
    `- ${avgLabel}≈${averages.couponAvg} (kaynak: ${averages.couponAvgSource})`,
    isOnNumara
      ? `- On Numara: çekilişte 22 sayı; 22’nin toplam ortalaması≈${averages.onNumaraDrawAvg} (4. maddeye parantez içinde)`
      : null,
    hotCold
      ? `- sıcak sayılar (kolonda): ${
          hotCold.hotInCoupon.length
            ? hotCold.hotInCoupon.join(", ")
            : "yok"
        }`
      : null,
    hotCold
      ? `- soğuk sayılar (kolonda): ${
          hotCold.coldInCoupon.length
            ? hotCold.coldInCoupon.join(", ")
            : "yok"
        }`
      : null,
    hotCold ? `- sıcak/soğuk hesap: tüm çekilişler (${hotCold.drawCount}); recency` : null,
    "",
    "KURALLAR:",
    `- Tam olarak ${itemCount} madde yaz; her madde ayrı satırda.`,
    "- Her satır nokta ve boşluk ile başlasın: \". \"",
    "- 1. madde: sadece çift/tek adedi.",
    "- 2. madde: sadece düşük/yüksek adedi; eşiği yaz (≤" + stats.mid + " ve >" + stats.mid + ").",
    "- 3. madde: sadece ardışık sayılar; varsa çiftleri sayı-sayı şeklinde yaz, yoksa olmadığını söyle.",
    sumRule,
    ...hotColdRules,
    "- Madde işareti olarak tire (-), yıldız (*) veya başka sembol KULLANMA; sadece \". \"",
    "- Kendi kelimelerinle kısa yaz; şablon veya örnek cümle kullanma.",
    "- Kendini tanıtma; rol veya isim söyleme.",
    "- Klişe YASAK: işaret eder, ağırlıklı bir yapı, dağılım sergiliyor.",
    "- Tavsiye, olasılık, şans artışı, kazanma ihtimali YASAK.",
    "",
    `Yanıt yalnızca JSON: {"comment":"${jsonDots}"}`,
  ]
    .filter((line): line is string => line != null)
    .join("\n");

  const systemContent = hotCold
    ? `Çift/tek, düşük/yüksek, ardışık, toplam-ortalama ve sıcak/soğuk sayılarını ${itemCount} satırda yaz. Her satır ". " ile başlasın. Ortalama de, beklenen deme; fark sayısını yazma. Sıcak/soğukta şans veya gelecek iddiası yazma; \"tahmin değil\" deme. Verilen listeleri kullan. Kimlik veya rol yazma. JSON dışında bir şey yazma.`
    : isOnNumara
    ? "Çift/tek, düşük/yüksek, ardışık ve toplam-ortalama bilgisini dört satırda yaz. On Numara’da 22’lik çekiliş ortalamasını 4. maddenin parantezinde ver; ayrı madde yapma. Her satır \". \" ile başlasın. Ortalama de, beklenen deme; fark sayısını yazma. Kimlik veya rol yazma. JSON dışında bir şey yazma."
    : "Çift/tek, düşük/yüksek, ardışık ve toplam-ortalama karşılaştırmasını dört satırda yaz. Her satır \". \" ile başlasın. Ortalama de, beklenen deme; fark sayısını yazma. Verilen sayıları kullan. Kimlik veya rol yazma. JSON dışında bir şey yazma.";

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.9,
      max_tokens: hotCold ? 240 : 200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("[lota-generate] DeepSeek HTTP", res.status, detail.slice(0, 300));
    throw new Error(`DeepSeek error ${res.status}`);
  }

  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) {
    throw new Error("Empty model response");
  }
  return extractComment(content);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");

    if (!supabaseUrl || !anonKey) {
      return json({ error: "Server misconfigured" }, 500);
    }
    if (!deepseekKey) {
      console.error("[lota-generate] DEEPSEEK_API_KEY missing");
      return json({ error: "AI servisi yapılandırılmadı." }, 500);
    }

    const jwt = authHeader.slice("Bearer ".length);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
    if (userError || !userData.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => null);
    const gameId = typeof body?.gameId === "string" ? body.gameId : "";
    const game = GAMES[gameId];
    if (!game) {
      return json({ error: "Unknown game" }, 400);
    }

    const coupon = generateCoupon(game);
    const stats = computeStats(coupon.numbers, game.max);
    const consecutiveLabel = formatConsecutive(coupon.numbers);

    const drawRows = await fetchAllDraws(userClient, game.name);
    const hotCold = computeHotColdMatch(drawRows, coupon.numbers, game.max);
    const averages = resolveAverages(game, drawRows);

    let comment = fallbackComment(game, stats, consecutiveLabel, hotCold, averages);
    try {
      comment = await commentWithDeepSeek(
        game,
        coupon,
        stats,
        deepseekKey,
        hotCold,
        averages,
      );
    } catch (err) {
      console.error("[lota-generate] comment fallback", err);
    }

    return json({ success: true, ...coupon, comment }, 200);
  } catch (err) {
    console.error("[lota-generate]", err);
    return json({ error: "Beklenmeyen bir hata oluştu." }, 500);
  }
});
