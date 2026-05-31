// app/(tabs)/ai-assistant.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { AppTheme, GameAccent } from '../../constants/theme';
import { chatWithAI } from '../../lib/deepseek';
import { GameEmblem } from '../../lib/emblems';
import { GAMES, getGameByName } from '../../lib/games';
import { AIAssistantIcon, BackIcon, BookmarkIcon, SendIcon } from '../../lib/icons';
import { useTheme } from '../../lib/theme';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  coupon?: { game: string; numbers: number[]; explanation: string };
};

const SUGGESTIONS = [
  'Şanslı bir Çılgın Sayısal kuponu üret',
  'Süper Loto nasıl oynanır?',
  'Bu hafta hangi çekilişler var?',
  'Sıcak sayılar ne demek?',
];

const getBasePrompt = (): string => {
  const today = new Date();
  const gunAdi = today.toLocaleDateString('tr-TR', { weekday: 'long' });
  const tarih = today.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Sen, Türkiye'deki şans oyunları konusunda uzman bir loto asistanısın. Kullanıcılara güncel oyun kuralları hakkında bilgi verir, istatistiksel yorumlar yapar ve isterlerse rastgele kupon üretirsin.
Kesinlikle kazanma garantisi vermezsin. Yanıtlarında sohbet havasında, sade bir dil kullan ve gereksiz yere markdown formatı (yıldız, tire gibi) kullanma.

Bugün ${gunAdi}, ${tarih}.

Güncel Oyun Bilgileri:
- Çılgın Sayısal Loto: 1-90 arasından 6 numara seçilir. Joker (1-90 arası 1 numara) ve SüperStar (1-90 arası 1 numara) çekilişleri vardır. SADECE Pazartesi, Çarşamba ve Cumartesi günleri çekilir.
- Süper Loto: 1-60 arasından 6 numara seçilir. SADECE Salı, Perşembe ve Pazar günleri çekilir.
- Şans Topu: 1-34 arasından 5 numara + 1-14 arasından 1 "Şans Topu" seçilir. SADECE Çarşamba ve Pazar günleri çekilir.
- On Numara: 1-80 arasından 10 numara seçilir. Çekilişte 22 numara belirlenir. SADECE Pazartesi ve Cuma günleri çekilir.

Eğer kullanıcı bir kupon üretmeni isterse, yanıtının SONUNDA mutlaka şu alanları içeren bir JSON objesi bulundur. JSON'u her zaman bir kod bloğu içine al:
\`\`\`json
{ "game": "On Numara", "numbers": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "explanation": "Sayıların seçilme sebebi..." }
\`\`\`

JSON'daki "game" alanı, kullanıcının istediği oyunun tam adı olmalıdır: "Çılgın Sayısal Loto", "Süper Loto", "Şans Topu" veya "On Numara".
JSON'daki "numbers" dizisi:
- Çılgın Sayısal Loto ve Süper Loto için 6 adet, benzersiz sayı içermeli.
- Şans Topu için 5 adet, benzersiz sayı içermeli.
- On Numara için 10 adet, benzersiz sayı içermeli.
Sayılar, oyunun kendi numara aralığında olmalıdır.`;
};

