// lib/deepseek.ts
import Constants from 'expo-constants';

const DEEPSEEK_API_KEY = Constants.expoConfig?.extra?.DEEPSEEK_API_KEY as string;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function chatWithAI(messages: Message[]): Promise<string | null> {
  if (!DEEPSEEK_API_KEY) {
    console.error('DeepSeek API anahtarı bulunamadı! Lütfen app.json dosyasını kontrol et.');
    return null;
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        max_tokens: 500,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('DeepSeek API hatası:', response.status, errorData);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error('DeepSeek isteği başarısız:', error);
    return null;
  }
}