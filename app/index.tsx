// app/index.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

export default function Index() {
  const [isReady, setIsReady] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('onboardingCompleted').then(val => {
      setOnboardingDone(!!val);
      setIsReady(true);
    }).catch(() => {
      setOnboardingDone(false);
      setIsReady(true);
    });
  }, []);

  if (!isReady) return <View style={{ flex: 1, backgroundColor: '#1a1a2e' }} />;

  return <Redirect href={onboardingDone ? '/(tabs)/home' : '/onboarding'} />;
}