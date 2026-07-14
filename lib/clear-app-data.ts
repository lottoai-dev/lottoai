import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

/** Removes all local storage and signs out the current session. */
export async function clearAllAppData(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  if (keys.length > 0) {
    await AsyncStorage.multiRemove(keys);
  }
  await supabase.auth.signOut();
}
