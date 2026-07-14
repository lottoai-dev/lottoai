// app/(tabs)/ai-assistant.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../../components/ui/app-button';
import { NumberBall } from '../../components/ui/number-ball';
import { PressableScale } from '../../components/ui/surface';
import { STORAGE_KEYS } from '../../constants/storage-keys';
import { AppTheme, GameAccent } from '../../constants/theme';
import { useAlert } from '../../contexts/AlertContext';
import { useAuth } from '../../contexts/AuthContext';
import { APP_SCREEN_MAP, buildAppContextSnapshot, formatAppContextForPrompt } from '../../lib/aiAppContext';
import {
  type ConstraintKey,
  type FrequencyMap,
  type NumberConstraints,
  buildAvoidSet,
  checkPrimeFeasibility,
  checkSumRangeFeasibility,
  generateCouponWithConstraints,
  generateMultipleCoupons,
  getViolatedConstraints,
  pickSingleNumber,
} from '../../lib/couponGenerator';
import { type AIErrorType, type CouponIntent, chatWithAI, classifyCouponIntent, stripMarkdown } from '../../lib/deepseek';
import { GameEmblem } from '../../lib/emblems';
import { GAMES, type Game, type GameId, getGameById, getGameByName } from '../../lib/games';
import { AIAssistantIcon, BackIcon, BookmarkIcon, CloseIcon, SendIcon } from '../../lib/icons';
import { formatPrize } from '../../lib/prizeEstimates';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';

/* ─────────────────────────── cache ─────────────────────────── */
let cachedStatsText: string | null = null;
let cachedStatsTime = 0;
const STATS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 dakika sonra istatistikler yenilenir

function softHaptic() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

/* ─────────────────────────── stats helpers ─────────────────────────── */
function combination(n: number, r: number): number {
  if (r > n) return 0;
  if (r === 0 || r === n) return 1;
  let result = 1;
  for (let i = 0; i < r; i++) {
    result *= n - i;
    result /= i + 1;
  }
  return Math.round(result);
}

function parseNumbers(str: string): number[] {
  return str.split(' - ').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
}

function calcOdds(game: (typeof GAMES)[0]): number {
  const ON_NUMARA_DRAWN = 22;
  if (game.id === 'onnumara') return combination(game.max, game.count) / combination(ON_NUMARA_DRAWN, game.count);
  const mainOdds = combination(game.max, game.count);
  return game.bonus ? mainOdds * combination(game.bonus.max, game.bonus.count) : mainOdds;
}

function formatOdds(n: number): string {
  if (n >= 1e9) return `1 / ${(n / 1e9).toFixed(1)} milyar`;
  if (n >= 1e6) return `1 / ${(n / 1e6).toFixed(1)} milyon`;
  if (n >= 1e3) return `1 / ${(n / 1e3).toFixed(0)} bin`;
  return `1 / ${n.toFixed(0)}`;
}

/**
 * En son çekiliş satırındaki `estimated_prize` alanına göre ikramiye bilgisi
 * satırı üretir. Değer yoksa veya geçersizse AI'ın rakam uydurmasını önlemek
 * için açıkça "bilmiyorum" diyen bir cümle döner.
 */
function buildPrizeLine(rawAmount: unknown, currency: string, drawDate: string): string {
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return `  Güncel büyük ikramiye tutarı: En son çekiliş (${drawDate}) için bilgi yok, bilmiyorum.`;
  }
  return `  Güncel büyük ikramiye tutarı (${drawDate} çekilişi itibarıyla): ${formatPrize(amount, currency)}`;
}

type GameStats = {
  text: string;
  frequency: FrequencyMap;
};

/**
 * Bir oyunun son 100 çekilişini analiz eder.
 * Hem AI'a okutulacak metin özetini, hem de kupon üretiminde
 * kullanılacak ham sayı sıklığı haritasını (frequency) döndürür.
 * İkramiye tutarı `draws` tablosundaki en son çekiliş satırının
 * `estimated_prize` sütunundan okunur.
 */
async function computeGameStats(game: (typeof GAMES)[0]): Promise<GameStats> {
  try {
    const { data, error } = await supabase
      .from('draws')
      .select('numbers, draw_date, estimated_prize')
      .eq('game', game.name)
      .order('draw_date_parsed', { ascending: false })
      .limit(100);

    if (error || !data || data.length === 0) {
      return { text: `${game.name}: Henüz yeterli çekiliş verisi yok.\n`, frequency: {} };
    }

    const countMap: Record<number, number> = {};
    const missingMap: Record<number, number> = {};
    let totalNumbers = 0;
    let evenCount = 0;

    data.forEach((row: any, idx: number) => {
      const nums = parseNumbers(row.numbers).filter((n: number) => n >= 1 && n <= game.max);
      nums.forEach((num: number) => {
        countMap[num] = (countMap[num] || 0) + 1;
        totalNumbers++;
        if (num % 2 === 0) evenCount++;
        if (missingMap[num] === undefined) missingMap[num] = idx;
      });
    });

    const sortedByCount = Object.entries(countMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([num, count]) => `${num} (${count} kez)`);

    const sortedByLeast = Object.entries(countMap)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 5)
      .map(([num, count]) => `${num} (${count} kez)`);

    const coldList = Object.entries(missingMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([num, since]) => `${num} (${since} çekiliş)`);

    const evenPct = Math.round((evenCount / totalNumbers) * 100);
    const oddPct = 100 - evenPct;
    const odds = calcOdds(game);
    const drawCount = data.length;

    const sums = data.map((row: any) => {
      const nums = parseNumbers(row.numbers).filter((n: number) => n >= 1 && n <= game.max);
      return nums.reduce((a: number, b: number) => a + b, 0);
    });
    const avgSum = Math.round(sums.reduce((a: number, b: number) => a + b, 0) / sums.length);
    const minSum = Math.min(...sums);
    const maxSum = Math.max(...sums);

    // Bir kuponun (oyuncunun seçtiği game.count adet sayının) matematiksel
    // olarak alabileceği KESİN toplam aralığı. Bu, çekilişte açıklanan
    // sayıların toplamından TAMAMEN FARKLIDIR — özellikle On Numara'da
    // oyuncu 10 sayı seçerken çekilişte 22 sayı açıklanır, bu yüzden
    // "minSum/maxSum" (aşağıda) bir kuponla asla doğrudan kıyaslanamaz.
    // Bu satırı eklemezsek AI, çekiliş istatistiğini kupon toplamıyla
    // karıştırıp imkansız bir aralık önerebilir (yaşanmış bir hataydı).
    const couponMinSum = (game.count * (game.count + 1)) / 2;
    const couponMaxSum = game.count * game.max - (game.count * (game.count - 1)) / 2;

    // En son çekiliş (data[0], draw_date_parsed'e göre azalan sırayla
    // geldiği için ilk satır) — ikramiye tutarı bu satırdan okunur.
    const latestDraw = data[0];
    const currency = game.currency || 'TRY';

    const text = [
      `${game.name} (son ${drawCount} çekiliş):`,
      `  En çok çıkan: ${sortedByCount.join(', ')}`,
      `  En az çıkan: ${sortedByLeast.join(', ')}`,
      `  En çok geciken: ${coldList.join(', ')}`,
      `  Çift/Tek: %${evenPct} / %${oddPct}`,
      `  KESİN kupon toplam aralığı (oyuncunun seçtiği ${game.count} sayı için, bu sınırların dışına ASLA çıkılamaz): ${couponMinSum} – ${couponMaxSum}`,
      `  Çekilişte açıklanan sayıların geçmiş toplamları (BU BİR KUPON TOPLAMI DEĞİLDİR, sadece çekiliş istatistiğidir): ${minSum} – ${maxSum} (ort. ${avgSum})`,
      `  Büyük ikramiye ihtimali: ${formatOdds(odds)}`,
      buildPrizeLine(latestDraw.estimated_prize, currency, latestDraw.draw_date),
      ``,
    ].join('\n');

    return { text, frequency: countMap };
  } catch {
    return { text: `${game.name}: İstatistikler yüklenemedi.\n`, frequency: {} };
  }
}

