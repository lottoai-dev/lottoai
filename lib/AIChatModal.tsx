// lib/AIChatModal.tsx
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { chatWithAI } from './deepseek';

type Props = {
  visible: boolean;
  onClose: () => void;
  onUseNumbers: (numbers: number[], explanation: string) => void;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const SYSTEM_PROMPT = `Sen bir loto asistanısın. Kullanıcılara şans oyunları hakkında bilgi verir, istatistiksel yorumlar yapar ve isterlerse rastgele kupon üretirsin. 
Kesinlikle kazanma garantisi vermezsin. 
Eğer kullanıcı kupon isterse, yanıtında mutlaka şu formatta bir JSON bloğu bulundur:
\`\`\`json
{ "numbers": [1, 2, 3, 4, 5, 6], "explanation": "Sayıların seçilme sebebi..." }
\`\`\`
JSON'daki numbers dizisi 6 adet, 1-90 arasında benzersiz sayı içermeli.`;

export default function AIChatModal({ visible, onClose, onUseNumbers }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    // API'ye gönderilecek mesajlar: sistem promptu + sohbet geçmişi
    const apiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...updatedMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const reply = await chatWithAI(apiMessages);

    if (reply) {
      const assistantMsg: ChatMessage = { role: 'assistant', content: reply };
      setMessages(prev => [...prev, assistantMsg]);

      // Yanıtta JSON olup olmadığını kontrol et
      const jsonMatch = reply.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (parsed.numbers && Array.isArray(parsed.numbers) && parsed.numbers.length === 6) {
            onUseNumbers(parsed.numbers, parsed.explanation || 'AI tarafından önerilen kupon');
          }
        } catch (e) {}
      }
    } else {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Üzgünüm, şu anda yanıt veremiyorum. Lütfen tekrar dene.' }]);
    }

    setLoading(false);
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeBtn}>✕ Kapat</Text>
          </TouchableOpacity>
          <Text style={styles.title}>🤖 AI Asistan</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView ref={scrollRef} style={styles.messages} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {messages.length === 0 && (
            <View style={styles.guideCard}>
              <Text style={styles.guideText}>
                Merhaba! Ben LottoAI asistanınım. Bana loto hakkında sorular sorabilir veya kupon üretmemi isteyebilirsin. {"\n\n"}
                Örnek: "Bana şanslı bir Çılgın Sayısal Loto kuponu üretir misin?"
              </Text>
            </View>
          )}
          {messages.map((msg, index) => (
            <View key={index} style={[styles.messageBubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
              <Text style={styles.messageText}>{msg.content}</Text>
            </View>
          ))}
          {loading && (
            <View style={styles.loadingBubble}>
              <ActivityIndicator size="small" color="#6C63FF" />
              <Text style={{ color: '#999', marginLeft: 8 }}>Düşünüyor...</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Bir şey yaz..."
            placeholderTextColor="#666"
            multiline
            editable={!loading}
          />
          <TouchableOpacity style={[styles.sendBtn, loading && { opacity: 0.5 }]} onPress={handleSend} disabled={loading || !input.trim()}>
            <Text style={styles.sendBtnText}>Gönder</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#2a2a4a' },
  closeBtn: { color: '#FF6B6B', fontSize: 14 },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  messages: { flex: 1, padding: 16 },
  guideCard: { backgroundColor: '#16213e', padding: 16, borderRadius: 12, marginBottom: 12 },
  guideText: { color: '#999', fontSize: 13, lineHeight: 20 },
  messageBubble: { padding: 12, borderRadius: 16, marginBottom: 10, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#6C63FF' },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: '#16213e', borderWidth: 1, borderColor: '#2a2a4a' },
  messageText: { color: '#fff', fontSize: 14 },
  loadingBubble: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, backgroundColor: '#16213e', borderWidth: 1, borderColor: '#2a2a4a', alignSelf: 'flex-start', marginBottom: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderTopColor: '#2a2a4a', gap: 8 },
  input: { flex: 1, backgroundColor: '#16213e', color: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 100 },
  sendBtn: { backgroundColor: '#6C63FF', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  sendBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});