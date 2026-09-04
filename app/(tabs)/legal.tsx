// app/(tabs)/legal.tsx
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '../../components/ui/surface';
import { AppTheme } from '../../constants/theme';
import { softHaptic } from '../../lib/haptics';
import { BackIcon, ChevronDownIcon } from '../../lib/icons';
import { useTheme } from '../../lib/theme';

const FAQ = [
  { q: 'LottoAI nedir?', a: "LottoAI, Türkiye'deki şans oyunları için kolon üretme, sonuç takibi, istatistik, Lota AI analizi ve bildirim sunan ücretsiz bir yardımcı uygulamadır." },
  { q: 'Uygulama ücretli mi?', a: 'Hayır, LottoAI ücretsizdir; uygulama içi satın alma veya abonelik yoktur. Bazı özelliklerde (filtreli üretim, geçmiş karşılaştırma vb.) günlük ücretsiz hak bittikten sonra isteğe bağlı ödüllü reklam izleyerek ek hak kazanabilirsiniz.' },
  { q: 'Lota AI nedir?', a: 'Kolon Üret ekranındaki "Lota AI\'a geç" ile açılan ayrı moddur. Tek dokunuşla rastgele kolon üretir ve kısa bir istatistik analizi gösterir. Tahmin veya çekiliş öngörüsü sunmaz. Kullanmak için giriş yapmanız gerekir.' },
  { q: 'Lota AI analizi neyi kapsar?', a: 'Çift/tek, düşük/yüksek, ardışık sayılar, kolon toplamının ortalamaya göre durumu ve (veri varsa) sıcak/soğuk sayılar gibi bilgilendirici özetler sunar. Sıcak/soğuk geçmiş çekilişlere göre hesaplanır; gelecek sonucu tahmin etmez. Kazanma garantisi vermez.' },
  { q: 'Lota AI kolonları kazanma garantisi verir mi?', a: 'Hayır. Lota AI ile üretilen kolonlar adil rastgele algoritmayla oluşturulur. Analiz metinleri yalnızca bilgilendirme amaçlıdır.' },
  { q: 'Kolon nasıl üretilir?', a: 'Kolon Üret ekranından oyunu seçip "Kolon üret" ile filtreli veya filtresiz kolon oluşturabilir; Lota AI modunda "Lota ile üret" ile tek dokunuşta kolon ve analiz alabilirsiniz.' },
  { q: 'Filtreleri nasıl kullanırım?', a: 'Kolon Üret ekranında filtre butonuna dokunarak çift/tek dengesi, ardışık sayı engelleme ve toplam aralığı gibi filtreleri kullanabilirsiniz.' },
  { q: 'Çekiliş sonuçları nasıl güncellenir?', a: 'Çekiliş sonuçları, çekilişten sonra uygulama veritabanına girilir ve kısa süre sonra uygulamada görünür.' },
  { q: 'Kolonlarım otomatik kontrol ediliyor mu?', a: 'Evet. Kaydettiğiniz kolonlar, çekiliş sonuçları girildiğinde otomatik kontrol edilir. Tutan sayılar kolon kartında renkli gösterilir.' },
  { q: 'Hatırlatıcılar nasıl çalışır?', a: 'Profil > Hatırlatıcılar ekranından istediğiniz oyunlar için çekiliş öncesi ve sonrası bildirimleri açabilirsiniz.' },
  { q: 'Uygulama internet gerektiriyor mu?', a: 'Sonuçlar, istatistikler, Lota AI, hesap işlemleri ve reklamlar için internet gerekir. Klasik kolon üretme ve kaydetme çevrimdışı da çalışabilir.' },
  { q: 'Verilerim güvende mi?', a: 'Evet. Hesap bilgileriniz güvenli sunucularda saklanır; kayıtlı kolonlarınız cihazınızda tutulur. Detaylar için Gizlilik Politikamıza göz atabilirsiniz.' },
  { q: 'Hesabımı nasıl silerim?', a: 'Profil ekranındaki "Hesabımı sil" seçeneği ile hesabınızı ve bu cihazdaki verilerinizi kalıcı olarak silebilirsiniz. Bu işlem geri alınamaz.' },
  { q: 'Bu uygulama kumar teşvik ediyor mu?', a: 'Hayır. LottoAI yalnızca bilgilendirme amaçlı bir araçtır. Şans oyunları bağımlılık yapabilir. Lütfen sorumlu oynayın. Yardım için: Yeşilay 115.' },
];

export default function LegalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const [expanded, setExpanded] = useState<number | null>(null);

  const toggle = (i: number) => {
    setExpanded(expanded === i ? null : i);
  };

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <View style={{ paddingTop: insets.top + 6 }}>
        <View style={s.nav}>
          <Pressable
            onPress={() => { softHaptic(); router.back(); }}
            style={[s.navBtn, { backgroundColor: c.surface }]}
            hitSlop={6}
          >
            <BackIcon color={c.text2} size={22} />
          </Pressable>
          <Text style={s.navTitle}>Sık Sorulan Sorular</Text>
          <View style={{ width: 38 }} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 40 }}
      >
        <View style={{ gap: 8 }}>
          {FAQ.map((item, index) => {
            const open = expanded === index;
            return (
              <PressableScale
                key={index}
                onPress={() => toggle(index)}
                style={[s.faqItem, { backgroundColor: c.surface }]}
              >
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
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    nav: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingBottom: spacing.md,
    },
    navBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    navTitle: { ...ty.h3, color: c.text },
    faqItem: { borderRadius: radius.xl, backgroundColor: c.surface, padding: 16 },
    faqHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    faqQ: { ...ty.bodySemibold, color: c.text, flex: 1 },
    faqA: { ...ty.body, color: c.text2, lineHeight: 22, marginTop: 12 },
  });
}