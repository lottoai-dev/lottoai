import AsyncStorage from '@react-native-async-storage/async-storage';

import { unregisterPushToken } from './push-token';
import { supabase } from './supabase';

/** Removes all local storage and signs out the current session. */
export async function clearAllAppData(): Promise<void> {
  // Oturum açıkken silinmeli; sonrası RLS'e takılır.
  await unregisterPushToken();

  const keys = await AsyncStorage.getAllKeys();
  if (keys.length > 0) {
    await AsyncStorage.multiRemove(keys);
  }
  await supabase.auth.signOut();
}
