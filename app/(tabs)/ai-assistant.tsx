// app/(tabs)/ai-assistant.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../../components/ui/app-button';
import { NumberBall } from '../../components/ui/number-ball';
import { PressableScale } from '../../components/ui/surface';
import { STORAGE_KEYS } from '../../constants/storage-keys';
import { AppTheme, GameAccent } from '../../constants/theme';
import { useAlert } from '../../contexts/AlertContext';
import { chatWithAI } from '../../lib/deepseek';
import { GameEmblem } from '../../lib/emblems';
import { GAMES, getGameByName } from '../../lib/games';
import { AIAssistantIcon, BackIcon, BookmarkIcon, CloseIcon, SendIcon } from '../../lib/icons';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';

/* ───────────────────────── cache ───────────────────────── */
let cachedStatsText: string | null = null;

function softHaptic() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

/* ───────────────────────── stats helpers ───────────────────────── */
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

async function getGameStats(game: (typeof GAMES)[0]): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('draws')
      .select('numbers, draw_date')
      .eq('game', game.name)
      .order('draw_date_parsed', { ascending: false })
      .limit(100);

    if (error || !data || data.length === 0) return `${game.name}: Henüz yeterli çekiliş verisi yok.\n`;

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

    return [
      `${game.name} (son ${drawCount} çekiliş):`,
      `  En çok çıkan: ${sortedByCount.join(', ')}`,
      `  En az çıkan: ${sortedByLeast.join(', ')}`,
      `  En çok geciken: ${coldList.join(', ')}`,
      `  Çift/Tek: %${evenPct} / %${oddPct}`,
      `  Toplam aralığı: ${minSum} – ${maxSum} (ort. ${avgSum})`,
      `  Büyük ikramiye ihtimali: ${formatOdds(odds)}`,
      ``,
    ].join('\n');
  } catch {
    return `${game.name}: İstatistikler yüklenemedi.\n`;
  }
}

async function buildStatsPrompt(): Promise<string> {
  const lines: string[] = [];
  for (const game of GAMES) {
    lines.push(await getGameStats(game));
  }
  return lines.join('\n');
}

const getBasePrompt = (statsText: string, userName: string | null): string => {
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

${userStr}

Konu yönetimi:
- Loto dışı sorularda nazikçe konuyu loto veya şans oyunlarına çekersin.
- Örneğin biri "hava nasıl?" derse "Bilmiyorum ama şansın açık görünüyor, bir kupon deneyelim mi?" gibi yanıt verebilirsin.
- Siyaset, din, kişisel sorunlar gibi hassas konulara hiç girmezsin.

Bugün ${gunAdi}, ${tarih}.

Güncel Oyun Bilgileri:
- Çılgın Sayısal Loto: 1-90 arasından 6 ana numara seçilir. Ayrıca 1-90 arasından 1 adet SüperStar numarası seçilir (ana numaralardan bağımsız, tekrar edebilir). SADECE Pazartesi, Çarşamba ve Cumartesi günleri çekilir.
- Süper Loto: 1-60 arasından 6 numara seçilir. Ek numara yoktur. SADECE Salı, Perşembe ve Pazar günleri çekilir.
- Şans Topu: 1-34 arasından 5 ana numara + 1-14 arasından 1 adet "Şans Topu" numarası seçilir. Şans Topu ana numaralardan tamamen bağımsızdır. SADECE Çarşamba ve Pazar günleri çekilir.
- On Numara: 1-80 arasından 10 numara seçilir. Çekilişte 22 numara belirlenir. Ek numara yoktur. SADECE Pazartesi ve Cuma günleri çekilir.

Eğer kullanıcı bir kupon üretmeni isterse, yanıtının SONUNDA mutlaka aşağıdaki kurallara uygun bir JSON objesi bulundur. JSON'u her zaman bir kod bloğu içine al:

Çılgın Sayısal Loto için (6 ana numara 1-90, 1 SüperStar 1-90):
\`\`\`json
{ "game": "Çılgın Sayısal Loto", "numbers": [5, 14, 27, 38, 52, 71], "superStar": 43, "bonus": null, "explanation": "Seçim sebebi..." }
\`\`\`

Süper Loto için (6 numara 1-60, ek numara yok):
\`\`\`json
{ "game": "Süper Loto", "numbers": [3, 11, 22, 34, 45, 58], "superStar": null, "bonus": null, "explanation": "Seçim sebebi..." }
\`\`\`

Şans Tobu için (5 ana numara 1-34, 1 Şans Topu 1-14):
\`\`\`json
{ "game": "Şans Topu", "numbers": [4, 12, 19, 25, 31], "superStar": null, "bonus": 7, "explanation": "Seçim sebebi..." }
\`\`\`

On Numara için (10 numara 1-80, ek numara yok):
\`\`\`json
{ "game": "On Numara", "numbers": [3, 11, 18, 24, 33, 47, 55, 62, 71, 78], "superStar": null, "bonus": null, "explanation": "Seçim sebebi..." }
\`\`\`

Kurallar:
- "numbers" dizisindeki sayılar benzersiz ve oyunun kendi aralığında olmalıdır.
- Çılgın Sayısal Loto'da "superStar" 1-90 arasında olmalı, ana numaralardan farklı olmasına gerek yok.
- Şans Topu'nda "bonus" 1-14 arasında olmalıdır.
- Diğer oyunlarda "superStar" ve "bonus" alanları null olmalıdır.

Aşağıda güncel çekiliş istatistikleri verilmiştir. Kullanıcı sorduğunda bu verilere dayanarak yanıt ver:

${statsText}`;
};

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

