// lib/supabase.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tsxzukctomvnyzalgxap.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_R4PXW8J2-BxE77dlN7cS-w_6NfFrcl0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storage: AsyncStorage,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: (url, options) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const fetchOptions = {
        ...options,
        signal: controller.signal,
      };

      return fetch(url, fetchOptions).finally(() => clearTimeout(timeoutId));
    },
  },
});

export async function safeQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  errorMessage = 'Veriler yüklenirken bir sorun oluştu.'
): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await queryFn();

    if (error) {
      console.error('[safeQuery]', error, { code: error.code });
      if (error.code === 'PGRST116') {
        return { data: null, error: 'Sonuç bulunamadı.' };
      }
      return { data: null, error: errorMessage };
    }

    return { data, error: null };
  } catch (err: any) {
    console.error('[safeQuery]', err, { name: err.name });
    if (err.name === 'AbortError') {
      return { data: null, error: 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.' };
    }
    if (err.message?.includes('Network request failed')) {
      return { data: null, error: 'İnternet bağlantısı yok. Lütfen bağlantınızı kontrol edin.' };
    }
    return { data: null, error: errorMessage };
  }
}