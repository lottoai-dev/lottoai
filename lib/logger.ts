// lib/logger.ts
// Basit hata loglama mekanizması.
// Hataları Supabase'deki app_logs tablosuna kaydeder.
// Tablo yoksa veya bağlantı yoksa sessizce devam eder, uygulamayı etkilemez.

import { supabase } from './supabase';

type LogLevel = 'error' | 'warn' | 'info';

export async function logError(context: string, error: any, extraData?: any) {
  await logToSupabase('error', context, error, extraData);
}

export async function logWarn(context: string, message: string, extraData?: any) {
  await logToSupabase('warn', context, message, extraData);
}

export async function logInfo(context: string, message: string, extraData?: any) {
  await logToSupabase('info', context, message, extraData);
}

async function logToSupabase(level: LogLevel, context: string, errorOrMessage: any, extraData?: any) {
  try {
    if (level === 'error') {
      console.error(`[${context}]`, errorOrMessage);
    } else if (level === 'warn') {
      console.warn(`[${context}]`, errorOrMessage);
    } else {
      console.log(`[${context}]`, errorOrMessage);
    }

    const entry = {
      level,
      message: typeof errorOrMessage === 'string' ? errorOrMessage : errorOrMessage?.message || JSON.stringify(errorOrMessage),
      context,
      data: extraData ? JSON.stringify(extraData) : undefined,
      timestamp: new Date().toISOString(),
    };

    await supabase.from('app_logs').insert(entry);
  } catch {
    // Loglama başarısız olursa uygulamayı etkileme
  }
}