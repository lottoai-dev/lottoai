// app/auth/reset-password.tsx
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '../../lib/emblems';
import { softHaptic } from '../../lib/haptics';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const c = theme.colors;

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);

    if (!password.trim()) {
      setError('Şifre boş bırakılamaz.');
      return;
    }
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor.');
      return;
    }

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setError('Oturum bulunamadı. Lütfen şifre sıfırlama bağlantısına tekrar tıkla.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        if (updateError.message.includes('Password should be')) {
          setError('Şifre en az 6 karakter olmalıdır.');
        } else {
          setError('Şifre güncellenemedi. Lütfen tekrar dene.');
        }
        return;
      }

      // updateUser oturumu açık bırakır; yeni şifreyle giriş için çıkış yapıyoruz.
      await supabase.auth.signOut();
      router.replace({
        pathname: '/login',
        params: { message: 'Şifren güncellendi, şimdi giriş yapabilirsin.' },
      });
    } catch {
      setError('Bir sorun oluştu. İnternet bağlantını kontrol et.');
    } finally {
      setLoading(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    backButton: {
      position: 'absolute',
      top: insets.top + 8,
      left: 16,
      zIndex: 10,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: insets.top + 60,
      paddingBottom: insets.bottom + 32,
    },
    hero: {
      alignItems: 'center',
      marginBottom: 36,
    },
    title: {
      fontFamily: theme.font.bold,
      fontSize: 26,
      color: c.text,
      marginBottom: 6,
    },
    subtitle: {
      fontFamily: theme.font.regular,
      fontSize: 15,
      color: c.text2,
      textAlign: 'center',
    },
    form: { gap: 4 },
    label: {
      fontFamily: theme.font.semibold,
      fontSize: 13,
      color: c.text2,
      marginBottom: 6,
      marginTop: 12,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 999,
      paddingHorizontal: 18,
      height: 52,
    },
    input: {
      flex: 1,
      fontFamily: theme.font.regular,
      fontSize: 15,
      color: c.text,
    },
    eyeButton: { padding: 4 },
    errorBox: {
      backgroundColor: c.dangerSoft,
      borderRadius: 16,
      padding: 14,
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    errorText: {
      fontFamily: theme.font.medium,
      color: c.danger,
      fontSize: 14,
      flex: 1,
      lineHeight: 20,
    },
    submitButton: {
      backgroundColor: c.brand,
      borderRadius: 999,
      height: 54,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 20,
    },
    submitButtonDisabled: { opacity: 0.6 },
    submitButtonText: {
      fontFamily: theme.font.semibold,
      color: c.brandText,
      fontSize: 16,
    },
  });

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Pressable
        style={s.backButton}
        onPress={() => {
          softHaptic();
          if (router.canGoBack()) router.back();
          else router.replace('/login');
        }}
      >
        <Ionicons name="arrow-back" size={20} color={c.text2} />
      </Pressable>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.hero}>
          <BrandMark size={72} />
          <Text style={s.title}>Yeni Şifre Belirle</Text>
          <Text style={s.subtitle}>Hesabın için yeni bir şifre oluştur</Text>
        </View>

        <View style={s.form}>
          <Text style={s.label}>YENİ ŞİFRE</Text>
          <View style={s.inputWrapper}>
            <TextInput
              style={s.input}
              placeholder="En az 6 karakter"
              placeholderTextColor={c.text3}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
            />
            <Pressable
              style={s.eyeButton}
              onPress={() => {
                softHaptic();
                setPasswordVisible(!passwordVisible);
              }}
            >
              <Ionicons
                name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={c.text3}
              />
            </Pressable>
          </View>

          <Text style={s.label}>ŞİFRE TEKRAR</Text>
          <View style={s.inputWrapper}>
            <TextInput
              style={s.input}
              placeholder="Şifreyi tekrar gir"
              placeholderTextColor={c.text3}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!confirmVisible}
              autoCapitalize="none"
            />
            <Pressable
              style={s.eyeButton}
              onPress={() => {
                softHaptic();
                setConfirmVisible(!confirmVisible);
              }}
            >
              <Ionicons
                name={confirmVisible ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={c.text3}
              />
            </Pressable>
          </View>

          {error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={18} color={c.danger} style={{ marginTop: 1 }} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={[s.submitButton, loading && s.submitButtonDisabled]}
            onPress={() => {
              softHaptic();
              handleSubmit();
            }}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={c.brandText} />
            ) : (
              <Text style={s.submitButtonText}>Şifreyi Güncelle</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
