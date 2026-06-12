// app/(tabs)/legal.tsx
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Segmented } from '../../components/ui/segmented';
import { PressableScale, Surface } from '../../components/ui/surface';
import { AppTheme } from '../../constants/theme';
import { BackIcon, ChevronDownIcon } from '../../lib/icons';
import { useTheme } from '../../lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

const TERMS_OF_USE = `LottoAI Kullanım Koşulları

Son güncelleme: Mayıs 2026

1. KABUL
Bu uygulamayı kullanarak aşağıdaki şartları kabul etmiş sayılırsınız. Şartları kabul etmiyorsanız uygulamayı kullanmayı bırakmalısınız.

2. YASAL UYARI
- Bu uygulama yalnızca 18 yaş ve üzeri bireyler için tasarlanmıştır.
- Uygulama yalnızca bilgilendirme ve eğlence amaçlıdır.
- Şans oyunları bağımlılık yapabilir. Lütfen sorumlu oynayın.
- Yardım için: Yeşilay 115 danışma hattı
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
- Çekiliş sonuçları ilgili resmi kurumlar tarafından belirlenir.
- Uygulama içindeki ikramiye tutarları tahminidir.
- Gerçek ikramiye tutarları için millipiyangoonline.com adresini ziyaret edin.
- Uygulama, hiçbir şekilde Milli Piyango İdaresi ile resmi olarak bağlantılı değildir.

6. KULLANIM KURALLARI
- Uygulamayı yalnızca yasal amaçlarla kullanabilirsiniz.
- Uygulamayı kötüye kullanmak, tersine mühendislik yapmak veya izinsiz kopyalamak yasaktır.
- AI Asistan'ı yasa dışı veya uygunsuz amaçlarla kullanamazsınız.

7. FİKRİ MÜLKİYET
- Uygulama kodu, tasarımı ve içeriği LottoAI'ye aittir.
- Çılgın Sayısal, Süper Loto, Şans Topu, On Numara isimleri ve logoları ilgili kurumların tescilli markalarıdır.

8. DEĞİŞİKLİKLER
Bu şartlar zaman zaman güncellenebilir. Güncellemeler uygulama içinde duyurulacaktır.

9. UYGULANACAK HUKUK
Bu şartlar Türkiye Cumhuriyeti kanunlarına tabidir. Uyuşmazlık durumunda İstanbul (Çağlayan) Mahkemeleri yetkilidir.

10. İLETİŞİM
Sorularınız için: lottoai.destek@gmail.com`;

const FAQ = [
  { q: 'LottoAI nedir?', a: "LottoAI, Türkiye'deki şans oyunları için kupon üretme, sonuç takibi, AI destekli analiz ve istatistik yapmanızı sağlayan ücretsiz bir yardımcı uygulamadır." },
  { q: 'Uygulama ücretli mi?', a: 'Hayır, LottoAI tamamen ücretsizdir. Hiçbir uygulama içi satın alma veya abonelik içermez.' },
  { q: 'AI Asistan nasıl çalışır?', a: 'AI Asistan ekranından loto hakkında sorular sorabilir, istatistiksel yorumlar alabilir ve size özel kupon üretmesini isteyebilirsiniz. Verdiği bilgiler tahmin amaçlıdır.' },
  { q: 'AI kuponları kazanma garantisi verir mi?', a: 'Hayır. AI tarafından üretilen kuponlar rastgele veya istatistiksel verilere dayalıdır. Hiçbir şekilde kazanma garantisi vermez.' },
  { q: 'Kupon nasıl üretilir?', a: 'Kupon Üret ekranından oyunu seçip "Kupon üret" butonuna basarak kupon oluşturabilir veya AI Asistan\'dan size özel kupon isteyebilirsiniz.' },
  { q: 'Filtreleri nasıl kullanırım?', a: 'Kupon Üret ekranında filtre butonuna dokunarak çift/tek dengesi, ardışık sayı engelleme ve toplam aralığı gibi filtreleri kullanabilirsiniz.' },
  { q: 'Çekiliş sonuçları nasıl güncellenir?', a: 'Çekiliş sonuçları, çekilişten sonra uygulama veritabanına girilir ve kısa süre sonra uygulamada görünür.' },
  { q: 'Kuponlarım otomatik kontrol ediliyor mu?', a: 'Evet. Kaydettiğiniz kuponlar, çekiliş sonuçları girildiğinde otomatik kontrol edilir. Tutan sayılar kupon kartında renkli gösterilir.' },
  { q: 'Hatırlatıcılar nasıl çalışır?', a: 'Profil > Hatırlatıcılar ekranından istediğiniz oyunlar için çekiliş öncesi ve sonrası bildirimleri açabilirsiniz.' },
  { q: 'Uygulama internet gerektiriyor mu?', a: 'Sonuçlar, istatistikler ve AI Asistan için internet gerekir. Kupon üretme ve kaydetme çevrimdışı da çalışır.' },
  { q: 'Verilerim güvende mi?', a: 'Evet. Tüm kişisel verileriniz cihazınızda yerel saklanır. AI sohbet geçmişi oturum kapanınca silinir. Verileriniz üçüncü şahıslarla paylaşılmaz.' },
  { q: 'Bu uygulama kumar teşvik ediyor mu?', a: 'Hayır. LottoAI yalnızca bilgilendirme amaçlı bir araçtır. Şans oyunları bağımlılık yapabilir. Lütfen sorumlu oynayın. Yardım için: Yeşilay 115.' },
];

const SEGMENTS = [
  { key: 'privacy', label: 'Gizlilik' },
  { key: 'terms', label: 'Koşullar' },
  { key: 'faq', label: 'SSS' },
];

export default function LegalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const [tab, setTab] = useState('privacy');
  const [expanded, setExpanded] = useState<number | null>(null);

  const toggle = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setExpanded(expanded === i ? null : i);
  };

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <View style={{ paddingTop: insets.top + 6 }}>
        <View style={s.nav}>
          <Pressable onPress={() => router.back()} style={[s.navBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]} hitSlop={6}>
            <BackIcon color={c.text2} size={22} />
          </Pressable>
          <Text style={s.navTitle}>Yasal & SSS</Text>
          <View style={{ width: 38 }} />
        </View>
        <Segmented options={SEGMENTS} value={tab} onChange={setTab} />
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}>
        {tab !== 'faq' ? (
          <Surface style={s.docCard}>
            <Text style={s.docText}>{tab === 'privacy' ? PRIVACY_POLICY : TERMS_OF_USE}</Text>
          </Surface>
        ) : (
          <View style={{ gap: 8 }}>
            {FAQ.map((item, index) => {
              const open = expanded === index;
              return (
                <PressableScale key={index} onPress={() => toggle(index)} style={[s.faqItem, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <View style={s.faqHead}>
                    <Text style={s.faqQ}>{item.q}</Text>
                    <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                      <ChevronDownIcon color={c.text3} size={18} />
                    </View>
                  </View>
                  {open ? <Text style={s.faqA}>{item.a}</Text> : null}
                </PressableScale>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: spacing.md },
    navBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    navTitle: { ...ty.h3, color: c.text },
    docCard: { padding: 18 },
    docText: { ...ty.body, color: c.text, lineHeight: 23 },
    faqItem: { borderRadius: radius.lg, borderWidth: 1, padding: 16 },
    faqHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    faqQ: { ...ty.bodySemibold, color: c.text, flex: 1 },
    faqA: { ...ty.body, color: c.text2, lineHeight: 22, marginTop: 12 },
  });
}