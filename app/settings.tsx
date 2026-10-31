import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { IconButton } from '../src/components/IconButton';
import { getSetting, setSetting, SETTING_SHOW_INCOME } from '../src/db/repo';
import { exportBackup, pickAndImportBackup } from '../src/lib/backup';
import { colors, radius } from '../src/theme';

type IconName = ComponentProps<typeof Feather>['name'];

function Row({
  icon,
  title,
  subtitle,
  onPress,
  right,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <Feather name={icon} size={18} color={colors.text} />
      </View>
      <View style={styles.rowTexts}>
        <AppText weight="semibold" size={15}>
          {title}
        </AppText>
        {subtitle && (
          <AppText size={12} color={colors.textMuted}>
            {subtitle}
          </AppText>
        )}
      </View>
      {right}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <AppText weight="extrabold" size={26}>
          Configuración
        </AppText>
        <IconButton icon="x" label="Cerrar" background={colors.chip} onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <AppText size={13} color={colors.textMuted} style={styles.sectionTitle}>
          Vista
        </AppText>
        <View style={styles.card}>
          <Row
            icon="trending-up"
            title="Mostrar ingresos"
            subtitle="El total muestra el balance del mes (ingresos − gastos)"
            right={
              <Switch
                value={showIncome}
                onValueChange={toggleIncome}
                trackColor={{ true: colors.income, false: colors.border }}
                thumbColor={colors.surface}
              />
            }
          />
        </View>

        <AppText size={13} color={colors.textMuted} style={styles.sectionTitle}>
          Respaldo
        </AppText>
        <View style={styles.card}>
          <Row
            icon="upload"
            title="Exportar respaldo (JSON)"
            subtitle="Guárdalo en Google Drive para cambiar de celular"
            onPress={busy ? undefined : runExport}
          />
          <View style={styles.divider} />
          <Row
            icon="download"
            title="Importar respaldo (JSON)"
            subtitle="Se combina con tus datos, sin duplicar"
            onPress={busy ? undefined : runImport}
          />
        </View>
        {busy && <ActivityIndicator style={styles.spinner} color={colors.textMuted} />}

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
  sectionTitle: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowPressed: {
    backgroundColor: colors.chip,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 62,
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
