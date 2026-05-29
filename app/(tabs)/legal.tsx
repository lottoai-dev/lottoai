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

Son güncelleme: Mayıs 2026

1. TOPLANAN VERİLER
LottoAI uygulaması aşağıdaki verileri toplar:
- Kaydettiğiniz kupon bilgileri (cihazınızda saklanır)
- Bildirim tercihleri (cihazınızda saklanır)
- AI Asistan ile yaptığınız sohbet geçmişi (geçici olarak işlenir, kalıcı olarak saklanmaz)
- Uygulama içi tercihleriniz (isim, favori oyunlar vb.)

2. VERİLERİN KULLANIMI
Toplanan veriler yalnızca uygulama işlevlerini sağlamak amacıyla kullanılır:
- Kuponlarınızın kaydedilmesi ve çekiliş sonuçlarıyla karşılaştırılması
- Size özel bildirimlerin gönderilmesi
- AI Asistan'ın size daha iyi hizmet verebilmesi
Verileriniz hiçbir şekilde üçüncü şahıslarla paylaşılmaz veya satılmaz.

3. VERİ GÜVENLİĞİ
Tüm kişisel verileriniz cihazınızda yerel olarak saklanır. Sunucularımızda (Supabase) yalnızca çekiliş sonuçları gibi anonim veriler bulunur. Veri aktarımı şifreli bağlantılar (HTTPS) üzerinden gerçekleştirilir.

4. YASAL DAYANAK
Veri işleme faaliyetlerimiz, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve ilgili mevzuata uygun olarak yürütülmektedir.

5. ÇEREZ VE TAKİP
Uygulama herhangi bir izleme, analitik veya reklam çerezi kullanmaz.

6. ÜÇÜNCÜ TARAF HİZMETLER
Uygulama, çekiliş verilerini sağlamak için Supabase altyapısını ve AI hizmetleri için DeepSeek API'yi kullanır. Bu hizmetlerin gizlilik politikaları için:
- Supabase: supabase.com/privacy
- DeepSeek: platform.deepseek.com/privacy

7. ÇOCUKLARIN GİZLİLİĞİ
Bu uygulama yalnızca 18 yaş ve üzeri bireyler için tasarlanmıştır. 18 yaş altı bireylerin uygulamayı kullanması yasaktır.

8. VERİ SAKLAMA VE SİLME
- Kupon verileriniz ve tercihleriniz, siz silene kadar cihazınızda saklanır.
- AI sohbet geçmişi yalnızca oturum süresince tutulur, uygulama kapatıldığında silinir.
- Profil > Tüm Verileri Sil seçeneği ile tüm yerel verilerinizi silebilirsiniz.

9. DEĞİŞİKLİKLER
Bu gizlilik politikası zaman zaman güncellenebilir. Değişiklikler uygulama içinde duyurulacaktır.

10. İLETİŞİM
Sorularınız için: lottoai.destek@gmail.com`;

const TERMS_OF_USE = `LottoAI Kullanım Şartları

Son güncelleme: Mayıs 2026

1. KABUL
Bu uygulamayı kullanarak aşağıdaki şartları kabul etmiş sayılırsınız. Şartları kabul etmiyorsanız uygulamayı kullanmayı bırakmalısınız.

2. YASAL UYARI
- Bu uygulama yalnızca 18 yaş ve üzeri bireyler için tasarlanmıştır.
- Uygulama yalnızca bilgilendirme ve eğlence amaçlıdır.
- Şans oyunları bağımlılık yapabilir. Lütfen sorumlu oynayın.
- Yardım için: 182 (Bağımlılık Danışma Hattı)
- Kumar bağımlılığı riski taşıyorsanız bu uygulamayı kullanmayın.

3. HİZMET KAPSAMI
LottoAI şunları sağlar:
- Rastgele kupon üretimi
- Çekiliş sonuçlarının görüntülenmesi
- İstatistik ve analiz araçları
- AI destekli kupon önerileri
- Çekiliş hatırlatıcıları

4. AI ASİSTAN KULLANIMI
- AI Asistan tarafından üretilen tüm içerikler (kupon önerileri, istatistik yorumları vb.) yalnızca bilgilendirme amaçlıdır.
- AI, kazanma garantisi vermez.
- AI'ın verdiği bilgilerde hatalar olabilir. Kesin bilgi için resmi kaynakları kontrol edin.
- AI ile paylaştığınız kişisel bilgilerden siz sorumlusunuz.

5. SORUMLULUK REDDİ
- Uygulama kazanç garantisi vermez.
- Çekiliş sonuçları Sisal Şans tarafından belirlenir.
- Uygulama içindeki ikramiye tutarları tahminidir.
- Gerçek ikramiye tutarları için millipiyangoonline.com adresini ziyaret edin.
- Uygulama, hiçbir şekilde Milli Piyango İdaresi veya Sisal Şans ile resmi olarak bağlantılı değildir.

6. KULLANIM KURALLARI
- Uygulamayı yalnızca yasal amaçlarla kullanabilirsiniz.
- Uygulamayı kötüye kullanmak, tersine mühendislik yapmak veya izinsiz kopyalamak yasaktır.
- AI Asistan'ı yasa dışı veya uygunsuz amaçlarla kullanamazsınız.

