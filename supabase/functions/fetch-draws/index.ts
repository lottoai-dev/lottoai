// @ts-nocheck

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

const GAMES = [
  {
    name: 'Çılgın Sayısal',
    url: 'https://www.millipiyangoonline.com/sayisal-loto/sonuclar',
  },
  {
    name: 'Süper Loto',
    url: 'https://www.millipiyangoonline.com/super-loto/sonuclar',
  },
  {
    name: 'Şans Topu',
    url: 'https://www.millipiyangoonline.com/sans-topu/sonuclar',
  },
  {
    name: 'On Numara',
    url: 'https://www.millipiyangoonline.com/on-numara/sonuclar',
  },
];

async function fetchDrawResult(game: { name: string; url: string }) {
  const response = await fetch(game.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'tr-TR,tr;q=0.9',
    },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const html = await response.text();

  // Sayıları HTML'den çek
  const numberPattern = /class="lottery-ball[^"]*">(\d+)<\/span>/g;
  const numbers: string[] = [];
  let match;
  while ((match = numberPattern.exec(html)) !== null) {
    numbers.push(match[1]);
    if (numbers.length >= 10) break;
  }

  // Çekiliş tarihini çek
  const datePattern = /(\d{2}\.\d{2}\.\d{4})/;
  const dateMatch = html.match(datePattern);
  const drawDate = dateMatch ? dateMatch[1] : new Date().toLocaleDateString('tr-TR');

  // Çekiliş no çek
  const drawNoPattern = /Çekiliş No[:\s]*(\d+)/i;
  const drawNoMatch = html.match(drawNoPattern);
  const drawNo = drawNoMatch ? drawNoMatch[1] : Date.now().toString();

  return { numbers: numbers.join(', '), drawDate, drawNo };
}

Deno.serve(async (_req) => {
  try {
    const results = [];

    for (const game of GAMES) {
      try {
        const { numbers, drawDate, drawNo } = await fetchDrawResult(game);

        if (!numbers) {
          results.push({ game: game.name, status: 'no_data' });
          continue;
        }

        const { error } = await supabase
          .from('draws')
          .upsert({
            game: game.name,
            draw_date: drawDate,
            draw_no: drawNo,
            numbers: numbers,
            bonus: '-',
          }, {
            onConflict: 'game,draw_no',
          });

        if (error) {
          results.push({ game: game.name, status: 'db_error', message: error.message });
        } else {
          results.push({ game: game.name, status: 'success', numbers, drawDate });
        }
      } catch (e) {
        results.push({ game: game.name, status: 'fetch_error', message: String(e) });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});