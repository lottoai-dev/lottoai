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

async function registerPushToken(): Promise<string | null> {
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
          { token, platform: Platform.OS, updated_at: new Date().toISOString() },
          { onConflict: 'token' }
        );

      if (error) logError('registerPushToken', error);
      else console.log('Token Supabase\'e kaydedildi.');

      return token;
    }
  } catch (err) {
    logError('registerPushToken', err);
  }
  return null;
}

async function fetchUnreadNotifications(
  addBildirim: (b: { title: string; body: string; screen?: string }) => void
) {
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '1686d4a1-7dbf-4293-a0b3-a71afc9e4a61',
    }).catch(() => null);

    if (!tokenData) return;
    const token = tokenData.data;

    const lastLoadKey = 'lastNotificationLoadTime';
    const lastLoad = await AsyncStorage.getItem(lastLoadKey);
    const now = new Date().toISOString();

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('token', token)
      .eq('is_read', false)
      .order('created_at', { ascending: true });

    if (lastLoad) {
      query = query.gt('created_at', lastLoad);
    }

    const { data: unread } = await query;

    if (unread && unread.length > 0) {
      for (const notif of unread) {
        addBildirim({
          title: notif.title || 'Bildirim',
          body: notif.body || '',
          screen: notif.screen,
        });
      }

      const ids = unread.map((n: any) => n.id);
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', ids);
    }

    await AsyncStorage.setItem(lastLoadKey, now);
  } catch (err) {
    console.error('[fetchUnreadNotifications]', err);
  }
}

function RootContent() {
  const router = useRouter();
  const theme = useTheme();
  const fontsLoaded = useAppFonts();
  const responseListener = useRef<any>(null);
  const { addBildirim } = useBildirim();

  // Fontları beklemeden hemen bildirimleri yükle
  useEffect(() => {
    fetchUnreadNotifications(addBildirim);
  }, [addBildirim]);

  useEffect(() => {
    registerPushToken();

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
            if (error) console.error('[deepLink] session error:', error);
            else console.log('[deepLink] oturum başarıyla alındı');
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

    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;
      if (!title && !body) return;
      addBildirim({
        title: title || 'Bildirim',
        body: body || '',
        screen: data?.screen as string | undefined,
      });
    });

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

    Notifications.getLastNotificationResponseAsync().then(async (response) => {
      if (!response) return;
      const notifId = response.notification.request.identifier;
      if (!notifId) return;
      const lastHandled = await AsyncStorage.getItem('lastHandledNotificationId');
      if (lastHandled === notifId) return;
      await AsyncStorage.setItem('lastHandledNotificationId', notifId);
      const { data, title, body } = response.notification.request.content;
      if (!title && !body) return;
      const { screen } = data ?? {};
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