async function buildStatsPrompt(): Promise<string> {
  const lines: string[] = [];
  for (const game of GAMES) {
    const stats = await computeGameStats(game);
    lines.push(stats.text);
  }
  return lines.join('\n');
}

async function getCachedStatsText(): Promise<string> {
  const now = Date.now();
  if (cachedStatsText && now - cachedStatsTime < STATS_CACHE_TTL_MS) {
    return cachedStatsText;
  }
  const text = await buildStatsPrompt();
  cachedStatsText = text;
  cachedStatsTime = now;
  return text;
}

const getBasePrompt = (statsText: string, userName: string | null, appContextText: string): string => {
  const today = new Date();
  const gunAdi = today.toLocaleDateString('tr-TR', { weekday: 'long' });
  const tarih = today.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const userStr = userName ? `Kullanıcının adı: ${userName}. Konuşmada uygun yerlerde ismiyle hitap et, ama her cümlede kullanma.` : 'Kullanıcı henüz ismini girmemiş.';

  return `Sen LottoAI uygulamasının yapay zeka asistanısın. Adın Lota.

Kişiliğin:
- Sıcak, samimi ve doğal konuşursun. Ne çok resmi ne de çok şakacısın.
- Kullanıcıyla arkadaş gibi konuşursun ama saygı sınırını korursun.
- Zaman zaman hafif espri yapabilirsin ama asla zorlamazsın.
- Kazanma garantisi vermezsin, şans oyunlarının eğlence amaçlı olduğunu hatırlatırsın.
- Cevapların kısa ve öz olur, gereksiz uzatmazsın.
- Kesinlikle markdown formatı kullanmazsın (yıldız, tire, başlık gibi).

ÇOK ÖNEMLİ - Kupon üretme şekli:
- Kullanıcı AÇIKÇA sormadığı sürece kuponları nasıl ürettiğini ASLA anlatma. Kupon verirken,
  sohbette veya açıklamada "adil rastgelelik", "rastgele", "algoritma", "istatistiklere göre"
  gibi üretim yöntemi ifadeleri KULLANMA — kullanıcı sormadıysa bu konuya hiç girme.
- Yalnızca kullanıcı "nasıl üretiyorsun", "sayıları nasıl seçiyorsun" gibi açıkça sorduğunda
  cevap ver: adil rastgelelikle ürettiğini söyle. "Rastgelelik" kelimesini TEK BAŞINA kullanma;
  her zaman "adil rastgelelik" / "adil rastgelelikle" de. Bunu bir eksiklik gibi değil, doğru
  ve güvenilir bir yöntem olarak sun.
- ASLA "istatistiklere göre kupon üretiyorum" veya "geçmiş verilere dayanarak seçiyorum" GİBİ
  İFADELER KULLANMA — bu yanlış bir izlenim yaratır.
- Geçmiş çekiliş istatistiklerini (sıcak/soğuk sayılar gibi) kullanıcı merak ederse EK BİLGİ
  olarak gösterebilirsin — ama bunun sayı SEÇİMİNİN sebebi olduğunu ASLA iddia etme.
- Örnek iyi cevap (yalnızca sorulursa): "Adil rastgelelikle üretiyorum; piyango sayılarının
  hiçbiri diğerinden daha şanslı değil. İstersen geçmiş çekiliş istatistiklerini de gösterebilirim."

ÇOK ÖNEMLİ - Kupon adedi limiti:
- Bir seferde en fazla 5 kupon üretebilirsin. Bu kesin bir uygulama kuralıdır.
- ASLA "en fazla 10", "10 kupon üretebiliyorum" gibi yanlış bir üst sınır söyleme.
- Kullanıcı 5'ten fazla isterse nazikçe en fazla 5 üretebildiğini söyle; istersen 5 tane
  hazırlayabileceğini belirt.

${userStr}

${APP_SCREEN_MAP}

${appContextText}

Uygulama bilgisi kuralları:
- "Kuponlarım", "Profil", "Sonuçlar" gibi uygulama sorularında yukarıdaki ekran haritasını ve güncel
  durum verisini kullan. Güncel durumda yazmayan bir bilgiyi (ör. kayıtlı kuponların tam listesi,
  ekranda şu an ne göründüğü) uydurma; kullanıcıyı ilgili ekrana yönlendir.
- Kullanıcı kayıtlı kuponlarının sayısını veya dağılımını sorarsa güncel durum satırlarını kullan.
- Ekranları canlı göremezsin; sadece bu mesaj anında okunan özet ve sabit ekran açıklamalarına güven.

Konu yönetimi:
- Loto dışı sorularda nazikçe konuyu loto veya şans oyunlarına çekersin.
- Örneğin biri "hava nasıl?" derse "Bilmiyorum ama şansın açık görünüyor, bir kupon deneyelim mi?" gibi yanıt verebilirsin.
- Siyaset, din, kişisel sorunlar gibi hassas konulara hiç girmezsin.

ÇOK ÖNEMLİ - Kumarbaz Yanılgısına Asla Düşme:
- Geçmişte az çıkan (geciken) bir sayının gelecekte çıkma ihtimalinin arttığını, ya da çok çıkan
  bir sayının "iyi gittiğini" ASLA ima etme. Bu istatistiksel olarak yanlıştır (kumarbaz yanılgısı
  olarak bilinir) — her çekiliş önceki çekilişlerden tamamen bağımsızdır.
- "Sırası gelmiş", "bu sefer çıkabilir", "onların sırası", "gecikti demek yakında çıkar",
  "iyi gidiyor" gibi ifadeleri KESİNLİKLE KULLANMA — ne genel sohbette ne de kupon açıklamalarında.
- Sıcak/soğuk sayı istatistiklerinden bahsedebilirsin ama SADECE geçmişe dönük, nötr bir bilgi
  olarak ("son 100 çekilişte en çok/az çıkan sayılar bunlar") — bunun geleceğe dair hiçbir öngörü
  taşımadığını açıkça belirt veya en azından ima etme.

ÇOK ÖNEMLİ - Toplam Aralığı Karışıklığı Uyarısı:
- İstatistiklerde iki farklı "toplam" bilgisi olabilir: biri kuponun KESİN alabileceği toplam
  aralığı (bu her zaman doğrudur, asla aşılamaz), diğeri geçmiş çekilişlerde açıklanan sayıların
  toplamı (bu bir kupon toplamı DEĞİLDİR, özellikle On Numara'da oyuncu 10 sayı seçerken çekilişte
  22 sayı açıklanır — bu ikisi karıştırılamaz). Kullanıcıya bir toplam aralığı önerirken SADECE
  "KESİN kupon toplam aralığı" satırındaki sınırları temel al, asla geçmiş çekiliş toplamlarını
  kupon toplamı gibi sunma.

ÇOK ÖNEMLİ - Büyük İkramiye Tutarı Hakkında:
- Aşağıdaki istatistiklerde "Güncel büyük ikramiye tutarı" satırı uygulamanın güncel verisidir.
  Kullanıcı sorduğunda bu satırdaki tutarı doğrudan ve güvenle paylaş.
- Satırda "bilmiyorum" yazıyorsa dürüstçe bu bilgiye şu an ulaşamadığını söyle — ASLA rakam
  tahmin etme veya uydurma.
- Tutar varsa çekiliş tarihini de belirt (örn. "Süper Loto büyük ikramiyesi 7 Temmuz çekilişi
  itibarıyla 79 milyon TL"). Elle girildiğinden, resmi kaynaktan kontrol edilmesi gerektiğinden
  veya verinin güncel olmayabileceğinden ASLA bahsetme.

ÇOK ÖNEMLİ - Sayı Üretimi Kuralı:
- Bu sohbette (normal konuşma modunda) KESİNLİKLE hiçbir sayı dizisi, kupon önerisi veya
  "1-2-3-4-5..." gibi örnek sayılar YAZMA. Kupon sayıları SADECE ayrı bir sistem tarafından,
  gerçek bir algoritma ile üretilir — sen asla kendi kafandan sayı uydurmazsın, toplamlarını
  hesaplamazsın, örnek de vermezsin.
- Kullanıcı "neden karşılayamadın", "farklı bir kupon dener misin", "başka sayı önerir misin"
  gibi bir şey sorarsa, ASLA kendin sayı üretme. Bunun yerine kısaca açıkla (örn. çok dar bir
  toplam aralığı istendiyse bunun neden zor olduğunu anlat) ve "yeniden denememi ister misin?"
  diye sor. Kullanıcı evet derse, gerçek üretim sistemi devreye girer.
- Bu kural her koşulda geçerlidir, kullanıcı ısrar etse bile sayı UYDURMAZSIN.

Bugün ${gunAdi}, ${tarih}.

Güncel Oyun Bilgileri:
- Çılgın Sayısal Loto: 1-90 arasından 6 ana numara seçilir. Ayrıca 1-90 arasından 1 adet SüperStar numarası seçilir (ana numaralardan bağımsız, tekrar edebilir). SADECE Pazartesi, Çarşamba ve Cumartesi günleri çekilir.
- Süper Loto: 1-60 arasından 6 numara seçilir. Ek numara yoktur. SADECE Salı, Perşembe ve Pazar günleri çekilir.
- Şans Topu: 1-34 arasından 5 ana numara + 1-14 arasından 1 adet "Şans Topu" numarası seçilir. Şans Topu ana numaralardan tamamen bağımsızdır. SADECE Çarşamba ve Pazar günleri çekilir.
- On Numara: 1-80 arasından 10 numara seçilir. Çekilişte 22 numara belirlenir. Ek numara yoktur. SADECE Pazartesi ve Cuma günleri çekilir.

Aşağıda güncel çekiliş istatistikleri verilmiştir. Kullanıcı sorduğunda bu verilere dayanarak yanıt ver:

${statsText}`;
};