/* typing dots */
function TypingDots({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0.4)).current, useRef(new Animated.Value(0.4)).current, useRef(new Animated.Value(0.4)).current];
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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const extractJSON = (text: string): any | null => {
    const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try { return JSON.parse(codeBlockMatch[1]); } catch {}
    }
    const plainMatch = text.match(/\{[\s\S]*"game"[\s\S]*"numbers"[\s\S]*"explanation"[\s\S]*\}/);
    if (plainMatch) {
      try { return JSON.parse(plainMatch[0]); } catch {}
    }
    return null;
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: ChatMessage = { role: 'user', content };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const apiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: getBasePrompt() },
      ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content },
    ];

    const reply = await chatWithAI(apiMessages);

    if (reply) {
      const parsed = extractJSON(reply);
      let cleanReply = reply;
      const codeBlockMatch = reply.match(/```json[\s\S]*?```/);
      if (codeBlockMatch) cleanReply = reply.replace(/```json[\s\S]*?```/, '').trim();
      else if (parsed) cleanReply = reply.replace(/\{[\s\S]*"game"[\s\S]*"numbers"[\s\S]*"explanation"[\s\S]*\}/, '').trim();

      const assistantMsg: ChatMessage = { role: 'assistant', content: cleanReply };
      if (parsed && parsed.numbers && Array.isArray(parsed.numbers) && parsed.game) {
        assistantMsg.coupon = {
          game: parsed.game,
          numbers: parsed.numbers.sort((a: number, b: number) => a - b),
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
    try {
      const existing = await AsyncStorage.getItem('savedCoupons');
      const coupons = existing ? JSON.parse(existing) : [];
      const gameConfig = GAMES.find((g) => g.name === coupon.game);
      const gameColor = GameAccent[gameConfig?.id ?? 'cilgin'] ?? c.brand;
      coupons.unshift({
        id: Date.now(),
        game: coupon.game,
        icon: gameConfig?.icon || '',
        color: gameColor,
        numbers: coupon.numbers,
        bonus: [],
        superStar: null,
        date: new Date().toLocaleDateString('tr-TR'),
        timestamp: new Date().toISOString(),
        matchedCount: undefined,
        aiExplanation: coupon.explanation,
      });
      await AsyncStorage.setItem('savedCoupons', JSON.stringify(coupons));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Kaydedildi', "AI kuponu Kuponlarım'a eklendi.", [
        { text: 'Tamam' },
        { text: 'Kuponlarıma git', onPress: () => router.push('/(tabs)/saved') },
      ]);
    } catch {
      Alert.alert('Hata', 'Kupon kaydedilemedi.');
    }
  };

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <View style={{ paddingTop: insets.top + 6 }}>
        <View style={s.nav}>
          <Pressable onPress={() => router.back()} style={[s.navBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]} hitSlop={6}>
            <BackIcon color={c.text2} size={22} />
          </Pressable>
          <View style={[s.navAvatar, { backgroundColor: c.brandSoft }]}>
            <AIAssistantIcon color={c.brand} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.navTitle}>AI Asistan</Text>
            <View style={s.navStatus}>
              <View style={[s.statusDot, { backgroundColor: c.brand }]} />
              <Text style={[s.navStatusText, { color: c.brand }]}>Çevrimiçi</Text>
            </View>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
        {messages.length === 0 ? (
          <View style={s.empty}>
            <View style={[s.emptyIcon, { backgroundColor: c.brandSoft }]}>
              <AIAssistantIcon color={c.brand} size={34} />
            </View>
            <Text style={s.emptyTitle}>Merhaba, ben LottoAI</Text>
            <Text style={s.emptyDesc}>Loto hakkında soru sor ya da senin için kupon üreteyim. Şununla başlayabilirsin:</Text>
            <View style={s.suggestions}>
              {SUGGESTIONS.map((sug, i) => (
                <PressableScale key={i} onPress={() => send(sug)} style={[s.suggestion, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <Text style={s.suggestionText}>{sug}</Text>
                </PressableScale>
              ))}
            </View>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((msg, index) => (
              <View key={index} style={{ gap: 12 }}>
                <View style={[s.bubble, msg.role === 'user' ? [s.userBubble, { backgroundColor: c.brand }] : [s.aiBubble, { backgroundColor: c.surface, borderColor: c.border }]]}>
                  <Text style={[s.bubbleText, { color: msg.role === 'user' ? c.brandText : c.text }]}>{msg.content}</Text>
                </View>
                {msg.coupon ? <AICouponCard coupon={msg.coupon} theme={theme} onSave={() => saveCoupon(msg.coupon)} /> : null}
              </View>
            ))}
            {loading ? (
              <View style={[s.bubble, s.aiBubble, { backgroundColor: c.surface, borderColor: c.border, paddingVertical: 14 }]}>
                <TypingDots color={c.text3} />
              </View>
            ) : null}
          </ScrollView>
        )}

        {/* Input */}
        <View style={[s.inputRow, { borderTopColor: c.hairline, paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }]}>
          <TextInput
            style={[s.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
            value={input}
            onChangeText={setInput}
            placeholder="Bir şey yaz…"
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

function AICouponCard({ coupon, theme, onSave }: { coupon: NonNullable<ChatMessage['coupon']>; theme: AppTheme; onSave: () => void }) {
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
          <Text style={s.couponTag}>AI önerisi</Text>
        </View>
      </View>
      <View style={s.couponBalls}>
        {coupon.numbers.map((n, i) => (
          <NumberBall key={i} value={n} color={color} size={38} />
        ))}
      </View>
      <Text style={s.couponExp}>{coupon.explanation}</Text>
      <AppButton label="Kuponu kaydet" onPress={onSave} iconLeft={(cl, sz) => <BookmarkIcon color={cl} size={sz} />} style={{ marginTop: 13 }} />
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

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
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
    couponExp: { ...ty.caption, color: c.text2, lineHeight: 18, marginTop: 13, paddingTop: 13, borderTopWidth: 1, borderTopColor: c.hairline },

    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
    input: { flex: 1, minHeight: 48, maxHeight: 110, borderRadius: 24, borderWidth: 1, paddingHorizontal: 18, paddingTop: 13, paddingBottom: 13, ...ty.body },
    sendBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  });
}