// app/login.tsx
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '../lib/emblems';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

type Mode = 'login' | 'register' | 'forgot';

const TERMS_URL = 'https://getlottoai.app/legal#terms';
const PRIVACY_URL = 'https://getlottoai.app/legal';

export default function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const c = theme.colors;

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '775120851198-fkplgqbpkljuf173g63d5ivpr6mt2c5o.apps.googleusercontent.com',
      scopes: ['email', 'profile'],
    });
  }, []);

  const resetState = () => {
    setError(null);
    setSuccessMessage(null);
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;

      if (!idToken) {
        setError('Google girişi başarısız. Tekrar dene.');
        return;
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (error) {
        setError('Google ile giriş yapılamadı. Tekrar dene.');
        return;
      }

      router.canGoBack() ? router.back() : router.replace('/(tabs)/home');

    } catch (err: any) {
      if (isErrorWithCode(err)) {
        if (err.code === statusCodes.SIGN_IN_CANCELLED) {
          // kullanıcı iptal etti
        } else if (err.code === statusCodes.IN_PROGRESS) {
          setError('Giriş işlemi zaten devam ediyor.');
        } else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setError('Google Play Servisleri kullanılamıyor.');
        } else {
          setError('Google ile giriş yapılamadı. Tekrar dene.');
        }
      } else {
        setError('Bir sorun oluştu. Tekrar dene.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async () => {
    resetState();

    if (!email.trim()) {
      setError('E-posta boş bırakılamaz.');
      return;
    }
    if (mode !== 'forgot' && !password.trim()) {
      setError('Şifre boş bırakılamaz.');
      return;
    }
    if (mode !== 'forgot' && password.length < 6) {
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
        router.canGoBack() ? router.back() : router.replace('/(tabs)/home');

      } else if (mode === 'register') {
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

      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) {
          setError('Şifre sıfırlama maili gönderilemedi. E-posta adresini kontrol et.');
          return;
        }
        setSuccessMessage('Şifre sıfırlama bağlantısı e-posta adresine gönderildi. Gelen kutunu kontrol et.');
        setMode('login');
        setEmail('');
        setPassword('');
      }
    } catch {
      setError('Bir sorun oluştu. İnternet bağlantını kontrol et.');
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<Mode, string> = {
    login: 'Hoş Geldin!',
    register: 'Hesap Oluştur',
    forgot: 'Şifremi Unuttum',
  };

  const subtitles: Record<Mode, string> = {
    login: 'Kuponlarına her yerden eriş',
    register: 'Ücretsiz hesap oluştur, kuponlarını kaydet',
    forgot: 'E-postanı gir, sıfırlama bağlantısı gönderelim',
  };

  const buttonLabels: Record<Mode, string> = {
    login: 'Giriş Yap',
    register: 'Kayıt Ol',
    forgot: 'Sıfırlama Maili Gönder',
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
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
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
      fontFamily: theme.font.extrabold,
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
    form: {
      gap: 4,
    },
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
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 16,
      height: 52,
    },
    inputWrapperFocused: {
      borderColor: c.brand,
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
      borderRadius: 12,
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
    successBox: {
      backgroundColor: c.brandSoft,
      borderRadius: 12,
      padding: 14,
      marginTop: 12,
      borderWidth: 1,
      borderColor: c.brandBorder,
    },
    successText: {
      fontFamily: theme.font.medium,
      color: c.brand,
      fontSize: 14,
      lineHeight: 20,
    },
    submitButton: {
      backgroundColor: c.brand,
      borderRadius: 14,
      height: 54,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 20,
    },
    submitButtonDisabled: { opacity: 0.6 },
    submitButtonText: {
      fontFamily: theme.font.bold,
      color: c.brandText,
      fontSize: 16,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 20,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: c.hairline },
    dividerText: {
      fontFamily: theme.font.medium,
      fontSize: 13,
      color: c.text3,
    },
    googleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderRadius: 14,
      height: 54,
      borderWidth: 1,
      borderColor: c.border,
      marginTop: 12,
    },
    googleButtonDisabled: { opacity: 0.6 },
    googleLetter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: '#4285F4',
      alignItems: 'center',
      justifyContent: 'center',
    },
    googleLetterText: {
      color: '#fff',
      fontSize: 12,
      fontFamily: theme.font.bold,
    },
    googleButtonText: {
      fontFamily: theme.font.semibold,
      color: c.text,
      fontSize: 15,
    },
    footer: {
      marginTop: 28,
      gap: 14,
      alignItems: 'center',
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    switchText: {
      fontFamily: theme.font.regular,
      fontSize: 14,
      color: c.text2,
    },
    switchLink: {
      fontFamily: theme.font.bold,
      fontSize: 14,
      color: c.brand,
    },
    forgotText: {
      fontFamily: theme.font.medium,
      fontSize: 14,
      color: c.text3,
    },
    guestText: {
      fontFamily: theme.font.medium,
      fontSize: 13,
      color: c.text3,
      textDecorationLine: 'underline',
    },
    consentText: {
      fontFamily: theme.font.regular,
      fontSize: 12.5,
      color: c.text3,
      textAlign: 'center',
      lineHeight: 18,
      marginTop: 14,
    },
    consentLink: {
      fontFamily: theme.font.semibold,
      color: c.text2,
      textDecorationLine: 'underline',
    },
  });

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Pressable
        style={s.backButton}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/home')}
      >
        <Ionicons name="arrow-back" size={20} color={c.text2} />
      </Pressable>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={s.hero}>
        <BrandMark size={72} />
          <Text style={s.title}>{titles[mode]}</Text>
          <Text style={s.subtitle}>{subtitles[mode]}</Text>
        </View>

        {/* Form */}
        <View style={s.form}>
          <Text style={s.label}>E-POSTA</Text>
          <View style={s.inputWrapper}>
            <TextInput
              style={s.input}
              placeholder="ornek@email.com"
              placeholderTextColor={c.text3}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {mode !== 'forgot' && (
            <>
              <Text style={s.label}>ŞİFRE</Text>
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
                <Pressable style={s.eyeButton} onPress={() => setPasswordVisible(!passwordVisible)}>
                  <Ionicons
                    name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={c.text3}
                  />
                </Pressable>
              </View>
            </>
          )}

          {error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color={c.danger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {successMessage && (
            <View style={s.successBox}>
              <Text style={s.successText}>{successMessage}</Text>
            </View>
          )}

          {mode !== 'forgot' && (
            <Text style={s.consentText}>
              {mode === 'register' ? 'Kayıt olarak' : 'Giriş yaparak veya hesap oluşturarak'}{' '}
              <Text style={s.consentLink} onPress={() => Linking.openURL(TERMS_URL)}>
                Kullanım Koşulları
              </Text>
              {"'"}nı ve{' '}
              <Text style={s.consentLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
                Gizlilik Politikası
              </Text>
              {"'"}nı kabul etmiş, 18 yaşından büyük olduğunu beyan etmiş olursun.
            </Text>
          )}

          <Pressable
            style={[s.submitButton, loading && s.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={c.brandText} />
              : <Text style={s.submitButtonText}>{buttonLabels[mode]}</Text>
            }
          </Pressable>

          {mode !== 'forgot' && (
            <>
              <View style={s.dividerRow}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>veya</Text>
                <View style={s.dividerLine} />
              </View>

              <Pressable
                style={[s.googleButton, googleLoading && s.googleButtonDisabled]}
                onPress={handleGoogleSignIn}
                disabled={googleLoading}
              >
                {googleLoading
                  ? <ActivityIndicator color={c.text} />
                  : (
                    <>
                      <Ionicons name="logo-google" size={20} color="#4285F4" />
                      <Text style={s.googleButtonText}>Google ile devam et</Text>
                    </>
                  )
                }
              </Pressable>
            </>
          )}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          {mode === 'login' && (
            <>
              <View style={s.switchRow}>
                <Text style={s.switchText}>Hesabın yok mu?</Text>
                <Pressable onPress={() => { setMode('register'); resetState(); }}>
                  <Text style={s.switchLink}>Kayıt Ol</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => { setMode('forgot'); resetState(); }}>
                <Text style={s.forgotText}>Şifremi unuttum</Text>
              </Pressable>
            </>
          )}

          {mode === 'register' && (
            <View style={s.switchRow}>
              <Text style={s.switchText}>Zaten hesabın var mı?</Text>
              <Pressable onPress={() => { setMode('login'); resetState(); }}>
                <Text style={s.switchLink}>Giriş Yap</Text>
              </Pressable>
            </View>
          )}

          {mode === 'forgot' && (
            <Pressable onPress={() => { setMode('login'); resetState(); }}>
              <Text style={s.switchLink}>Giriş ekranına dön</Text>
            </Pressable>
          )}

          {mode !== 'forgot' && (
            <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/home')}>
              <Text style={s.guestText}>Şimdilik devam et, giriş yapma</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}