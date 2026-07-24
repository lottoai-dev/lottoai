import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function softHaptic() {
  if (Platform.OS === 'android') {
    void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}
