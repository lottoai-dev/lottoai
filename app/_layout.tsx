// app_layout.tsx
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { OfflineBanner } from '../lib/OfflineBanner';

export default function RootLayout() {
  const router = useRouter();
  const responseListener = useRef<any>(null);

  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const { screen } = response.notification.request.content.data ?? {};
      if (screen === 'saved') router.push('/(tabs)/saved');
      else if (screen === 'generate') router.push('/(tabs)/generate');
    });

    Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return;
      const { screen } = response.notification.request.content.data ?? {};
      if (screen === 'saved') router.push('/(tabs)/saved');
      else if (screen === 'generate') router.push('/(tabs)/generate');
    });

    return () => {
      responseListener.current?.remove();
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}