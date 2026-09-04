// Lota AI istemci ucu: sunucu crypto ile kolon uretir, DeepSeek yorum doner.

import type { GameId } from './games';
import { supabase } from './supabase';

const SUPABASE_URL = 'https://tsxzukctomvnyzalgxap.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_R4PXW8J2-BxE77dlN7cS-w_6NfFrcl0';
const TIMEOUT_MS = 30000;

export type LotaCouponResult = {
  numbers: number[];
  bonus: number[];
  superStar?: number;
  comment: string;
};

export class LotaGenerateError extends Error {
  constructor(
    message: string,
    public readonly code: 'auth' | 'network' | 'server' | 'unknown',
  ) {
    super(message);
    this.name = 'LotaGenerateError';
  }
}

export async function generateLotaCoupon(gameId: GameId): Promise<LotaCouponResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new LotaGenerateError(
      'Lota ile üretmek için giriş yapman gerekiyor.',
      'auth',
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/lota-generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ gameId }),
      signal: controller.signal,
    });

    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg =
        typeof payload?.error === 'string'
          ? payload.error
          : 'Lota şu an kolon üretemedi. Biraz sonra tekrar dene.';
      if (res.status === 401) {
        throw new LotaGenerateError(
          'Lota ile üretmek için giriş yapman gerekiyor.',
          'auth',
        );
      }
      throw new LotaGenerateError(msg, 'server');
    }

    const numbers = payload?.numbers;
    const bonus = Array.isArray(payload?.bonus) ? payload.bonus : [];
    if (!Array.isArray(numbers) || numbers.length === 0) {
      throw new LotaGenerateError('Lota geçersiz bir yanıt döndü.', 'server');
    }

    const comment =
      typeof payload?.comment === 'string' && payload.comment.trim()
        ? payload.comment.trim()
        : '';

    const result: LotaCouponResult = { numbers, bonus, comment };
    if (payload?.superStar != null) {
      result.superStar = Number(payload.superStar);
    }
    return result;
  } catch (err) {
    if (err instanceof LotaGenerateError) throw err;
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new LotaGenerateError(
        'Lota yanıt vermedi. Bağlantını kontrol edip tekrar dene.',
        'network',
      );
    }
    throw new LotaGenerateError(
      'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.',
      'network',
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
