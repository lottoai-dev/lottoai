// app/(tabs)/ai-assistant.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../../components/ui/app-button';
import { NumberBall } from '../../components/ui/number-ball';
import { PressableScale } from '../../components/ui/surface';
import { STORAGE_KEYS } from '../../constants/storage-keys';
import { AppTheme } from '../../constants/theme';
import { useAlert } from '../../contexts/AlertContext';
import { useAuth } from '../../contexts/AuthContext';
import { APP_SCREEN_MAP, buildAppContextSnapshot, formatAppContextForPrompt } from '../../lib/aiAppContext';
import { clearQuotaExhausted, formatQuotaResetIn, loadQuotaExhausted, msUntilQuotaReset, persistQuotaExhausted } from '../../lib/aiQuota';
import {
  type ConstraintKey,
  type FrequencyMap,
  type NumberConstraints,
  buildAvoidSet,
  checkParityFeasibility,
  checkPrimeFeasibility,
  checkSumRangeFeasibility,
  generateCouponWithConstraints,
  generateMultipleCoupons,
  getViolatedConstraints,
  pickSingleNumber,
} from '../../lib/couponGenerator';
import { markCouponsDirty } from '../../lib/couponsStore';
import { type AIErrorType, type AIResult, type CouponIntent, chatWithAI, chatWithAIStream, extractCouponToolIntent, stripMarkdown } from '../../lib/deepseek';
import { GameEmblem } from '../../lib/emblems';
import { GAMES, type Game, type GameId, getGameAccentColor, getGameById, getGameByName } from '../../lib/games';
import { AIAssistantIcon, BackIcon, BookmarkIcon, CloseIcon, SendIcon } from '../../lib/icons';
import { formatPrize } from '../../lib/prizeEstimates';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';

/* ───────────────────── ÜRÜN KARARI: şablon cevap yok ─────────────────────
 * Lota'nın sohbet cevapları hazır şablonlarla DEĞİŞTİRİLMEZ. Kullanıcıya
 * "konuşuyormuş gibi" görünen her cümle gerçek AI'dan gelmeli; aksi halde
 * aynı cümleyi ikinci kez gören kullanıcıda şablon hissi oluşuyor (bu
 * geçmişte bizzat yaşandı, bkz. askForCouponGame'deki not).
 *
 * Sabit metin YALNIZCA şu iki durumda kullanılabilir:
 *   1) AI çağrısı gerçekten başarısız oldu (ağ, timeout, oturum, kota) —
 *      elde gösterilecek bir cevap yok.
 *   2) Modele bırakılamayacak teknik bir açıklama gerekiyor (matematiksel
 *      imkansızlık, kırpma uyarısı, karşılanamayan kısıt notu) — bunlar
 *      gerçek hesaptan türeyen, uydurulmaması gereken bilgiler.
 *
 * Yeni bir sabit cevap eklemeden önce: bunu AI'a kısa bir talimatla
 * yaptıramaz mıyım? Cevap "yaptırabilirim" ise şablon YAZILMAZ.
 * ───────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────── cache ─────────────────────────── */
let cachedStatsText: string | null = null;
let cachedStatsTime = 0;
const STATS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 dakika sonra istatistikler yenilenir

/** Geliştirme sırasında AI akışındaki gerçek darboğazı Metro'da gösterir. */
function logAITiming(stage: string, startedAt: number, detail = ''): void {
  if (!__DEV__) return;
  const suffix = detail ? ` · ${detail}` : '';
  console.info(`[AI timing] ${stage}: ${Date.now() - startedAt} ms${suffix}`);
}

/**
 * AI asistanında bir seferde üretilebilecek en fazla kupon sayısı.
 * DİKKAT: Bu sabit hem gerçek üretim sınırını, hem getBasePrompt'taki
 * kuralı, hem de buildTruncationWarning'deki uyarı metnini besler —
 * TEK KAYNAK burasıdır. Değiştirirsen üçü birden otomatik güncellenir;
 * prompt'a elle sayı yazma (geçmişte prompt ile kodun ayrı düşmesi
 * "desteklemiyorum" tarzı tutarsızlıklara yol açmıştı).
 */
const MAX_AI_COUPONS = 5;

/** TR kupon oyunları — "hepsinden birer" kuyruğunun sırası. */
const TR_COUPON_GAME_IDS: GameId[] = ['cilgin', 'superloto', 'sanstopu', 'onnumara'];

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
  // 4 oyunun sorgusu birbirinden bağımsız — paralel çekmek toplam süreyi
  // tek sorgununkine indirir (sırayla beklemek 4 kat sürüyordu).
  const allStats = await Promise.all(GAMES.map((game) => computeGameStats(game)));
  return allStats.map((s) => s.text).join('\n');
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

/* ───────────────── seçici bağlam (ne lazımsa o) ───────────────── */
// Her mesaja ~16KB istatistik + uygulama özeti yapıştırmak hem token hem
// gecikme pahasına. Aşağıdaki sezgiler "bu turda gerçekten lazım mı?" diye
// bakar — şüphede EKLEMEYE yatkınız (kaçırmak uydurmaya yol açar).

/** Çekiliş istatistiği / ikramiye / sıcak-soğuk gibi veri isteyen sorular. */
const DRAW_STATS_RE =
  /istatistik|sıcak|soğuk|gecik|en çok çıkan|en az çıkan|frekans|ikramiye|jackpot|büyük ikramiye|çekiliş sonucu|son çekiliş|kaç kez çıkt|kaç çekiliş|çift\s*\/\s*tek|tek\s*\/\s*çift|kaçtır çıkmad|kaç gündür çıkmad|kaç çekiliştir|en sık|en seyrek|kaç milyon|ne kadar.*ikramiye|ikramiye.*ne kadar|kaç para|oranı nedir|çıkma (oran|ihtimal)/i;

/** Kayıtlı kupon, bildirim, ekran yönlendirmesi gibi uygulama durumu soruları. */
const APP_CONTEXT_RE =
  /kayıtlı|kuponlarım|kaç kupon|bildirim|profil|okunmamış|üretim geçmiş|kaydettiğim|kontrol edilmemiş|eşleşme|kupon üret ekran|sonuçlar ekran|ana sayfa|hangi ekran|nereye (git|bak)|uygulama(da|nın|yı)|kaç tane kupon|kuponum var|kaç kuponum/i;

/**
 * Kısa takip sorusu mu? ("peki Süper Loto?", "ya o?") — önceki turda
 * istatistik konuşulduysa bu turda da bloğu tutmak gerekir.
 */
function looksLikeShortFollowUp(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;
  if (t.length <= 40) return true;
  return /^(peki|ya |o zaman|ent|peki ya|ya o|bunlar|şunlar|süper|on numara|şans topu|çılgın)/i.test(t);
}

function conversationNeedsDrawStats(current: string, recentTexts: string[]): boolean {
  if (DRAW_STATS_RE.test(current)) return true;
  if (!looksLikeShortFollowUp(current)) return false;
  return recentTexts.slice(-4).some((t) => DRAW_STATS_RE.test(t));
}

function conversationNeedsAppContext(current: string, recentTexts: string[]): boolean {
  if (APP_CONTEXT_RE.test(current)) return true;
  if (!looksLikeShortFollowUp(current)) return false;
  return recentTexts.slice(-4).some((t) => APP_CONTEXT_RE.test(t));
}

/**
 * Lota'nın ana sistem prompt'u.
 *
 * Sıra bilinçli: önce OTURUMLAR ARASI DEĞİŞMEYEN kurallar, sonra bu mesaja
 * özel değişkenler (isim, uygulama durumu, saat, istatistikler). DeepSeek
 * prompt'un başındaki ortak öneki önbelleğe alır — ortada değişen bir alan
 * (özellikle dakika dakika değişen saat) o noktadan sonrasını cache dışı
 * bırakırdı. Değişkenleri sona almak isabet oranını yükseltir.
 *
 * statsText / appContextText null ise o blok bu turda eklenmez — token
 * tasarrufu. Model uydurmasın diye açıkça "bu turda yok" denir.
 */
