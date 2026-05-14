// tabs_layout.tsx
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../lib/i18n';
import {
  GenerateIcon,
  HomeIcon,
  ProfileIcon,
  ResultsIcon,
  SavedIcon,
} from '../../lib/icons';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#6C63FF',
        tabBarInactiveTintColor: '#444',
        tabBarStyle: {
          backgroundColor: '#1a1a2e',
          borderTopColor: '#2a2a4a',
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 6,
        },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="generate"
        options={{
          title: t('generate'),
          tabBarIcon: ({ color, size }) => <GenerateIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: t('results'),
          tabBarIcon: ({ color, size }) => <ResultsIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: t('saved'),
          tabBarIcon: ({ color, size }) => <SavedIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ color, size }) => <ProfileIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="analyze" options={{ href: null }} />
      <Tabs.Screen name="statistics" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="legal" options={{ href: null }} />
    </Tabs>
  );
}