/**
 * Kupon açıklaması için kısa, odaklı bir prompt. Sayılar kod tarafında
 * seçilir; AI'ın tek görevi bu kuponu samimi ve kısa tanıtmak — yöntem veya
 * istatistik gerekçesi uydurmadan.
 */
function getExplanationPrompt(
  game: Game,
  numbers: number[],
  superStar: number | null,
  bonus: number | null,
  userName: string | null,
  constraints: NumberConstraints = {},
  relaxed = false,
  avoidPreviousCoupons = false
): string {
  const userStr = userName ? `Kullanıcının adı: ${userName}, uygun bir yerde ismiyle hitap edebilirsin.` : '';
  const extra = superStar != null
    ? ` SüperStar: ${superStar}.`
    : bonus != null
      ? ` Şans Topu: ${bonus}.`
      : '';

  const notes = describeConstraints(constraints, false, avoidPreviousCoupons);
  const constraintStr = notes.length === 0
    ? ''
    : relaxed
      ? `\nKullanıcı şunu istemişti: ${notes.join('; ')}. AMA bu istek(ler) bu sayı adedi/oyun için
tam karşılanamadı, en yakın kombinasyon hazırlandı. Bunu ASLA "istediğin gibi yaptım" gibi başarılı
bir şekilde sunma — bunun yerine dürüstçe "tam istediğin gibi olmadı ama en yakınını hazırladım"
gibi bir ifade kullan. Kesinlikle karşılandığını iddia etme.`
      : `\nBu kupon, kullanıcının şu özel isteklerine göre hazırlandı: ${notes.join('; ')}. Bu isteklerini
karşıladığını doğal bir cümleyle teyit et (örn. "istediğin gibi ... yaptım" gibi).`;

  return `Sen LottoAI uygulamasının yapay zeka asistanısın, adın Lota. Sıcak, samimi ve kısa konuşursun.

Kullanıcı senden ${game.name} için kupon istedi. Sen (Lota) kullanıcı için şu sayıları seçtin:
${numbers.join(', ')}.${extra}
${constraintStr}

${userStr}

Görevin: Kullanıcıya 1-2 cümlelik, samimi ve kısa bir açıklama yaz. Bu sayıları SEN seçtin;
kullanıcı seçmedi. "Seçtiğin sayılar", "seçimlerin", "verdiğin sayılar" gibi ifadeler KULLANMA.
Bunun yerine "senin için seçtiğim sayılar", "bu kuponu hazırladım", "önerdiğim kupon" gibi
ifadeler kullan.
Örnek iyi açıklama: "Senin için bu ${game.name} kuponunu hazırladım, bol şans!"
ÇOK ÖNEMLİ: Bu açıklamada kuponları NASIL ürettiğinden ASLA bahsetme. Aşağıdakileri KESİNLİKLE
KULLANMA: adil rastgelelik, rastgelelik, rastgele, algoritma, istatistik, olasılık, sık çıkan,
az çıkan, sıcak, soğuk, geciken, geçmiş çekiliş, verilere göre, hesapladım, analiz ettim.
Sayı seçiminin sebebini uydurma; istatistik veya yöntem anlatma. Sayıları DEĞİŞTİRME veya
yeniden ÖNERME.
ÇOK ÖNEMLİ: "Sırası gelmiş", "bu sefer çıkabilir", "onların sırası", "gecikti demek yakında
çıkar" gibi kumarbaz yanılgısı içeren ifadeleri KESİNLİKLE KULLANMA.
Markdown kullanma. Kazanma garantisi verme.`;
}

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  coupon?: {
    game: string;
    numbers: number[];
    superStar: number | null;
    bonus: number | null;
    explanation: string;
  };
};

/** Basit, bağımlılıksız bir oturum kimliği üretir (gerçek UUID gerekmiyor). */
function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Bir sohbet mesajını, kupon kartı içeriyorsa sayılarıyla birlikte, okunabilir
 * tek bir metne çevirir — `ai_conversations` tablosuna bu haliyle yazılır.
 * Ham JSON yerine düz metin tutmak, geliştiricinin Supabase'den kayıtları
 * hızlıca okuyup AI'ın cevaplarını değerlendirmesini kolaylaştırır.
 */
function messageToLogText(msg: ChatMessage): string {
  if (!msg.coupon) return msg.content;
  const c = msg.coupon;
  const extra = c.superStar != null ? ` + SüperStar ${c.superStar}` : c.bonus != null ? ` + Şans Topu ${c.bonus}` : '';
  return `${msg.content} [${c.game}: ${c.numbers.join('-')}${extra}] ${c.explanation}`.trim();
}

/**
 * Bir mesajı `ai_conversations` tablosuna kaydeder. Bu SADECE ürünü
 * geliştirmek için AI'ın verdiği cevapları incelemeye yarar — kullanıcı
 * arayüzünden hiçbir zaman geri okunmaz (bkz. RLS: sadece insert izni var,
 * select izni yok, ai-conversations-schema.sql dosyasına bak). Kayıt
 * başarısız olursa sohbeti ASLA bozmaz — sessizce yutulur, kullanıcı bunu
 * fark etmez.
 */
