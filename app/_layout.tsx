import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { migrateDatabase } from '../src/db/migrations';
import { LockProvider } from '../src/security/LockProvider';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync();

const DATABASE_NAME = 'finanzas.db';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  const fontsReady = fontsLoaded || !!fontError;
  const [lockReady, setLockReady] = useState(false);
  const onLockReady = useCallback(() => setLockReady(true), []);

  // Keep the splash until we know whether to show the lock, so the data never flashes.
  useEffect(() => {
    if (fontsReady && lockReady) SplashScreen.hideAsync();
  }, [fontsReady, lockReady]);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <LockProvider onReady={onLockReady}>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDatabase}>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="transaction" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="settings" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="security" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </SQLiteProvider>
      </LockProvider>
    </SafeAreaProvider>
  );
}
