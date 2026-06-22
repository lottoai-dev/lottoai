// app/_layout.tsx
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

import { ErrorBoundary } from '../components/ErrorBoundary';
import { AlertProvider } from '../contexts/AlertContext';
import { AuthProvider } from '../contexts/AuthContext';
import { BildirimProvider, useBildirim } from '../contexts/BildirimContext';
import { OfflineBanner } from '../lib/OfflineBanner';
import { useAppFonts } from '../lib/fonts';
import { logError } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { ThemeProvider, useTheme } from '../lib/theme';

async function registerPushToken() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus === 'granted') {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '1686d4a1-7dbf-4293-a0b3-a71afc9e4a61',
      });

      const token = tokenData.data;
      console.log('Expo Push Token:', token);

      const { error } = await supabase
        .from('push_tokens')
        .upsert(
          {
            token: token,
            platform: Platform.OS,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'token' }
        );

      if (error) {
        logError('registerPushToken', error);
      } else {
        console.log('Token Supabase\'e kaydedildi.');
      }
    }
  } catch (err) {
    logError('registerPushToken', err);
  }
}

function RootContent() {
  const router = useRouter();
  const theme = useTheme();
  const fontsLoaded = useAppFonts();
  const responseListener = useRef<any>(null);
  const { addBildirim } = useBildirim();

  useEffect(() => {
    registerPushToken();

    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;
      addBildirim({
        title: title || 'Bildirim',
        body: body || '',
        screen: data?.screen as string | undefined,
      });
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const { title, body, data } = response.notification.request.content;
      addBildirim({
        title: title || 'Bildirim',
        body: body || '',
        screen: data?.screen as string | undefined,
      });
      const { screen } = data ?? {};
      if (screen === 'saved') router.push('/(tabs)/saved');
      else if (screen === 'generate') router.push('/(tabs)/generate');
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const { data } = response.notification.request.content;
      const { screen } = data ?? {};
      if (screen === 'saved') router.push('/(tabs)/saved');
      else if (screen === 'generate') router.push('/(tabs)/generate');
    });

    return () => {
      subscription.remove();
      responseListener.current?.remove();
    };
  }, [router, addBildirim]);

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
        <Stack.Screen name="login" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AlertProvider>
        <AuthProvider>
          <BildirimProvider>
            <ErrorBoundary>
              <RootContent />
            </ErrorBoundary>
          </BildirimProvider>
        </AuthProvider>
      </AlertProvider>
    </ThemeProvider>
  );
}