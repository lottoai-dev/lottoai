import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logError } from './logger';
import { supabase } from './supabase';

export const EXPO_PROJECT_ID = '1686d4a1-7dbf-4293-a0b3-a71afc9e4a61';

export async function registerPushToken(): Promise<string | null> {
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

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { token, platform: Platform.OS, updated_at: new Date().toISOString() },
        { onConflict: 'token' }
      );

    if (error) logError('registerPushToken', error);

    return token;
  } catch (err) {
    logError('registerPushToken', err);
  }
  return null;
}

export async function syncNotifyResults(notifyResults: boolean): Promise<void> {
  const token = await registerPushToken();
  if (!token) return;

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        token,
        platform: Platform.OS,
        notify_results: notifyResults,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );

  if (error) logError('syncNotifyResults', error);
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
