// lib/fonts.ts
// Loads Plus Jakarta Sans via expo-font.
//
// SETUP: download the TTFs (Google Fonts → "Plus Jakarta Sans") and place them in
//   assets/fonts/
//     PlusJakartaSans-Regular.ttf
//     PlusJakartaSans-Medium.ttf
//     PlusJakartaSans-SemiBold.ttf
//     PlusJakartaSans-Bold.ttf
//     PlusJakartaSans-ExtraBold.ttf
// Then call useAppFonts() in app/_layout.tsx (see that file).

import { useFonts } from 'expo-font';

export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    'PlusJakarta-Regular': require('../assets/fonts/PlusJakartaSans-Regular.ttf'),
    'PlusJakarta-Medium': require('../assets/fonts/PlusJakartaSans-Medium.ttf'),
    'PlusJakarta-SemiBold': require('../assets/fonts/PlusJakartaSans-SemiBold.ttf'),
    'PlusJakarta-Bold': require('../assets/fonts/PlusJakartaSans-Bold.ttf'),
    'PlusJakarta-ExtraBold': require('../assets/fonts/PlusJakartaSans-ExtraBold.ttf'),
  });
  return loaded;
}