const getBasePrompt = (
  statsText: string | null,
  userName: string | null,
  appContextText: string | null,
): string => {
  const today = new Date();
  const gunAdi = today.toLocaleDateString('tr-TR', { weekday: 'long' });
  const tarih = today.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const saat = today.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const userStr = userName
    ? `Kullanıcının adı: ${userName}. Konuşmada uygun yerlerde ismiyle hitap et, ama her cümlede kullanma.`
    : 'Kullanıcı henüz ismini girmemiş.';

  const appBlock = appContextText
    ? appContextText
    : 'Kullanıcının güncel durumu bu turda eklenmedi. Kayıtlı kupon sayısı, bildirim durumu gibi canlı uygulama verisini UYDURMA; ilgili ekrana yönlendir.';

  const statsBlock = statsText
    ? `Aşağıda güncel çekiliş istatistikleri verilmiştir. Kullanıcı sorduğunda bu verilere dayanarak yanıt ver:

${statsText}`
    : 'Bu turda çekiliş istatistikleri eklenmedi. Sıcak/soğuk sayılar, ikramiye tutarı, frekans gibi sayısal veri UYDURMA; elinde yoksa bunu söyle.';

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
  sohbette, yetenek listesinde veya açıklamada "adil rastgelelik", "adil rastgele", "rastgele",
  "algoritma", "istatistiklere göre" gibi üretim yöntemi ifadeleri KULLANMA — kullanıcı sormadıysa
  bu konuya hiç girme.
- "Nasıl yardımcı olabilirsin?", "neler yapabilirsin?" gibi sorularda SADECE ne yapabildiğini söyle
  (kupon hazırlamak, oyun bilgisi, kayıtlı kuponlar, sonuç/istatistik). Üretim yöntemini ASLA
  ekleme. Yanlış: "adil rastgele bir kupon hazırlayabilirim". Doğru: "istediğin oyundan bir
  kupon hazırlayabilirim".
- Yalnızca kullanıcı "nasıl üretiyorsun", "sayıları nasıl seçiyorsun", "adil rastgele nedir"
  gibi açıkça sorduğunda cevap ver: adil rastgelelikle ürettiğini söyle. "Rastgelelik"
  kelimesini TEK BAŞINA kullanma; her zaman "adil rastgelelik" / "adil rastgelelikle" de.
  Bunu bir eksiklik gibi değil, doğru ve güvenilir bir yöntem olarak sun.
- ASLA "istatistiklere göre kupon üretiyorum" veya "geçmiş verilere dayanarak seçiyorum" GİBİ
  İFADELER KULLANMA — bu yanlış bir izlenim yaratır.
- Geçmiş çekiliş istatistiklerini (sıcak/soğuk sayılar gibi) kullanıcı merak ederse EK BİLGİ
  olarak gösterebilirsin — ama bunun sayı SEÇİMİNİN sebebi olduğunu ASLA iddia etme.
- Örnek iyi cevap (yalnızca sorulursa): "Adil rastgelelikle üretiyorum; piyango sayılarının
  hiçbiri diğerinden daha şanslı değil. İstersen geçmiş çekiliş istatistiklerini de gösterebilirim."

ÇOK ÖNEMLİ - Kupon adedi limiti:
- Bir seferde en fazla ${MAX_AI_COUPONS} kupon üretebilirsin. Bu kesin bir uygulama kuralıdır.
- ASLA bundan farklı bir üst sınır söyleme — doğru üst sınır her zaman ${MAX_AI_COUPONS} kupondur.
- Kullanıcı bundan fazlasını isterse nazikçe bir seferde en fazla ${MAX_AI_COUPONS} kupon
  üretebildiğini söyle; istersen o kadarını hazırlayabileceğini belirt.

${APP_SCREEN_MAP}

Uygulama bilgisi kuralları:
- "Kuponlarım", "Profil", "Sonuçlar" gibi uygulama sorularında yukarıdaki ekran haritasını ve
  aşağıdaki güncel durum verisini kullan. Güncel durumda yazmayan bir bilgiyi (ör. kayıtlı
  kuponların tam listesi, ekranda şu an ne göründüğü) uydurma; kullanıcıyı ilgili ekrana yönlendir.
- Kullanıcı kayıtlı kuponlarının sayısını veya dağılımını sorarsa güncel durum satırlarını kullan.
- Kullanıcı kuponlarını "kontrol et" / "sonuçlarına bak" derse: güncel durumdaki bekleyen ve
  kontrol edilmiş sayıları özetle, alt menüden Kuponlarım'a gitmesini söyle. Bekleyenleri görmek
  için üstteki "Bekleyen" filtresini kullanmasını belirt. Kontrolün otomatik olduğunu ve "Kontrol
  Et" gibi bir butonun OLMADIĞINI açıkça söyle — ASLA olmayan bir butona veya manuel kontrol
  adımına yönlendirme. Hâlâ bekleyen kupon varsa, o çekilişin sonucunun henüz uygulamaya
  girilmediğini nazikçe belirt.
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
  "iyi gidiyor", "bir sonraki kuponda şansın daha yüksek olabilir", "bu sefer daha şanslı
  olabilirsin" gibi ifadeleri KESİNLİKLE KULLANMA — ne genel sohbette ne de kupon açıklamalarında.
  Bir kuponun "az tutması", bir SONRAKİ kuponun "daha çok tutacağı" anlamına gelmez — her kupon
  birbirinden tamamen bağımsızdır, üzücü bir sonuç bile "yakında telafi olur" gibi sunulamaz.
- Sıcak/soğuk sayı istatistiklerinden bahsedebilirsin ama SADECE geçmişe dönük, nötr bir bilgi
  olarak ("son 100 çekilişte en çok/az çıkan sayılar bunlar") — bunun geleceğe dair hiçbir öngörü
  taşımadığını açıkça belirt veya en azından ima etme.
- Bir kuponun toplamı/çift-tek dağılımı ortalamaya veya "beklenen" bir değere yakınsa bile bunu
  "dengeli kupon", "iyi bir kupon", "güzel bir dağılım olmuş", "gayet uygun" gibi KALİTE ima eden
  bir ifadeyle ÖVME. Sayıları nötr şekilde bildir ("3 çift, 3 tek var, toplamı 279"), ama bunun
  "iyi/dengeli/uygun" olduğunu ima etme — her kombinasyon (dengeli görünen de, görünmeyen de)
  matematiksel olarak eşit şansa sahiptir, biri diğerinden "daha iyi" değildir.
- Kullanıcı "kazanma taktiği", "şansımı nasıl artırırım" gibi bir şey sorarsa: ÖNCE net ve dürüst
  bir şekilde böyle bir taktiğin var olmadığını söyle, SONRA istersen filtreleri (çift/tek, toplam
  aralığı vb.) çeşitlilik/eğlence aracı olarak tanıt. Sırayı tersine çevirip önce filtreleri
  "tavsiye" gibi sunup sona dürüstlük notu eklemek YETERLİ DEĞİL — bu, uyarıyı okumadan geçen bir
  kullanıcıda "bu bir taktikmiş" izlenimi bırakabilir.

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

ÇOK ÖNEMLİ - Veri ve Hesap Sorularında Dürüstlük:
- Kullanıcı "sohbetlerimizi kaydediyor musun", "verilerim ne oluyor" gibi bir şey sorarsa: sohbet
  geçmişinin, hesabıyla ilişkilendirilerek KALICI olarak saklandığını, amacının "konuşmaya devam
  edebilmek" DEĞİL, senin (Lota'nın) verdiğin yanıtları incelemek ve geliştirmek olduğunu söyle.
  ASLA "geçici olarak saklanıyor" ya da "kaldığımız yerden devam edebilmek için" gibi YANLIŞ bir
  açıklama uydurma — bu bilgiler doğru değildir. Detay isterse Profil ekranındaki yasal bilgilere
  yönlendir.
- Kullanıcı "hesabımı nasıl silerim" diye sorarsa: Profil ekranındaki "Hesabımı sil" seçeneğini
  kullanmasını söyle. Bu seçenek hesabını, AI sohbet kayıtlarını ve cihazdaki verilerini kalıcı
  olarak siler. ASLA e-posta ile silme talebi gerektiğini veya "Tüm Verileri Sil" diye bir seçenek
  olduğunu söyleme — bunlar artık geçerli değil.
- Kullanıcı "önceki oturumları/konuşmaları hatırlıyor musun" diye sorarsa: BU İKİ ŞEYİ KARIŞTIRMA —
  (1) sohbetler KAYDEDİLİYOR (hesabına bağlı, ekibin incelemesi için, kalıcı) — bu doğru ve sabit;
  (2) ama SEN (Lota), yeni bir oturumda önceki oturumların içeriğine CANLI ERİŞEMEZSİN — her oturum
  kendi bağlamıyla başlar. İkisini birbirine karıştırıp "kayıt tutulmuyor" gibi YANLIŞ bir şey
  söyleme (kayıt tutuluyor, sadece sen o kayda o an bakamıyorsun). Örnek doğru cevap: "Sohbetlerin
  kayıtlı duruyor ama ben yeni bir oturumda önceki oturumların içeriğini göremiyorum — bu oturumda
  neler konuştuysak onu hatırlarım."

ÇOK ÖNEMLİ - Sayı Üretimi ve generate_coupon aracı:
- Bu sohbette KESİNLİKLE hiçbir sayı dizisi, kupon önerisi veya "1-2-3-4-5..." gibi örnek
  sayılar YAZMA. Kupon sayıları SADECE generate_coupon aracı çağrıldığında uygulama tarafından
  üretilir — sen asla kendi kafandan sayı uydurmazsın, toplamlarını hesaplamazsın, örnek
  de vermezsin. Bu kural her koşulda geçerlidir, kullanıcı ısrar etse bile sayı UYDURMAZSIN.
- Kullanıcı açıkça kupon/sayı üretmek, hazırlamak veya önermek istiyorsa generate_coupon
  aracını çağır. Araç argümanlarına yalnızca kullanıcının AÇIKÇA söylediği kısıtları yaz;
  sumMin/sumMax/maxConsecutive gibi alanları tahmin etme veya uydurma.
- Toplam için TEK TARAFLI istekler: "toplamı 700'den büyük/üzerinde" → yalnızca sumMin yaz
  (sumMax yazma). "toplamı 200'den küçük/altında" → yalnızca sumMax yaz (sumMin yazma).
  Uygulama eksik kenarı oyunun matematiksel sınırına tamamlar. "200-300 arası" gibi iki
  taraflı isteklerde ikisini birden yaz.
- "Hepsinden birer", "her oyundan bir" gibi isteklerde generate_coupon'ı ÇILGIN (cilgin)
  için bir kez çağır; diğer oyunları uygulama sırayla üretir — sen sayı yazma, dört oyunu
  tek cevapta bitirmeye çalışma.
- ÇOK ÖNEMLİ — DOLAYLI İSTEKLER DE ARAÇ GEREKTİRİR: Kullanıcı yeni bir kupon istediğini
  dolaylı şekilde ifade edebilir — "başka?", "bir tane daha", "yine yap", "aynı oyundan
  devam edelim", "tekrar dener misin" gibi. Bunların hepsi generate_coupon çağırmanı
  gerektirir; önceki turdaki oyun/kısıtlar hâlâ geçerliyse aynı argümanlarla tekrar çağır.
  Bu durumlarda ASLA sadece "isteğini anladım" diye serbest metinle cevap verip aracı
  atlama — bu, aracı hiç çağırmadan kendi kafandan sayı yazmana yol açan en sık hatadır.
  Emin değilsen (hangi oyun, hangi kısıtlar belirsizse) kısa bir soru sorabilirsin, ama
  yine de sayı YAZMA; sadece netleştirmek için soru sor, cevap gelince aracı çağır.
- Oyun adı belli değilse gameId alanını yazma — uygulama kullanıcıya soracak. İstersen kısa
  bir cümleyle de sorabilirsin, ama sayı üretme.
- "Evet", "Tamam", "Oluştur", "Yap" gibi kısa onaylarda aracı YALNIZCA önceki asistan mesajın
  açıkça kupon üretimi teklif ettiyse çağır. İstatistik/bilgi bağlamındaki onaylarda çağırma.
  Şüphede araç çağırma, sohbet et.
- generate_coupon çağırırken her zaman 1 kısa, doğal Türkçe cümle yaz — bu metin kupon kartının
  üstündeki sohbet balonunda görünür; ASLA yalnızca aracı çağırıp metin bırakma. Örnekler:
  "Tamam, hemen bir kombinasyon seçiyorum", "Çılgın Sayısal için bakıyorum". "İşte kuponun hazır!"
  / "hazırladım" gibi tamamlanmış iddia kullanma — süreç devam ediyormuş gibi kısa bir giriş yeter;
  sayıları sen yazma, kartı uygulama gösterecek.
- Kullanıcı "neden karşılayamadın", "farklı bir kupon dener misin", "başka sayı önerir misin"
  gibi bir şey sorarsa, ASLA kendin sayı üretme. Bunun yerine kısaca açıkla ve yeniden denemek
  isterse tekrar generate_coupon çağır.
- DESTEKLENEN FİLTRELER SINIRLIDIR — şu an sadece şunlar var: toplam aralığı, mutlaka içersin/
  içermesin, bir aralığı tamamen hariç tut, sadece asal sayılar, sadece çift sayılar, sadece tek
  sayılar, çoklu kupon çakışmasızlığı, önceki kuponlardan farklı olsun. Kullanıcı bunların DIŞINDA,
  BİLEŞİK bir istek yaparsa (ör. "yarısı asal yarısı çift olsun", "üçte biri 50'den büyük olsun"
  gibi birden fazla kategoriyi aynı anda karıştıran istekler), bu sistemde KARŞILANAMAZ. Böyle bir
  istekte:
  1. ASLA sanki karşılanmış gibi davranma veya "istediğin gibi hazırladım" deme.
  2. Kupon yine de üretilecek ama SEN bunu netleştir: "Şu an '[X] ve [Y]'yi aynı anda
     karıştıran bir filtre desteklemiyorum, bu yüzden bu isteğini tam karşılayamadım — yine
     de bir kupon hazırladım" gibi dürüst bir açıklama yap. Üretim yöntemini ("adil rastgele"
     vb.) burada da söyleme — kullanıcı sormadıysa.
  3. Kullanıcı sonradan "bu sayılar gerçekten [X] mi?" diye sorarsa, kendi geçmişindeki GERÇEK
     sayılara bakıp dürüstçe kontrol et ve cevapla (uydurma, yukarıdaki kural geçerli) — çoğu
     zaman hayır olacaktır, bunu söylemekten çekinme.
