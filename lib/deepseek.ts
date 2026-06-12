// lib/deepseek.ts
// API anahtarı Edge Function'da saklanıyor.
// İstemci anon key ile yetkilendirme yapıyor.

import { logError } from './logger';

const AI_FUNCTION_URL = "https://tsxzukctomvnyzalgxap.supabase.co/functions/v1/ai-chat";
const SUPABASE_ANON_KEY = "sb_publishable_R4PXW8J2-BxE77dlN7cS-w_6NfFrcl0";

export async function chatWithAI(
  messages: { role: "system" | "user" | "assistant"; content: string }[]
): Promise<string | null> {
  try {
    const response = await fetch(AI_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      logError('chatWithAI', new Error(`Edge Function returned ${response.status}`));
      return null;
    }

    const data = await response.json();
    return data.reply || null;
  } catch (err) {
    logError('chatWithAI', err);
    return null;
  }
}