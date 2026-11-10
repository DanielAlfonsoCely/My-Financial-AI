import { Feather } from '@expo/vector-icons';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { CategoryGrid } from '../src/components/CategoryGrid';
import { IconButton } from '../src/components/IconButton';
import { PillButton } from '../src/components/PillButton';
import {
  applyCategoryPick,
  type CategoryChoice,
  getCurrentListId,
  getSetting,
  loadCategoryChoices,
  setSetting,
  SETTING_CURRENT_LIST,
  SETTING_ONBOARDING_DONE,
  SETTING_SHOW_INCOME,
} from '../src/db/repo';
import type { Category } from '../src/db/types';
import { onCategoryCreated } from '../src/lib/events';
import { withSystemDialog } from '../src/lib/security';
import { showToast } from '../src/lib/toast';
import { categoryPalette, colors, radius } from '../src/theme';

type Step = 'categories' | 'voice' | 'style';
type Params = { listId?: string; mode?: string; replay?: string };

type Item = CategoryChoice;

/** Bars of the little phone in "Elige un estilo". */
const PREVIEW_COLORS = [10, 1, 4, 3].map((i) => categoryPalette[i]);

/**
 * First run (Video Yt/01–05): "Elige tus categorías" → "Entrada de voz" → "Elige un estilo".
 * With ?mode=list it only shows the categories step, for a new list.
 * With ?replay=1 ("Ver la bienvenida otra vez") it runs over what the user already has, and
 * leaving it halfway changes nothing.
 */
