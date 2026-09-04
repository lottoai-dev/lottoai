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
  lota: "lota_count",
};

/** Cok eski bildirimler kabul edilmez (kaydedilmis bir istegin tekrar oynatilmasi). */
const MAX_AGE_MS = 60 * 60 * 1000;

type VerifierKey = { keyId: number; pem: string; base64: string };

let keyCache: { fetchedAt: number; keys: Map<string, CryptoKey> } | null = null;
const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Istek URL'sinden ham query string — sira / encoding degistirilmez. */
function getRawQueryString(requestUrl: string): string {
  const q = requestUrl.indexOf("?");
  if (q < 0) return "";
  const hash = requestUrl.indexOf("#", q);
  return hash < 0 ? requestUrl.slice(q + 1) : requestUrl.slice(q + 1, hash);
}

function decodeParam(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return base64ToBytes(padded);
}

/** Google imzasi DER SEQUENCE (r,s); Web Crypto IEEE P1363 (r||s, 64 bayt) bekler. */
function derEcdsaSignatureToP1363(der: Uint8Array): Uint8Array {
  let offset = 0;
  if (der[offset++] !== 0x30) throw new Error("Invalid DER signature");

  let seqLen = der[offset++];
  if (seqLen & 0x80) {
    const lenBytes = seqLen & 0x7f;
    seqLen = 0;
    for (let i = 0; i < lenBytes; i++) seqLen = (seqLen << 8) | der[offset++];
  }

  if (der[offset++] !== 0x02) throw new Error("Invalid DER r marker");
  let rLen = der[offset++];
  if (rLen & 0x80) {
    const lenBytes = rLen & 0x7f;
    rLen = 0;
    for (let i = 0; i < lenBytes; i++) rLen = (rLen << 8) | der[offset++];
  }
  let r = der.slice(offset, offset + rLen);
  offset += rLen;

  if (der[offset++] !== 0x02) throw new Error("Invalid DER s marker");
  let sLen = der[offset++];
  if (sLen & 0x80) {
    const lenBytes = sLen & 0x7f;
    sLen = 0;
    for (let i = 0; i < lenBytes; i++) sLen = (sLen << 8) | der[offset++];
  }
  let s = der.slice(offset, offset + sLen);

  if (r.length > 32 && r[0] === 0) r = r.slice(1);
  if (s.length > 32 && s[0] === 0) s = s.slice(1);

  const out = new Uint8Array(64);
  out.set(r, 32 - r.length);
  out.set(s, 64 - s.length);
  return out;
}

/**
 * Google SSV: imzalanan icerik query string'de signature= oncesinde kalir.
 * https://developers.google.com/admob/android/ssv
 */
function parseSsvQuery(queryString: string): {
  signedContent: string;
  signature: string;
  keyId: string;
  params: Record<string, string>;
} | null {
  const sigMarker = "signature=";
  const sigIdx = queryString.indexOf(sigMarker);
  if (sigIdx <= 0) return null;

  const signedContent = queryString.slice(0, sigIdx - 1);

  const afterSig = queryString.slice(sigIdx + sigMarker.length);
  const keyMarker = "key_id=";
  const keyIdx = afterSig.indexOf(keyMarker);
  if (keyIdx <= 0) return null;

  const signature = decodeParam(afterSig.slice(0, keyIdx - 1));
  const keyId = decodeParam(afterSig.slice(keyIdx + keyMarker.length).split("&")[0]);

  const params: Record<string, string> = {};
  if (signedContent) {
    for (const part of signedContent.split("&")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const key = part.slice(0, eq);
      params[key] = decodeParam(part.slice(eq + 1));
    }
  }

  return { signedContent, signature, keyId, params };
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
    const spki = base64ToBytes(key.base64);
    const cryptoKey = await crypto.subtle.importKey(
      "spki",
      spki,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    keys.set(String(key.keyId), cryptoKey);
  }

  keyCache = { fetchedAt: Date.now(), keys };
  return keys;
}

async function verifyEcdsaSignature(
  signedContent: string,
  signatureB64Url: string,
  publicKey: CryptoKey,
): Promise<boolean> {
  const derSig = base64UrlToBytes(signatureB64Url);
  const p1363 = derEcdsaSignatureToP1363(derSig);
  const data = new TextEncoder().encode(signedContent);
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    p1363,
    data,
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

Deno.serve(async (req) => {
  const queryString = getRawQueryString(req.url);
  if (!queryString) {
    return json({ error: "Missing query string" }, 400);
  }

  const parsed = parseSsvQuery(queryString);
  if (!parsed) {
    return json({ error: "Missing signature or key_id" }, 400);
  }

  const { signedContent, signature, keyId, params } = parsed;
  const transactionId = params.transaction_id ?? "";
  const userId = params.user_id ?? "";
  const customData = params.custom_data ?? "";
  const timestamp = Number(params.timestamp ?? "0");

  if (!signature || !keyId) {
    return json({ error: "Missing signature or key_id" }, 400);
  }

  try {
    const keys = await getVerifierKeys();
    const publicKey = keys.get(keyId);
    if (!publicKey) return json({ error: "Unknown key_id" }, 401);

    const verified = await verifyEcdsaSignature(signedContent, signature, publicKey);
    if (!verified) return json({ error: "Invalid signature" }, 401);
  } catch (err) {
    return json({ error: `Verification failed: ${(err as Error).message}` }, 500);
  }

  if (timestamp > 0 && Date.now() - timestamp > MAX_AGE_MS) {
    return json({ error: "Stale callback" }, 400);
  }

  let feature = "";
  try {
    feature = JSON.parse(customData)?.feature ?? "";
  } catch {
    feature = "";
  }
  const field = FIELD_BY_FEATURE[feature];

  // AdMob konsol dogrulamasi veya eksik test verisi: imza gecerliyse 200 yeter.
  if (!transactionId || !userId || !field || !isValidUuid(userId)) {
    return json({ success: true, verify_only: true }, 200);
  }

  const { error: insertError } = await supabase.from("admob_ssv_rewards").insert({
    transaction_id: transactionId,
    user_id: userId,
    feature,
    reward_amount: REWARD_AMOUNT,
  });

  if (insertError) {
    const code = (insertError as { code?: string }).code;
    if (code === "23505") {
      return json({ success: true, duplicate: true }, 200);
    }
    if (code === "23503") {
      return json({ success: true, verify_only: true, reason: "user_not_found" }, 200);
    }
    return json({ error: insertError.message }, 500);
  }

  const day = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);

  const { error: rpcError } = await supabase.rpc("increment_feature_usage", {
    p_user_id: userId,
    p_day: day,
    p_field: field,
    p_amount: -REWARD_AMOUNT,
  });

  if (rpcError) {
    await supabase.from("admob_ssv_rewards").delete().eq("transaction_id", transactionId);
    return json({ error: rpcError.message }, 500);
  }

  return json({ success: true }, 200);
});
