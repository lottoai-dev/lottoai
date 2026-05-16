import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = Constants.expoConfig?.extra?.SUPABASE_URL as string;
const supabaseKey = Constants.expoConfig?.extra?.SUPABASE_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Supabase bilgileri eksik! Lütfen app.json içindeki extra alanını kontrol et.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);