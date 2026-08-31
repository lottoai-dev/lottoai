// Supabase Edge Function: admob-ssv
//
// AdMob'un sunucu tarafli odul dogrulamasi (SSV) ucu. Kullanici odullu
// reklami sonuna kadar izledginde Google BU adrese imzali bir GET atar;
// odul ancak imza dogrulanirsa yazilir. Istemci artik kendi kendine hak
// ekleyemez (feature_usage_daily uzerindeki trigger de bunu engeller).
//
// verify_jwt = false olmali: cagriyi Google yapiyor, Supabase oturumu yok.
// Guvenlik JWT'den degil, ECDSA imzasindan geliyor.
//
// AdMob konsolunda her odullu reklam biriminin SSV alanina bu fonksiyonun
// URL'i girilmeli: https://<proje-ref>.supabase.co/functions/v1/admob-ssv

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const VERIFIER_KEYS_URL = "https://gstatic.com/admob/reward/verifier-keys.json";

/** Odul basina eklenen hak. lib/featureQuota.ts icindeki REWARD_AMOUNT ile ayni olmali. */
const REWARD_AMOUNT = 3;

const FIELD_BY_FEATURE: Record<string, string> = {
  filtered_coupon: "filtered_coupon_count",
  report: "report_count",
};

/** Cok eski bildirimler kabul edilmez (kaydedilmis bir istegin tekrar oynatilmasi). */
const MAX_AGE_MS = 60 * 60 * 1000;

type VerifierKey = { keyId: number; pem: string; base64: string };

let keyCache: { fetchedAt: number; keys: Map<string, CryptoKey> } | null = null;
const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getVerifierKeys(): Promise<Map<string, CryptoKey>> {
  if (keyCache && Date.now() - keyCache.fetchedAt < KEY_CACHE_TTL_MS) {
    return keyCache.keys;
  }

  const res = await fetch(VERIFIER_KEYS_URL);
  if (!res.ok) throw new Error(`verifier-keys fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys: VerifierKey[] };

  const keys = new Map<string, CryptoKey>();
  for (const key of body.keys ?? []) {
    const imported = await crypto.subtle.importKey(
      "spki",
      base64ToBytes(key.base64),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    keys.set(String(key.keyId), imported);
  }

  keyCache = { fetchedAt: Date.now(), keys };
  return keys;
}

/**
 * Google imzayi ASN.1 DER olarak gonderir; WebCrypto ise r||s ham formatini
 * bekler. Ikisi arasinda cevirir.
 */
function derToRawSignature(der: Uint8Array): Uint8Array<ArrayBuffer> {
  if (der[0] !== 0x30) throw new Error("invalid DER signature");

  let offset = 2;
  // Uzun form uzunluk baytini atla.
  if (der[1] & 0x80) offset = 2 + (der[1] & 0x7f);

  const readInt = (): Uint8Array => {
    if (der[offset] !== 0x02) throw new Error("invalid DER integer");
    const length = der[offset + 1];
    const start = offset + 2;
    offset = start + length;
    let value = der.subarray(start, start + length);
    // Basdaki isaret baytlarini at, 32 bayta tamamla.
    while (value.length > 32 && value[0] === 0x00) value = value.subarray(1);
    const padded = new Uint8Array(32);
    padded.set(value, 32 - value.length);
    return padded;
  };

  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(new ArrayBuffer(64));
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const query = url.search.startsWith("?") ? url.search.slice(1) : url.search;

  // Imzalanan icerik, sorgu dizesinin "&signature=" oncesinde kalan kismi.
  const signatureIndex = query.indexOf("&signature=");
  if (signatureIndex === -1) {
    return json({ error: "Missing signature" }, 400);
  }
  const signedContent = query.slice(0, signatureIndex);

  const params = url.searchParams;
  const signature = params.get("signature") ?? "";
  const keyId = params.get("key_id") ?? "";
  const transactionId = params.get("transaction_id") ?? "";
  const userId = params.get("user_id") ?? "";
  const customData = params.get("custom_data") ?? "";
  const timestamp = Number(params.get("timestamp") ?? "0");

  if (!signature || !keyId || !transactionId || !userId) {
    return json({ error: "Missing parameters" }, 400);
  }

  let verified = false;
  try {
    const keys = await getVerifierKeys();
    const key = keys.get(keyId);
    if (!key) return json({ error: "Unknown key_id" }, 401);

    verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      derToRawSignature(base64ToBytes(signature)),
      new TextEncoder().encode(signedContent),
    );
  } catch (err) {
    // Anahtar cekilemedi / imza bozuk. Gecici bir hata olabilecegi icin 500
    // doneriz; Google tekrar dener.
    return json({ error: `Verification failed: ${(err as Error).message}` }, 500);
  }

  if (!verified) return json({ error: "Invalid signature" }, 401);

  // Google timestamp'i mikrosaniye olarak gonderir.
  const sentAt = timestamp > 0 ? Math.floor(timestamp / 1000) : 0;
  if (sentAt > 0 && Date.now() - sentAt > MAX_AGE_MS) {
    return json({ error: "Stale callback" }, 400);
  }

  let feature = "";
  try {
    feature = JSON.parse(customData)?.feature ?? "";
  } catch {
    feature = "";
  }
  const field = FIELD_BY_FEATURE[feature];
  if (!field) return json({ error: "Unknown feature" }, 400);

  // Tekrar korumasi: ayni transaction_id ikinci kez odul yazdirmaz.
  const { error: insertError } = await supabase
    .from("admob_ssv_rewards")
    .insert({
      transaction_id: transactionId,
      user_id: userId,
      feature,
      reward_amount: REWARD_AMOUNT,
    });

  if (insertError) {
    // 23505 = unique_violation; bildirim zaten islenmis, basarili sayilir.
    if ((insertError as { code?: string }).code === "23505") {
      return json({ success: true, duplicate: true }, 200);
    }
    return json({ error: insertError.message }, 500);
  }

  // Turkiye takvim gunu — istemcideki todayInTurkey() ile ayni olmali.
  const day = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);

  const { error: rpcError } = await supabase.rpc("increment_feature_usage", {
    p_user_id: userId,
    p_day: day,
    p_field: field,
    p_amount: -REWARD_AMOUNT,
  });

  if (rpcError) {
    // Odul yazilamadi; kaydi geri al ki Google'in tekrari islesin.
    await supabase.from("admob_ssv_rewards").delete().eq("transaction_id", transactionId);
    return json({ error: rpcError.message }, 500);
  }

  return json({ success: true }, 200);
});