- BU KURALIN KAPSAMI DIŞINDA KALAN BİR ŞEY: Eğer bu sohbette DAHA ÖNCE bir kupon ürettiysen, o
  kuponun GERÇEK sayıları senin mesaj geçmişinde (köşeli parantez içinde, ör. "[On Numara: 3-7-11...]"
  formatında) AYNEN duruyor — bunlar sana gerçekten gösterilen, uydurulmamış, doğrulanmış sayılardır.
  Kullanıcı o kuponun toplamını, kaç çift/tek sayı içerdiğini gibi BASİT bir hesabı sorarsa, bu
  sayıları KENDİ GEÇMİŞİNDEN AYNEN KOPYALA ve üzerinde hesap yap — bu "yeni sayı üretmek" değil,
  zaten gösterilmiş sayıları okuyup toplamak.
  - "Kuponun sayılarını göremiyorum/hesaplayamam" gibi YANLIŞ bir şey söyleme.
  - EN ÖNEMLİSİ: Kendi geçmişindeki gerçek sayılar yerine KENDİNDEN FARKLI/UYDURMA bir sayı dizisi
    YAZMA — bu, kullanıcıya yanlış bilgi vermek demektir ve KESİNLİKLE YASAKTIR. Emin değilsen ya da
    hangi kupondan bahsedildiği belirsizse, uydurmak yerine "hangi kuponu kastediyorsun, en son
    ürettiğim mi?" diye sor.
  - Sohbette birden fazla kupon üretildiyse ve kullanıcı "bu kupon" derse, EN SON ürettiğin kuponu
    kastettiğini varsay (aksi belirtilmedikçe).
  Sadece kuponu bu sohbette hiç üretmediysen (örn. kullanıcı "Kuponlarım ekranındaki eski bir
  kuponumun toplamı ne" derse, ki bu sohbette hiç görünmüyor) o zaman "Kuponlarım ekranına bak"
  demen doğru olur.

Güncel Oyun Bilgileri:
- Çılgın Sayısal Loto: 1-90 arasından 6 ana numara seçilir. Ayrıca 1-90 arasından 1 adet SüperStar numarası seçilir (ana numaralardan bağımsız, tekrar edebilir). SADECE Pazartesi, Çarşamba ve Cumartesi günleri çekilir.
- Süper Loto: 1-60 arasından 6 numara seçilir. Ek numara yoktur. SADECE Salı, Perşembe ve Pazar günleri çekilir.
- Şans Topu: 1-34 arasından 5 ana numara + 1-14 arasından 1 adet "Şans Topu" numarası seçilir. Şans Topu ana numaralardan tamamen bağımsızdır. SADECE Çarşamba ve Pazar günleri çekilir.
- On Numara: 1-80 arasından 10 numara seçilir. Çekilişte 22 numara belirlenir. Ek numara yoktur. SADECE Pazartesi ve Cuma günleri çekilir.

Bu mesaja özel bağlam:
${userStr}

${appBlock}

Bugün ${gunAdi}, ${tarih}. Şu an saat ${saat} (bu, mesajın gönderildiği ana ait GERÇEK saattir —
kullanıcı saat sorarsa bu değeri kullan, kendinden bir saat UYDURMA).

${statsBlock}`;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  coupon?: {
    game: string;
    numbers: number[];
    superStar: number | null;
    bonus: number | null;
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
  return `${msg.content} [${c.game}: ${c.numbers.join('-')}${extra}]`.trim();
}

/**
 * Modelin generate_coupon aracını ATLAYIP serbest metinde kendi kafasından
 * sayı yazdığı nadir ama gerçek durumları yakalar (bkz. ai_conversations
 * kayıtları — model üç kez üst üste bunu yapıp her seferinde "hata yaptım"
 * diye itiraf edip düzeltememişti). Prompt kuralına güvenmek yerine son bir
 * kod tabanlı güvenlik ağı: en az 3 tire ile ayrılmış, loto kuponuna benzer
 * bir sayı dizisi görürsek bu metni ASLA ekrana basmayız.
 */
const FAKE_COUPON_NUMBERS_RE = /\b\d{1,2}(?:\s*-\s*\d{1,2}){2,}\b/;

function containsFakeCouponNumbers(text: string): boolean {
  return FAKE_COUPON_NUMBERS_RE.test(text);
}

/**
 * Kurtarılan giriş cümlesinin anlamlı sayılması için gereken en az uzunluk.
 * Bunun altında kalan artıklar ("Tabii!", ":" gibi) giriş cümlesi olarak
 * iş görmez; çağıran taraf şablona düşer.
 */
const MIN_SALVAGED_INTRO_LENGTH = 10;

/**
 * Model uydurma sayı yazdığında metnin TAMAMINI atmak yerine, yalnızca sayı
 * dizisi geçen cümleleri ayıklar ve geri kalanını döndürür.
 *
 * Gerekçe: uydurma sayı yakalandığında kuponu biz üretiyoruz ve giriş cümlesi
 * olmadığı için sabit şablona düşüyorduk — yani bu yol her tetiklendiğinde
 * kullanıcı AYNI cümleyi görüyordu (bkz. dosya başındaki "şablon cevap yok"
 * notu). Oysa modelin yazdığı metnin sorunlu kısmı sadece sayıların geçtiği
 * cümle; "Tabii, Süper Loto için hazırlıyorum." ya da "Bol şans!" gibi kısımlar
 * kullanılabilir durumda. Bunları kurtarmak ek AI çağrısı, ek gecikme ve ek
 * token gerektirmez.
 *
 * Satır satır, sonra cümle cümle ayrıştırılır: model sayıları bazen ayrı bir
 * satıra liste halinde yazıyor, noktalama ile bölmek tek başına yetmiyor.
 * Hermes'te lookbehind güvenilir olmadığı için bölme `match` ile yapılır.
 */
function stripFakeCouponSentences(text: string): string | null {
  const kept: string[] = [];
  for (const line of text.split('\n')) {
    for (const sentence of line.match(/[^.!?…]+[.!?…]*/g) ?? []) {
      if (containsFakeCouponNumbers(sentence)) continue;
      const trimmed = sentence.trim();
      if (trimmed) kept.push(trimmed);
    }
  }
  const salvaged = kept.join(' ').trim();
  if (salvaged.length < MIN_SALVAGED_INTRO_LENGTH) return null;
  return salvaged;
}

/**
 * Model kendi kafasından sayı yazdığında (containsFakeCouponNumbers ile
 * yakalandığında), o mesajı gizlemek yetmez — kullanıcı gerçek bir kupon
 * ALAMADAN kalır (yaşanmış bir hataydı: model üst üste "hazırlıyorum" deyip
 * hiçbir zaman gerçek kupon üretmiyordu). Bu fonksiyon, en son hangi oyunun
 * konuşulduğunu SOHBET GEÇMİŞİNDEN bulur ki o oyun için otomatik olarak
 * gerçek kupon üretebilelim. Önce en son gerçek kupon kartına (kesin, doğru
 * bilgi) bakar; yoksa kullanıcının en son mesajlarında geçen oyun adına bakar.
 */
function findMostRecentGameId(messages: ChatMessage[]): GameId | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.coupon) {
      const game = getGameByName(msg.coupon.game);
      if (game) return game.id;
    }
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'user') continue;
    const found = matchGameNameOnly(msg.content);
    if (found) return found;
  }
  return null;
}

/**
 * Fake sayı yakalandığında hangi oyun için gerçek kupon üretileceği.
 * Öncelik: (1) modelin metninde geçen oyun, (2) kuyruğun başı,
 * (3) sohbetteki en son kupon/oyun adı. Eskiden yalnız (3) vardı;
 * "Sıradaki → Şans Topu" uydurulunca fallback yanlışlıkla Süper Loto
 * üretiyordu.
 */
function resolveFallbackGameId(
  replyText: string,
  messages: ChatMessage[],
  queueHead: GameId | null,
): GameId | null {
  const fromReply = matchGameNameOnly(replyText);
  if (fromReply) return fromReply;
  if (queueHead) return queueHead;
  return findMostRecentGameId(messages);
}

/** Bu sayıya kadar (dahil) tüm geçmiş AI'ya ham gider. Üstünde özet + pencere. */
const FULL_HISTORY_LIMIT = 15;
/** Eşik aşıldığında ham gönderilen en son mesaj sayısı. */
const RECENT_HISTORY_WINDOW = 5;

/**
 * Eski mesajlardan kural tabanlı, kısa bir oturum özeti üretir.
 * Ekstra AI çağrısı yok — özellikle üretilmiş kuponların GERÇEK sayılarını
 * korur ki "bu kuponun toplamı ne?" gibi sorular özet yüzünden bozulmasın.
 */
function buildSessionSummary(older: ChatMessage[]): string {
  const lines: string[] = [
    'Oturum özeti (eski mesajların yerine — ekranda hâlâ duruyorlar, sen sadece bunları görüyorsun):',
  ];

  const coupons = older.filter((m) => m.coupon);
  if (coupons.length > 0) {
    lines.push(`Bu oturumda daha önce üretilen kuponlar (${coupons.length} adet):`);
    coupons.forEach((m, i) => {
      const c = m.coupon!;
      const extra =
        c.superStar != null ? ` + SüperStar ${c.superStar}` : c.bonus != null ? ` + Şans Topu ${c.bonus}` : '';
      lines.push(`  ${i + 1}. [${c.game}: ${c.numbers.join('-')}${extra}]`);
    });
  } else {
    lines.push('Bu dilimde üretilmiş kupon yok.');
  }

  const userBits = older
    .filter((m) => m.role === 'user' && !m.coupon)
    .map((m) => m.content.trim())
    .filter((t) => t.length > 0)
    .slice(-4);
  if (userBits.length > 0) {
    lines.push('Kullanıcının eski isteklerinden örnekler:');
    for (const bit of userBits) {
      const clipped = bit.length > 80 ? `${bit.slice(0, 77)}…` : bit;
      lines.push(`  - ${clipped}`);
    }
  }

  lines.push(
    'Yukarıdaki özet eksik kalırsa uydurma; emin değilsen son mesajlara bak veya kullanıcıya sor.',
  );
  return lines.join('\n');
}

/**
 * AI'ya gidecek sohbet geçmişini hazırlar.
 * ≤15 mesaj: tamamı ham. >15: eski kısım özet + son 5 ham mesaj.
 * Ekrandaki liste budanmaz; sadece API paketi kısalır.
 */
function buildChatHistoryForApi(
  all: ChatMessage[],
): { role: 'user' | 'assistant'; content: string }[] {
  if (all.length <= FULL_HISTORY_LIMIT) {
    return all.map((m) => ({ role: m.role, content: messageToLogText(m) }));
  }

  const older = all.slice(0, -RECENT_HISTORY_WINDOW);
  const recent = all.slice(-RECENT_HISTORY_WINDOW);
  return [
    { role: 'assistant', content: buildSessionSummary(older) },
    ...recent.map((m) => ({ role: m.role as 'user' | 'assistant', content: messageToLogText(m) })),
  ];
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
 *
 * Sabit metnin meşru olduğu durum (1): AI çağrısı başarısız olduğu için
 * ortada gösterilecek bir cevap yok. Buraya sohbet cevabı niteliğinde
 * yeni metin EKLENMEZ — bkz. dosya başındaki "şablon cevap yok" notu.
 */
function errorMessageFor(errorType?: AIErrorType): string {
  switch (errorType) {
    case 'network':
      return 'İnternet bağlantında bir sorun var gibi görünüyor. Bağlantını kontrol edip tekrar dener misin?';
    case 'timeout':
      return 'Cevabım her zamankinden uzun sürdü, bağlantı yavaş olabilir. Bir daha dener misin?';
    case 'auth':
      return 'Oturumunda bir sorun oluştu. Çıkış yapıp tekrar giriş yaptıktan sonra yine buradayım.';
    case 'quota':
      return 'Bugünlük konuşma hakkın doldu. Yarın yenilenecek — o zamana kadar kupon üretmeye ve sonuçlara bakmaya devam edebilirsin!';
    default:
      return 'Şu an biraz yoğunum, kısa bir süre sonra tekrar dener misin?';
  }
}

/**
 * Kullanıcının gerçekten yazdığı metinleri (bu mesaj + son sohbetteki
 * kullanıcı mesajları) tek bir küçük harfli havuzda toplar. Bu havuz,
 * Modelin generate_coupon argümanlarında halüsinasyon yapıp yapmadığını
 * (yani kullanıcı hiç istemediği bir kısıtlama "uydurup uydurmadığını")
 * doğrulamak için kullanılır — LLM'ler "belirtilmediyse yazma" talimatına
 * uysa bile bazen kendiliğinden değer üretebiliyor, bu yüzden kod tarafında
 * ayrıca kontrol ediyoruz. Sadece kullanıcı mesajları kullanılır (asistan
 * mesajları değil) ki asistanın kendi cümleleri yanlışlıkla "onay" sayılmasın.
 */
function collectUserIntentText(content: string, recentContext: { role: string; content: string }[]): string {
  const parts = [content, ...recentContext.filter((m) => m.role === 'user').map((m) => m.content)];
  return parts.join(' ').toLocaleLowerCase('tr-TR');
}

/**
 * "Sadece çift" / "sadece tek" isteği için açık kalıp listeleri. Tek başına
 * 'çift'/'tek' aramak fazla gevşekti: "tekrar", "teklif" gibi kelimeler ve
 * "çift/tek dengeli olsun" ifadesi yanlış tetiklemeye yol açabiliyordu
 * (halüsinasyon güvenlik ağının kendisi yanlış geçirir hale geliyordu).
 * Bu kalıplar, kullanıcının GERÇEKTEN "hepsi çift/tek olsun" tarzı bir
 * istek yazdığından makul ölçüde emin olmamızı sağlar.
 */
const ONLY_EVEN_PHRASES = [
  'sadece çift', 'yalnız çift', 'yalnızca çift', 'hepsi çift', 'tamamı çift',
  'çift sayılardan', 'çift olsun',
];
const ONLY_ODD_PHRASES = [
  'sadece tek', 'yalnız tek', 'yalnızca tek', 'hepsi tek', 'tamamı tek',
  'tek sayılardan', 'tek olsun', 'tek sayı olsun',
];

/** Oyuncunun seçtiği N sayı için matematiksel min/max kupon toplamı. */
function couponSumBounds(game: Game): { min: number; max: number } {
  const min = (game.count * (game.count + 1)) / 2;
  const max = game.count * game.max - (game.count * (game.count - 1)) / 2;
  return { min, max };
}

/**
 * "Hepsinden birer tane", "her oyundan bir kupon" gibi dört oyunu da
 * kapsayan istekler. Tek generate_coupon (tek gameId) bunları karşılamaz;
 * uygulama sabit sırayla kuyruk kurar.
 */
function wantsAllGamesOneEach(text: string): boolean {
  const lower = text.toLocaleLowerCase('tr-TR');
  return (
    lower.includes('hepsinden') ||
    lower.includes('her oyundan') ||
    lower.includes('dört oyundan') ||
    lower.includes('4 oyundan') ||
    lower.includes('bütün oyun') ||
    (lower.includes('hepsi') && lower.includes('birer'))
  );
}

/**
 * Kuyruktaki sıradaki oyuna geçiş komutu. AI'ya bırakılmaz — yanlış oyun
 * veya uydurma sayı riski yüksek (gerçek sohbet kayıtlarında görüldü).
 */
function isQueueAdvancePhrase(text: string): boolean {
  const lower = text.toLocaleLowerCase('tr-TR').trim();
  if (/^(sıradaki|sonraki|devam|bir\s*sonraki|öbürü|diğeri)([.!?,…\s]*)$/i.test(lower)) {
    return true;
  }
  if (lower.includes('sıradaki') && lower.length < 48) return true;
  if (lower.includes('sonraki kupon') || lower.includes('bir sonraki')) return true;
  return false;
}

/**
 * generate_coupon tool argümanlarını, couponGenerator'ın anladığı
 * NumberConstraints biçimine çevirir. Oyunun gerçek sınırlarına (max, count)
 * göre geçersiz değerleri sessizce eler. Ayrıca sayısal/kategorik
 * kısıtlamaları (toplam aralığı, ardışık sınırı, denge vb.) yalnızca
 * kullanıcının mesajında bu isteği gösteren gerçek bir kelime varsa uygular
 * — modelin "halüsinasyon" yaparak var olmayan bir istek uydurmasına karşı
 * bir güvenlik ağıdır.
 *
 * Toplam için tek taraflı istekler (yalnız sumMin veya yalnız sumMax) desteklenir;
 * eksik kenar oyunun matematiksel sınırına tamamlanır. "700'den büyük" gibi
 * ifadelerde alt sınır dahil edilmez (sumMin+1).
 */
function buildConstraintsFromIntent(intent: CouponIntent | null, game: Game, userText: string): NumberConstraints {
  if (!intent) return {};
  const constraints: NumberConstraints = {};

  if ((intent.sumMin != null || intent.sumMax != null) && userText.includes('toplam')) {
    const bounds = couponSumBounds(game);
    const wantsAbove =
      userText.includes('büyük') ||
      userText.includes('üzerind') ||
      userText.includes('üstünd');
    const wantsBelow =
      userText.includes('küçük') ||
      userText.includes('altında') ||
      userText.includes('düşük');

    // Model bazen "700'den büyük" için sumMin=sumMax=700 yazar — tek taraflı say.
    const oneSidedHigh =
      intent.sumMin != null &&
      (intent.sumMax == null || (wantsAbove && intent.sumMin === intent.sumMax));
    const oneSidedLow =
      intent.sumMax != null &&
      (intent.sumMin == null || (wantsBelow && intent.sumMin === intent.sumMax));

    let min = intent.sumMin;
    let max = intent.sumMax;

    if (oneSidedHigh && intent.sumMin != null) {
      // "700'den büyük" → dahil değil
      min = wantsAbove ? intent.sumMin + 1 : intent.sumMin;
      max = bounds.max;
    } else if (oneSidedLow && intent.sumMax != null) {
      max = wantsBelow ? intent.sumMax - 1 : intent.sumMax;
      min = bounds.min;
    } else {
      if (min == null && max != null) min = bounds.min;
      if (max == null && min != null) max = bounds.max;
    }

    if (min != null && max != null && min <= max) {
      constraints.sumRange = { min, max };
    }
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
  if (intent.onlyEven && ONLY_EVEN_PHRASES.some((p) => userText.includes(p))) {
    constraints.onlyEven = true;
  }
  if (intent.onlyOdd && ONLY_ODD_PHRASES.some((p) => userText.includes(p))) {
    constraints.onlyOdd = true;
  }

  return constraints;
}

/** Oyun seçimi turunda ilk istekteki kısıtları (toplam, mustInclude vb.) korur. */
function mergeCouponIntents(pending: CouponIntent, tool: CouponIntent): CouponIntent {
  return {
    ...pending,
    ...tool,
    gameId: tool.gameId ?? pending.gameId,
    count: tool.count ?? pending.count,
    countRequestedRaw: tool.countRequestedRaw ?? pending.countRequestedRaw,
  };
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
 * Aynı imkansızlık kontrolünün "sadece çift" / "sadece tek" karşılığı.
 * Desteklenen oyunların hiçbirinde pratikte tetiklenmez (her zaman yeterince
 * çift/tek sayı var), ama tutarlılık ve gelecekte küçük aralıklı bir oyun
 * eklenirse güvenlik için hazır tutuyoruz.
 */
function buildImpossibleParityNote(game: Game, constraints: NumberConstraints): string | null {
  const parity = constraints.onlyEven ? 'even' : constraints.onlyOdd ? 'odd' : null;
  if (!parity) return null;
  const { feasible, availableCount } = checkParityFeasibility(game.count, game.max, parity);
  if (feasible) return null;
  const label = parity === 'even' ? 'çift' : 'tek';
  return (
    `${game.name}'da 1-${game.max} arasında sadece ${availableCount} ${label} sayı var, ama ${game.count} ` +
    `sayı seçilmesi gerekiyor — bu yüzden sadece ${label} sayılardan oluşan bir kupon üretmek mümkün değil. ` +
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
      `${intent.countRequestedRaw} kupon istedin, ben bir seferde en fazla ${MAX_AI_COUPONS} kupon üretebiliyorum, ${MAX_AI_COUPONS} tanesini hazırladım`
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

const CONSTRAINT_LABELS: Record<ConstraintKey, string> = {
  sumRange: 'toplam aralığını',
  maxConsecutive: 'ardışık sayı sınırını',
  spreadAcrossZones: 'sayıları aralığa yayma isteğini',
  balanceEvenOdd: 'çift/tek dengesini',
  avoidObviousPatterns: 'belirgin örüntülerden kaçınma isteğini',
  mustInclude: 'mutlaka istediğin sayı(lar)ı',
  mustExclude: 'hariç tutmak istediğin sayı(lar)ı',
  onlyPrimes: 'sadece asal sayı isteğini',
  onlyEven: 'sadece çift sayı isteğini',
  onlyOdd: 'sadece tek sayı isteğini',
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

/** Chip metinlerinde kısa oyun adı (intent eşleşmesiyle uyumlu). */
const SUGGESTION_SHORT_NAME: Record<GameId, string> = {
  cilgin: 'Sayısal Loto',
  superloto: 'Süper Loto',
  sanstopu: 'Şans Topu',
  onnumara: 'On Numara',
};

const INFO_SUGGESTIONS = [
  'Sıcak sayılar ne demek?',
  'Süper Loto nasıl oynanır?',
  'Şans Topu nasıl oynanır?',
  'On Numara nasıl oynanır?',
  'Sayısal Loto nasıl oynanır?',
];

const SUGGESTION_FALLBACKS = [
  'Bu hafta hangi çekilişler var?',
  'Sıcak sayılar ne demek?',
  'Süper Loto kuponu üret',
  'Sayısal Loto nasıl oynanır?',
];

function daySeed(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function pickStable<T>(items: readonly T[], seed: number, salt: number): T {
  return items[((seed + salt) % items.length + items.length) % items.length];
}

function getGamesDrawingOn(date: Date): Game[] {
  const weekday = date.getDay();
  return GAMES.filter((g) => g.country === 'TR' && g.drawDays.includes(weekday));
}

/**
 * Boş sohbet önerilerini güne ve kayıtlı kupon durumuna göre üretir.
 * Aynı takvim gününde aynı seed kullanılır — ekran her açıldığında değişmez.
 */
function buildDailySuggestions(hasSavedCoupons: boolean, date = new Date()): string[] {
  const seed = daySeed(date);
  const todays = getGamesDrawingOn(date);
  const trGames = GAMES.filter((g) => g.country === 'TR');
  const out: string[] = [];

  // Slot 1 — bugünün aksiyonu (çekiliş yoksa yine kupon üret)
  if (todays.length >= 1) {
    const game = todays.length === 1 ? todays[0] : pickStable(todays, seed, 0);
    out.push(`${SUGGESTION_SHORT_NAME[game.id]} kuponu üret`);
  } else {
    const game = pickStable(trGames, seed, 0);
    out.push(`${SUGGESTION_SHORT_NAME[game.id]} kuponu üret`);
  }

  // Slot 2 — keşif / bilgi (aynı gün sabit rotasyon)
  const infoPool = INFO_SUGGESTIONS.filter((s) => !out.includes(s));
  out.push(pickStable(infoPool.length > 0 ? infoPool : INFO_SUGGESTIONS, seed, 1));

  // Slot 3 — takvim bağlamı
  if (todays.length > 1) {
    out.push('Bugün hangi çekilişler var?');
  } else {
    out.push('Bu hafta hangi çekilişler var?');
  }

  // Slot 4 — kişisel veya alternatif üretim
  if (hasSavedCoupons) {
    out.push('Kaç bekleyen kuponum var?');
  } else {
    const used = new Set(out);
    const candidates = trGames
      .map((g) => `${SUGGESTION_SHORT_NAME[g.id]} kuponu üret`)
      .filter((s) => !used.has(s));
    if (candidates.length > 0) {
      out.push(pickStable(candidates, seed, 2));
    }
  }

  const unique: string[] = [];
  for (const s of out) {
    if (!unique.includes(s)) unique.push(s);
  }
  for (const f of SUGGESTION_FALLBACKS) {
    if (unique.length >= 4) break;
    if (!unique.includes(f)) unique.push(f);
  }
  return unique.slice(0, 4);
}

// Oyun adı eşleşmesi için, en spesifik (uzun) ifadeler önce kontrol edilir.
// Kısa/bitişik yazımlar da tanınır ("çılgın", "süperloto", "10 numara" gibi) —
// kullanıcı "hangi oyun?" sorusuna doğal kısaltmalarla cevap verdiğinde
// eşleşememe (ve sessizce normal sohbete düşme) sorununu önler.
// BİLİNÇLİ OLARAK EKLENMEYENLER: tek başına "süper" ("süper, on numara olsun"
// gibi bir onay cümlesini yanlış oyuna yönlendirirdi) ve tek başına "şans"
// ("şansım", "şanslı" gibi kelimelerin içinde geçiyor).
const GAME_NAME_PATTERNS: { id: GameId; patterns: string[] }[] = [
  { id: 'cilgin', patterns: ['çılgın sayısal', 'çılgın loto', 'sayısal loto', 'çılgın', 'sayısal'] },
  { id: 'superloto', patterns: ['süper loto', 'süperloto'] },
  { id: 'sanstopu', patterns: ['şans topu', 'şanstopu'] },
  { id: 'onnumara', patterns: ['on numara', 'onnumara', '10 numara'] },
];

/**
 * Sadece oyun adını arar, aksiyon kelimesi gerektirmez. Kupon isteği tespiti
 * sohbet turundaki generate_coupon tool-call ile yapılır; bu fonksiyon yalnızca
 * "hangi oyun?" sorusuna verilen cevabı eşlemek için kullanılır — model bu
 * turda tool çağırmazsa (regex'e uymayan bir cümle kurarsa) devreye giren
 * ikinci, güvenilir bir yol.
 */
function matchGameNameOnly(text: string): GameId | null {
  const lower = text.toLocaleLowerCase('tr-TR');
  for (const gc of GAME_NAME_PATTERNS) {
    if (gc.patterns.some((p) => lower.includes(p))) return gc.id;
  }
  return null;
}

function TypingDot({ color, delay }: { color: string; delay: number }) {
  const y = useSharedValue(0);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-4, { duration: 280, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 280 }),
          withTiming(0.4, { duration: 280 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, opacity, y]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View
      style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }, style]}
    />
  );
}

