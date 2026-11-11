import { Redirect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { SettingsRow } from '../src/components/SettingsRow';
import { clearDevData, getDevSeedStatus, seedDevData } from '../src/dev/seed';
import { useQuery } from '../src/hooks/useData';
import { showToast } from '../src/lib/toast';
import { colors } from '../src/theme';

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function when(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * "Desarrollo": fills the app with invented data that is really saved, and removes it again.
 * Temporary, for trying the app while it is being built; the route does nothing outside development.
 */
export default function DevScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const { data: status } = useQuery(() => getDevSeedStatus(db), { seeded: false, seededAt: null, movements: 0, rows: 0 }, [db]);

  if (!__DEV__) return <Redirect href="/" />;

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      Alert.alert('Algo falló', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const seed = () =>
    run(async () => {
      const done = await seedDevData(db);
      showToast(done ? { kind: 'success', emoji: '🧪', title: 'Datos de prueba listos' } : { kind: 'error', title: 'Ya hay datos de prueba', subtitle: 'Bórralos primero para volver a poblar.' });
    });

  const clear = () =>
    Alert.alert('Borrar datos de prueba', 'Se quita solo lo que creó el botón de poblar. Lo que hayas creado tú se queda.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            const removed = await clearDevData(db);
            showToast({ kind: 'success', emoji: '🧹', title: `${removed} filas de prueba borradas` });
          }),
      },
    ]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader title="Desarrollo" subtitle="Solo aparece mientras se desarrolla la app" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <AppText size={14} color={colors.textMuted} style={styles.text}>
          Crea cuentas, seis meses de movimientos, transferencias, presupuestos, recurrentes, reglas de IA y dos listas
          más. Son datos inventados pero guardados de verdad, para probar todo sin escribirlo a mano.
        </AppText>

        <SettingsRow
          emoji="🌱"
          title="Poblar con datos de prueba"
          subtitle={status.seeded ? 'Ya está poblado' : 'Tarda unos segundos'}
          onPress={busy || status.seeded ? undefined : seed}
          disabled={busy || status.seeded}
        />
        <SettingsRow
          emoji="🧹"
          title="Borrar datos de prueba"
          subtitle="Quita solo lo sembrado, no tus datos"
          onPress={busy || !status.seeded ? undefined : clear}
          disabled={busy || !status.seeded}
        />
        {busy && <ActivityIndicator style={styles.spinner} color={colors.textMuted} />}

        <AppText size={13} color={colors.textMuted} style={styles.text}>
          {status.seeded
            ? `Último poblado: ${status.seededAt ? when(status.seededAt) : '—'} · ${status.movements} movimientos · ${status.rows} filas en total.`
            : 'No hay datos de prueba en este momento.'}
        </AppText>
        <AppText size={12} color={colors.textMuted} style={styles.text}>
          Ojo: si exportas un respaldo con datos de prueba puestos, el archivo los lleva como si fueran tuyos. Bórralos
          antes de exportar.
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  text: {
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  spinner: {
    paddingVertical: 12,
  },
});
