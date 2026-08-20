import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logError } from './logger';
import { supabase } from './supabase';

export const EXPO_PROJECT_ID = '1686d4a1-7dbf-4293-a0b3-a71afc9e4a61';

type RegisterOptions = {
  /** Verilirse upsert sırasında notify_results de yazılır. */
  notifyResults?: boolean;
};

/**
 * Expo push token'ını alır ve giriş yapmış kullanıcı için push_tokens'a yazar.
 * Conflict anahtarı (user_id, platform): token değeri değişse bile aynı satır
 * güncellenir — aksi halde her FCM/Expo token yenilemesinde yeni satır birikir
 * ve aynı kullanıcıya tekrarlayan bildirimler gider.
 */
export async function registerPushToken(options?: RegisterOptions): Promise<string | null> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });

    const token = tokenData.data;

    const { data: { user } } = await supabase.auth.getUser();
    // user_id + platform unique için kimlik şart; giriş yoksa sunucuya yazma.
    if (!user) return token;

    const row: {
      user_id: string;
      token: string;
      platform: string;
      updated_at: string;
      notify_results?: boolean;
    } = {
      user_id: user.id,
      token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    };
    if (options?.notifyResults !== undefined) {
      row.notify_results = options.notifyResults;
    }

    const { error } = await supabase
      .from('push_tokens')
      .upsert(row, { onConflict: 'user_id,platform' });

    if (error) logError('registerPushToken', error);

    return token;
  } catch (err) {
    logError('registerPushToken', err);
  }
  return null;
}

export async function syncNotifyResults(notifyResults: boolean): Promise<void> {
  await registerPushToken({ notifyResults });
}

/** Eski sabit-saatli "sonuç açıklandı" yerel bildirimlerini iptal eder. */
export async function cancelTimedResultNotifications(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const timedAfter = scheduled.filter((n) => n.content.data?.type === 'after');
    await Promise.all(
      timedAfter.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch (err) {
    logError('cancelTimedResultNotifications', err);
  }
}
