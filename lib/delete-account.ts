import { clearAllAppData } from './clear-app-data';
import { logError } from './logger';
import { supabase } from './supabase';

const DELETE_ACCOUNT_URL =
  'https://tsxzukctomvnyzalgxap.supabase.co/functions/v1/delete-account';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Deletes the signed-in user's Auth account on the server, then clears
 * all local app data and signs out.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, message: 'Oturum bulunamadı. Tekrar giriş yapıp dene.' };
  }

  try {
    const response = await fetch(DELETE_ACCOUNT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (response.status === 401) {
      return { ok: false, message: 'Oturumun süresi dolmuş. Tekrar giriş yapıp dene.' };
    }

    if (!response.ok) {
      let serverMessage: string | undefined;
      try {
        const body = await response.json();
        if (typeof body?.error === 'string') serverMessage = body.error;
      } catch {
        // ignore parse errors
      }
      logError('deleteAccount', new Error(`Edge Function returned ${response.status}`), {
        serverMessage,
      });
      return {
        ok: false,
        message: serverMessage || 'Hesap silinemedi. Lütfen tekrar dene.',
      };
    }

    await clearAllAppData();
    return { ok: true };
  } catch (err) {
    logError('deleteAccount', err);
    return {
      ok: false,
      message: 'İnternet bağlantını kontrol edip tekrar dene.',
    };
  }
}
