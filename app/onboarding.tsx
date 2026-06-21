// app/onboarding.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/ui/app-button';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { AppTheme } from '../constants/theme';
import { BrandMark } from '../lib/emblems';
import { t } from '../lib/i18n';
import { DiceIcon, ResultsIcon, ShieldIcon, StatsIcon, type IconProps } from '../lib/icons';
import { useTheme } from '../lib/theme';

const { width } = Dimensions.get('window');

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
};

const SLIDES: Slide[] = [
  { Icon: 'brand', titleKey: 'onboarding_welcome_title', descKey: 'onboarding_welcome_desc', skippable: true },
  { Icon: DiceIcon, titleKey: 'onboarding_generate_title', descKey: 'onboarding_generate_desc', skippable: true },
  { Icon: ResultsIcon, titleKey: 'onboarding_results_title', descKey: 'onboarding_results_desc', skippable: true },
  { Icon: StatsIcon, titleKey: 'onboarding_stats_title', descKey: 'onboarding_stats_desc', skippable: true },
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
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const slide = SLIDES[currentIndex];
  const isLast = currentIndex === SLIDES.length - 1;

  const goToSlide = (index: number) => {
    softHaptic();
    listRef.current?.scrollToIndex({ index, animated: true });
    setCurrentIndex(index);
  };

  const handleNext = async () => {
    if (!isLast) {
      goToSlide(currentIndex + 1);
    } else {
      softHaptic();
      await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETED, 'true');
      router.replace('/(tabs)/home');
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />

      <View style={s.topBar}>
        {slide.skippable ? (
          <Pressable onPress={() => { softHaptic(); goToSlide(SLIDES.length - 1); }} hitSlop={8}>
            <Text style={s.skip}>Geç</Text>
          </Pressable>
        ) : (
          <View />
        )}
      </View>

      <Animated.FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i < SLIDES.length) setCurrentIndex(i);
        }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={[s.slide, { width }]}>
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
              <View style={[s.warningBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                <Text style={s.warningText}>{t('onboarding_warning_text_1')}</Text>
                <Text style={s.warningText}>{t('onboarding_warning_text_2')}</Text>
                <Text
                  style={[s.warningText, { color: c.brand, fontFamily: theme.font.bold }]}
                  onPress={() => { softHaptic(); Linking.openURL('tel:115'); }}
                >
                  {t('onboarding_warning_text_3')}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      />

      <View style={s.dots}>
        {SLIDES.map((_, index) => {
          const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
          const dotWidth = scrollX.interpolate({ inputRange, outputRange: [8, 24, 8], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });
          return <Animated.View key={index} style={[s.dot, { width: dotWidth, opacity, backgroundColor: c.brand }]} />;
        })}
      </View>

      <AppButton label={isLast ? t('onboardingStart') : t('onboardingNext')} onPress={handleNext} style={{ marginHorizontal: 24 }} />
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
    slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 18, flex: 1 },
    iconWrap: { width: 132, height: 132, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    title: { ...ty.h1, color: c.text, textAlign: 'center' },
    desc: { ...ty.body, fontSize: 16, lineHeight: 24, color: c.text2, textAlign: 'center' },
    warningBox: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 8, gap: 8, width: '100%' },
    warningText: { ...ty.bodyMedium, color: c.text2, textAlign: 'center', lineHeight: 20 },
    dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 24 },
    dot: { height: 8, borderRadius: 4 },
  });
}