// app/index.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { STORAGE_KEYS } from '../constants/storage-keys';

export default function Index() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasOnboarded, setHasOnboarded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETED)
      .then((value) => {
        setHasOnboarded(value === 'true');
      })
      .catch(() => {
        setHasOnboarded(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F5F7' }}>
        <ActivityIndicator size="large" color="#1C9E73" />
      </View>
    );
  }

  if (hasOnboarded) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/onboarding" />;
}