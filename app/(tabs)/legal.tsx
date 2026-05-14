// tabs_legal.tsx
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../lib/i18n';

const PRIVACY_POLICY = `LottoAI Gizlilik Politikası

Son güncelleme: Mayıs 2025

1. TOPLANAN VERİLER
LottoAI uygulaması aşağıdaki verileri toplar:
- Kaydettiğiniz kupon bilgileri (cihazınızda saklanır)
- Bildirim tercihleri (cihazınızda saklanır)

2. VERİLERİN KULLANIMI
Toplanan veriler yalnızca uygulama işlevlerini sağlamak amacıyla kullanılır. Verileriniz üçüncü şahıslarla paylaşılmaz.

3. VERİ GÜVENLİĞİ
Tüm veriler cihazınızda yerel olarak saklanır. Sunucularımızda kişisel veri saklanmaz.

4. ÇEREZ VE TAKİP
Uygulama herhangi bir izleme veya analitik araç kullanmaz.

5. ÜÇÜNCÜ TARAF HİZMETLER
Uygulama, çekiliş verilerini sağlamak için Supabase altyapısını kullanır. Supabase'in gizlilik politikası için: supabase.com/privacy

6. ÇOCUKLARIN GİZLİLİĞİ
Bu uygulama 18 yaş altı bireylere yönelik değildir. 18 yaş altı bireylerin uygulamayı kullanması yasaktır.

7. DEĞİŞİKLİKLER
Bu gizlilik politikası zaman zaman güncellenebilir. Değişiklikler uygulama içinde duyurulacaktır.

8. İLETİŞİM
Sorularınız için: lottoai.destek@gmail.com`;

const TERMS_OF_USE = `LottoAI Kullanım Şartları

Son güncelleme: Mayıs 2025

1. KABUL
Bu uygulamayı kullanarak aşağıdaki şartları kabul etmiş sayılırsınız.

2. YASAL UYARI
- Bu uygulama yalnızca 18 yaş ve üzeri bireyler için tasarlanmıştır.
- Uygulama yalnızca bilgilendirme amaçlıdır.
- Şans oyunları bağımlılık yapabilir. Lütfen sorumlu oynayın.
- Yardım için: 182 (Bağımlılık Danışma Hattı)

3. HİZMET KAPSAMI
LottoAI şunları sağlar:
- Rastgele kupon üretimi
- Çekiliş sonuçlarının görüntülenmesi
- İstatistik ve analiz araçları
- Çekiliş hatırlatıcıları

4. SORUMLULUK REDDİ
- Uygulama kazanç garantisi vermez.
- Çekiliş sonuçları Milli Piyango İdaresi tarafından belirlenir.
- Uygulama içindeki ikramiye tutarları tahminidir.
- Gerçek ikramiye tutarları için millipiyangoonline.com adresini ziyaret edin.

5. KULLANIM KURALLARI
- Uygulamayı yalnızca yasal amaçlarla kullanabilirsiniz.
- Uygulamayı kötüye kullanmak yasaktır.

6. DEĞİŞİKLİKLER
Bu şartlar zaman zaman güncellenebilir. Güncellemeler uygulama içinde duyurulacaktır.

7. UYGULANACAK HUKUK
Bu şartlar Türkiye Cumhuriyeti kanunlarına tabidir.

8. İLETİŞİM
Sorularınız için: lottoai.destek@gmail.com`;

