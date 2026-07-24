// app/(tabs)/_layout.tsx
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontFamily } from '../../constants/theme';
import { t } from '../../lib/i18n';
import {
    HomeIcon,
    PlusIcon,
    ProfileIcon,
    ResultsIcon,
    SavedIcon,
    type IconProps,
} from '../../lib/icons';
import { useTheme } from '../../lib/theme';

type TabDef = {
  name: string;
  label: string;
  Icon?: (p: IconProps) => React.ReactNode;
  center?: boolean;
};

const TAB_ORDER: TabDef[] = [
  { name: 'home', label: t('home'), Icon: HomeIcon },
  { name: 'results', label: t('results'), Icon: ResultsIcon },
  { name: 'generate', label: t('generate'), center: true },
  { name: 'saved', label: t('saved'), Icon: SavedIcon },
  { name: 'profile', label: t('profile'), Icon: ProfileIcon },
];

function tabHaptic() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

function LottoTabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const currentRoute = state.routes[state.index]?.name;

  const go = (name: string) => {
    tabHaptic();
    navigation.navigate(name as never);
  };

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: c.tabBg,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
          height: 64 + (insets.bottom > 0 ? insets.bottom : 10),
        },
      ]}
    >
      {TAB_ORDER.map((tab) => {
        const focused = currentRoute === tab.name;

        if (tab.center) {
          return (
            <View key={tab.name} style={styles.centerSlot}>
              <Pressable
                onPress={() => go(tab.name)}
                style={[styles.fab, { backgroundColor: c.brand }]}
              >
                <PlusIcon color={c.brandText} size={26} />
              </Pressable>
              <Text
                style={[styles.centerLabel, { color: focused ? c.brand : c.text3 }]}
                allowFontScaling={false}
              >
                {tab.label}
              </Text>
            </View>
          );
        }

        const tint = focused ? c.brand : c.text3;
        const Icon = tab.Icon!;
        return (
          <Pressable key={tab.name} style={styles.tab} onPress={() => go(tab.name)}>
            <View style={styles.iconWrap}>
              <Icon color={tint} size={22} active={focused} />
            </View>
            <Text
              style={[
                styles.label,
                { color: tint, fontFamily: focused ? FontFamily.semibold : FontFamily.medium },
              ]}
              allowFontScaling={false}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <LottoTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'none', freezeOnBlur: true }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="results" />
      <Tabs.Screen name="generate" />
      <Tabs.Screen name="saved" />
      <Tabs.Screen name="profile" />

      <Tabs.Screen name="ai-assistant" options={{ href: null }} />
      <Tabs.Screen name="bildirimler" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="legal" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  iconWrap: {
    width: 40,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 10.5 },
  centerSlot: { flex: 1, alignItems: 'center' },
  centerLabel: { fontSize: 10.5, fontFamily: FontFamily.medium, marginTop: 6 },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
  },
});
