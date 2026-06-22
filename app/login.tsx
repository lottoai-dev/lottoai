// app/login.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSuccessMessage(null);

    if (!email.trim() || !password.trim()) {
      setError('E-posta ve şifre boş bırakılamaz.');
      return;
    }

    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            setError('E-posta veya şifre hatalı.');
          } else if (error.message.includes('Email not confirmed')) {
            setError('E-posta adresin doğrulanmamış. Gelen kutunu kontrol et.');
          } else {
            setError('Giriş yapılamadı. Lütfen tekrar dene.');
          }
          return;
        }

        router.back();

      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          if (error.message.includes('already registered')) {
            setError('Bu e-posta adresi zaten kayıtlı.');
          } else if (error.message.includes('Password should be')) {
            setError('Şifre en az 6 karakter olmalıdır.');
          } else {
            setError('Kayıt olunamadı. Lütfen tekrar dene.');
          }
          return;
        }

        setSuccessMessage('Hesabın oluşturuldu! E-posta adresine bir doğrulama bağlantısı gönderdik. Doğruladıktan sonra giriş yapabilirsin.');
        setMode('login');
        setPassword('');
      }
    } catch (err) {
      setError('Bir sorun oluştu. İnternet bağlantını kontrol et.');
    } finally {
      setLoading(false);
    }
  };

  const s = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 40,
    },
    backButton: {
      position: 'absolute',
      top: 56,
      left: 20,
      zIndex: 10,
      padding: 8,
    },
    logo: {
      alignItems: 'center',
      marginBottom: 40,
    },
    logoIcon: {
      fontSize: 48,
      marginBottom: 12,
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 15,
      color: theme.colors.text2,
      textAlign: 'center',
      marginBottom: 32,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 8,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 16,
      paddingHorizontal: 14,
    },
    input: {
      flex: 1,
      height: 52,
      fontSize: 15,
      color: theme.colors.text,
    },
    eyeButton: {
      padding: 8,
    },
    errorBox: {
      backgroundColor: theme.colors.dangerSoft,
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 14,
      textAlign: 'center',
    },
    successBox: {
      backgroundColor: theme.colors.brandSoft,
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    successText: {
      color: theme.colors.brand,
      fontSize: 14,
      textAlign: 'center',
    },
    submitButton: {
      backgroundColor: theme.colors.brand,
      borderRadius: 14,
      height: 54,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 24,
    },
    submitButtonDisabled: {
      opacity: 0.6,
    },
    submitButtonText: {
      color: theme.colors.brandText,
      fontSize: 16,
      fontWeight: '700',
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
    },
    switchText: {
      fontSize: 14,
      color: theme.colors.text2,
    },
    switchLink: {
      fontSize: 14,
      color: theme.colors.brand,
      fontWeight: '600',
    },
    guestButton: {
      marginTop: 20,
      alignItems: 'center',
    },
    guestText: {
      fontSize: 14,
      color: theme.colors.text3,
      textDecorationLine: 'underline',
    },
  });

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Pressable style={s.backButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/home')}>
        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
      </Pressable>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logo}>
          <Text style={s.logoIcon}>🍀</Text>
          <Text style={s.title}>
            {mode === 'login' ? 'Hoş Geldin!' : 'Hesap Oluştur'}
          </Text>
          <Text style={s.subtitle}>
            {mode === 'login'
              ? 'Kuponlarına her yerden eriş'
              : 'Ücretsiz hesap oluştur, kuponlarını kaydet'}
          </Text>
        </View>

        <Text style={s.label}>E-posta</Text>
        <View style={s.inputWrapper}>
          <TextInput
            style={s.input}
            placeholder="ornek@email.com"
            placeholderTextColor={theme.colors.text3}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Text style={s.label}>Şifre</Text>
        <View style={s.inputWrapper}>
          <TextInput
            style={s.input}
            placeholder="En az 6 karakter"
            placeholderTextColor={theme.colors.text3}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!passwordVisible}
            autoCapitalize="none"
          />
          <Pressable style={s.eyeButton} onPress={() => setPasswordVisible(!passwordVisible)}>
            <Ionicons
              name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={theme.colors.text2}
            />
          </Pressable>
        </View>

        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {successMessage && (
          <View style={s.successBox}>
            <Text style={s.successText}>{successMessage}</Text>
          </View>
        )}

        <Pressable
          style={[s.submitButton, loading && s.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.brandText} />
          ) : (
            <Text style={s.submitButtonText}>
              {mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
            </Text>
          )}
        </Pressable>

        <View style={s.switchRow}>
          <Text style={s.switchText}>
            {mode === 'login' ? 'Hesabın yok mu?' : 'Zaten hesabın var mı?'}
          </Text>
          <Pressable onPress={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
            setSuccessMessage(null);
          }}>
            <Text style={s.switchLink}>
              {mode === 'login' ? 'Kayıt Ol' : 'Giriş Yap'}
            </Text>
          </Pressable>
        </View>

        <Pressable style={s.guestButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/home')}>
          <Text style={s.guestText}>Şimdilik devam et, giriş yapma</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}