const FAQ = [
  {
    question: 'LottoAI nedir?',
    answer: 'LottoAI, Türkiye\'deki şans oyunları için kupon üretme, sonuç takibi ve analiz yapmanızı sağlayan bir yardımcı uygulamadır.',
  },
  {
    question: 'Uygulama ücretli mi?',
    answer: 'Hayır, LottoAI tamamen ücretsizdir.',
  },
  {
    question: 'Kupon nasıl üretilir?',
    answer: 'Kupon Üret ekranından oyunu seçip "Kupon Üret" butonuna basmanız yeterlidir. Rastgele sayılar otomatik olarak oluşturulur.',
  },
  {
    question: 'Filtreleri nasıl kullanırım?',
    answer: 'Kupon Üret ekranında ⚙️ butonuna tıklayarak çift/tek, ardışık engelleme ve toplam aralığı filtrelerini kullanabilirsiniz.',
  },
  {
    question: 'Çekiliş sonuçları nasıl güncellenir?',
    answer: 'Çekiliş sonuçları her çekilişten sonra sistemimize manuel olarak girilmektedir. Sonuçlar genellikle çekilişten kısa süre sonra uygulamada görünür.',
  },
  {
    question: 'Hatırlatıcılar nasıl çalışır?',
    answer: 'Hatırlatıcılar sekmesinden oyunu açıp switch\'i açık konuma getirin. Çekiliş kapanışından 30 dakika önce otomatik bildirim alırsınız.',
  },
  {
    question: 'Kuponumu nasıl kontrol ederim?',
    answer: 'Önce Kupon Üret ekranından kuponunuzu kaydedin. Ardından Kuponlarım ekranında kuponunuzu seçip ✅ butonuyla çekiliş sonucuyla karşılaştırabilirsiniz.',
  },
  {
    question: 'İstatistikler ne kadar güvenilir?',
    answer: 'İstatistikler sisteme girilen gerçek çekiliş verilerine dayanmaktadır. Daha fazla veri girdikçe istatistikler daha anlamlı hale gelir.',
  },
  {
    question: 'Uygulama internet gerektiriyor mu?',
    answer: 'Çekiliş sonuçlarını ve istatistikleri görüntülemek için internet bağlantısı gereklidir. Kupon üretme ve kaydetme işlemleri çevrimdışı da çalışır.',
  },
  {
    question: 'Bu uygulama kumar teşvik ediyor mu?',
    answer: 'Hayır. LottoAI yalnızca bilgilendirme amaçlı bir yardımcı araçtır. Şans oyunları bağımlılık yapabilir. Lütfen sorumlu oynayın. Yardım için: 182',
  },
];

export default function LegalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms' | 'faq'>('privacy');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📄 Yasal & SSS</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Sekmeler */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'privacy' && styles.tabActive]}
          onPress={() => setActiveTab('privacy')}>
          <Text style={[styles.tabText, activeTab === 'privacy' && styles.tabTextActive]}>
            🔒 {t('privacy')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'terms' && styles.tabActive]}
          onPress={() => setActiveTab('terms')}>
          <Text style={[styles.tabText, activeTab === 'terms' && styles.tabTextActive]}>
            📄 {t('terms')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'faq' && styles.tabActive]}
          onPress={() => setActiveTab('faq')}>
          <Text style={[styles.tabText, activeTab === 'faq' && styles.tabTextActive]}>
            ❓ SSS
          </Text>
        </TouchableOpacity>
      </View>

      {/* İçerik */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>

        {activeTab !== 'faq' && (
          <Text style={styles.contentText}>
            {activeTab === 'privacy' ? PRIVACY_POLICY : TERMS_OF_USE}
          </Text>
        )}

        {activeTab === 'faq' && (
          <View style={styles.faqContainer}>
            <Text style={styles.faqTitle}>Sıkça Sorulan Sorular</Text>
            {FAQ.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.faqItem}
                onPress={() => setExpandedFaq(expandedFaq === index ? null : index)}>
                <View style={styles.faqHeader}>
                  <Text style={styles.faqQuestion}>{item.question}</Text>
                  <Text style={styles.faqArrow}>{expandedFaq === index ? '▲' : '▼'}</Text>
                </View>
                {expandedFaq === index && (
                  <Text style={styles.faqAnswer}>{item.answer}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  backBtn: { width: 60 },
  backText: { color: '#6C63FF', fontSize: 16 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  tabs: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#16213e', borderRadius: 12, padding: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#6C63FF' },
  tabText: { color: '#999', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  content: { flex: 1, paddingHorizontal: 20 },
  contentText: { color: '#ccc', fontSize: 14, lineHeight: 24 },
  faqContainer: { gap: 8 },
  faqTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  faqItem: { backgroundColor: '#16213e', borderRadius: 12, padding: 16 },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  faqQuestion: { color: '#fff', fontSize: 14, fontWeight: 'bold', flex: 1, marginRight: 8 },
  faqArrow: { color: '#999', fontSize: 12 },
  faqAnswer: { color: '#999', fontSize: 13, lineHeight: 22, marginTop: 12 },
});