7. FİKRİ MÜLKİYET
- Uygulama kodu, tasarımı ve içeriği LottoAI'ye aittir.
- Çılgın Sayısal Loto, Süper Loto, Şans Topu, On Numara isimleri ve logoları ilgili kurumların tescilli markalarıdır.

8. DEĞİŞİKLİKLER
Bu şartlar zaman zaman güncellenebilir. Güncellemeler uygulama içinde duyurulacaktır. Güncellemeden sonra uygulamayı kullanmaya devam etmeniz, yeni şartları kabul ettiğiniz anlamına gelir.

9. UYGULANACAK HUKUK
Bu şartlar Türkiye Cumhuriyeti kanunlarına tabidir. Uyuşmazlık durumunda İstanbul (Çağlayan) Mahkemeleri ve İcra Daireleri yetkilidir.

10. İLETİŞİM
Sorularınız için: lottoai.destek@gmail.com`;

const FAQ = [
  {
    question: 'LottoAI nedir?',
    answer: 'LottoAI, Türkiye\'deki şans oyunları için kupon üretme, sonuç takibi, AI destekli analiz ve istatistik yapmanızı sağlayan ücretsiz bir yardımcı uygulamadır.',
  },
  {
    question: 'Uygulama ücretli mi?',
    answer: 'Hayır, LottoAI tamamen ücretsizdir. Hiçbir uygulama içi satın alma veya abonelik içermez.',
  },
  {
    question: 'AI Asistan nasıl çalışır?',
    answer: 'AI Asistan sekmesinden loto hakkında sorular sorabilir, istatistiksel yorumlar alabilir ve size özel kupon üretmesini isteyebilirsiniz. AI, DeepSeek altyapısını kullanır ve verdiği bilgiler tahmin amaçlıdır.',
  },
  {
    question: 'AI Asistan\'ın ürettiği kuponlar kazanma garantisi verir mi?',
    answer: 'Hayır. AI tarafından üretilen kuponlar tamamen rastgele veya istatistiksel verilere dayalıdır. Hiçbir şekilde kazanma garantisi vermez.',
  },
  {
    question: 'Kupon nasıl üretilir?',
    answer: 'Kupon Üret ekranından oyunu seçip "Kupon Üret" butonuna basarak rastgele kupon oluşturabilir veya AI Asistan\'dan size özel kupon üretmesini isteyebilirsiniz.',
  },
  {
    question: 'Filtreleri nasıl kullanırım?',
    answer: 'Kupon Üret ekranında ⚙️ butonuna tıklayarak çift/tek dengesi, ardışık sayı engelleme ve toplam aralığı gibi filtreleri kullanabilirsiniz.',
  },
  {
    question: 'Çekiliş sonuçları nasıl güncellenir?',
    answer: 'Çekiliş sonuçları, çekilişten sonra uygulama veritabanına girilmektedir. Sonuçlar genellikle çekilişten kısa süre sonra uygulamada görünür.',
  },
  {
    question: 'Kuponlarım otomatik olarak kontrol ediliyor mu?',
    answer: 'Evet! Kaydettiğiniz kuponlar, çekiliş sonuçları veritabanına girildiğinde otomatik olarak kontrol edilir. Tutan sayılar kupon kartında renkli olarak gösterilir.',
  },
  {
    question: 'Hatırlatıcılar nasıl çalışır?',
    answer: 'Profil > Hatırlatıcılar ekranından istediğiniz oyunlar için çekiliş öncesi ve sonrası bildirimleri açabilirsiniz.',
  },
  {
    question: 'Uygulama internet gerektiriyor mu?',
    answer: 'Çekiliş sonuçlarını, istatistikleri ve AI Asistan\'ı kullanmak için internet bağlantısı gereklidir. Kupon üretme ve kaydetme işlemleri çevrimdışı da çalışır.',
  },
  {
    question: 'Verilerim güvende mi?',
    answer: 'Evet. Tüm kişisel verileriniz cihazınızda yerel olarak saklanır. AI sohbet geçmişi oturum kapanınca silinir. Verileriniz üçüncü şahıslarla paylaşılmaz.',
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

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📄 Yasal & SSS</Text>
        <View style={{ width: 60 }} />
      </View>

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
  container: { flex: 1, backgroundColor: '#F5F5F7' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  backBtn: { width: 60 },
  backText: { color: '#6C63FF', fontSize: 16 },
  headerTitle: { color: '#1a1a2e', fontSize: 18, fontWeight: 'bold' },
  tabs: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: '#E5E5EA' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#6C63FF' },
  tabText: { color: '#8E8E93', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  content: { flex: 1, paddingHorizontal: 20 },
  contentText: { color: '#1a1a2e', fontSize: 14, lineHeight: 24 },
  faqContainer: { gap: 8 },
  faqTitle: { color: '#1a1a2e', fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  faqItem: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E5EA' },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  faqQuestion: { color: '#1a1a2e', fontSize: 14, fontWeight: 'bold', flex: 1, marginRight: 8 },
  faqArrow: { color: '#8E8E93', fontSize: 12 },
  faqAnswer: { color: '#8E8E93', fontSize: 13, lineHeight: 22, marginTop: 12 },
});