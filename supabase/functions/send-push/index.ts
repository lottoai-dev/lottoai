// Supabase Edge Function: send-push
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // ─── GÜVENLİK KAPISI: sadece service_role çağırabilir ───
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  let role = "";
  try {
    let b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    role = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
    ).role ?? "";
  } catch {
    role = "";
  }
  if (role !== "service_role") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();
    const record = payload.record;
    const gameName = record?.game || 'Bilinmeyen Oyun';

    const title = 'Çekiliş Sonuçları Açıklandı!';
    const body = `${gameName} sonuçları belli oldu. Kuponlarını kontrol etmek için tıkla.`;
    const screen = 'saved';

    const { data: tokens, error } = await supabase
      .from('push_tokens')
      .select('token, user_id, updated_at')
      .eq('notify_results', true);

    if (error || !tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Token bulunamadı' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const latestByUser = new Map<string, { token: string; updated_at: string }>();
    for (const t of tokens) {
      const key = t.user_id ?? `no-user:${t.token}`;
      const existing = latestByUser.get(key);
      if (!existing || new Date(t.updated_at) > new Date(existing.updated_at)) {
        latestByUser.set(key, { token: t.token, updated_at: t.updated_at });
      }
    }
    const uniqueTokens = Array.from(latestByUser.values());

    const messages = uniqueTokens.map((t) => ({
      to: t.token,
      sound: 'default',
      title,
      body,
      data: { screen },
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();

    const notificationRows = Array.from(latestByUser.entries()).map(([key, t]) => ({
      token: t.token,
      user_id: key.startsWith('no-user:') ? null : key,
      title,
      body,
      screen,
      is_read: false,
    }));

    await supabase
      .from('notifications')
      .insert(notificationRows);

    return new Response(JSON.stringify({ success: true, result, unique_recipients: uniqueTokens.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