function TypingDots({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <TypingDot key={i} color={color} delay={i * 140} />
      ))}
    </View>
  );
}

const ChatMessageRow = React.memo(function ChatMessageRow({
  msg,
  theme,
  styles: s,
  onSaveCoupon,
  savingCoupon,
}: {
  msg: ChatMessage;
  theme: AppTheme;
  styles: ReturnType<typeof makeStyles>;
  onSaveCoupon: (coupon: NonNullable<ChatMessage['coupon']>) => void;
  savingCoupon: boolean;
}) {
  const c = theme.colors;
  return (
    <View style={{ gap: 12, marginBottom: 12 }}>
      <View
        style={[
          s.bubble,
          msg.role === 'user'
            ? [s.userBubble, { backgroundColor: c.brand }]
            : [s.aiBubble, { backgroundColor: c.surface }],
        ]}
      >
        <Text style={[s.bubbleText, { color: msg.role === 'user' ? c.brandText : c.text }]}>
          {msg.content}
        </Text>
      </View>
      {msg.coupon ? (
        <AICouponCard
          coupon={msg.coupon}
          theme={theme}
          onSave={() => onSaveCoupon(msg.coupon!)}
          saving={savingCoupon}
        />
      ) : null}
    </View>
  );
});

export default function AIAssistantScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const listRef = useRef<FlashListRef<ChatMessage>>(null);
  const { showAlert } = useAlert();
  const { user } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // Cevap parça parça gelirken burada birikir ve geçici bir balonda gösterilir;
  // cevap bitince kalıcı mesaja dönüşüp burası boşalır.
  const [streamingText, setStreamingText] = useState('');
  const [userName, setUserName] = useState<string | null>(null);
  const [hasSavedCoupons, setHasSavedCoupons] = useState(false);
  const [savingCoupon, setSavingCoupon] = useState(false);
  const savingCouponRef = useRef(false);
  const [awaitingGameChoice, setAwaitingGameChoice] = useState(false);
  // "Hangi oyun için kupon istiyorsun?" diye sorduğumuzda, kullanıcının ilk
  // isteğindeki toplam aralığı/mustInclude gibi özel istekleri kaybetmemek
  // için burada saklarız; kullanıcı oyunu söyleyince tekrar kullanılır.
  const [pendingIntent, setPendingIntent] = useState<CouponIntent | null>(null);
  const [pendingIntentText, setPendingIntentText] = useState('');
  // Günlük token kotası dolduğunda yazma alanı kilitlenir ve yerine
  // yenilenme süresini gösteren bir bilgi satırı çıkar. Asıl kontrol
  // sunucuda (ai-chat); buradaki kilit kullanıcıyı boşuna denemekten
  // korur ve AsyncStorage'a yazıldığı için kapat/aç sonrası da kalır.
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  const [quotaResetIn, setQuotaResetIn] = useState(() => msUntilQuotaReset());
  // Bu ekran her açıldığında (ya da kullanıcı "Sohbeti temizle" dediğinde)
  // yeni bir oturum kimliği üretilir — ai_conversations tablosundaki
  // mesajlar bu kimlikle gruplanır, tek bir sohbeti baştan sona görebiliriz.
  const [sessionId, setSessionId] = useState<string>(generateSessionId);
  const isMounted = useRef(true);
  // generateCoupon / applyChatReply async olduğu için state kapanışı bayat
  // kalmasın diye mesaj listesi ve kuyruk ref'te de tutulur.
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  /** "Hepsinden birer" sonrası henüz üretilmemiş oyunlar (sabit TR sırası). */
  const gameQueueRef = useRef<GameId[]>([]);
  /** Son başarılı/istekli üretimin kısıtları — fake fallback ve sıradaki için. */
  const lastGenerationRef = useRef<{
    intent: CouponIntent | null;
    userText: string;
    noOverlap: boolean;
    avoidPrevious: boolean;
  } | null>(null);

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

  // Kapat/aç sonrası da kilit kalsın, ancak yalnızca kotayı tüketen hesapta.
  // Hesap değiştiğinde önce eski hesabın ekran kilidi kaldırılır, sonra yeni
  // hesabın kendine ait kaydı okunur.
  React.useEffect(() => {
    let cancelled = false;
    setQuotaExhausted(false);

    if (!user?.id) return () => {
      cancelled = true;
    };

    loadQuotaExhausted(user.id).then((exhausted) => {
      if (cancelled || !isMounted.current) return;
      setQuotaExhausted(exhausted);
      if (exhausted) setQuotaResetIn(msUntilQuotaReset());
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Kilitliyken kalan süreyi tazeler; gün dönünce kilidi kendiliğinden
  // kaldırır, kullanıcının uygulamayı yeniden başlatmasına gerek kalmaz.
  React.useEffect(() => {
    if (!quotaExhausted) return;

    const tick = () => {
      const remainingMs = msUntilQuotaReset();
      if (remainingMs <= 0) {
        setQuotaExhausted(false);
        if (user?.id) void clearQuotaExhausted(user.id);
        return;
      }
      setQuotaResetIn(remainingMs);
    };

    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [quotaExhausted, user?.id]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS)
        .then((raw) => {
          if (!raw) {
            setHasSavedCoupons(false);
            return;
          }
          try {
            const list = JSON.parse(raw);
            setHasSavedCoupons(Array.isArray(list) && list.length > 0);
          } catch {
            setHasSavedCoupons(false);
          }
        })
        .catch(() => setHasSavedCoupons(false));
    }, [])
  );

  const suggestions = useMemo(
    () => buildDailySuggestions(hasSavedCoupons),
    [hasSavedCoupons]
  );

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
    });
  }, []);

  // Yalnızca yeni mesaj / yükleme durumunda alta kaydır — klavye layout
  // değişiminde onContentSizeChange ile tetiklenmez (ekran kasmasının ana nedeni).
  useEffect(() => {
    if (messages.length === 0) return;
    scrollToBottom();
  }, [messages.length, loading, streamingText, scrollToBottom]);

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
          setMessages([]);
          setStreamingText('');
          setSessionId(generateSessionId());
          setAwaitingGameChoice(false);
          setPendingIntent(null);
          setPendingIntentText('');
          gameQueueRef.current = [];
          lastGenerationRef.current = null;
        },
      },
    ]);
  };

  /**
   * Belirli bir oyun için 1 veya daha fazla kupon üretir: sayılar kod
   * tarafında (algoritmik) seçilir; kart açıklaması şablonla yazılır
   * (ayrı AI turu yok — niyet zaten sohbet tool-call'ından geldi).
   * `constraints` ve `noOverlap`, generate_coupon tool argümanlarından
   * türetilir — bkz. buildConstraintsFromIntent.
   * `introText`: tool ile birlikte gelen kısa asistan metni (varsa balonda kullanılır).
   */
  const generateCoupon = async (
    gameId: GameId,
    userContent: string,
    userMessageAlreadyShown = false,
    constraints: NumberConstraints = {},
    requestedCount = 1,
    noOverlap = false,
    avoidPreviousCoupons = false,
    introText?: string | null,
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
      const afterPrimeConstraints: NumberConstraints = impossiblePrimeNote
        ? { ...afterSumConstraints, onlyPrimes: undefined }
        : afterSumConstraints;
      if (impossiblePrimeNote) {
        appendMessage({ role: 'assistant', content: impossiblePrimeNote });
      }

      // Aynı kontrol "sadece çift/tek sayı" için de yapılır — pratikte
      // desteklenen oyunlarda hiç tetiklenmez, ama tutarlılık için var.
      const impossibleParityNote = buildImpossibleParityNote(game, afterPrimeConstraints);
      const effectiveConstraints: NumberConstraints = impossibleParityNote
        ? { ...afterPrimeConstraints, onlyEven: undefined, onlyOdd: undefined }
        : afterPrimeConstraints;
      if (impossibleParityNote) {
        appendMessage({ role: 'assistant', content: impossibleParityNote });
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
      if (!isMounted.current) return;

      const cleanedIntro = introText?.trim() ? stripMarkdown(introText.trim()) : null;
      // Tool ile birlikte gelen metinde model yine de sayı uydurmuşsa balonda
      // gösterme — kart zaten gerçek sayıları taşıyor.
      const safeIntro =
        cleanedIntro && containsFakeCouponNumbers(cleanedIntro) ? null : cleanedIntro;

      // Aşağıdaki `safeIntro || '...'` sırası bilinçli: giriş cümlesi her
      // zaman ÖNCE AI'dan alınır, sabit metin sadece AI hiç metin yazmadığında
      // devreye girer. Sırayı ters çevirme veya sabit metni öne alma —
      // bkz. dosya başındaki "ÜRÜN KARARI: şablon cevap yok" notu.
      if (howMany > 1) {
        const introParts = [
          safeIntro || `${game.name} için ${coupons.length} kupon hazır:`,
        ];
        if (!safeIntro && noOverlap) introParts.push('İstediğin gibi kuponlar birbirleriyle ortak sayı taşımıyor.');
        const newMessages: ChatMessage[] = [];
        coupons.forEach((cp, idx) => {
          if (cp.relaxed) {
            newMessages.push({
              role: 'assistant',
              content: `${idx + 1}. kupon — ${buildRelaxedNote(cp.numbers, game.max, effectiveConstraints)}`,
            });
          }
        });
        newMessages.push({ role: 'assistant', content: introParts.join(' ') });
        coupons.forEach((cp, idx) => {
          newMessages.push({
            role: 'assistant',
            content: `${idx + 1}. kupon`,
            coupon: {
              game: game.name,
              numbers: cp.numbers,
              superStar: cp.superStar,
              bonus: cp.bonus,
            },
          });
        });
        appendMessages(newMessages);
      } else {
        const single = coupons[0];
        const batch: ChatMessage[] = [];
        if (single.relaxed) {
          batch.push({
            role: 'assistant',
            content: buildRelaxedNote(single.numbers, game.max, effectiveConstraints),
          });
        }
        batch.push({
          role: 'assistant',
          content: safeIntro || `${game.name} için bir kupon seçtim, bakalım nasıl olmuş.`,
          coupon: {
            game: game.name,
            numbers: single.numbers,
            superStar: single.superStar,
            bonus: single.bonus,
          },
        });
        appendMessages(batch);
      }
    } catch {
      if (!isMounted.current) return;
      appendMessage({ role: 'assistant', content: 'Kupon üretirken bir sorun oluştu, tekrar dener misin?' });
    } finally {
      if (isMounted.current) {
        setLoading(false);
        scrollToBottom();
      }
    }
  };

  /**
   * Her AI çağrısından sonra kota durumunu günceller. İki yoldan kilitlenir:
   * sunucu 429 döndüyse (kota zaten dolmuş) ya da bu çağrı son token'ları
   * harcadıysa (remaining 0) — ikincisi sayesinde kullanıcı kilidi görmek
   * için bir mesaj daha yazıp boşuna beklemez.
   */
  const applyQuotaState = (result: { errorType?: AIErrorType; remaining?: number }) => {
    if (result.errorType === 'quota' || result.remaining === 0) {
      setQuotaExhausted(true);
      if (user?.id) void persistQuotaExhausted(user.id);
    }
  };

  /**
   * Sohbet cevabını üretir (akışlı). generate_coupon tool açıktır — model
   * ya metin yazar ya da kupon aracı çağırır; ikisi de aynı turda döner.
   */
  const prepareChatReply = async (
    content: string,
    onDelta: (fullText: string) => void,
  ): Promise<AIResult> => {
    const contextStartedAt = Date.now();
    const recentTexts = messages.map((m) => messageToLogText(m));
    const wantStats = conversationNeedsDrawStats(content, recentTexts);
    const wantApp = conversationNeedsAppContext(content, recentTexts);

    let statsText: string | null = null;
    let appContextText: string | null = null;
    let resolvedUserName = userName;
    try {
      const tasks: Promise<unknown>[] = [];
      if (wantStats) tasks.push(getCachedStatsText().then((s) => { statsText = s; }));
      if (wantApp) {
        tasks.push(
          buildAppContextSnapshot().then((snapshot) => {
            appContextText = formatAppContextForPrompt(snapshot);
            resolvedUserName = snapshot.userName ?? userName;
            if (snapshot.userName && snapshot.userName !== userName) {
              setUserName(snapshot.userName);
            }
          }),
        );
      }
      if (tasks.length > 0) await Promise.all(tasks);
    } catch {
      if (wantStats) statsText = 'İstatistikler şu anda yüklenemedi.';
      if (wantApp) appContextText = 'Kullanıcının güncel durumu şu an okunamadı.';
    }
    logAITiming(
      'Bağlam + istatistik hazırlığı',
      contextStartedAt,
      `stats=${wantStats ? 'on' : 'off'} app=${wantApp ? 'on' : 'off'}`,
    );

    // ≤15 mesaj: tüm geçmiş. Üstünde: eski kısım kural tabanlı özet + son 5
    // ham mesaj. Ekrandaki sohbet budanmaz; sadece API paketi kısalır.
    // Kupon sayılarının kaybolmaması için özet, eski kuponları gerçek
    // sayılarıyla listeler (messageToLogText ile aynı format).
    const historyForApi = buildChatHistoryForApi(messages);

    const apiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: getBasePrompt(statsText, resolvedUserName, appContextText) },
      ...historyForApi,
      { role: 'user', content },
    ];

    const aiStartedAt = Date.now();
    let firstDeltaLogged = false;
    const result = await chatWithAIStream(apiMessages, (fullText) => {
      if (!firstDeltaLogged) {
        firstDeltaLogged = true;
        logAITiming('AI ilk kelime', aiStartedAt);
      }
      onDelta(fullText);
    }, { enableCouponTool: true });
    logAITiming(
      'Asıl AI cevabı',
      aiStartedAt,
      `${apiMessages.length} mesaj · ${apiMessages.reduce((sum, m) => sum + m.content.length, 0)} karakter` +
        (messages.length > FULL_HISTORY_LIMIT
          ? ` · geçmiş özetlendi (${messages.length}→${historyForApi.length})`
          : '') +
        (result.toolCalls?.length ? ` · tool=${result.toolCalls.map((t) => t.name).join(',')}` : ''),
    );
    return result;
  };

  /**
   * prepareChatReply sonucunu ekrana uygular (cevap veya hata mesajı).
   * Model kendi kafasından sayı yazdıysa (containsFakeCouponNumbers), artık
   * sadece durup "hata yapıyordum" demiyoruz — kullanıcı elleri boş
   * kalmasın diye SOHBET GEÇMİŞİNDEN oyunu bulup gerçek kuponu otomatik
   * üretiyoruz. Bu, dün yaşanan "model üst üste hazırlıyorum diyor ama
   * hiç kupon üretilmiyor" sorununu kalıcı çözer.
   */
  const applyChatReply = async (result: AIResult) => {
    if (!isMounted.current) return;
    applyQuotaState(result);

    if (result.reply) {
      const replyText = stripMarkdown(result.reply.trim());
      if (containsFakeCouponNumbers(replyText)) {
        // Kullanıcıya artık "hata yapıyordum" mesajı GÖSTERİLMEZ — sadece
        // gerçek kuponu bekleniyormuş gibi (typing dots) alır, sanki hiç
        // sorun olmamış gibi. Geliştirme kaydında (ai_conversations) yine
        // de bu olayı görebilelim diye, gösterilmeyen ham metni ayrıca
        // logluyoruz — kullanıcı ekranında hiç yer kaplamıyor.
        void logConversationMessage(sessionId, user?.id, {
          role: 'assistant',
          content: `[FAKE_COUPON_CAUGHT] ${replyText}`,
        });
        const queueHead = gameQueueRef.current[0] ?? null;
        const fallbackGameId = resolveFallbackGameId(
          replyText,
          messagesRef.current,
          queueHead,
        );
        if (fallbackGameId) {
          // Kuyruk başı seçildiyse (veya metindeki oyun kuyruk başıyla
          // aynıysa) kuyruktan düş — aksi halde "sıradaki" iki kez aynı
          // oyunu verir.
          if (gameQueueRef.current[0] === fallbackGameId) {
            gameQueueRef.current = gameQueueRef.current.slice(1);
          }
          const saved = lastGenerationRef.current;
          const game = getGameById(fallbackGameId);
          const constraints = saved
            ? buildConstraintsFromIntent(saved.intent, game, saved.userText)
            : {};
          await generateCoupon(
            fallbackGameId,
            '',
            true,
            constraints,
            1,
            saved?.noOverlap ?? false,
            saved?.avoidPrevious ?? false,
            stripFakeCouponSentences(replyText),
          );
        } else {
          appendMessage({
            role: 'assistant',
            content: 'Hangi oyun için kupon istiyorsun? Çılgın Sayısal Loto, Süper Loto, Şans Topu veya On Numara diyebilirsin.',
          });
          setStreamingText('');
          setLoading(false);
        }
        scrollToBottom();
        return;
      }
      appendMessage({ role: 'assistant', content: replyText });
    } else {
      appendMessage({ role: 'assistant', content: errorMessageFor(result.errorType) });
    }

    setStreamingText('');
    setLoading(false);
    scrollToBottom();
  };

  /**
   * generate_coupon tool-call sonucunu işleyip kuponu üretir. send() (ana
   * sohbet akışı) ve askForCouponGame (oyun sorusu sonrası) İKİSİ de bu
   * fonksiyonu kullanır — aynı mantığın iki yerde ayrı ayrı, birbirinden
   * farklı şekillerde yazılmasını (ve birinin unutulmasını) önler.
   */
  const handleCouponToolCall = async (
    intent: CouponIntent,
    content: string,
    recentContext: { role: string; content: string }[],
    introText: string | null,
    pendingIntent: CouponIntent | null = null,
    pendingIntentText = '',
  ) => {
    const effectiveIntent =
      pendingIntent && intent.gameId ? mergeCouponIntents(pendingIntent, intent) : intent;
    const userText = pendingIntentText
      ? `${pendingIntentText} ${collectUserIntentText(content, recentContext)}`
      : collectUserIntentText(content, recentContext);
    const truncationWarning = buildTruncationWarning(effectiveIntent);
    if (truncationWarning) {
      appendMessage({ role: 'assistant', content: truncationWarning });
    }

    const allGames = wantsAllGamesOneEach(content) || wantsAllGamesOneEach(userText);
    if (allGames) {
      const firstId = TR_COUPON_GAME_IDS[0];
      const rest = TR_COUPON_GAME_IDS.slice(1);
      gameQueueRef.current = rest;
      const game = getGameById(firstId);
      const constraints = buildConstraintsFromIntent(effectiveIntent, game, userText);
      const noOverlap = intentWantsNoOverlap(effectiveIntent, userText);
      const avoidPrevious = intentWantsAvoidPrevious(effectiveIntent, userText);
      lastGenerationRef.current = {
        intent: effectiveIntent,
        userText,
        noOverlap,
        avoidPrevious,
      };
      await generateCoupon(
        firstId,
        content,
        true,
        constraints,
        1,
        noOverlap,
        avoidPrevious,
        introText || `Harika, dört oyundan da birer kupon hazırlıyorum — ilki ${game.name}.`,
      );
      return;
    }

    if (effectiveIntent.gameId) {
      const game = getGameById(effectiveIntent.gameId);
      const constraints = buildConstraintsFromIntent(effectiveIntent, game, userText);
      const count = effectiveIntent.count ?? 1;
      const noOverlap = intentWantsNoOverlap(effectiveIntent, userText);
      const avoidPrevious = intentWantsAvoidPrevious(effectiveIntent, userText);
      lastGenerationRef.current = {
        intent: effectiveIntent,
        userText,
        noOverlap,
        avoidPrevious,
      };
      // Tek oyun isteği kuyruğu sıfırlar — eski "hepsinden" artığı kalmasın.
      gameQueueRef.current = [];
      await generateCoupon(
        effectiveIntent.gameId,
        content,
        true,
        constraints,
        count,
        noOverlap,
        avoidPrevious,
        introText,
      );
      return;
    }
    await askForCouponGame(content, true, effectiveIntent, userText);
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
      scrollToBottom();
    }
    setAwaitingGameChoice(true);
    setPendingIntent(intent);
    setPendingIntentText(userText);

    // Eskiden burada sabit (hardcoded) bir metin gönderiliyordu — kullanıcı
    // her kupon isteğinde AYNI cümleyi görüyordu, bu da "gerçekten bir yapay
    // zekayla mı konuşuyorum?" sorusuna yol açtı (haklı bir gözlemdi). Artık
    // gerçek bir AI çağrısı yapıyoruz — sadece AI'a bu turda TEK bir görevi
    // (hangi oyunu sor) net şekilde bildiriyoruz. İstatistik/uygulama özeti
    // bu soru için gereksiz; token ve gecikme tasarrufu için eklenmez.
    const resolvedUserName = userName;

    const gameAskInstruction = `

ŞU AN YAPMAN GEREKEN TEK ŞEY: Kullanıcı bir kupon istedi ama hangi oyun için istediğini
belirtmedi. Ona kendi doğal üslubunla, kısa bir cümleyle hangi oyunu istediğini sor. Seçenekler:
Çılgın Sayısal Loto, Süper Loto, Şans Topu, On Numara — bu dört seçeneği bir şekilde belirt.
SADECE bu soruyu sor; kupon üretme, sayı yazma, başka bir konuya girme.`;

    const apiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: getBasePrompt(null, resolvedUserName, null) + gameAskInstruction },
      ...buildChatHistoryForApi(messages),
      { role: 'user', content },
    ];

    // enableCouponTool: true — bu turda kullanıcı hangi oyunu istediğini
    // söylerse (ör. "Süper Loto") model doğrudan generate_coupon'ı
    // çağırabilsin diye. Eskiden bu turda tool kapalıydı; kullanıcının
    // cevabı matchGameNameOnly regex'ine düşmezse (ör. "süperloto olsun"
    // gibi regex'in tam eşleşmediği bir ifade) sohbet normal metne
    // düşüyor ve kupon hiç üretilmiyordu — kullanıcı tekrar istemek
    // zorunda kalıyordu. Artık iki yol da (regex + tool) aynı anda açık,
    // hangisi önce yakalarsa o devreye girer.
    const result = await chatWithAI(apiMessages, { enableCouponTool: true });
    if (!isMounted.current) return;
    applyQuotaState(result);

    // Model bu turda gerçekten generate_coupon çağırdıysa (regex'in
    // yakalayamadığı bir ifadede), kuponu doğrudan üret — send()'deki ana
    // akışla AYNI ortak fonksiyonu (handleCouponToolCall) kullanarak.
    const toolIntent = extractCouponToolIntent(result);
    if (toolIntent) {
      setAwaitingGameChoice(false);
      const savedPending = pendingIntent;
      const savedText = pendingIntentText;
      setPendingIntent(null);
      setPendingIntentText('');
      const recentContext = messages.slice(-5).map((m) => ({ role: m.role, content: messageToLogText(m) }));
      await handleCouponToolCall(
        toolIntent,
        content,
        recentContext,
        result.reply?.trim() || null,
        savedPending,
        savedText,
      );
      logAITiming('Oyun sorusundan kupon üretimine (tool ile)', Date.now());
      return;
    }

    if (result.reply) {
      const replyText = stripMarkdown(result.reply.trim());
      if (containsFakeCouponNumbers(replyText)) {
        // Aynı sessiz düzeltme — kullanıcı hata mesajı görmez, sadece log'a
        // yazılır (bkz. applyChatReply'deki aynı desen).
        void logConversationMessage(sessionId, user?.id, {
          role: 'assistant',
          content: `[FAKE_COUPON_CAUGHT] ${replyText}`,
        });
        const queueHead = gameQueueRef.current[0] ?? null;
        const fallbackGameId = resolveFallbackGameId(
          replyText,
          messagesRef.current,
          queueHead,
        );
        if (fallbackGameId) {
          if (gameQueueRef.current[0] === fallbackGameId) {
            gameQueueRef.current = gameQueueRef.current.slice(1);
          }
          const saved = lastGenerationRef.current;
          const game = getGameById(fallbackGameId);
          const constraints = saved
            ? buildConstraintsFromIntent(saved.intent, game, saved.userText)
            : {};
          await generateCoupon(
            fallbackGameId,
            content,
            true,
            constraints,
            1,
            saved?.noOverlap ?? false,
            saved?.avoidPrevious ?? false,
            stripFakeCouponSentences(replyText),
          );
          return;
        }
      } else {
        appendMessage({ role: 'assistant', content: replyText });
      }
    } else {
      // AI çağrısı başarısız olursa, kullanıcıyı hiç cevapsız bırakmamak
      // için son bir güvenlik ağı olarak sabit metne düşüyoruz — bu, normal
      // akışta artık kullanılmıyor, sadece gerçek bir hata durumunda devreye
      // giriyor.
      appendMessage({
        role: 'assistant',
        content: 'Hangi oyun için kupon istiyorsun? Çılgın Sayısal Loto, Süper Loto, Şans Topu veya On Numara diyebilirsin.',
      });
    }
    setLoading(false);
    scrollToBottom();
  };

  /**
   * Kuyruktan sıradaki kupon için giriş cümlesini AI'a yazdırır.
   *
   * Bu turda OYUN SEÇİMİ modele bırakılmaz (kuyruk sırası koddadır — modelin
   * yanlış oyun seçtiği gerçek vakalar yaşandı); modelden istenen tek şey
   * cümlenin kendisidir. Böylece hem doğru oyun garanti kalır hem de
   * kullanıcı arka arkaya "sıradaki" dediğinde aynı cümleyi tekrar tekrar
   * görmez (bkz. dosya başındaki "şablon cevap yok" notu).
   *
   * Kupon üretimi yerel ve anlık; bu çağrı araya ~1 sn gecikme koyar, ama
   * bu sürede zaten normal sohbetteki yazıyor animasyonu görünür.
   * enableCouponTool KAPALI: bu turda tek istenen bir cümle, tool çağrısı değil.
   */
  const fetchQueueAdvanceIntro = async (
    game: Game,
    remaining: number,
    content: string,
  ): Promise<string | null> => {
    const startedAt = Date.now();
    const instruction = `

ŞU AN YAPMAN GEREKEN TEK ŞEY: Kullanıcı sıradaki oyuna geçmeni istedi ve sıradaki oyun
${game.name}. Kuponu uygulama üretecek — sen SADECE ${game.name} için kupon hazırladığını
belirten, kendi doğal üslubunla yazılmış TEK kısa cümle yaz. ${
      remaining === 0
        ? 'Bu, listedeki son oyun — bunu da hissettir.'
        : `Bundan sonra ${remaining} oyun daha var.`
    }
ASLA sayı yazma, kupon yazma, soru sorma, başka bir konuya girme. Sadece o tek cümle.`;

    const apiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: getBasePrompt(null, userName, null) + instruction },
      ...buildChatHistoryForApi(messages),
      { role: 'user', content },
    ];

    const result = await chatWithAI(apiMessages, { maxTokens: 80 });
    applyQuotaState(result);
    logAITiming('Kuyruk giriş cümlesi', startedAt);

    const reply = result.reply?.trim();
    if (!reply) return null;
    const clean = stripMarkdown(reply);
    return containsFakeCouponNumbers(clean) ? null : clean;
  };

  const send = async (text?: string) => {
    const sendStartedAt = Date.now();
    const content = (text ?? input).trim();
    // quotaExhausted: yazma alanı zaten gizli, ama öneri kartları da send()
    // çağırdığı için kilit burada da uygulanır.
    if (!content || loading || quotaExhausted) return;

    // Giriş yapılmamışsa login ekranına yönlendir
    if (!user) {
      softHaptic();
      router.push('/login' as any);
      return;
    }

    softHaptic();

    // Mesajı hemen göster — AI cevabı arkada akar.
    appendMessage({ role: 'user', content });
    setInput('');
    setLoading(true);
    scrollToBottom();

    // "Hepsinden birer" kuyruğu doluyken "sıradaki/sonraki" — AI'ya bırakma;
    // sabit sıradan bir sonraki oyunu üret (yanlış oyun / uydurma sayı önlenir).
    if (isQueueAdvancePhrase(content) && gameQueueRef.current.length > 0) {
      const nextId = gameQueueRef.current[0];
      gameQueueRef.current = gameQueueRef.current.slice(1);
      const saved = lastGenerationRef.current;
      const game = getGameById(nextId);
      const constraints = saved
        ? buildConstraintsFromIntent(saved.intent, game, saved.userText)
        : {};
      const remaining = gameQueueRef.current.length;
      // Giriş cümlesi AI'dan gelir; oyun seçimi yine kodda kalır
      // (bkz. fetchQueueAdvanceIntro). Aşağıdaki sabit metinler yalnızca
      // AI çağrısı başarısız olduğunda devreye girer.
      const aiIntro = await fetchQueueAdvanceIntro(game, remaining, content);
      const intro =
        aiIntro ??
        (remaining === 0
          ? `Son olarak ${game.name}!`
          : `${game.name} için bakıyorum.`);
      await generateCoupon(
        nextId,
        content,
        true,
        constraints,
        1,
        saved?.noOverlap ?? false,
        saved?.avoidPrevious ?? false,
        intro,
      );
      logAITiming('Kuyruktan sıradaki kupon', sendStartedAt);
      return;
    }

    // "Hangi oyun?" sorusuna verilen cevap — önce AI turu (intro + tool);
    // ilk istekteki kısıtlar pendingIntent'te saklı kalır, tool sonrası birleştirilir.
    const wasAwaitingGame = awaitingGameChoice;
    const savedPendingIntent = wasAwaitingGame ? pendingIntent : null;
    const savedPendingText = wasAwaitingGame ? pendingIntentText : '';
    if (wasAwaitingGame) {
      setAwaitingGameChoice(false);
    }

    // Tek AI turu: model ya sohbet eder (stream) ya da generate_coupon
    // tool'unu çağırır. Ayrı sınıflandırma turu yok — ilk kelime gecikmeden
    // ekrana gelir; tool gelirse akan metin silinip kupon üretilir.
    let lastRenderAt = 0;
    let pendingRender: ReturnType<typeof setTimeout> | null = null;

    const flushStream = (text: string) => {
      pendingRender = null;
      lastRenderAt = Date.now();
      if (isMounted.current) setStreamingText(stripMarkdown(text));
    };

    const handleDelta = (fullText: string) => {
      // Her token'da setState yapmak listeyi gereksiz yere yeniden çizer;
      // ~60 ms'lik kısma göz için akıcı, cihaz için ucuz.
      const sinceLast = Date.now() - lastRenderAt;
      if (sinceLast >= 60) {
        if (pendingRender) clearTimeout(pendingRender);
        flushStream(fullText);
      } else if (!pendingRender) {
        pendingRender = setTimeout(() => flushStream(fullText), 60 - sinceLast);
      }
    };

    const result = await prepareChatReply(content, handleDelta);
    if (pendingRender) clearTimeout(pendingRender);
    if (!isMounted.current) return;

    const intent = extractCouponToolIntent(result);
    // Model tool çağırmasa bile "hepsinden birer" isteğini kod tarafında yakala.
    if (!intent && wantsAllGamesOneEach(content)) {
      setStreamingText('');
      applyQuotaState(result);
      const emptyIntent: CouponIntent = {
        intent: 'generate_coupon',
        gameId: null,
        count: null,
        countRequestedRaw: null,
        sumMin: null,
        sumMax: null,
        mustInclude: null,
        mustExclude: null,
        mustIncludeTruncatedFrom: null,
        mustExcludeTruncatedFrom: null,
        excludeRangeMin: null,
        excludeRangeMax: null,
        noOverlap: null,
        avoidPreviousCoupons: null,
        onlyPrimes: null,
        onlyEven: null,
        onlyOdd: null,
        balanceEvenOdd: null,
        avoidPatterns: null,
        spreadZones: null,
        maxConsecutive: null,
      };
      const recentContext = messagesRef.current.slice(-5).map((m) => ({
        role: m.role,
        content: messageToLogText(m),
      }));
      await handleCouponToolCall(
        emptyIntent,
        content,
        recentContext,
        result.reply?.trim() || null,
        savedPendingIntent,
        savedPendingText,
      );
      setPendingIntent(null);
      setPendingIntentText('');
      logAITiming('Hepsinden birer (tool yok, kod yolu)', sendStartedAt);
      return;
    }

    if (intent) {
      // Tool çağrıldı — akan sohbet balonunu temizle, kupon yoluna geç.
      const introFromAi = result.reply?.trim() || null;
      setStreamingText('');
      applyQuotaState(result);
      const recentContext = messages.slice(-5).map((m) => ({ role: m.role, content: messageToLogText(m) }));
      await handleCouponToolCall(
        intent,
        content,
        recentContext,
        introFromAi,
        savedPendingIntent,
        savedPendingText,
      );
      setPendingIntent(null);
      setPendingIntentText('');
      logAITiming('Gönderimden kupon üretimine toplam', sendStartedAt);
      return;
    }

    // Yedek: model tool çağırmadıysa ama kullanıcı net oyun seçtiyse yine üret
    // (intro şablonda kalır — normal akışta AI her zaman metin yazar).
    if (wasAwaitingGame) {
      const gameFromChoice = matchGameNameOnly(content);
      if (gameFromChoice) {
        const game = getGameById(gameFromChoice);
        const constraints = buildConstraintsFromIntent(savedPendingIntent, game, savedPendingText);
        const count = savedPendingIntent?.count ?? 1;
        const noOverlap = intentWantsNoOverlap(savedPendingIntent, savedPendingText);
        const avoidPrevious = intentWantsAvoidPrevious(savedPendingIntent, savedPendingText);
        const truncationWarning = buildTruncationWarning(savedPendingIntent);
        setPendingIntent(null);
        setPendingIntentText('');
        lastGenerationRef.current = {
          intent: savedPendingIntent,
          userText: savedPendingText,
          noOverlap,
          avoidPrevious,
        };
        gameQueueRef.current = [];
        if (truncationWarning) {
          appendMessage({ role: 'assistant', content: truncationWarning });
        }
        await generateCoupon(gameFromChoice, content, true, constraints, count, noOverlap, avoidPrevious);
        logAITiming('Gönderimden kupon üretimine toplam (yedek yol)', sendStartedAt);
        return;
      }
      setAwaitingGameChoice(true);
      if (savedPendingIntent) setPendingIntent(savedPendingIntent);
      if (savedPendingText) setPendingIntentText(savedPendingText);
    }

    await applyChatReply(result);
    logAITiming('Gönderimden cevaba toplam', sendStartedAt);
  };

  const saveCoupon = useCallback(async (coupon: ChatMessage['coupon']) => {
    if (!coupon) return;
    if (savingCouponRef.current) return;
    softHaptic();
    savingCouponRef.current = true;
    setSavingCoupon(true);
    try {
      const existing = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_COUPONS);
      const coupons = existing ? JSON.parse(existing) : [];
      const gameConfig = GAMES.find((g) => g.name === coupon.game);
      const gameColor = getGameAccentColor(gameConfig?.id ?? 'cilgin');
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
      });
      await AsyncStorage.setItem(STORAGE_KEYS.SAVED_COUPONS, JSON.stringify(coupons));
      markCouponsDirty();
      setHasSavedCoupons(true);
      showAlert('Kaydedildi', "AI kuponu Kuponlarım'a eklendi.", [
        { text: 'Tamam' },
        { text: 'Kuponlarıma git', onPress: () => router.push('/(tabs)/saved') },
      ]);
    } catch {
      showAlert('Hata', 'Kupon kaydedilemedi.');
    } finally {
      savingCouponRef.current = false;
      setSavingCoupon(false);
    }
  }, [router, showAlert]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <ChatMessageRow
        msg={item}
        theme={theme}
        styles={s}
        onSaveCoupon={saveCoupon}
        savingCoupon={savingCoupon}
      />
    ),
    [theme, s, saveCoupon, savingCoupon],
  );

  const listFooter = useMemo(() => {
    if (!loading) return null;
    if (streamingText) {
      return (
        <View style={[s.bubble, s.aiBubble, { backgroundColor: c.surface }]}>
          <Text style={[s.bubbleText, { color: c.text }]}>{streamingText}</Text>
        </View>
      );
    }
    return (
      <View style={[s.bubble, s.aiBubble, { backgroundColor: c.surface, paddingVertical: 14 }]}>
        <TypingDots color={c.text3} />
      </View>
    );
  }, [loading, streamingText, s, c.surface, c.text, c.text3]);

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <View style={{ paddingTop: insets.top + 6 }}>
        <View style={s.nav}>
          <Pressable
            onPress={() => { softHaptic(); router.back(); }}
            style={[s.navBtn, { backgroundColor: c.surfaceAlt }]}
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
              style={[s.navBtn, { backgroundColor: c.surfaceAlt }]}
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
                {suggestions.map((sug, i) => (
                  <PressableScale
                    haptic={false}
                    key={sug}
                    onPress={() => send(sug)}
                    style={[s.suggestion, { backgroundColor: c.surface }]}
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
          <FlashList
            ref={listRef}
            style={{ flex: 1 }}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(_, index) => String(index)}
            contentContainerStyle={{ padding: 16 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={listFooter}
          />
        )}

        {quotaExhausted ? (
          <View
            style={[
              s.quotaRow,
              { borderTopColor: c.hairline, backgroundColor: c.surface, paddingBottom: insets.bottom > 0 ? insets.bottom : 16 },
            ]}
          >
            <Text style={[s.quotaTitle, { color: c.text }]}>Bugünlük AI hakkın doldu</Text>
            <Text style={[s.quotaSub, { color: c.text3 }]}>
              {formatQuotaResetIn(quotaResetIn)} sonra yenilenir
            </Text>
          </View>
        ) : (
          <View style={[s.inputRow, { borderTopColor: c.hairline, paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }]}>
            <TextInput
              style={[s.input, { backgroundColor: c.surface, color: c.text }]}
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
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function AICouponCard({ coupon, theme, onSave, saving }: {
  coupon: NonNullable<ChatMessage['coupon']>;
  theme: AppTheme;
  onSave: () => void;
  saving?: boolean;
}) {
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const id = getGameByName(coupon.game)?.id ?? 'cilgin';
  const color = getGameAccentColor(id);
  const bonusLabel = coupon.game === 'Çılgın Sayısal Loto' ? 'JOKER' : 'ŞANS TOPU';

  return (
    <View style={[s.couponCard, { backgroundColor: c.surface }]}>
      <View style={[s.couponStripe, { backgroundColor: color }]} />
      <View style={s.couponBody}>
        <View style={s.couponHead}>
          <View style={[s.couponEmblem, { backgroundColor: `${color}14` }]}>
            <GameEmblem game={id} size={34} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.couponEyebrow, { color }]}>LOTA'NIN SEÇİMİ</Text>
            <Text style={[s.couponGame, { color }]}>{coupon.game}</Text>
          </View>
        </View>

        <View style={[s.couponPerforation, { borderTopColor: c.border }]} />

        <View style={s.couponBalls}>
          {coupon.numbers.map((n, i) => (
            <NumberBall
              key={i}
              value={n}
              color={color}
              variant="matched"
              size={38}
            />
          ))}
        </View>

        {coupon.bonus !== null ? (
          <View style={s.couponBonusBlock}>
            <Text style={s.couponBonusLabel}>{bonusLabel}</Text>
            <NumberBall
              value={coupon.bonus}
              variant="bonus"
              size={38}
            />
          </View>
        ) : null}

        {coupon.superStar !== null ? (
          <View style={s.couponBonusBlock}>
            <Text style={s.couponBonusLabel}>SÜPERSTAR</Text>
            <NumberBall
              value={coupon.superStar}
              variant="star"
              size={38}
            />
          </View>
        ) : null}

        <AppButton
          haptic={false}
          label={saving ? 'Kaydediliyor…' : 'Kuponu kaydet'}
          accent={c.brand}
          size="md"
          onPress={onSave}
          disabled={!!saving}
          loading={!!saving}
          iconLeft={(fg, size) => <BookmarkIcon color={fg} size={size} />}
          style={{ marginTop: 14 }}
        />
      </View>
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    nav: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14 },
    navBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
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
    suggestion: { paddingHorizontal: 16, paddingVertical: 13, borderRadius: radius.lg, backgroundColor: c.surface },
    suggestionText: { ...ty.bodySemibold, color: c.text },

    bubble: { maxWidth: '86%', paddingHorizontal: 15, paddingVertical: 12 },
    userBubble: { alignSelf: 'flex-end', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 5 },
    aiBubble: { alignSelf: 'flex-start', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 5 },
    bubbleText: { ...ty.body, lineHeight: 21 },

    couponCard: {
      alignSelf: 'flex-start',
      maxWidth: '78%',
      borderRadius: radius.xl,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    couponStripe: { width: 4 },
    couponBody: { flex: 1, padding: 16 },
    couponHead: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 14 },
    couponEyebrow: {
      ...ty.micro,
      fontFamily: theme.font.extrabold,
      letterSpacing: 1,
      marginBottom: 2,
    },
    couponGame: { ...ty.h3 },
    couponEmblem: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    couponPerforation: {
      borderTopWidth: 1,
      borderStyle: 'dashed',
      marginHorizontal: -16,
      marginBottom: 14,
    },
    couponBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    couponBonusBlock: { marginTop: 12, gap: 8 },
    couponBonusLabel: { ...ty.micro, color: c.text3 },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
    input: { flex: 1, minHeight: 48, maxHeight: 110, borderRadius: 24, paddingHorizontal: 18, paddingTop: 13, paddingBottom: 13, ...ty.body },
    sendBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    quotaRow: { alignItems: 'center', gap: 3, paddingHorizontal: 16, paddingTop: 14 },
    quotaTitle: { ...ty.body, fontFamily: theme.font.semibold },
    quotaSub: { ...ty.caption },
  });
}