async function logConversationMessage(sessionId: string, userId: string | undefined, msg: ChatMessage): Promise<void> {
  if (!userId) return; // giriş yapılmamışsa (send() zaten bunu engelliyor) kaydetmeyi atla
  try {
    await supabase.from('ai_conversations').insert({
      user_id: userId,
      session_id: sessionId,
      role: msg.role,
      content: messageToLogText(msg),
    });
  } catch {
    // Loglama başarısız olsa bile kullanıcı deneyimi ASLA etkilenmemeli.
  }
}

/**
 * Hata türüne göre, Lota'nın ağzından yazılmış farklı mesajlar.
 * Tek tip "yanıt veremiyorum" yerine kullanıcıya ne olduğunu ve
 * ne yapabileceğini söyler — güven verir.
 */
function errorMessageFor(errorType?: AIErrorType): string {
  switch (errorType) {
    case 'network':
      return 'İnternet bağlantında bir sorun var gibi görünüyor. Bağlantını kontrol edip tekrar dener misin?';
    case 'timeout':
      return 'Cevabım her zamankinden uzun sürdü, bağlantı yavaş olabilir. Bir daha dener misin?';
    case 'auth':
      return 'Oturumunda bir sorun oluştu. Çıkış yapıp tekrar giriş yaptıktan sonra yine buradayım.';
    default:
      return 'Şu an biraz yoğunum, kısa bir süre sonra tekrar dener misin?';
  }
}

/**
 * classifyCouponIntent'ten dönen alanları, couponGenerator'ın anladığı
 * NumberConstraints biçimine çevirir. Oyunun gerçek sınırlarına (max, count)
 * göre geçersiz değerleri sessizce eler — kullanıcı hatalı bir istek yazsa
 * bile uygulama çökmez, sadece o kısıtlama yok sayılır.
 */
/**
 * Kullanıcının gerçekten yazdığı metinleri (bu mesaj + son sohbetteki
 * kullanıcı mesajları) tek bir küçük harfli havuzda toplar. Bu havuz,
 * classifyCouponIntent'in halüsinasyon yapıp yapmadığını (yani kullanıcı
 * hiç istemediği bir kısıtlama "uydurup uydurmadığını") doğrulamak için
 * kullanılır — LLM'ler "belirtilmediyse null bırak" talimatına uysa bile
 * bazen kendiliğinden değer üretebiliyor, bu yüzden kod tarafında ayrıca
 * kontrol ediyoruz. Sadece kullanıcı mesajları kullanılır (asistan
 * mesajları değil) ki asistanın kendi cümleleri yanlışlıkla "onay" sayılmasın.
 */
function collectUserIntentText(content: string, recentContext: { role: string; content: string }[]): string {
  const parts = [content, ...recentContext.filter((m) => m.role === 'user').map((m) => m.content)];
  return parts.join(' ').toLocaleLowerCase('tr-TR');
}

/**
 * classifyCouponIntent'ten dönen alanları, couponGenerator'ın anladığı
 * NumberConstraints biçimine çevirir. Oyunun gerçek sınırlarına (max, count)
 * göre geçersiz değerleri sessizce eler. Ayrıca sayısal/kategorik
 * kısıtlamaları (toplam aralığı, ardışık sınırı, denge vb.) yalnızca
 * kullanıcının mesajında bu isteği gösteren gerçek bir kelime varsa uygular
 * — AI'ın "halüsinasyon" yaparak var olmayan bir istek uydurmasına karşı
 * bir güvenlik ağıdır.
 */
function buildConstraintsFromIntent(intent: CouponIntent | null, game: Game, userText: string): NumberConstraints {
  if (!intent) return {};
  const constraints: NumberConstraints = {};

  if (
    intent.sumMin != null && intent.sumMax != null && intent.sumMin <= intent.sumMax &&
    userText.includes('toplam')
  ) {
    constraints.sumRange = { min: intent.sumMin, max: intent.sumMax };
  }
  if (intent.mustInclude) {
    const valid = intent.mustInclude.filter((n) => n >= 1 && n <= game.max);
    if (valid.length > 0 && valid.length <= game.count) constraints.mustInclude = valid;
  }
  if (intent.mustExclude) {
    const valid = intent.mustExclude.filter((n) => n >= 1 && n <= game.max);
    if (valid.length > 0) constraints.mustExclude = valid;
  }
  // "1 ile 20 arası olmasın" gibi bir aralık isteği varsa, o aralıktaki
  // TÜM sayıları mustExclude'a genişletiriz. Bu, AI'ın 20 sayıyı tek tek
  // JSON'a yazmasını gerektirmez (hem daha güvenilir hem de dizi sınırına takılmaz).
  if (
    intent.excludeRangeMin != null && intent.excludeRangeMax != null &&
    intent.excludeRangeMin <= intent.excludeRangeMax &&
    userText.includes('aras')
  ) {
    const rangeStart = Math.max(1, intent.excludeRangeMin);
    const rangeEnd = Math.min(game.max, intent.excludeRangeMax);
    if (rangeStart <= rangeEnd) {
      const rangeExcluded = new Set(constraints.mustExclude ?? []);
      for (let n = rangeStart; n <= rangeEnd; n++) rangeExcluded.add(n);
      constraints.mustExclude = Array.from(rangeExcluded);
    }
  }
  if (intent.balanceEvenOdd && (userText.includes('dengeli') || userText.includes('çift') || userText.includes('tek '))) {
    constraints.balanceEvenOdd = true;
  }
  if (
    intent.avoidPatterns &&
    (userText.includes('ardışık') || userText.includes('sıradan') || userText.includes('örüntü') || userText.includes('desen'))
  ) {
    constraints.avoidObviousPatterns = true;
  }
  if (intent.spreadZones && (userText.includes('yayıl') || userText.includes('aralığa'))) {
    constraints.spreadAcrossZones = true;
  }
  if (intent.maxConsecutive != null && intent.maxConsecutive >= 1 && userText.includes('ardışık')) {
    constraints.maxConsecutive = intent.maxConsecutive;
  }
  if (intent.onlyPrimes && userText.includes('asal')) {
    constraints.onlyPrimes = true;
  }

  return constraints;
}

/** noOverlap isteği de aynı halüsinasyon riskini taşır — metin doğrulamasıyla korunur. */
function intentWantsNoOverlap(intent: CouponIntent | null, userText: string): boolean {
  if (!intent?.noOverlap) return false;
  return userText.includes('farklı') || userText.includes('ortak') || userText.includes('çakış');
}

/** avoidPreviousCoupons isteği de aynı halüsinasyon riskini taşır — metin doğrulamasıyla korunur. */
function intentWantsAvoidPrevious(intent: CouponIntent | null, userText: string): boolean {
  if (!intent?.avoidPreviousCoupons) return false;
  return (
    userText.includes('önceki') ||
    userText.includes('geçmiş') ||
    userText.includes('daha önce') ||
    userText.includes('tekrar')
  );
}

/**
 * Toplam aralığı isteği matematiksel olarak imkansızsa (ör. 10 sayı seçilen
 * bir oyunda "toplamı 50 olsun" — en düşük olası toplam 55'tir), boşuna
 * yüzlerce deneme yapmadan bunu tespit edip kullanıcıya NET bir sayısal
 * açıklama sunar. Mümkünse null döner (normal üretime devam edilir).
 */
function buildImpossibleSumRangeNote(game: Game, constraints: NumberConstraints): string | null {
  if (!constraints.sumRange) return null;
  const { feasible, minPossibleSum, maxPossibleSum } = checkSumRangeFeasibility(game.count, game.max, constraints.sumRange);
  if (feasible) return null;
  return (
    `Toplamı ${constraints.sumRange.min}-${constraints.sumRange.max} arası olan bir kupon üretmek, ` +
    `${game.name}'da ${game.count} sayı seçildiğinde matematiksel olarak mümkün değil — en düşük olası ` +
    `toplam ${minPossibleSum}, en yüksek olası toplam ${maxPossibleSum}. Bu isteğini dikkate almadan, ` +
    `diğer şartlarına uyan bir kupon hazırladım.`
  );
}

