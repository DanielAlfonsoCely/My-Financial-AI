import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { IconButton } from '../src/components/IconButton';
import { SettingsRow } from '../src/components/SettingsRow';
import { getSetting, setSetting, SETTING_SHOW_INCOME } from '../src/db/repo';
import { exportBackup, pickAndImportBackup } from '../src/lib/backup';
import { useLock } from '../src/security/LockProvider';
import { colors } from '../src/theme';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { config } = useLock();
  const [showIncome, setShowIncome] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSetting(db, SETTING_SHOW_INCOME).then((v) => setShowIncome(v === 'true'));
  }, [db]);

  const toggleIncome = (value: boolean) => {
    setShowIncome(value);
    setSetting(db, SETTING_SHOW_INCOME, String(value));
  };

  const runExport = async () => {
    setBusy(true);
    try {
      await exportBackup(db);
    } catch (error) {
      Alert.alert('No se pudo exportar', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    try {
      const summary = await pickAndImportBackup(db);
      if (summary) {
        const skipped = summary.skipped > 0 ? `\n${summary.skipped} registros inválidos se omitieron.` : '';
        Alert.alert(
          'Respaldo importado',
          `${summary.transactions} movimientos y ${summary.categories} categorías nuevos o actualizados.${skipped}`,
        );
      }
    } catch (error) {
      Alert.alert('No se pudo importar', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const securitySubtitle = !config?.pinEnabled
    ? 'Sin bloqueo'
    : config.biometricsEnabled
      ? 'PIN y huella'
      : 'PIN';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <AppText weight="extrabold" size={28}>
          Configuración
        </AppText>
        <IconButton icon="x" label="Cerrar" background={colors.surface} style={styles.close} onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <AppText weight="semibold" size={13} color={colors.textMuted} style={styles.sectionTitle}>
          Contenido
        </AppText>
        <View style={styles.section}>
          <SettingsRow
            emoji="➕"
            title="Mostrar ingresos"
            subtitle="El total muestra el balance (ingresos − gastos)"
            right={
              <Switch
                value={showIncome}
                onValueChange={toggleIncome}
                trackColor={{ true: colors.income, false: colors.border }}
                thumbColor={colors.surface}
              />
            }
          />
          <SettingsRow
            emoji="📤"
            title="Exportar respaldo"
            subtitle="Archivo JSON para guardar en Google Drive"
            onPress={busy ? undefined : runExport}
          />
          <SettingsRow
            emoji="📥"
            title="Importar respaldo"
            subtitle="Se combina con tus datos, sin duplicar"
            onPress={busy ? undefined : runImport}
          />
        </View>
        {busy && <ActivityIndicator style={styles.spinner} color={colors.textMuted} />}

        <AppText weight="semibold" size={13} color={colors.textMuted} style={styles.sectionTitle}>
          Privacidad
        </AppText>
        <View style={styles.section}>
          <SettingsRow
            emoji="🔒"
            title="Seguridad"
            subtitle={securitySubtitle}
            onPress={() => router.push('/security')}
          />
        </View>

        <AppText size={12} color={colors.textMuted} style={styles.footer}>
          My Financial AI v{Constants.expoConfig?.version ?? '0.1.0'} · Tus datos viven solo en este celular.
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  close: {
    elevation: 2,
  },
  sectionTitle: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 6,
  },
  section: {
    paddingHorizontal: 8,
  },
  spinner: {
    marginTop: 16,
  },
  footer: {
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: 24,
  },
});
