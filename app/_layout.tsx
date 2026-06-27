// app/_layout.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
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

const PENDING_NOTIFICATIONS_KEY = 'pendingNotifications';
// Bildirim handler'ı — uygulama açıkken bildirimleri göster
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
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

// Bildirimi bekleyen listeye kaydet (uygulama kapalıyken gelenleri sakla)
async function savePendingNotification(title: string, body: string, screen?: string) {
  try {
    const existing = await AsyncStorage.getItem(PENDING_NOTIFICATIONS_KEY);
    const pending = existing ? JSON.parse(existing) : [];
    pending.push({ title, body, screen, savedAt: new Date().toISOString() });
    await AsyncStorage.setItem(PENDING_NOTIFICATIONS_KEY, JSON.stringify(pending));
  } catch {}
}

function RootContent() {
  const router = useRouter();
  const theme = useTheme();
  const fontsLoaded = useAppFonts();
  const responseListener = useRef<any>(null);
  const { addBildirim } = useBildirim();

  useEffect(() => {
    registerPushToken();

    // Deep link ile gelen auth token'ı yakala
    const handleDeepLink = async (url: string) => {
      if (!url) return;
      if (url.includes('access_token') || url.includes('token_hash') || url.includes('type=signup') || url.includes('type=recovery')) {
        try {
          const urlObj = new URL(url);
          const accessToken = urlObj.searchParams.get('access_token') ||
            new URLSearchParams(urlObj.hash.replace('#', '')).get('access_token');
          const refreshToken = urlObj.searchParams.get('refresh_token') ||
            new URLSearchParams(urlObj.hash.replace('#', '')).get('refresh_token');

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) {
              console.error('[deepLink] session error:', error);
            } else {
              console.log('[deepLink] oturum başarıyla alındı');
            }
          }
        } catch (e) {
          console.error('[deepLink] url parse error:', e);
        }
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    // Uygulama açıkken gelen bildirimler
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;
      if (!title && !body) return;
      addBildirim({
        title: title || 'Bildirim',
        body: body || '',
        screen: data?.screen as string | undefined,
      });
    });

    // Kullanıcı bildirime tıklayınca
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const { title, body, data } = response.notification.request.content;
      if (!title && !body) return;
      addBildirim({
        title: title || 'Bildirim',
        body: body || '',
        screen: data?.screen as string | undefined,
      });
      const { screen } = data ?? {};
      if (screen === 'saved') router.push('/(tabs)/saved');
      else if (screen === 'generate') router.push('/(tabs)/generate');
    });

    // Uygulama kapalıyken gelen ve tıklanmayan bildirimleri işle
    Notifications.getLastNotificationResponseAsync().then(async (response) => {
      if (!response) {
        // Kullanıcı bildirime tıklamadan uygulamayı açtı
        // Bekleyen bildirimleri AsyncStorage'dan yükle
        try {
          const pending = await AsyncStorage.getItem(PENDING_NOTIFICATIONS_KEY);
          if (pending) {
            const pendingList = JSON.parse(pending);
            for (const notif of pendingList) {
              addBildirim({
                title: notif.title,
                body: notif.body,
                screen: notif.screen,
              });
            }
            await AsyncStorage.removeItem(PENDING_NOTIFICATIONS_KEY);
          }
        } catch {}
        return;
      }

      const notifId = response.notification.request.identifier;
      const lastHandled = await AsyncStorage.getItem('lastHandledNotificationId');
      if (lastHandled === notifId) return;
      await AsyncStorage.setItem('lastHandledNotificationId', notifId);
      const { data, title, body } = response.notification.request.content;
      if (!title && !body) return;
      const { screen } = data ?? {};
      addBildirim({
        title: title || 'Bildirim',
        body: body || '',
        screen: screen as string | undefined,
      });
      if (screen === 'saved') router.push('/(tabs)/saved');
      else if (screen === 'generate') router.push('/(tabs)/generate');
    });

    return () => {
      linkingSub.remove();
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