// Supabase Edge Function: revenuecat-webhook
//
// RevenueCat her abonelik olayinda (satin alma, yenileme, iptal, sure bitimi,
// odeme sorunu, urun degisikligi, transfer...) bu adrese POST atar. Fonksiyon
// olayin icerigine guvenip durumu kendisi hesaplamaz; olaydaki kullanicinin
// GUNCEL durumunu RevenueCat REST API'sinden okuyup user_entitlements'a yazar.
// Boylece olaylar sirasiz ya da tekrar gelse bile sonuc dogru olur.
//
// verify_jwt = false olmali: cagriyi RevenueCat yapiyor, Supabase oturumu yok.
// Guvenlik, RevenueCat panelinde webhook icin tanimlanan Authorization
// basligindan gelir (REVENUECAT_WEBHOOK_AUTH secret'i ile karsilastirilir).
//
// Gerekli secret'lar (Supabase > Edge Functions > Secrets):
//   REVENUECAT_WEBHOOK_AUTH     RevenueCat webhook ayarindaki Authorization degeri
//   REVENUECAT_SECRET_API_KEY   RevenueCat secret API key (sk_...), yalnizca okuma icin
//
// RevenueCat panelinde webhook URL'i:
//   https://<proje-ref>.supabase.co/functions/v1/revenuecat-webhook
//
// Uygulama tarafinda Purchases.logIn(<supabase user id>) kullanilir; bu yuzden
// app_user_id Supabase kullanici UUID'sidir. Anonim RevenueCat kimlikleri
// ($RCAnonymousID:...) ve UUID olmayanlar yok sayilir.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** RevenueCat entitlement kimligi (panel > Product catalog > Entitlements). */
const ENTITLEMENT_ID = "lottoai_pro";

const RC_SUBSCRIBERS_URL = "https://api.revenuecat.com/v1/subscribers/";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Sabit sureli karsilastirma: Authorization degeri tahmin edilemesin. */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

type RcEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
  event_timestamp_ms?: number;
  environment?: string;
};

type RcEntitlement = {
  expires_date: string | null;
  product_identifier: string;
};

type RcSubscription = {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  period_type?: string;
  store?: string;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
};

type RcSubscriberResponse = {
  subscriber?: {
    entitlements?: Record<string, RcEntitlement>;
    subscriptions?: Record<string, RcSubscription>;
  };
};

/** Olaydan etkilenen Supabase kullanicilari (TRANSFER'de iki taraf da). */
function affectedUserIds(event: RcEvent): string[] {
  const ids = new Set<string>();
  const add = (v?: string) => {
    if (v && UUID_RE.test(v)) ids.add(v.toLowerCase());
  };
  add(event.app_user_id);
  add(event.original_app_user_id);
  for (const v of event.aliases ?? []) add(v);
  for (const v of event.transferred_from ?? []) add(v);
  for (const v of event.transferred_to ?? []) add(v);
  return [...ids];
}

function laterDate(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

/** RevenueCat'ten kullanicinin guncel Pro durumunu okur. */
async function fetchProState(userId: string, secretKey: string) {
  const res = await fetch(RC_SUBSCRIBERS_URL + encodeURIComponent(userId), {
    headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`RevenueCat ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as RcSubscriberResponse;
  const ent = body.subscriber?.entitlements?.[ENTITLEMENT_ID];
  if (!ent) {
    return { is_pro: false, expires_at: null, product_id: null, store: null, period_type: null, will_renew: null };
  }

  const sub = body.subscriber?.subscriptions?.[ent.product_identifier];
  // Odeme sorunu yasayan kullanici, magazanin tanidigi ek sure boyunca Pro kalir.
  const expiresAt = laterDate(ent.expires_date, sub?.grace_period_expires_date);
  const isPro = expiresAt === null || new Date(expiresAt).getTime() > Date.now();

  return {
    is_pro: isPro,
    expires_at: expiresAt,
    product_id: ent.product_identifier,
    store: sub?.store ?? null,
    period_type: sub?.period_type ?? null,
    will_renew: sub ? !sub.unsubscribe_detected_at && !sub.billing_issues_detected_at : null,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Panelde kopyala-yapistir sirasinda eklenen satir sonu / bosluklar
  // karsilastirmayi bozmasin diye iki taraf da kirpilir.
  const expectedAuth = (Deno.env.get("REVENUECAT_WEBHOOK_AUTH") ?? "").trim();
  const secretKey = (Deno.env.get("REVENUECAT_SECRET_API_KEY") ?? "").trim();
  if (!expectedAuth || !secretKey) {
    console.error("[revenuecat-webhook] secret eksik");
    return json({ error: "Server not configured" }, 500);
  }
  if (!safeEqual((req.headers.get("Authorization") ?? "").trim(), expectedAuth)) {
    console.warn("[revenuecat-webhook] Authorization eslesmedi");
    return json({ error: "Unauthorized" }, 401);
  }

  let event: RcEvent;
  try {
    event = ((await req.json()) as { event?: RcEvent }).event ?? {};
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const eventId = event.id ?? "";
  const eventType = event.type ?? "UNKNOWN";
  if (!eventId) return json({ error: "Missing event id" }, 400);

  // Panelden gonderilen deneme olayi: baglanti calisiyor, yapilacak is yok.
  if (eventType === "TEST") return json({ ok: true, test: true }, 200);

  // Daha once islendiyse tekrar isleme (RevenueCat yeniden gonderebilir).
  const { data: seen } = await supabase
    .from("revenuecat_events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (seen) return json({ ok: true, duplicate: true }, 200);

  const userIds = affectedUserIds(event);
  const eventAt = event.event_timestamp_ms
    ? new Date(event.event_timestamp_ms).toISOString()
    : new Date().toISOString();

  for (const userId of userIds) {
    let state;
    try {
      state = await fetchProState(userId, secretKey);
    } catch (err) {
      // 5xx: RevenueCat olayi daha sonra tekrar gonderir.
      console.error("[revenuecat-webhook] durum okunamadi", userId, (err as Error).message);
      return json({ error: "Upstream error" }, 502);
    }

    const { error } = await supabase.from("user_entitlements").upsert(
      {
        user_id: userId,
        ...state,
        last_event_id: eventId,
        last_event_at: eventAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      // 23503: kullanici silinmis (auth.users'ta yok). Tekrar denemenin anlami yok.
      if ((error as { code?: string }).code === "23503") {
        console.warn("[revenuecat-webhook] kullanici yok, atlandi", userId);
        continue;
      }
      console.error("[revenuecat-webhook] yazilamadi", userId, error.message);
      return json({ error: "Database error" }, 500);
    }
  }

  // Yalnizca basarili islemden sonra "islendi" olarak isaretle.
  await supabase.from("revenuecat_events").upsert(
    {
      event_id: eventId,
      event_type: eventType,
      app_user_id: event.app_user_id ?? null,
    },
    { onConflict: "event_id", ignoreDuplicates: true },
  );

  return json({ ok: true, users: userIds.length }, 200);
});
