import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getApiKey } from '../src/ai/config';
import { AppText } from '../src/components/AppText';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { SettingsRow } from '../src/components/SettingsRow';
import { setSetting, SETTING_ACCUMULATED, SETTING_SHOW_INCOME } from '../src/db/repo';
import { listLabel, useCurrentList } from '../src/hooks/useData';
import { useHomeSettings } from '../src/hooks/useHomeData';
import { exportBackup, pickAndImportBackup } from '../src/lib/backup';
import { exportCsv } from '../src/lib/csv';
import { withSystemDialog } from '../src/lib/security';
import { useLock } from '../src/security/LockProvider';
import { colors } from '../src/theme';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <AppText weight="semibold" size={13} color={colors.textMuted} style={styles.sectionTitle}>
        {title}
      </AppText>
      <View style={styles.section}>{children}</View>
    </>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.income, false: colors.border }} thumbColor={colors.surface} />;
}

/** "Configuración" (Video Yt/16–22, TikTok/03) with the rows that make sense for this app. */
export default function SettingsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { config } = useLock();
  const { listId, list, lists } = useCurrentList();
  const settings = useHomeSettings();
  const [busy, setBusy] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const inList = `En tu lista actual "${listLabel(list)}"`;

  useEffect(() => {
    getApiKey().then((k) => setHasKey(!!k));
  }, []);

  const run = async (task: () => Promise<void>, errorTitle: string) => {
    setBusy(true);
    try {
      // Share sheet and file picker leave the app for a moment; that must not lock it.
      await withSystemDialog(task);
    } catch (error) {
      Alert.alert(errorTitle, error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const runImport = () =>
    run(async () => {
      const summary = await pickAndImportBackup(db);
      if (summary) {
        const skipped = summary.skipped > 0 ? `\n${summary.skipped} registros inválidos se omitieron.` : '';
        Alert.alert(
          'Respaldo importado',
          `${summary.transactions} movimientos, ${summary.categories} categorías y ${summary.other} otros datos nuevos o actualizados.${skipped}`,
        );
      }
    }, 'No se pudo importar');

  const securitySubtitle = !config?.pinEnabled ? 'Sin bloqueo' : config.biometricsEnabled ? 'PIN y huella' : 'PIN';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader title="Configuración" />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Section title="Contenido">
          <SettingsRow emoji="🥑" title="Editar categorías" subtitle={inList} onPress={() => router.push('/categories')} />
          <SettingsRow emoji="💰" title="Presupuestos" subtitle={inList} onPress={() => router.push('/budgets')} />
          <SettingsRow emoji="#️⃣" title="Editar etiquetas" subtitle={inList} onPress={() => router.push('/tags')} />
          <SettingsRow emoji="🔁" title="Lista de transacciones recurrentes" onPress={() => router.push('/recurring')} />
          <SettingsRow emoji="📝" title="Tus listas" badge={String(lists.length)} onPress={() => router.push('/lists')} />
          <SettingsRow
            emoji="📊"
            title="Exportar CSV"
            subtitle={`Movimientos de "${listLabel(list)}" para Excel`}
            onPress={busy ? undefined : () => run(async () => void (await exportCsv(db, listId, listLabel(list))), 'No se pudo exportar')}
          />
          <SettingsRow
            emoji="📤"
            title="Exportar respaldo"
            subtitle="Archivo JSON con todo, para guardar en Google Drive"
            onPress={busy ? undefined : () => run(() => exportBackup(db), 'No se pudo exportar')}
          />
          <SettingsRow emoji="📥" title="Importar respaldo" subtitle="Se combina con tus datos, sin duplicar" onPress={busy ? undefined : runImport} />
          {busy && <ActivityIndicator style={styles.spinner} color={colors.textMuted} />}
          <SettingsRow
            emoji="➕"
            title="Mostrar ingresos"
            right={<Toggle value={settings.showIncome} onChange={(v) => setSetting(db, SETTING_SHOW_INCOME, String(v))} />}
          />
          {settings.showIncome && (
            <SettingsRow
              emoji="⤵️"
              title="Acumulado"
              subtitle="Mostrar el total de todos los meses en lugar del mes actual solamente"
              right={<Toggle value={settings.accumulated} onChange={(v) => setSetting(db, SETTING_ACCUMULATED, String(v))} />}
            />
          )}
          <SettingsRow emoji="🤖" title="Mejoras de IA" subtitle={inList} onPress={() => router.push('/ai-rules')} />
        </Section>

        <Section title="Inteligencia artificial">
          <SettingsRow
            emoji="✨"
            title="Gemini"
            subtitle={hasKey ? 'Clave guardada' : 'Agrega tu clave para usar la voz y el chat'}
            onPress={() => router.push('/ai')}
          />
        </Section>

        <Section title="Privacidad">
          <SettingsRow emoji="🔒" title="Seguridad" subtitle={securitySubtitle} onPress={() => router.push('/security')} />
        </Section>

        <Section title="Más">
          <SettingsRow
            emoji="👋"
            title="Ver la bienvenida otra vez"
            subtitle="Elegir categorías, voz y estilo"
            // The setting is left alone: closing the app halfway must not force the welcome again.
            onPress={() => router.replace({ pathname: '/onboarding', params: { replay: '1' } })}
          />
        </Section>

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
  sectionTitle: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 6,
  },
  section: {
    paddingHorizontal: 8,
  },
  spinner: {
    marginVertical: 8,
  },
  footer: {
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: 24,
  },
});
