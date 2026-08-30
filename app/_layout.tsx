// app/_layout.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { AppState, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { ErrorBoundary } from '../components/ErrorBoundary';
import { AlertProvider } from '../contexts/AlertContext';
import { AuthProvider } from '../contexts/AuthContext';
import { BildirimProvider, useBildirim, type AddBildirimInput } from '../contexts/BildirimContext';
import { OfflineBanner } from '../lib/OfflineBanner';
import { useAppFonts } from '../lib/fonts';
import { cancelTimedResultNotifications, EXPO_PROJECT_ID, registerPushToken } from '../lib/push-token';
import { supabase } from '../lib/supabase';
import { ThemeProvider, useTheme } from '../lib/theme';

// Native (statik) splash'i JS tarafı hazır olana kadar elde tutuyoruz.
// Bu çağrı herhangi bir await'ten ÖNCE, modülün en üstünde olmalı — aksi
// halde splash otomatik kapanır ve aşağıdaki kontrollü geçiş hiç işe yaramaz.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Zaten gizliyse (ör. hot reload) ya da platform desteklemiyorsa sessizce
  // geç — bu kritik bir hata değil, uygulamayı durdurmamalı.
});

// YT Music tarzı: fade yok — logo bir süre ortada kalır, sonra anında kesilir.
// duration: 0 Android'deki varsayılan fade'i kapatır; fade: false iOS içindir.
SplashScreen.setOptions({ duration: 0, fade: false });

const SPLASH_BG = '#0A0C10';
// Logo en az bu kadar görünsün (fontlar daha erken hazır olsa bile).
const SPLASH_MIN_MS = 1000;
// Fontlar hiç yüklenmezse splash sonsuza dek takılı kalmasın.
const SPLASH_SAFETY_TIMEOUT_MS = 8000;
const splashStartedAt = Date.now();

async function hideSplashWhenReady() {
  const elapsed = Date.now() - splashStartedAt;
  const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  await SplashScreen.hideAsync().catch(() => {});
}

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

/** Expo Notification.date bazen saniye, bazen ms olabilir. */
function notificationDateToIso(date: number | undefined): string | undefined {
  if (typeof date !== 'number' || !Number.isFinite(date)) return undefined;
  const ms = date < 1e12 ? date * 1000 : date;
  const parsed = new Date(ms);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

async function fetchUnreadNotifications(
  addBildirim: (b: AddBildirimInput) => void
) {
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    }).catch(() => null);

    if (!tokenData) return;
    const token = tokenData.data;

    const lastLoadKey = 'lastNotificationLoadTime';
    const lastLoad = await AsyncStorage.getItem(lastLoadKey);
    const now = new Date().toISOString();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

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
          id: notif.id != null ? String(notif.id) : undefined,
          title: notif.title || 'Bildirim',
          body: notif.body || '',
          screen: notif.screen,
          createdAt: notif.created_at || undefined,
        });
      }

      const ids = unread.map((n: any) => n.id);
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', ids)
        .eq('token', token);
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

  // Fontlar hazır olunca splash'i en az SPLASH_MIN_MS tutup animasyonsuz kapat.
  useEffect(() => {
    if (!fontsLoaded) return;
    hideSplashWhenReady();
  }, [fontsLoaded]);

  // Güvenlik ağı: fontsLoaded herhangi bir sebeple hiç true olmazsa bile,
  // uygulama splash ekranında sonsuza dek takılı kalmasın.
  useEffect(() => {
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, SPLASH_SAFETY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    registerPushToken();
    // Eski sürümlerde sabit saatte planlanan "sonuç açıklandı" bildirimlerini temizle.
    cancelTimedResultNotifications();

    const handleDeepLink = async (url: string) => {
      if (!url) return;
      if (url.includes('access_token') || url.includes('token_hash') || url.includes('type=signup') || url.includes('type=recovery')) {
        try {
          const urlObj = new URL(url);
          const hashParams = new URLSearchParams(urlObj.hash.replace('#', ''));
          const accessToken = urlObj.searchParams.get('access_token') ||
            hashParams.get('access_token');
          const refreshToken = urlObj.searchParams.get('refresh_token') ||
            hashParams.get('refresh_token');
          const linkType = urlObj.searchParams.get('type') || hashParams.get('type');
          const isRecovery = linkType === 'recovery' || url.includes('type=recovery');

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) {
              console.error('[deepLink] session error:', error);
            } else {
              console.log('[deepLink] oturum başarıyla alındı', { isRecovery });
              // Recovery: kullanıcı henüz yeni şifre belirlemedi — ana sayfaya değil
              // şifre belirleme ekranına yönlendir.
              if (isRecovery) {
                router.replace('/auth/reset-password' as any);
              }
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

    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;
      // Bazı result push'ları foreground'da title/body taşımayabiliyor.
      // Bu durumda DB'deki okunmamış kayıtları çekerek çan rozetini güncel tut.
      if (!title && !body) {
        fetchUnreadNotifications(addBildirim);
        return;
      }
      addBildirim({
        title: title || 'Bildirim',
        body: body || '',
        screen: data?.screen as string | undefined,
        createdAt: notificationDateToIso(notification.date),
      });
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const { title, body, data } = response.notification.request.content;
      if (!title && !body) return;
      addBildirim({
        title: title || 'Bildirim',
        body: body || '',
        screen: data?.screen as string | undefined,
        createdAt: notificationDateToIso(response.notification.date),
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

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        fetchUnreadNotifications(addBildirim);
      }
    });

    return () => {
      linkingSub.remove();
      subscription.remove();
      responseListener.current?.remove();
      appStateSub.remove();
    };
  }, [router, addBildirim]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: SPLASH_BG }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <OfflineBanner />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="login" />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="auth/reset-password" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <KeyboardProvider>
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
    </KeyboardProvider>
  );
}