/**
 * Kullanıcının belirtilen oyun için daha önce kaydettiği kuponları okuyup,
 * `generateCouponWithConstraints`'in `avoidExactMatches` parametresine
 * verilebilecek bir küme oluşturur. Kayıtlı kupon yoksa veya okuma
 * başarısız olursa boş küme döner — bu durumda üretim normal şekilde devam
 * eder, kullanıcı asla eli boş kalmaz.
 */
async function buildAvoidSetFromSavedCoupons(gameName: string): Promise<Set<string>> {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS);
    if (!existing) return new Set();
    const saved = JSON.parse(existing) as { game: string; numbers: number[] }[];
    const numberArrays = saved.filter((cp) => cp.game === gameName).map((cp) => cp.numbers);
    return buildAvoidSet(numberArrays);
  } catch {
    return new Set();
  }
}

/**
 * "Sadece asal sayılardan olsun" isteği matematiksel olarak imkansızsa
 * (oyunun aralığında yeterli asal sayı yoksa), boşuna deneme yapmadan bunu
 * tespit edip kullanıcıya net bir açıklama sunar. Mümkünse null döner.
 */
function buildImpossiblePrimeNote(game: Game, constraints: NumberConstraints): string | null {
  if (!constraints.onlyPrimes) return null;
  const { feasible, availablePrimes } = checkPrimeFeasibility(game.count, game.max);
  if (feasible) return null;
  return (
    `${game.name}'da 1-${game.max} arasında sadece ${availablePrimes} asal sayı var, ama ${game.count} ` +
    `sayı seçilmesi gerekiyor — bu yüzden sadece asal sayılardan oluşan bir kupon üretmek mümkün değil. ` +
    `Bu isteğini dikkate almadan, diğer şartlarına uyan bir kupon hazırladım.`
  );
}

/**
 * Kullanıcı mustInclude/mustExclude için 30'dan fazla tekil sayı yazdıysa
 * (nadir ama olabilir), bunu sessizce kırpmak yerine açıkça bildiririz —
 * aksi halde kullanıcı isteğinin bir kısmının neden uygulanmadığını hiç
 * anlayamaz.
 */
function buildTruncationWarning(intent: CouponIntent | null): string | null {
  if (!intent) return null;
  const parts: string[] = [];
  if (intent.countRequestedRaw) {
    parts.push(
      `${intent.countRequestedRaw} kupon istedin, ben bir seferde en fazla 5 kupon üretebiliyorum, 5 tanesini hazırladım`
    );
  }
  if (intent.mustIncludeTruncatedFrom) {
    parts.push(
      `mutlaka bulunması gereken sayılar için ${intent.mustIncludeTruncatedFrom} sayı belirttin, ben en fazla 30 tanesini aynı anda işleyebiliyorum, ilk 30'unu dikkate aldım`
    );
  }
  if (intent.mustExcludeTruncatedFrom) {
    parts.push(
      `hariç tutulacak sayılar için ${intent.mustExcludeTruncatedFrom} sayı belirttin, en fazla 30 tanesini aynı anda işleyebiliyorum, ilk 30'unu dikkate aldım`
    );
  }
  if (parts.length === 0) return null;
  return `${parts.join('; ')}.`;
}

/** Uygulanan kısıtlamaları kullanıcının anlayacağı kısa Türkçe ifadelere çevirir. */
function describeConstraints(constraints: NumberConstraints, noOverlap: boolean, avoidPrevious = false): string[] {
  const notes: string[] = [];
  if (constraints.sumRange) notes.push(`toplamları ${constraints.sumRange.min}-${constraints.sumRange.max} aralığında`);
  if (constraints.mustInclude?.length) notes.push(`${constraints.mustInclude.join(', ')} sayılarını içeriyor`);
  if (constraints.mustExclude?.length) notes.push(`${constraints.mustExclude.join(', ')} sayılarını içermiyor`);
  if (constraints.balanceEvenOdd) notes.push('çift/tek dengeli');
  if (constraints.avoidObviousPatterns) notes.push('belirgin bir örüntü taşımıyor');
  if (constraints.spreadAcrossZones) notes.push('sayı aralığına yayılmış');
  if (constraints.maxConsecutive != null) notes.push(`en fazla ${constraints.maxConsecutive} ardışık sayı içeriyor`);
  if (constraints.onlyPrimes) notes.push('sadece asal sayılardan oluşuyor');
  if (noOverlap) notes.push('birbirleriyle hiç ortak sayı taşımıyor');
  if (avoidPrevious) notes.push('daha önce kaydettiğin kuponlardan farklı');
  return notes;
}

const CONSTRAINT_LABELS: Record<ConstraintKey, string> = {
  sumRange: 'toplam aralığını',
  maxConsecutive: 'ardışık sayı sınırını',
  spreadAcrossZones: 'sayıları aralığa yayma isteğini',
  balanceEvenOdd: 'çift/tek dengesini',
  avoidObviousPatterns: 'belirgin örüntülerden kaçınma isteğini',
  mustInclude: 'mutlaka istediğin sayı(lar)ı',
  mustExclude: 'hariç tutmak istediğin sayı(lar)ı',
  onlyPrimes: 'sadece asal sayı isteğini',
};

/**
 * `relaxed: true` döndüğünde, kullanıcıya TAM OLARAK hangi isteğinin
 * karşılanamadığını söyleyen bir not üretir. Genel "bazı şartlar
 * karşılanamadı" mesajı yerine, örn. "toplam aralığını tam karşılayamadım"
 * gibi somut bir açıklama — kullanıcı neyin çakıştığını anlar.
 */
