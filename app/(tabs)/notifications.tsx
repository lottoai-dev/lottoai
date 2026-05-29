// tabs_notifications.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GAMES, type GameId } from '../../lib/games';
import { t } from '../../lib/i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type GameSettings = {
  before: boolean;
  after: boolean;
};
type NotifSettings = Partial<Record<GameId, GameSettings>>;
const SETTINGS_KEY = 'notificationSettings_v2';

async function requestPermission(): Promise<boolean> {
  if (!Device.isDevice) {
    Alert.alert(t('notifTitle'), t('notifDeviceWarning'));
    return false;
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  const { status } = existing === 'granted'
    ? { status: existing }
    : await Notifications.requestPermissionsAsync();

  if (status !== 'granted') {
    Alert.alert(t('notifPermRequired'), t('notifPermSettings'));
    return false;
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('lottoai', {
      name: t('notifChannelName'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  return true;
}

async function scheduleNotifications(gameId: GameId, settings: GameSettings) {
  const game = GAMES.find(g => g.id === gameId);
  if (!game) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(n => n.content.data?.gameId === gameId)
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );

  const hourStr = String(game.drawHour).padStart(2, '0');
  const minuteStr = String(game.drawMinute).padStart(2, '0');

  for (const day of game.drawDays) {
    const weekday = day === 0 ? 1 : day + 1;

    if (settings.before) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('notifBeforeTitle', { icon: game.icon, name: game.name }),
          body: t('notifBeforeBody', { hour: hourStr, minute: minuteStr }),
          sound: true,
          data: { gameId, type: 'before', screen: 'generate' },
        },
        trigger: {
          type: 'weekly',
          weekday,
          hour: game.notifyBeforeHour,
          minute: game.notifyBeforeMinute,
          repeats: true,
        } as any,
      });
    }

    if (settings.after) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('notifAfterTitle', { name: game.name }),
          body: t('notifAfterBody'),
          sound: true,
          data: { gameId, type: 'after', screen: 'saved' },
        },
        trigger: {
          type: 'weekly',
          weekday,
          hour: game.notifyAfterHour,
          minute: game.notifyAfterMinute,
          repeats: true,
        } as any,
      });
    }
  }
}

