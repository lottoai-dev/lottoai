// app/auth/callback.tsx
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../../lib/theme';

export default function AuthCallback() {
  const router = useRouter();
  const theme = useTheme();

  useEffect(() => {
    // Kısa bir bekleme sonrası ana sayfaya yönlendir
    const timer = setTimeout(() => {
      router.replace('/(tabs)/home');
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.bg }}>
      <ActivityIndicator size="large" color={theme.colors.brand} />
    </View>
  );
}