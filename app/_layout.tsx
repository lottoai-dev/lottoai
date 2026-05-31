// app/_layout.tsx
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { OfflineBanner } from '../lib/OfflineBanner';
import { useAppFonts } from '../lib/fonts';
import { ThemeProvider, useTheme } from '../lib/theme';

function RootContent() {
  const router = useRouter();
  const theme = useTheme();
  const fontsLoaded = useAppFonts();
  const responseListener = useRef<any>(null);

  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const { screen } = response.notification.request.content.data ?? {};
      if (screen === 'saved') router.push('/(tabs)/saved');
      else if (screen === 'generate') router.push('/(tabs)/generate');
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const { screen } = response.notification.request.content.data ?? {};
      if (screen === 'saved') router.push('/(tabs)/saved');
      else if (screen === 'generate') router.push('/(tabs)/generate');
    });

    return () => responseListener.current?.remove();
  }, [router]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootContent />
    </ThemeProvider>
  );
}