const SUGGESTIONS = [
  'Şanslı bir Çılgın Sayısal kuponu üret',
  'Süper Loto nasıl oynanır?',
  'Bu hafta hangi çekilişler var?',
  'Sıcak sayılar ne demek?',
];

function TypingDots({ color }: { color: string }) {
  const dots = [
    useRef(new Animated.Value(0.4)).current,
    useRef(new Animated.Value(0.4)).current,
    useRef(new Animated.Value(0.4)).current,
  ];
  React.useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, { toValue: 1, duration: 320, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.4, duration: 320, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [dots]);
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, opacity: d }} />
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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  React.useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.USER_NAME).then((name) => {
      if (name) setUserName(name);
    });
  }, []);

  const handleClearMessages = () => {
    if (messages.length === 0) return;
    showAlert('Sohbeti temizle', 'Tüm mesajlar silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Temizle',
        style: 'destructive',
        onPress: () => { softHaptic(); setMessages([]); },
      },
    ]);
  };

  const extractJSON = (text: string): any | null => {
    const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try { return JSON.parse(codeBlockMatch[1]); } catch {}
    }
    const plainMatch = text.match(/\{[\s\S]*"game"[\s\S]*"numbers"[\s\S]*\}/);
    if (plainMatch) {
      try { return JSON.parse(plainMatch[0]); } catch {}
    }
    return null;
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    softHaptic();
    const userMsg: ChatMessage = { role: 'user', content };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    let statsText = '';
    try {
      if (cachedStatsText) {
        statsText = cachedStatsText;
      } else {
        setStatsLoading(true);
        statsText = await buildStatsPrompt();
        cachedStatsText = statsText;
        setStatsLoading(false);
      }
    } catch {
      statsText = 'İstatistikler şu anda yüklenemedi.';
      setStatsLoading(false);
    }

    const apiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: getBasePrompt(statsText, userName) },
      ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content },
    ];

    const reply = await chatWithAI(apiMessages);

    if (reply) {
      const parsed = extractJSON(reply);
      let cleanReply = reply;
      const codeBlockMatch = reply.match(/```json[\s\S]*?```/);
      if (codeBlockMatch) cleanReply = reply.replace(/```json[\s\S]*?```/, '').trim();
      else if (parsed) cleanReply = reply.replace(/\{[\s\S]*"game"[\s\S]*"numbers"[\s\S]*\}/, '').trim();

      const assistantMsg: ChatMessage = { role: 'assistant', content: cleanReply };
      if (parsed && parsed.numbers && Array.isArray(parsed.numbers) && parsed.game) {
        assistantMsg.coupon = {
          game: parsed.game,
          numbers: parsed.numbers.sort((a: number, b: number) => a - b),
          superStar: parsed.superStar ?? null,
          bonus: parsed.bonus ?? null,
          explanation: parsed.explanation || 'AI tarafından önerilen kupon',
        };
      }
      setMessages((prev) => [...prev, assistantMsg]);
    } else {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Üzgünüm, şu anda yanıt veremiyorum.' }]);
    }

    setLoading(false);
    scrollRef.current?.scrollToEnd({ animated: true });
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
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
              Loto hakkında soru sor ya da senin için kupon üreteyim. Şununla başlayabilirsin:
            </Text>
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
          </ScrollView>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
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
            {statsLoading ? (
              <View style={[s.bubble, s.aiBubble, { backgroundColor: c.surface, borderColor: c.border, paddingVertical: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={c.brand} />
                  <Text style={[s.bubbleText, { color: c.text2 }]}>İstatistikler yükleniyor…</Text>
                </View>
              </View>
            ) : loading ? (
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
            placeholder="Lota'ya bir şey yaz…"
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

      <Text style={s.couponExp}>{coupon.explanation}</Text>
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