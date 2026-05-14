// app_onboarding.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { t } from '../lib/i18n';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    emoji: '🍀',
    titleKey: 'onboarding_welcome_title' as const,
    descKey: 'onboarding_welcome_desc' as const,
    color: '#6C63FF',
    skippable: true,
  },
  {
    emoji: '🎲',
    titleKey: 'onboarding_generate_title' as const,
    descKey: 'onboarding_generate_desc' as const,
    color: '#FF6B6B',
    skippable: true,
  },
  {
    emoji: '📡',
    titleKey: 'onboarding_results_title' as const,
    descKey: 'onboarding_results_desc' as const,
    color: '#6BCB77',
    skippable: true,
  },
  {
    emoji: '📊',
    titleKey: 'onboarding_stats_title' as const,
    descKey: 'onboarding_stats_desc' as const,
    color: '#FFD93D',
    skippable: true,
  },
  {
    emoji: '⚠️',
    titleKey: 'onboarding_warning_title' as const,
    descKey: 'onboarding_warning_desc' as const,
    color: '#FF9F43',
    isWarning: true,
    skippable: false,
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const slide = SLIDES[currentIndex];
  const isLast = currentIndex === SLIDES.length - 1;

  const goToSlide = (index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setCurrentIndex(index);
  };

  const handleNext = async () => {
    if (!isLast) {
      goToSlide(currentIndex + 1);
    } else {
      await AsyncStorage.setItem('onboardingCompleted', 'true');
      router.replace('/(tabs)/home');
    }
  };

  const handleSkip = async () => {
    goToSlide(SLIDES.length - 1);
  };

  const handleMomentumScrollEnd = (e: any) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    if (newIndex >= SLIDES.length) return;
    setCurrentIndex(newIndex);
  };

  return (
    <View style={styles.container}>

      {slide.skippable && (
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipText}>{t('onboardingSkip')} →</Text>
        </TouchableOpacity>
      )}

      <Animated.FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={true}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.emojiContainer, { backgroundColor: item.color + '22' }]}>
              <Text style={styles.emoji}>{item.emoji}</Text>
            </View>

            <Text style={[styles.title, item.isWarning && { color: '#FF9F43' }]}>
              {t(item.titleKey)}
            </Text>
            <Text style={styles.description}>{t(item.descKey)}</Text>

            {item.isWarning && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  🎰 {t('onboarding_warning_text_1')}{'\n'}
                  {t('onboarding_warning_text_2')}{'\n'}
                  {t('onboarding_warning_text_3')}
                </Text>
              </View>
            )}
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((s, index) => {
          const inputRange = [
            (index - 1) * width,
            index * width,
            (index + 1) * width,
          ];
          const dotWidth = scrollX.interpolate({
            inputRange,
            outputRange: [8, 24, 8],
            extrapolate: 'clamp',
          });
          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.4, 1, 0.4],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                {
                  width: dotWidth,
                  opacity,
                  backgroundColor: s.color,
                },
              ]}
            />
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.nextBtn, { backgroundColor: slide.color }]}
        onPress={handleNext}
        activeOpacity={0.85}>
        <Text style={styles.nextBtnText}>
          {isLast ? t('onboardingStart') : t('onboardingNext')}
        </Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    paddingTop: 60,
    paddingBottom: 40,
  },
  skipBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 24,
    paddingVertical: 8,
    marginBottom: 8,
  },
  skipText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 20,
    flex: 1,
  },
  emojiContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  emoji: { fontSize: 70 },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  description: {
    color: '#999',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  warningBox: {
    backgroundColor: '#FF9F4322',
    borderWidth: 1,
    borderColor: '#FF9F43',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  warningText: {
    color: '#FF9F43',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 22,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextBtn: {
    marginHorizontal: 24,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});