// tabs_profile.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GAME_COLORS } from '../../lib/games';
import { t } from '../../lib/i18n';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [totalCoupons, setTotalCoupons] = useState(0);
  const [bestResult, setBestResult] = useState(0);
  const [mostPlayedGame, setMostPlayedGame] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const loadData = async () => {
    try {
      const savedName = await AsyncStorage.getItem('userName');
      if (savedName) setName(savedName);

      const couponsData = await AsyncStorage.getItem('savedCoupons');
      if (couponsData) {
        const coupons = JSON.parse(couponsData);
        setTotalCoupons(coupons.length);
        const best = coupons.reduce((max: number, c: any) => Math.max(max, c.matchedCount || 0), 0);
        setBestResult(best);
        const gameCounts = coupons.reduce((acc: any, c: any) => {
          acc[c.game] = (acc[c.game] || 0) + 1;
          return acc;
        }, {});
        const topGame = Object.entries(gameCounts).sort((a: any, b: any) => b[1] - a[1])[0];
        if (topGame) setMostPlayedGame(topGame[0] as string);
      }

      const notifData = await AsyncStorage.getItem('notificationSettings_v2');
      if (notifData) {
        const settings = JSON.parse(notifData);
        const anyEnabled = Object.values(settings).some(
          (v: any) => v?.before === true || v?.after === true
        );
        setNotificationsEnabled(anyEnabled);
      }
    } catch (e) {}
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const handleSaveName = async () => {
    if (tempName.trim() === '') {
      Alert.alert('Uyarı', 'İsim boş olamaz!');
      return;
    }
    await AsyncStorage.setItem('userName', tempName.trim());
    setName(tempName.trim());
    setEditingName(false);
  };

  const handleClearData = () => {
    Alert.alert('⚠️ Tüm Verileri Sil', 'Tüm kuponlarınız, ayarlarınız ve verileriniz silinecek. Bu işlem geri alınamaz!', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          setTotalCoupons(0);
          setBestResult(0);
          setMostPlayedGame('');
          setName('');
          Alert.alert('✅ Silindi', 'Tüm veriler temizlendi. Uygulamayı kapatıp açın.');
        },
      },
    ]);
  };

  const getGameColor = (gameName: string) => {
    const gc = GAME_COLORS[gameName as keyof typeof GAME_COLORS];
    return gc?.main || '#6C63FF';
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>

        {/* Header */}
        <LinearGradient colors={['#0f0f23', '#1a1a2e']} style={styles.headerGradient}>
          <View style={styles.avatarContainer}>
            <LinearGradient colors={['#6C63FF', '#4834d4']} style={styles.avatar}>
              <Text style={styles.avatarText}>
                {name ? name.charAt(0).toUpperCase() : '👤'}
              </Text>
            </LinearGradient>
            {editingName ? (
              <View style={styles.nameEditRow}>
                <TextInput
                  style={styles.nameInput}
                  value={tempName}
                  onChangeText={setTempName}
                  placeholder={t('addName')}
                  placeholderTextColor="#666"
                  autoFocus
                />
                <TouchableOpacity style={styles.nameSaveBtn} onPress={handleSaveName}>
                  <Text style={styles.nameSaveBtnText}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.nameCancelBtn} onPress={() => setEditingName(false)}>
                  <Text style={styles.nameCancelBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.nameRow}
                onPress={() => { setTempName(name); setEditingName(true); }}>
                <Text style={styles.nameText}>{name || t('addName')}</Text>
                <Ionicons name="pencil-outline" size={16} color="#999" />
              </TouchableOpacity>
            )}
            <Text style={styles.memberText}>{t('luckyPickUser')}</Text>
          </View>
        </LinearGradient>

        {/* İstatistikler */}
        <View style={styles.statsCard}>
          <Text style={styles.cardTitle}>{t('myStats')}</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#6C63FF' }]}>{totalCoupons}</Text>
              <Text style={styles.statLabel}>{t('savedCoupons')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#FFD700' }]}>{bestResult}</Text>
              <Text style={styles.statLabel}>En İyi</Text>
            </View>
          </View>
          {mostPlayedGame !== '' && (
            <View style={[styles.mostPlayedRow, { backgroundColor: getGameColor(mostPlayedGame) + '22', borderColor: getGameColor(mostPlayedGame) + '44' }]}>
              <Text style={styles.mostPlayedText}>⭐ En çok oynadığın: </Text>
              <Text style={[styles.mostPlayedGame, { color: getGameColor(mostPlayedGame) }]}>{mostPlayedGame}</Text>
            </View>
          )}
        </View>

        {/* Araçlar */}
        <View style={styles.menuCard}>
          <Text style={styles.cardTitle}>🛠 Araçlar</Text>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/notifications' as any)}>
            <View style={[styles.menuIcon, { backgroundColor: '#6C63FF22' }]}>
              <Ionicons name="notifications-outline" size={20} color="#6C63FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuItemText}>{t('notifications')}</Text>
              <Text style={styles.menuItemSub}>{notificationsEnabled ? 'Açık' : 'Kapalı'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/statistics' as any)}>
            <View style={[styles.menuIcon, { backgroundColor: '#FFD93D22' }]}>
              <Ionicons name="bar-chart-outline" size={20} color="#FFD93D" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuItemText}>{t('statsTitle')}</Text>
              <Text style={styles.menuItemSub}>{t('statsSub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/analyze' as any)}>
            <View style={[styles.menuIcon, { backgroundColor: '#6BCB7722' }]}>
              <Ionicons name="search-outline" size={20} color="#6BCB77" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuItemText}>{t('analyzeTitle')}</Text>
              <Text style={styles.menuItemSub}>{t('analyzeSub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Hakkında */}
        <View style={styles.menuCard}>
          <Text style={styles.cardTitle}>ℹ️ Hakkında</Text>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/legal' as any)}>
            <View style={[styles.menuIcon, { backgroundColor: '#FF6B6B22' }]}>
              <Ionicons name="document-text-outline" size={20} color="#FF6B6B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuItemText}>{t('privacy')}</Text>
              <Text style={styles.menuItemSub}>Kişisel verileriniz</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/legal' as any)}>
            <View style={[styles.menuIcon, { backgroundColor: '#FF9F4322' }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#FF9F43" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuItemText}>{t('terms')}</Text>
              <Text style={styles.menuItemSub}>Uygulama kuralları</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} onPress={() => Linking.openURL('mailto:lottoai.destek@gmail.com')}>
            <View style={[styles.menuIcon, { backgroundColor: '#6C63FF22' }]}>
              <Ionicons name="mail-outline" size={20} color="#6C63FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuItemText}>{t('contactUs')}</Text>
              <Text style={styles.menuItemSub}>lottoai.destek@gmail.com</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          <View style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: '#2a2a4a' }]}>
              <Ionicons name="information-circle-outline" size={20} color="#999" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuItemText}>Versiyon</Text>
              <Text style={styles.menuItemSub}>1.0.0</Text>
            </View>
          </View>
        </View>

        {/* Tehlikeli Alan */}
        <View style={styles.dangerCard}>
          <TouchableOpacity style={styles.dangerBtn} onPress={handleClearData}>
            <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
            <Text style={styles.dangerBtnText}>{t('clearAllData')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>🍀 LottoAI v1.0.0</Text>
          <Text style={styles.footerSub}>Şans oyunları asistanınız</Text>
          <Text style={styles.footerWarning}>⚠️ Bu uygulama 18 yaş ve üzeri içindir.</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  headerGradient: { paddingBottom: 30 },
  avatarContainer: { alignItems: 'center', paddingTop: 40, gap: 10 },
  avatar: { width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 40 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: { backgroundColor: '#16213e', color: '#fff', fontSize: 18, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#6C63FF', minWidth: 180 },
  nameSaveBtn: { backgroundColor: '#6C63FF', padding: 10, borderRadius: 10 },
  nameSaveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  nameCancelBtn: { backgroundColor: '#2a2a4a', padding: 10, borderRadius: 10 },
  nameCancelBtnText: { color: '#999', fontSize: 16 },
  memberText: { color: '#6C63FF', fontSize: 13 },
  statsCard: { backgroundColor: '#16213e', marginHorizontal: 20, padding: 16, borderRadius: 16, marginTop: 20, marginBottom: 12, borderWidth: 1, borderColor: '#2a2a4a' },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
  statsGrid: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: 'bold' },
  statLabel: { color: '#999', fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, height: 40, backgroundColor: '#2a2a4a' },
  mostPlayedRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, borderWidth: 1 },
  mostPlayedText: { color: '#999', fontSize: 13 },
  mostPlayedGame: { fontSize: 13, fontWeight: 'bold', flex: 1 },
  menuCard: { backgroundColor: '#16213e', marginHorizontal: 20, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#2a2a4a' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  menuIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  menuItemText: { color: '#fff', fontSize: 15 },
  menuItemSub: { color: '#999', fontSize: 12, marginTop: 1 },
  menuDivider: { height: 1, backgroundColor: '#2a2a4a', marginVertical: 4 },
  dangerCard: { backgroundColor: '#16213e', marginHorizontal: 20, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#FF6B6B22' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: '#FF6B6B11' },
  dangerBtnText: { color: '#FF6B6B', fontSize: 15, fontWeight: 'bold' },
  footer: { alignItems: 'center', padding: 20, gap: 4 },
  footerText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  footerSub: { color: '#666', fontSize: 12 },
  footerWarning: { color: '#FF9F43', fontSize: 11, marginTop: 4 },
});