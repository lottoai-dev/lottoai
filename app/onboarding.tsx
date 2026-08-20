// app/onboarding.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/ui/app-button';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { AppTheme } from '../constants/theme';
import { BrandMark } from '../lib/emblems';
import { t } from '../lib/i18n';
import { CheckIcon, BellIcon, DiceIcon, ResultsIcon, ShieldIcon, StatsIcon, type IconProps } from '../lib/icons';
import {
  applyNotificationSettings,
  initializeNotificationSettingsIfNeeded,
  requestNotificationPermission,
} from '../lib/notificationSettings';
import { useTheme } from '../lib/theme';

const TERMS_URL = 'https://getlottoai.app/legal#terms';
const PRIVACY_URL = 'https://getlottoai.app/legal';

function softHaptic() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

type Slide = {
  Icon: 'brand' | React.ComponentType<IconProps>;
  titleKey: string;
  descKey: string;
  skippable: boolean;
  isWarning?: boolean;
  isNotification?: boolean;
};

const WARNING_INDEX = 5;

const SLIDES: Slide[] = [
  { Icon: 'brand', titleKey: 'onboarding_welcome_title', descKey: 'onboarding_welcome_desc', skippable: true },
  { Icon: DiceIcon, titleKey: 'onboarding_generate_title', descKey: 'onboarding_generate_desc', skippable: true },
  { Icon: ResultsIcon, titleKey: 'onboarding_results_title', descKey: 'onboarding_results_desc', skippable: true },
  { Icon: StatsIcon, titleKey: 'onboarding_stats_title', descKey: 'onboarding_stats_desc', skippable: true },
  { Icon: BellIcon, titleKey: 'onboarding_notif_title', descKey: 'onboarding_notif_desc', skippable: true, isNotification: true },
  { Icon: ShieldIcon, titleKey: 'onboarding_warning_title', descKey: 'onboarding_warning_desc', skippable: false, isWarning: true },
];