async function sendTestNotification() {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: t('notifTestTitle'),
      body: t('notifTestBody'),
      sound: true,
      data: { screen: 'notifications' },
    },
    trigger: {
      type: 'timeInterval',
      seconds: 3,
      repeats: false,
    } as any,
  });
  Alert.alert('✅', t('notifTestAlert'));
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [hasPermission, setHasPermission] = useState(false);
  const [settings, setSettings] = useState<NotifSettings>({});

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setHasPermission(status === 'granted');
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings(JSON.parse(raw));
    } catch {}
  };

  const handleRequestPermission = async () => {
    const granted = await requestPermission();
    setHasPermission(granted);
  };

  const getGameSettings = (gameId: GameId): GameSettings =>
    settings[gameId] ?? { before: false, after: false };

  const handleToggle = async (gameId: GameId, type: 'before' | 'after', value: boolean) => {
    if (!hasPermission) {
      await handleRequestPermission();
      return;
    }
    const current = getGameSettings(gameId);
    const updated: GameSettings = { ...current, [type]: value };
    const newSettings: NotifSettings = { ...settings, [gameId]: updated };
    setSettings(newSettings);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    await scheduleNotifications(gameId, updated);
  };

  const anyEnabled = (gameId: GameId) => {
    const s = getGameSettings(gameId);
    return s.before || s.after;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('notifTitle')}</Text>
          <Text style={styles.headerSub}>{t('notifSub')}</Text>
        </View>

        {!hasPermission ? (
          <TouchableOpacity style={styles.permissionCard} onPress={handleRequestPermission}>
            <Text style={styles.permissionEmoji}>🔔</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.permissionTitle}>{t('notifPermission')}</Text>
              <Text style={styles.permissionDesc}>{t('notifPermissionDesc')}</Text>
            </View>
            <Text style={styles.permissionBtn}>{t('allowNotif')} →</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.permissionGranted}>
            <Text style={styles.permissionGrantedText}>{t('notifGranted')}</Text>
          </View>
        )}

        {hasPermission && (
          <TouchableOpacity style={styles.testBtn} onPress={sendTestNotification}>
            <Text style={styles.testBtnText}>{t('notifTestBtn')}</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.sectionTitle}>{t('notifGames')}</Text>
        {GAMES.map((game) => {
          const gs = getGameSettings(game.id);
          const color = game.colors.main;
          const beforeHour = String(game.notifyBeforeHour).padStart(2, '0');
          const beforeMinute = String(game.notifyBeforeMinute).padStart(2, '0');
          const afterHour = String(game.notifyAfterHour).padStart(2, '0');
          const afterMinute = String(game.notifyAfterMinute).padStart(2, '0');

          return (
            <View
              key={game.id}
              style={[styles.gameCard, anyEnabled(game.id) && { borderLeftColor: color }]}>

              <View style={styles.gameHeader}>
                <Text style={styles.gameEmoji}>{game.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gameName}>{game.name}</Text>
                  <Text style={styles.gameMeta}>
                    🗓 {game.drawDaysLong} · 🏆 {game.drawHour}:{String(game.drawMinute).padStart(2, '0')}
                  </Text>
                </View>
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>{t('notifToggleBeforeLabel')}</Text>
                  <Text style={styles.toggleDesc}>
                    {t('notifToggleBeforeDesc', { hour: beforeHour, minute: beforeMinute })}
                  </Text>
                </View>
                <Switch
                  value={gs.before}
                  onValueChange={(v) => handleToggle(game.id, 'before', v)}
                  trackColor={{ false: '#E5E5EA', true: color }}
                  thumbColor={gs.before ? '#fff' : '#C7C7CC'}
                />
              </View>

              <View style={[styles.toggleRow, { borderTopWidth: 1, borderTopColor: '#E5E5EA' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>{t('notifToggleAfterLabel')}</Text>
                  <Text style={styles.toggleDesc}>
                    {t('notifToggleAfterDesc', { hour: afterHour, minute: afterMinute })}
                  </Text>
                </View>
                <Switch
                  value={gs.after}
                  onValueChange={(v) => handleToggle(game.id, 'after', v)}
                  trackColor={{ false: '#E5E5EA', true: color }}
                  thumbColor={gs.after ? '#fff' : '#C7C7CC'}
                />
              </View>

            </View>
          );
        })}

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>{t('notifNote')}</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7' },
  header: { padding: 20 },
  headerTitle: { color: '#1a1a2e', fontSize: 26, fontWeight: 'bold' },
  headerSub: { color: '#8E8E93', fontSize: 14, marginTop: 4 },
  permissionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FF6B6B15', marginHorizontal: 20,
    padding: 16, borderRadius: 12,
    borderWidth: 1, borderColor: '#FF6B6B33',
    marginBottom: 16, gap: 12,
  },
  permissionEmoji: { fontSize: 28 },
  permissionTitle: { color: '#1a1a2e', fontSize: 15, fontWeight: 'bold' },
  permissionDesc: { color: '#8E8E93', fontSize: 12, marginTop: 2 },
  permissionBtn: { color: '#FF6B6B', fontSize: 14, fontWeight: 'bold' },
  permissionGranted: {
    backgroundColor: '#6BCB7722', marginHorizontal: 20,
    padding: 12, borderRadius: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#6BCB7733',
  },
  permissionGrantedText: { color: '#6BCB77', fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  testBtn: {
    backgroundColor: '#6C63FF15', marginHorizontal: 20,
    padding: 14, borderRadius: 12, marginBottom: 16,
    borderWidth: 1, borderColor: '#6C63FF33', alignItems: 'center',
  },
  testBtnText: { color: '#6C63FF', fontSize: 14, fontWeight: 'bold' },
  sectionTitle: { color: '#1a1a2e', fontSize: 18, fontWeight: 'bold', paddingHorizontal: 20, marginBottom: 12 },
  gameCard: {
    backgroundColor: '#FFFFFF', marginHorizontal: 20,
    borderRadius: 12, marginBottom: 12,
    borderLeftWidth: 4, borderLeftColor: '#E5E5EA',
    overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  gameHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, padding: 14, paddingBottom: 10,
  },
  gameEmoji: { fontSize: 26 },
  gameName: { color: '#1a1a2e', fontSize: 15, fontWeight: 'bold' },
  gameMeta: { color: '#8E8E93', fontSize: 11, marginTop: 3 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10, gap: 12,
  },
  toggleLabel: { color: '#1a1a2e', fontSize: 13, fontWeight: '600' },
  toggleDesc: { color: '#8E8E93', fontSize: 11, marginTop: 2 },
  infoBox: {
    backgroundColor: '#FFFFFF', marginHorizontal: 20,
    padding: 14, borderRadius: 12, marginTop: 4, marginBottom: 30,
    borderWidth: 1, borderColor: '#E5E5EA',
  },
  infoText: { color: '#8E8E93', fontSize: 13, lineHeight: 20 },
});