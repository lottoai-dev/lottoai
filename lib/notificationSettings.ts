import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import type { AlertButton } from '../components/ui/app-alert';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { GAMES, type GameId } from './games';
import { t } from './i18n';
import { syncNotifyResults } from './push-token';

type ShowAlert = (title: string, message?: string, buttons?: AlertButton[]) => void;

export type GameSettings = {
  before: boolean;
  beforeMinutes: number;
  after: boolean;
};

export type NotifSettings = Partial<Record<GameId, GameSettings>>;

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  before: false,
  beforeMinutes: 120,
  after: true,
};

const SETTINGS_KEY = STORAGE_KEYS.NOTIFICATION_SETTINGS;

export function createDefaultNotificationSettings(resultNotifications = true): NotifSettings {
  const gameSettings: GameSettings = {
    ...DEFAULT_GAME_SETTINGS,
    after: resultNotifications,
  };
  return Object.fromEntries(GAMES.map((game) => [game.id, { ...gameSettings }])) as NotifSettings;
}

export function getGameSettings(settings: NotifSettings, gameId: GameId): GameSettings {
  return settings[gameId] ?? { ...DEFAULT_GAME_SETTINGS };
}

export async function loadNotificationSettings(): Promise<NotifSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as NotifSettings;
  } catch {}
  return {};
}

export async function saveNotificationSettings(settings: NotifSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** İlk kurulum: AsyncStorage'da kayıt yoksa varsayılanları yazar. Mevcut kullanıcıları etkilemez. */
export async function initializeNotificationSettingsIfNeeded(
  resultNotifications = true
): Promise<NotifSettings | null> {
  const existing = await AsyncStorage.getItem(SETTINGS_KEY);
  if (existing) return null;

  const defaults = createDefaultNotificationSettings(resultNotifications);
  await saveNotificationSettings(defaults);
  return defaults;
}

export async function applyNotificationSettings(settings: NotifSettings): Promise<void> {
  await rescheduleAll(settings);
  const anyAfter = Object.values(settings).some((gs) => gs?.after);
  await syncNotifyResults(!!anyAfter);
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;

  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') {
    await ensureAndroidChannel();
    return true;
  }

  if (existing.canAskAgain === false) return false;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;

  await ensureAndroidChannel();
  return true;
}

export async function requestNotificationPermissionWithAlert(
  showAlert: ShowAlert
): Promise<boolean> {
  if (!Device.isDevice) {
    showAlert(t('notifTitle'), t('notifDeviceWarning'));
    return false;
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') {
    await ensureAndroidChannel();
    return true;
  }

  const openSettingsButtons: AlertButton[] = [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'Ayarları aç', onPress: () => Linking.openSettings() },
  ];

  if (existing.canAskAgain === false) {
    showAlert(t('notifPermRequired'), t('notifPermSettings'), openSettingsButtons);
    return false;
  }

  const granted = await requestNotificationPermission();
  if (!granted) {
    showAlert(t('notifPermRequired'), t('notifPermSettings'), openSettingsButtons);
  }
  return granted;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('lottoai', {
    name: t('notifChannelName'),
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

async function rescheduleAll(settings: NotifSettings) {
  await Promise.all(
    GAMES.map((game) => scheduleNotifications(game.id, getGameSettings(settings, game.id)))
  );
}

export async function scheduleGameNotifications(gameId: GameId, gameSettings: GameSettings): Promise<void> {
  await scheduleNotifications(gameId, gameSettings);
}

async function scheduleNotifications(gameId: GameId, gameSettings: GameSettings) {
  const game = GAMES.find((g) => g.id === gameId);
  if (!game) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.gameId === gameId)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );

  if (!gameSettings.before) return;

  const hourStr = String(game.drawHour).padStart(2, '0');
  const minuteStr = String(game.drawMinute).padStart(2, '0');
  const channelId = Platform.OS === 'android' ? 'lottoai' : undefined;

  for (const day of game.drawDays) {
    const weekday = day === 0 ? 1 : day + 1;
    const beforeDate = new Date();
    beforeDate.setHours(game.drawHour, game.drawMinute, 0, 0);
    beforeDate.setMinutes(beforeDate.getMinutes() - gameSettings.beforeMinutes);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notifBeforeTitle', { name: game.name }),
        body: t('notifBeforeBody', { hour: hourStr, minute: minuteStr }),
        sound: true,
        data: { gameId, type: 'before', screen: 'generate' },
        ...(channelId ? { channelId } : {}),
      },
      trigger: {
        type: 'weekly',
        weekday,
        hour: beforeDate.getHours(),
        minute: beforeDate.getMinutes(),
        repeats: true,
      } as Notifications.NotificationTriggerInput,
    });
  }
}
