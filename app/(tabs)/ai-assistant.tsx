// app/(tabs)/ai-assistant.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatWithAI } from '../../lib/deepseek';
import { GAMES, GAME_COLORS } from '../../lib/games';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  coupon?: {
    game: string;
    numbers: number[];
    explanation: string;
  };
};

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

export default function AIAssistantScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // JSON'u hem code block içinde hem de düz metin olarak ara
  const extractJSON = (text: string): any | null => {
    const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try { return JSON.parse(codeBlockMatch[1]); } catch (e) {}
    }
    const plainMatch = text.match(/\{[\s\S]*"game"[\s\S]*"numbers"[\s\S]*"explanation"[\s\S]*\}/);
    if (plainMatch) {
      try { return JSON.parse(plainMatch[0]); } catch (e) {}
    }
    return null;
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const apiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: getBasePrompt() },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: input.trim() },
    ];

    const reply = await chatWithAI(apiMessages);

    if (reply) {
      const parsed = extractJSON(reply);

      let cleanReply = reply;
      const codeBlockMatch = reply.match(/```json[\s\S]*?```/);
      if (codeBlockMatch) {
        cleanReply = reply.replace(/```json[\s\S]*?```/, '').trim();
      } else if (parsed) {
        cleanReply = reply.replace(/\{[\s\S]*"game"[\s\S]*"numbers"[\s\S]*"explanation"[\s\S]*\}/, '').trim();
      }

      const assistantMsg: ChatMessage = { role: 'assistant', content: cleanReply };

      if (parsed && parsed.numbers && Array.isArray(parsed.numbers) && parsed.game) {
        assistantMsg.coupon = {
          game: parsed.game,
          numbers: parsed.numbers.sort((a: number, b: number) => a - b),
          explanation: parsed.explanation || 'AI tarafından önerilen kupon',
        };
      }

      setMessages(prev => [...prev, assistantMsg]);
    } else {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Üzgünüm, şu anda yanıt veremiyorum.' }]);
    }

    setLoading(false);
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  const handleSaveCoupon = async (coupon: ChatMessage['coupon']) => {
    if (!coupon) return;
    try {
      const existing = await AsyncStorage.getItem('savedCoupons');
      const coupons = existing ? JSON.parse(existing) : [];
      const gameConfig = GAMES.find(g => g.name === coupon.game);
      const gameColor = GAME_COLORS[coupon.game as keyof typeof GAME_COLORS]?.main || '#6C63FF';

      coupons.unshift({
        id: Date.now(),
        game: coupon.game,
        icon: gameConfig?.icon || '🎱',
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
      Alert.alert('✅ Kaydedildi!', 'AI kuponu Kuponlarım\'a eklendi.', [
        { text: 'Tamam' },
        { text: 'Kuponlarıma Git', onPress: () => router.push('/(tabs)/saved') },
      ]);
    } catch (e) {
      Alert.alert('Hata', 'Kupon kaydedilemedi!');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Text style={styles.title}>🤖 AI Asistan</Text>
          <Text style={styles.subtitle}>Loto hakkında sohbet et, kupon üret</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {messages.length === 0 && (
            <View style={styles.guideCard}>
              <Text style={styles.guideText}>
                Merhaba! Ben LottoAI asistanınım. Bana loto hakkında sorular sorabilir veya kupon üretmemi isteyebilirsin.{"\n\n"}
                Örnek: "Bana şanslı bir Çılgın Sayısal Loto kuponu üretir misin?"
              </Text>
            </View>
          )}
          {messages.map((msg, index) => (
            <View key={index}>
              <View style={[styles.messageBubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                <Text style={[styles.messageText, msg.role === 'user' && { color: '#fff' }]}>{msg.content}</Text>
              </View>
              {msg.coupon && (() => {
                const c = msg.coupon;
                const color = GAME_COLORS[c.game as keyof typeof GAME_COLORS]?.main || '#6C63FF';
                return (
                  <View style={[styles.couponCard, { borderColor: color + '44' }]}>
                    <Text style={[styles.couponCardTitle, { color }]}>
                      🎲 AI'nin Önerdiği {c.game} Kuponu
                    </Text>
                    <View style={styles.couponNumbers}>
                      {c.numbers.map((num, i) => (
                        <View key={i} style={[styles.couponBall, { backgroundColor: color }]}>
                          <Text style={styles.couponBallText}>{num}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.couponExplanation}>{c.explanation}</Text>
                    <TouchableOpacity style={styles.saveCouponBtn} onPress={() => handleSaveCoupon(c)}>
                      <Text style={styles.saveCouponBtnText}>💾 Kuponu Kaydet</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}
            </View>
          ))}
          {loading && (
            <View style={styles.loadingBubble}>
              <ActivityIndicator size="small" color="#6C63FF" />
              <Text style={{ color: '#8E8E93', marginLeft: 8 }}>Düşünüyor...</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Bir şey yaz..."
            placeholderTextColor="#A0A0A5"
            multiline
            editable={!loading}
          />
          <TouchableOpacity style={[styles.sendBtn, loading && { opacity: 0.5 }]} onPress={handleSend} disabled={loading || !input.trim()}>
            <Text style={styles.sendBtnText}>Gönder</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  title: { color: '#1a1a2e', fontSize: 22, fontWeight: 'bold' },
  subtitle: { color: '#8E8E93', fontSize: 13, marginTop: 4 },
  messages: { flex: 1, padding: 16 },
  guideCard: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E5E5EA' },
  guideText: { color: '#8E8E93', fontSize: 13, lineHeight: 20 },
  messageBubble: { padding: 12, borderRadius: 16, marginBottom: 10, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#6C63FF' },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E5EA' },
  messageText: { color: '#1a1a2e', fontSize: 14 },
  loadingBubble: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E5EA', alignSelf: 'flex-start', marginBottom: 10 },
  couponCard: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderRadius: 16, padding: 16, marginBottom: 10, marginLeft: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  couponCardTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  couponNumbers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  couponBall: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  couponBallText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  couponExplanation: { color: '#8E8E93', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  saveCouponBtn: { backgroundColor: '#FFD70022', borderWidth: 1, borderColor: '#FFD700', borderRadius: 10, padding: 12, alignItems: 'center' },
  saveCouponBtnText: { color: '#1a1a2e', fontSize: 14, fontWeight: 'bold' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderTopColor: '#E5E5EA', gap: 8 },
  input: { flex: 1, backgroundColor: '#FFFFFF', color: '#1a1a2e', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 100, borderWidth: 1, borderColor: '#E5E5EA' },
  sendBtn: { backgroundColor: '#6C63FF', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  sendBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});