function SlideIcon({ icon, isWarning, brandColor, warningColor }: {
  icon: Slide['Icon'];
  isWarning?: boolean;
  brandColor: string;
  warningColor: string;
}) {
  if (icon === 'brand') return null;
  const IconComponent = icon;
  return <IconComponent color={isWarning ? warningColor : brandColor} size={56} />;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentHighlight, setConsentHighlight] = useState(false);
  const [notifOptIn, setNotifOptIn] = useState<boolean | null>(null);
  const listRef = useRef<FlatList>(null);
  const warningScrollRef = useRef<ScrollView>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  const slide = SLIDES[currentIndex];
  const isLast = currentIndex === SLIDES.length - 1;
  const isNotification = !!slide.isNotification;

  const goToSlide = (index: number) => {
    softHaptic();
    listRef.current?.scrollToIndex({ index, animated: false });
    setCurrentIndex(index);
  };

  const handleNotificationChoice = (optIn: boolean) => {
    setNotifOptIn(optIn);
    goToSlide(WARNING_INDEX);
  };

  const promptConsent = () => {
    softHaptic();
    warningScrollRef.current?.scrollToEnd({ animated: true });
    setConsentHighlight(true);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setConsentHighlight(false), 1600);
  };

  const finishOnboarding = async () => {
    if (!consentChecked) {
      promptConsent();
      return;
    }
    softHaptic();

    const resultNotifications = notifOptIn ?? true;
    const settings = await initializeNotificationSettingsIfNeeded(resultNotifications);

    if (resultNotifications && settings) {
      const granted = await requestNotificationPermission();
      if (granted) {
        await applyNotificationSettings(settings);
      }
    }

    await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETED, 'true');
    router.replace('/(tabs)/home');
  };

  const handleNext = async () => {
    if (isNotification) return;
    if (!isLast) {
      goToSlide(currentIndex + 1);
    } else {
      await finishOnboarding();
    }
  };

  const renderSlideBody = (item: Slide) => (
    <>
      <View style={[s.iconWrap, { backgroundColor: item.isWarning ? c.goldSoft : c.brandSoft }]}>
        {item.Icon === 'brand' ? (
          <BrandMark size={76} />
        ) : (
          <SlideIcon
            icon={item.Icon}
            isWarning={item.isWarning}
            brandColor={c.brand}
            warningColor={c.gold}
          />
        )}
      </View>
      <Text style={s.title}>{t(item.titleKey)}</Text>
      <Text style={s.desc}>{t(item.descKey)}</Text>
      {item.isWarning ? (
        <View
          style={[
            s.warningBox,
            {
              backgroundColor: c.surfaceAlt,
              borderWidth: consentHighlight ? 1.5 : 0,
              borderColor: consentHighlight ? c.brand : 'transparent',
            },
          ]}
        >
          <Text style={s.warningText}>{t('onboarding_warning_text_1')}</Text>
          <Text style={s.warningText}>{t('onboarding_warning_text_2')}</Text>
          <Text
            style={[s.warningText, { color: c.brand, fontFamily: theme.font.bold }]}
            onPress={() => { softHaptic(); Linking.openURL('tel:115'); }}
          >
            {t('onboarding_warning_text_3')}
          </Text>
          <Pressable
            style={[
              s.consentRow,
              {
                borderTopColor: c.border,
                backgroundColor: consentHighlight ? c.brandSoft : 'transparent',
                marginHorizontal: -8,
                paddingHorizontal: 8,
                borderRadius: 10,
              },
            ]}
            onPress={() => { softHaptic(); setConsentChecked((v) => !v); setConsentHighlight(false); }}
            hitSlop={6}
          >
            <View
              style={[
                s.checkbox,
                {
                  borderColor: consentChecked || consentHighlight ? c.brand : c.text3,
                  backgroundColor: consentChecked ? c.brand : 'transparent',
                },
              ]}
            >
              {consentChecked ? <CheckIcon color={c.brandText} size={13} /> : null}
            </View>
            <Text style={s.consentText}>
              18 yaşından büyüğüm ve{' '}
              <Text style={s.consentLink} onPress={() => Linking.openURL(TERMS_URL)}>
                Kullanım Koşulları
              </Text>
              {"'"}nı ile{' '}
              <Text style={s.consentLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
                Gizlilik Politikası
              </Text>
              {"'"}nı okudum, kabul ediyorum.
            </Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[s.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />

      <View style={s.topBar}>
        {slide.skippable ? (
          <Pressable onPress={() => goToSlide(SLIDES.length - 1)} hitSlop={8}>
            <Text style={s.skip}>Geç</Text>
          </Pressable>
        ) : (
          <View />
        )}
      </View>

      <FlatList
        ref={listRef}
        style={s.pager}
        data={SLIDES}
        extraData={{ consentChecked, consentHighlight, width }}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i < SLIDES.length) setCurrentIndex(i);
        }}
        renderItem={({ item }) =>
          item.isWarning ? (
            <ScrollView
              ref={warningScrollRef}
              style={{ width }}
              contentContainerStyle={s.slideScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {renderSlideBody(item)}
            </ScrollView>
          ) : (
            <View style={[s.slide, { width }]}>{renderSlideBody(item)}</View>
          )
        }
      />

      <View style={s.dots}>
        {SLIDES.map((_, index) => (
          <View
            key={index}
            style={[
              s.dot,
              {
                width: index === currentIndex ? 24 : 8,
                opacity: index === currentIndex ? 1 : 0.3,
                backgroundColor: c.brand,
              },
            ]}
          />
        ))}
      </View>

      {!isNotification ? (
        <View style={s.footerActions}>
          {isLast && !consentChecked ? (
            <Text style={s.consentHint}>{t('onboardingConsentHint')}</Text>
          ) : null}
          <AppButton
            haptic={false}
            label={isLast ? t('onboardingStart') : t('onboardingNext')}
            onPress={handleNext}
          />
        </View>
      ) : null}

      {isNotification ? (
        <View style={s.notifActions}>
          <AppButton
            haptic={false}
            variant="ghost"
            label={t('onboarding_notif_no')}
            onPress={() => handleNotificationChoice(false)}
          />
          <AppButton
            haptic={false}
            label={t('onboarding_notif_yes')}
            onPress={() => handleNotificationChoice(true)}
          />
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 24, height: 32 },
    skip: { ...ty.label, color: c.text2 },
    pager: { flex: 1, overflow: 'hidden' },
    slide: {
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingHorizontal: 32,
      paddingTop: 40,
      gap: 18,
      height: '100%',
    },
    slideScroll: {
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingHorizontal: 32,
      paddingTop: 40,
      paddingBottom: 24,
      gap: 18,
    },
    iconWrap: { width: 132, height: 132, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    title: { ...ty.h1, color: c.text, textAlign: 'center' },
    desc: { ...ty.body, fontSize: 16, lineHeight: 24, color: c.text2, textAlign: 'center' },
    warningBox: { borderRadius: 18, padding: 16, marginTop: 8, gap: 8, width: '100%' },
    warningText: { ...ty.bodyMedium, color: c.text2, textAlign: 'center', lineHeight: 20 },
    consentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginTop: 8,
      paddingTop: 12,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    consentText: { ...ty.caption, color: c.text2, flex: 1, lineHeight: 18, textAlign: 'left' },
    consentLink: { color: c.brand, fontFamily: theme.font.semibold, textDecorationLine: 'underline' },
    dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 24, zIndex: 2 },
    dot: { height: 8, borderRadius: 4 },
    consentHint: { ...ty.caption, color: c.gold, textAlign: 'center', marginBottom: 8 },
    // Keep primary CTA at the same Y across slides (notif has 2 buttons: 52 + 8 + 52).
    footerActions: {
      marginHorizontal: 24,
      minHeight: 112,
      justifyContent: 'flex-end',
      zIndex: 2,
      elevation: 2,
    },
    notifActions: {
      gap: 8,
      marginHorizontal: 24,
      minHeight: 112,
      justifyContent: 'flex-end',
      zIndex: 2,
      elevation: 2,
    },
  });
}