// app/auth/callback.tsx
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../../lib/theme';

function urlIsRecovery(url: string | null): boolean {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    const hashParams = new URLSearchParams(urlObj.hash.replace('#', ''));
    const linkType = urlObj.searchParams.get('type') || hashParams.get('type');
    return linkType === 'recovery' || url.includes('type=recovery');
  } catch {
    return url.includes('type=recovery');
  }
}

export default function AuthCallback() {
  const router = useRouter();
  const theme = useTheme();
  const liveUrl = Linking.useURL();

  useEffect(() => {
    let cancelled = false;

    const routeAfterAuth = async () => {
      const initialUrl = await Linking.getInitialURL();
      const isRecovery = urlIsRecovery(liveUrl) || urlIsRecovery(initialUrl);

      // Kısa bekleme: _layout handleDeepLink setSession'ı tamamlasın
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (cancelled) return;

      if (isRecovery) {
        router.replace('/auth/reset-password' as any);
      } else {
        router.replace('/(tabs)/home');
      }
    };

    routeAfterAuth();
    return () => {
      cancelled = true;
    };
  }, [router, liveUrl]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.bg }}>
      <ActivityIndicator size="large" color={theme.colors.brand} />
    </View>
  );
}