function buildRelaxedNote(numbers: number[], max: number, constraints: NumberConstraints): string {
  const violated = getViolatedConstraints(numbers, max, constraints);
  if (violated.length === 0) {
    return 'Not: istediğin bazı özel şartları tam karşılayamadım, en yakın uygun kombinasyonu hazırladım.';
  }
  const labels = violated.map((key) => CONSTRAINT_LABELS[key]);
  const joined = labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(', ')} ve ${labels[labels.length - 1]}`;
  // Nedeni kesin bilmiyoruz — başka bir istekle gerçekten çakışmış da olabilir,
  // ya da istenen aralık/kural bu kadar sayı için istatistiksel olarak çok dar
  // da olabilir. Emin olmadığımız bir sebep uydurmak yerine nötr bir ifade kullanılır.
  return `Not: ${joined} tam karşılayamadım, en yakın uygun kombinasyonu hazırladım.`;
}

/** AI asistanında bir seferde üretilebilecek en fazla kupon sayısı. */
const MAX_AI_COUPONS = 5;

const SUGGESTIONS = [
  'Şanslı bir Çılgın Sayısal kuponu üret',
  'Süper Loto nasıl oynanır?',
  'Bu hafta hangi çekilişler var?',
  'Sıcak sayılar ne demek?',
];

// Oyun adı eşleşmesi için, en spesifik (uzun) ifadeler önce kontrol edilir.
const GAME_NAME_PATTERNS: { id: GameId; patterns: string[] }[] = [
  { id: 'cilgin', patterns: ['çılgın sayısal', 'çılgın loto', 'sayısal loto'] },
  { id: 'superloto', patterns: ['süper loto'] },
  { id: 'sanstopu', patterns: ['şans topu'] },
  { id: 'onnumara', patterns: ['on numara'] },
];

/**
 * Sadece oyun adını arar, aksiyon kelimesi gerektirmez. Kupon isteği tespiti
 * artık classifyCouponIntent (AI tabanlı) ile yapılıyor; bu fonksiyon yalnızca
 * "hangi oyun?" sorusuna verilen cevabı eşlemek için kullanılır.
 */
function matchGameNameOnly(text: string): GameId | null {
  const lower = text.toLocaleLowerCase('tr-TR');
  for (const gc of GAME_NAME_PATTERNS) {
    if (gc.patterns.some((p) => lower.includes(p))) return gc.id;
  }
  return null;
}

function TypingDots({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, opacity: 0.55 }} />
      ))}
    </View>
  );
}

export default function AIAssistantScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const scrollRef = useRef<ScrollView>(null);
  const { showAlert } = useAlert();
  const { user } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [awaitingGameChoice, setAwaitingGameChoice] = useState(false);
  // "Hangi oyun için kupon istiyorsun?" diye sorduğumuzda, kullanıcının ilk
  // isteğindeki toplam aralığı/mustInclude gibi özel istekleri kaybetmemek
  // için burada saklarız; kullanıcı oyunu söyleyince tekrar kullanılır.
  const [pendingIntent, setPendingIntent] = useState<CouponIntent | null>(null);
  const [pendingIntentText, setPendingIntentText] = useState('');
  // Bu ekran her açıldığında (ya da kullanıcı "Sohbeti temizle" dediğinde)
  // yeni bir oturum kimliği üretilir — ai_conversations tablosundaki
  // mesajlar bu kimlikle gruplanır, tek bir sohbeti baştan sona görebiliriz.
  const [sessionId, setSessionId] = useState<string>(generateSessionId);
  const isMounted = useRef(true);

  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  React.useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.USER_NAME).then((name) => {
      if (name) setUserName(name);
    });
  }, []);

  /**
   * Ekrana yeni bir mesaj eklerken kullanılan TEK yol — hem görünen sohbete
   * (state) ekler hem de arka planda `ai_conversations`'a kaydeder. Tüm
   * mesaj eklemeleri bunun üzerinden geçmeli ki hiçbir mesaj loglanmadan
   * kaçmasın. Loglama arka planda (await edilmeden) çalışır — kullanıcı
   * yanıtı beklemez, bir gecikme yaşamaz.
   */
  const appendMessage = (msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
    void logConversationMessage(sessionId, user?.id, msg);
  };

  const appendMessages = (msgs: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...msgs]);
    msgs.forEach((msg) => void logConversationMessage(sessionId, user?.id, msg));
  };

  const handleClearMessages = () => {
    if (messages.length === 0) return;
    showAlert('Sohbeti temizle', 'Tüm mesajlar silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Temizle',
        style: 'destructive',
        onPress: () => {
          softHaptic();
          setMessages([]);
          setSessionId(generateSessionId());
          setAwaitingGameChoice(false);
          setPendingIntent(null);
          setPendingIntentText('');
        },
      },
    ]);
  };

  /**
   * Belirli bir oyun için kupon üretir: sayılar kod tarafında (algoritmik)
   * seçilir, AI sadece bu seçim için kısa bir açıklama yazar.
   */
  /**
   * Belirli bir oyun için 1 veya daha fazla kupon üretir: sayılar kod
   * tarafında (algoritmik) seçilir, AI sadece bu seçim(ler) için kısa bir
   * açıklama yazar. `constraints` ve `noOverlap`, kullanıcının doğal dilde
   * belirttiği özel isteklerden (toplam aralığı, belirli sayı, çakışmama
   * vb.) türetilir — bkz. buildConstraintsFromIntent.
   */
  const generateCoupon = async (
    gameId: GameId,
    userContent: string,
    userMessageAlreadyShown = false,
    constraints: NumberConstraints = {},
    requestedCount = 1,
    noOverlap = false,
    avoidPreviousCoupons = false
  ) => {
    const game = getGameById(gameId);
    if (!userMessageAlreadyShown) {
      appendMessage({ role: 'user', content: userContent });
      setInput('');
      setLoading(true);
    }

    try {
      // Toplam aralığı isteği matematiksel olarak imkansızsa, boşuna deneme
      // yapmadan bunu bildirip o kısıtlamayı kaldırıyoruz — kullanıcı yine
      // bir kupon alır, ama neden bu isteğin uygulanmadığını NET olarak bilir.
      const impossibleSumNote = buildImpossibleSumRangeNote(game, constraints);
      const afterSumConstraints: NumberConstraints = impossibleSumNote
        ? { ...constraints, sumRange: undefined }
        : constraints;
      if (impossibleSumNote) {
        appendMessage({ role: 'assistant', content: impossibleSumNote });
      }

      // Aynı şekilde "sadece asal sayılardan olsun" isteği bu oyun için
      // matematiksel olarak imkansızsa (yeterli asal sayı yoksa) önceden
      // tespit edilip kaldırılır.
      const impossiblePrimeNote = buildImpossiblePrimeNote(game, afterSumConstraints);
      const effectiveConstraints: NumberConstraints = impossiblePrimeNote
        ? { ...afterSumConstraints, onlyPrimes: undefined }
        : afterSumConstraints;
      if (impossiblePrimeNote) {
        appendMessage({ role: 'assistant', content: impossiblePrimeNote });
      }

      // "Önceki kuponlarımdan farklı olsun" istendiyse, bu oyun için
      // kaydedilmiş kuponları oku ve üretim sırasında bunlardan kaçınılacak
      // bir küme olarak kullan. Kombinasyon sayısı milyonlarca olduğu için
      // bu pratikte neredeyse hiç devreye girmez, ama kullanıcı isterse
      // dürüstçe uygulanır.
      const avoidExactMatches = avoidPreviousCoupons ? await buildAvoidSetFromSavedCoupons(game.name) : undefined;

      const howMany = Math.min(Math.max(requestedCount, 1), MAX_AI_COUPONS);

      const results = howMany > 1
        ? generateMultipleCoupons(game.count, game.max, howMany, { constraints: effectiveConstraints, noOverlap, avoidExactMatches })
        : [generateCouponWithConstraints(game.count, game.max, effectiveConstraints, avoidExactMatches)];

      const coupons = results.map((r) => ({
        numbers: r.numbers,
        superStar: game.superStar ? pickSingleNumber(game.superStar.max) : null,
        bonus: game.bonus ? pickSingleNumber(game.bonus.max) : null,
        relaxed: r.relaxed,
      }));

      // Her kupon için ayrı açıklama — paralel çağrı ile bekleme süresini kısaltır.
      const explanations = await Promise.all(
        coupons.map(async (cp) => {
          const prompt = getExplanationPrompt(
            game,
            cp.numbers,
            cp.superStar,
            cp.bonus,
            userName,
            effectiveConstraints,
            cp.relaxed,
            avoidPreviousCoupons
          );
          const result = await chatWithAI([{ role: 'user', content: prompt }]);
          const explanation = result.reply?.trim()
            ? stripMarkdown(result.reply.trim())
            : 'Senin için bir kupon hazırladım.';
          return cp.relaxed
            ? `${explanation} (${buildRelaxedNote(cp.numbers, game.max, effectiveConstraints)})`
            : explanation;
        })
      );
      if (!isMounted.current) return;

      if (howMany > 1) {
        const introParts = [`${game.name} için ${coupons.length} kupon hazır:`];
        if (noOverlap) introParts.push('İstediğin gibi kuponlar birbirleriyle ortak sayı taşımıyor.');
        const newMessages: ChatMessage[] = [{ role: 'assistant', content: introParts.join(' ') }];
        coupons.forEach((cp, idx) => {
          newMessages.push({
            role: 'assistant',
            content: `${idx + 1}. kupon`,
            coupon: {
              game: game.name,
              numbers: cp.numbers,
              superStar: cp.superStar,
              bonus: cp.bonus,
              explanation: explanations[idx],
            },
          });
        });
        appendMessages(newMessages);
      } else {
        const single = coupons[0];
        appendMessage({
          role: 'assistant',
          content: `İşte ${game.name} için hazırladığım kupon!`,
          coupon: {
            game: game.name,
            numbers: single.numbers,
            superStar: single.superStar,
            bonus: single.bonus,
            explanation: explanations[0],
          },
        });
      }
    } catch {
      if (!isMounted.current) return;
      appendMessage({ role: 'assistant', content: 'Kupon üretirken bir sorun oluştu, tekrar dener misin?' });
    } finally {
      if (isMounted.current) {
        setLoading(false);
        scrollRef.current?.scrollToEnd({ animated: false });
      }
    }
  };

  /** Normal sohbet akışı — kupon üretme dışındaki tüm mesajlar için. */
  const sendChatMessage = async (content: string, userMessageAlreadyShown = false) => {
    if (!userMessageAlreadyShown) {
      appendMessage({ role: 'user', content });
      setInput('');
      setLoading(true);
    }

    let statsText = '';
    let appContextText = '';
    let resolvedUserName = userName;
    try {
      const [stats, snapshot] = await Promise.all([
        getCachedStatsText(),
        buildAppContextSnapshot(),
      ]);
      statsText = stats;
      appContextText = formatAppContextForPrompt(snapshot);
      resolvedUserName = snapshot.userName ?? userName;
      if (snapshot.userName && snapshot.userName !== userName) {
        setUserName(snapshot.userName);
      }
    } catch {
      statsText = 'İstatistikler şu anda yüklenemedi.';
      appContextText = 'Kullanıcının güncel durumu şu an okunamadı.';
    }

    // Bağlam artık oturum boyunca TAM olarak korunur — DeepSeek'in güncel
    // (1M token) bağlam penceresi bunu rahatça kaldırıyor. Bilinçli bir
    // güvenlik tavanı KONULMADI: uygulama henüz yayınlanmadı, tek kullanıcı
    // biziz; yayınlandığında zaten planlanan kullanıcı bazlı token/kota
    // sistemi bu riski üstlenecek — o zaman burayı tekrar değerlendirebiliriz.
    const recentMessages = messages;

    const apiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: getBasePrompt(statsText, resolvedUserName, appContextText) },
      ...recentMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content },
    ];

    const result = await chatWithAI(apiMessages);
    if (!isMounted.current) return;

    if (result.reply) {
      const replyText = stripMarkdown(result.reply.trim());
      appendMessage({ role: 'assistant', content: replyText });
    } else {
      appendMessage({ role: 'assistant', content: errorMessageFor(result.errorType) });
    }

    if (isMounted.current) {
      setLoading(false);
      scrollRef.current?.scrollToEnd({ animated: false });
    }
  };

  const askForCouponGame = async (
    content: string,
    userMessageAlreadyShown = false,
    intent: CouponIntent | null = null,
    userText = ''
  ) => {
    if (!userMessageAlreadyShown) {
      appendMessage({ role: 'user', content });
      setInput('');
      setLoading(true);
      scrollRef.current?.scrollToEnd({ animated: false });
    }
    setAwaitingGameChoice(true);
    setPendingIntent(intent);
    setPendingIntentText(userText);

    // Bu mesaj hazır bir metin (gerçek AI çağrısı değil), ama diğer
    // cevaplarla tutarlı hissettirmesi için kısa bir "düşünme" süresi
    // ekliyoruz — aksi halde anında çıkıp yapay durur.
    const thinkingDelay = 2000 + Math.random() * 1500;
    await new Promise((resolve) => setTimeout(resolve, thinkingDelay));
    if (!isMounted.current) return;

    appendMessage({
      role: 'assistant',
      content: 'Hangi oyun için kupon istiyorsun? Çılgın Sayısal Loto, Süper Loto, Şans Topu veya On Numara diyebilirsin.',
    });
    setLoading(false);
    scrollRef.current?.scrollToEnd({ animated: false });
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    // Giriş yapılmamışsa login ekranına yönlendir
    if (!user) {
      softHaptic();
      router.push('/login' as any);
      return;
    }

    softHaptic();

    // Mesajı hemen göster — sınıflandırma arkada çalışır.
    appendMessage({ role: 'user', content });
    setInput('');
    setLoading(true);
    scrollRef.current?.scrollToEnd({ animated: false });

    // Bir önceki mesajda "hangi oyun?" diye sorduysak, bu mesaj sadece
    // oyun adı içeriyorsa doğrudan üret. İlk istekteki özel şartlar
    // (toplam aralığı, mustInclude vb.) pendingIntent'te saklanmıştı.
    if (awaitingGameChoice) {
      const gameFromChoice = matchGameNameOnly(content);
      if (gameFromChoice) {
        setAwaitingGameChoice(false);
        const game = getGameById(gameFromChoice);
        const constraints = buildConstraintsFromIntent(pendingIntent, game, pendingIntentText);
        const count = pendingIntent?.count ?? 1;
        const noOverlap = intentWantsNoOverlap(pendingIntent, pendingIntentText);
        const avoidPrevious = intentWantsAvoidPrevious(pendingIntent, pendingIntentText);
        const truncationWarning = buildTruncationWarning(pendingIntent);
        setPendingIntent(null);
        setPendingIntentText('');
        if (truncationWarning) {
          appendMessage({ role: 'assistant', content: truncationWarning });
        }
        await generateCoupon(gameFromChoice, content, true, constraints, count, noOverlap, avoidPrevious);
        return;
      }
      setAwaitingGameChoice(false);
      setPendingIntent(null);
      setPendingIntentText('');
      // Eşleşme yoksa normal sohbete düş, kullanıcıyı zorlamayalım.
    }

    // Kupon isteği mi, hangi oyun için, hangi özel şartlarla — hepsi
    // AI tabanlı tek bir sınıflandırma çağrısıyla anlaşılır.
    const recentContext = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    const intent = await classifyCouponIntent(content, recentContext);
    if (!isMounted.current) return;

    if (intent?.intent === 'generate_coupon') {
      const userText = collectUserIntentText(content, recentContext);
      const truncationWarning = buildTruncationWarning(intent);
      if (truncationWarning) {
        appendMessage({ role: 'assistant', content: truncationWarning });
      }
      if (intent.gameId) {
        const game = getGameById(intent.gameId);
        const constraints = buildConstraintsFromIntent(intent, game, userText);
        const count = intent.count ?? 1;
        const noOverlap = intentWantsNoOverlap(intent, userText);
        const avoidPrevious = intentWantsAvoidPrevious(intent, userText);
        await generateCoupon(intent.gameId, content, true, constraints, count, noOverlap, avoidPrevious);
        return;
      }
      await askForCouponGame(content, true, intent, userText);
      return;
    }

    await sendChatMessage(content, true);
  };

  const saveCoupon = async (coupon: ChatMessage['coupon']) => {
    if (!coupon) return;
    softHaptic();
    try {
      const existing = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS);
      const coupons = existing ? JSON.parse(existing) : [];
      const gameConfig = GAMES.find((g) => g.name === coupon.game);
      const gameColor = GameAccent[gameConfig?.id ?? 'cilgin'] ?? c.brand;
      coupons.unshift({
        id: Date.now(),
        game: coupon.game,
        icon: gameConfig?.icon || '',
        color: gameColor,
        numbers: coupon.numbers,
        bonus: coupon.bonus !== null ? [coupon.bonus] : [],
        superStar: coupon.superStar,
        date: new Date().toLocaleDateString('tr-TR'),
        timestamp: new Date().toISOString(),
        matchedCount: undefined,
        aiExplanation: coupon.explanation,
      });
      await AsyncStorage.setItem(STORAGE_KEYS.SAVED_COUPONS, JSON.stringify(coupons));
      showAlert('Kaydedildi', "AI kuponu Kuponlarım'a eklendi.", [
        { text: 'Tamam' },
        { text: 'Kuponlarıma git', onPress: () => router.push('/(tabs)/saved') },
      ]);
    } catch {
      showAlert('Hata', 'Kupon kaydedilemedi.');
    }
  };

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <View style={{ paddingTop: insets.top + 6 }}>
        <View style={s.nav}>
          <Pressable
            onPress={() => { softHaptic(); router.back(); }}
            style={[s.navBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
            hitSlop={6}
          >
            <BackIcon color={c.text2} size={22} />
          </Pressable>
          <View style={[s.navAvatar, { backgroundColor: c.brandSoft }]}>
            <AIAssistantIcon color={c.brand} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.navTitle}>Lota</Text>
            <View style={s.navStatus}>
              <View style={[s.statusDot, { backgroundColor: c.brand }]} />
              <Text style={[s.navStatusText, { color: c.brand }]}>Çevrimiçi</Text>
            </View>
          </View>
          {messages.length > 0 ? (
            <Pressable
              onPress={() => { softHaptic(); handleClearMessages(); }}
              style={[s.navBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
              hitSlop={6}
            >
              <CloseIcon color={c.text2} size={20} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {messages.length === 0 ? (
          <ScrollView
            contentContainerStyle={s.empty}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[s.emptyIcon, { backgroundColor: c.brandSoft }]}>
              <AIAssistantIcon color={c.brand} size={34} />
            </View>
            <Text style={s.emptyTitle}>Merhaba, ben Lota</Text>
            <Text style={s.emptyDesc}>
              {user
                ? 'Loto hakkında soru sor ya da senin için kupon üreteyim. Şununla başlayabilirsin:'
                : 'Loto hakkında soru sormak veya kupon ürettirmek için giriş yapman gerekiyor.'}
            </Text>
            {user ? (
              <View style={s.suggestions}>
                {SUGGESTIONS.map((sug, i) => (
                  <PressableScale
                    key={i}
                    onPress={() => { softHaptic(); send(sug); }}
                    style={[s.suggestion, { backgroundColor: c.surface, borderColor: c.border }]}
                  >
                    <Text style={s.suggestionText}>{sug}</Text>
                  </PressableScale>
                ))}
              </View>
            ) : (
              <AppButton
                label="Giriş Yap"
                onPress={() => router.push('/login' as any)}
                style={{ marginTop: 24, width: '100%' }}
              />
            )}
          </ScrollView>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((msg, index) => (
              <View key={index} style={{ gap: 12 }}>
                <View
                  style={[
                    s.bubble,
                    msg.role === 'user'
                      ? [s.userBubble, { backgroundColor: c.brand }]
                      : [s.aiBubble, { backgroundColor: c.surface, borderColor: c.border }],
                  ]}
                >
                  <Text style={[s.bubbleText, { color: msg.role === 'user' ? c.brandText : c.text }]}>
                    {msg.content}
                  </Text>
                </View>
                {msg.coupon ? (
                  <AICouponCard coupon={msg.coupon} theme={theme} onSave={() => saveCoupon(msg.coupon)} />
                ) : null}
              </View>
            ))}
            {loading ? (
              <View style={[s.bubble, s.aiBubble, { backgroundColor: c.surface, borderColor: c.border, paddingVertical: 14 }]}>
                <TypingDots color={c.text3} />
              </View>
            ) : null}
          </ScrollView>
        )}

        <View style={[s.inputRow, { borderTopColor: c.hairline, paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }]}>
          <TextInput
            style={[s.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
            value={input}
            onChangeText={setInput}
            placeholder={user ? "Lota'ya bir şey yaz…" : "Kullanmak için giriş yap…"}
            placeholderTextColor={c.text3}
            multiline
            editable={!loading}
          />
          <Pressable
            onPress={() => send()}
            disabled={loading || !input.trim()}
            style={[s.sendBtn, { backgroundColor: c.brand, opacity: loading || !input.trim() ? 0.5 : 1 }]}
          >
            <SendIcon color={c.brandText} size={20} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function AICouponCard({ coupon, theme, onSave }: {
  coupon: NonNullable<ChatMessage['coupon']>;
  theme: AppTheme;
  onSave: () => void;
}) {
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const id = getGameByName(coupon.game)?.id ?? 'cilgin';
  const color = GameAccent[id] ?? c.brand;

  return (
    <View style={[s.couponCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={s.couponHead}>
        <GameEmblem game={id} size={34} />
        <View>
          <Text style={s.couponGame}>{coupon.game}</Text>
          <Text style={s.couponTag}>Lota'nın önerisi</Text>
        </View>
      </View>

      <View style={s.couponBalls}>
        {coupon.numbers.map((n, i) => (
          <NumberBall key={i} value={n} color={color} size={38} />
        ))}
      </View>

      {coupon.bonus !== null && (
        <View style={s.couponExtra}>
          <Text style={[s.couponExtraLabel, { color: c.text3 }]}>Şans Topu</Text>
          <NumberBall value={coupon.bonus} variant="bonus" size={38} />
        </View>
      )}

      {coupon.superStar !== null && (
        <View style={s.couponExtra}>
          <Text style={[s.couponExtraLabel, { color: c.text3 }]}>SüperStar</Text>
          <NumberBall value={coupon.superStar} variant="star" size={38} />
        </View>
      )}

      {coupon.explanation ? <Text style={s.couponExp}>{coupon.explanation}</Text> : null}
      <AppButton
        label="Kuponu kaydet"
        onPress={onSave}
        iconLeft={(cl, sz) => <BookmarkIcon color={cl} size={sz} />}
        style={{ marginTop: 13 }}
      />
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    nav: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.hairline },
    navBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    navAvatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    navTitle: { ...ty.h3, color: c.text },
    navStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    navStatusText: { ...ty.caption, fontFamily: theme.font.semibold },

    empty: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
    emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    emptyTitle: { ...ty.h2, color: c.text },
    emptyDesc: { ...ty.body, color: c.text2, textAlign: 'center', maxWidth: 290, marginTop: 8 },
    suggestions: { width: '100%', gap: 9, marginTop: 22 },
    suggestion: { paddingHorizontal: 16, paddingVertical: 13, borderRadius: radius.md, borderWidth: 1 },
    suggestionText: { ...ty.bodySemibold, color: c.text },

    bubble: { maxWidth: '86%', paddingHorizontal: 15, paddingVertical: 12 },
    userBubble: { alignSelf: 'flex-end', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 5 },
    aiBubble: { alignSelf: 'flex-start', borderWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 5 },
    bubbleText: { ...ty.body, lineHeight: 21 },

    couponCard: { alignSelf: 'flex-start', maxWidth: '92%', borderRadius: radius.xl, borderWidth: 1, padding: 16, ...theme.shadowSm },
    couponHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 13 },
    couponGame: { ...ty.title, color: c.text },
    couponTag: { ...ty.caption, color: c.text3 },
    couponBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    couponExtra: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
    couponExtraLabel: { ...ty.caption, fontFamily: theme.font.semibold },
    couponExp: { ...ty.caption, color: c.text2, lineHeight: 18, marginTop: 13, paddingTop: 13, borderTopWidth: 1, borderTopColor: c.hairline },

    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
    input: { flex: 1, minHeight: 48, maxHeight: 110, borderRadius: 24, borderWidth: 1, paddingHorizontal: 18, paddingTop: 13, paddingBottom: 13, ...ty.body },
    sendBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  });
}