export default function OnboardingScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<Params>();
  const forList = params.mode === 'list';
  const replay = params.replay === '1';
  const [listId, setListId] = useState<string | null>(typeof params.listId === 'string' && params.listId ? params.listId : null);
  const [step, setStep] = useState<Step>('categories');
  const [items, setItems] = useState<Item[]>([]);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    if (!listId) getCurrentListId(db).then(setListId);
  }, [db, listId]);

  // The style step starts with what the user already has, so repeating the onboarding changes nothing by itself.
  useEffect(() => {
    getSetting(db, SETTING_SHOW_INCOME).then((v) => setAdvanced(v === 'true'));
  }, [db]);

  const load = useCallback(async () => {
    if (!listId) return;
    setItems(await loadCategoryChoices(db, listId, replay));
  }, [db, listId, replay]);

  useEffect(() => {
    load();
  }, [load]);

  // "Añadir categoría" creates it right away; show it selected.
  useEffect(
    () =>
      onCategoryCreated(async (id) => {
        const c = await db.getFirstAsync<Category>('SELECT * FROM categories WHERE id = ?', id);
        if (!c) return;
        setItems((current) => [
          ...current,
          { id: c.id, key: c.id, name: c.name, emoji: c.emoji, color: c.color, kind: c.kind, selected: true, locked: false },
        ]);
      }),
    [db],
  );

  const toggle = (key: string) => {
    const item = items.find((i) => i.key === key);
    if (item?.locked) {
      showToast({ kind: 'error', title: 'No se puede quitar la categoría', subtitle: 'La categoría ya está en tus transacciones' });
      return;
    }
    setItems((current) => current.map((i) => (i.key === key ? { ...i, selected: !i.selected } : i)));
  };

  const saveCategories = async () => {
    if (!listId) return;
    await applyCategoryPick(db, listId, items.filter((i) => i.selected));
    if (forList) {
      await setSetting(db, SETTING_CURRENT_LIST, listId);
      router.dismissTo('/');
      return;
    }
    setStep('voice');
  };

  const continueVoice = async () => {
    // The permission is asked here, like MonAi; refusing it does not block the app.
    await withSystemDialog(() => requestRecordingPermissionsAsync()).catch(() => undefined);
    setStep('style');
  };

  const finish = async () => {
    await setSetting(db, SETTING_SHOW_INCOME, String(advanced));
    // Repeating the welcome never touched the setting, so there is nothing to restore.
    if (!replay) await setSetting(db, SETTING_ONBOARDING_DONE, 'true');
    // Back to the existing home if there is one (e.g. opened from Configuración), never a second copy.
    router.dismissTo('/');
  };

  const selectedCount = items.filter((i) => i.selected).length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
      {step === 'categories' && (
        <>
          <View style={styles.titleRow}>
            <AppText weight="extrabold" size={28} style={styles.flex}>
              Elige tus categorías
            </AppText>
            {forList && <IconButton icon="x" label="Cerrar" background={colors.surface} onPress={() => router.back()} />}
          </View>
          <ScrollView contentContainerStyle={styles.gridScroll}>
            <CategoryGrid
              items={items.map((i) => ({ key: i.key, emoji: i.emoji, name: i.name, color: i.color, selected: i.selected }))}
              onPress={toggle}
              onAdd={() => router.push({ pathname: '/category', params: { listId: listId ?? '' } })}
            />
          </ScrollView>
          <PillButton label="Guardar" onPress={saveCategories} disabled={selectedCount === 0} />
        </>
      )}

      {step === 'voice' && (
        <>
          <View style={styles.titleBlock}>
            <AppText weight="extrabold" size={28}>
              Entrada de voz
            </AppText>
            <AppText size={14} color={colors.textMuted}>
              Agrega transacciones con tu voz automáticamente
            </AppText>
          </View>
          <View style={styles.center}>
            <View style={[styles.ring, styles.ringOuter]}>
              <View style={[styles.ring, styles.ringMiddle]}>
                <View style={[styles.ring, styles.ringInner]}>
                  <View style={styles.micDot}>
                    <Feather name="mic" size={26} color={colors.surface} />
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.bubble}>
              <AppText weight="semibold" size={15}>
                Compra de mercado $35.000
              </AppText>
            </View>
          </View>
          <PillButton label="Continuar" onPress={continueVoice} />
        </>
      )}

      {step === 'style' && (
        <>
          <View style={styles.titleBlock}>
            <AppText weight="extrabold" size={28}>
              Elige un estilo
            </AppText>
            <AppText size={14} color={colors.textMuted}>
              Puedes cambiarlo en cualquier momento desde la configuración.
            </AppText>
          </View>
          <View style={styles.center}>
            <LinearGradient colors={['#D8F55E', '#7EE08A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.previewFrame}>
              <View style={styles.previewPhone}>
                <View style={styles.previewTotal}>
                  <View style={[styles.previewDot, { backgroundColor: advanced ? colors.income : colors.textFaint }]}>
                    <AppText weight="extrabold" size={10} color={colors.surface}>
                      {advanced ? '+' : '−'}
                    </AppText>
                  </View>
                  <AppText weight="extrabold" size={34}>
                    {advanced ? '1.240.000' : '760.000'}
                  </AppText>
                  <AppText weight="semibold" size={14} color={colors.textMuted}>
                    $
                  </AppText>
                </View>
                {advanced && (
                  <View style={styles.previewKinds}>
                    <AppText weight="bold" size={12} color={colors.accent}>
                      − 760.000
                    </AppText>
                    <AppText weight="bold" size={12} color={colors.income}>
                      + 2.000.000
                    </AppText>
                  </View>
                )}
                <View style={styles.previewBars}>
                  {[0.9, 0.65, 0.45, 0.3].map((h, i) => (
                    <View key={i} style={[styles.previewBar, { height: 110 * h, backgroundColor: PREVIEW_COLORS[i] }]} />
                  ))}
                </View>
              </View>
            </LinearGradient>
          </View>
          <View style={styles.styleOptions}>
            {[
              { value: false, title: 'Simplificado', subtitle: 'Solo gastos' },
              { value: true, title: 'Avanzado', subtitle: 'Ingresos y gastos' },
            ].map((o) => {
              const active = advanced === o.value;
              return (
                <Pressable key={o.title} onPress={() => setAdvanced(o.value)} style={[styles.styleOption, active && styles.styleOptionActive]}>
                  <AppText weight="bold" size={15}>
                    {o.title} {active ? '✓' : ''}
                  </AppText>
                  <AppText size={12} color={colors.textMuted}>
                    {o.subtitle}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <PillButton label="Siguiente" onPress={finish} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    gap: 16,
  },
  flex: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  titleBlock: {
    paddingHorizontal: 24,
    gap: 4,
  },
  gridScroll: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  ringOuter: {
    width: 260,
    height: 260,
    backgroundColor: '#F2F2F4',
  },
  ringMiddle: {
    width: 190,
    height: 190,
    backgroundColor: '#EAEAEE',
  },
  ringInner: {
    width: 120,
    height: 120,
    backgroundColor: '#E1E1E6',
  },
  micDot: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    position: 'absolute',
    top: '38%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  previewFrame: {
    width: 260,
    height: 300,
    borderRadius: 40,
    padding: 14,
  },
  previewPhone: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingTop: 36,
    gap: 6,
    overflow: 'hidden',
  },
  previewTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewKinds: {
    flexDirection: 'row',
    gap: 14,
  },
  previewBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 'auto',
    marginBottom: 16,
  },
  previewBar: {
    width: 40,
    borderRadius: 12,
  },
  styleOptions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
  },
  styleOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 2,
  },
  styleOptionActive: {
    borderColor: colors.text,
    backgroundColor: colors.surface,
  },
});
