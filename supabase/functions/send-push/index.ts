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
    const body = `${gameName} sonuçları belli oldu. Kolonlarını kontrol etmek için tıkla.`;
    const screen = 'saved';

    const { data: tokens, error } = await supabase
      .from('push_tokens')
      .select('token, user_id')
      .eq('notify_results', true);

    if (error || !tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Token bulunamadı' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // One message per device. push_tokens already keeps a single row per
    // (user_id, platform), so a user with an iPhone and an Android phone has two
    // rows and must get two pushes. (Collapsing to one row per user used to drop
    // whichever device registered less recently.) Dedupe only identical tokens.
    const byToken = new Map<string, string | null>();
    for (const t of tokens) {
      if (t.token && !byToken.has(t.token)) byToken.set(t.token, t.user_id ?? null);
    }
    const uniqueTokens = Array.from(byToken, ([token, user_id]) => ({ token, user_id }));

    const messages = uniqueTokens.map((t) => ({
      to: t.token,
      sound: 'default',
      title,
      body,
      data: { screen },
    }));

    // Expo accepts at most 100 messages per request.
    const result: unknown[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
      result.push(await response.json());
    }

    // The app reads in-app notifications by token, so each device needs its own row.
    const notificationRows = uniqueTokens.map((t) => ({
      token: t.token,
      user_id: t.user_id,
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
