import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { LoadError } from '../src/components/LoadError';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { ThresholdSlider } from '../src/components/ThresholdSlider';
import {
  listBudgets,
  listCategories,
  setSetting,
  SETTING_BUDGET_ALERTS,
  SETTING_BUDGET_THRESHOLD,
} from '../src/db/repo';
import type { Budget, Category } from '../src/db/types';
import { useCurrentList, useQuery } from '../src/hooks/useData';
import { useHomeSettings } from '../src/hooks/useHomeData';
import { formatMoney } from '../src/lib/money';
import { colors, radius } from '../src/theme';

const RECOMMENDED = 5;
const RECENT_MS = 90 * 86_400_000;

/**
 * "Presupuestos" (TikTok/09–10): alerts switch with the threshold slider, then the most used
 * categories ("Recomendaciones") and the rest ("Otras"). Each row opens the budget editor.
 * The alert is a toast right after saving an expense that crosses the threshold (lib/budgetAlert).
 * System notifications come with phase 3.
 */
export default function BudgetsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { listId } = useCurrentList();
  const settings = useHomeSettings();
  const [threshold, setThreshold] = useState(settings.budgetThreshold);

  useEffect(() => setThreshold(settings.budgetThreshold), [settings.budgetThreshold]);

  const { data, error, reload } = useQuery(
    async () => {
      const [categories, budgets, usage] = await Promise.all([
        listCategories(db, listId),
        listBudgets(db, listId),
        db.getAllAsync<{ category_id: string; n: number }>(
          `SELECT category_id, COUNT(*) AS n FROM transactions
           WHERE list_id = ? AND deleted_at IS NULL AND category_id IS NOT NULL AND occurred_at >= ?
           GROUP BY category_id`,
          listId,
          Date.now() - RECENT_MS,
        ),
      ]);
      return { categories, budgets, usage };
    },
    { categories: [] as Category[], budgets: [] as Budget[], usage: [] as { category_id: string; n: number }[] },
    [db, listId],
  );

  const uses = new Map(data.usage.map((u) => [u.category_id, u.n]));
  const budgetOf = new Map(data.budgets.map((b) => [b.category_id, b.amount]));
  const expenses = data.categories
    .filter((c) => c.kind === 'expense')
    .sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || (budgetOf.has(b.id) ? 1 : 0) - (budgetOf.has(a.id) ? 1 : 0));
  const recommended = expenses.slice(0, RECOMMENDED);
  const others = [...expenses.slice(RECOMMENDED), ...data.categories.filter((c) => c.kind === 'income')];

  const row = (c: Category) => {
    const amount = budgetOf.get(c.id);
    return (
      <Pressable
        key={c.id}
        onPress={() => router.push({ pathname: '/budget', params: { categoryId: c.id } })}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={[styles.square, { backgroundColor: c.color }]}>
          <AppText size={20}>{c.emoji}</AppText>
        </View>
        <View style={styles.texts}>
          <AppText weight="bold" size={16}>
            {c.name}
          </AppText>
          <AppText size={13} color={amount ? colors.textMuted : colors.textFaint}>
            {amount ? formatMoney(amount) : 'Sin presupuesto'}
          </AppText>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textFaint} />
      </Pressable>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader title="Presupuestos" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {error && <LoadError onRetry={reload} />}
        <View style={styles.alertCard}>
          <View style={styles.alertRow}>
            <AppText size={18}>🔔</AppText>
            <AppText weight="bold" size={16} style={styles.texts}>
              Alertas de presupuesto
            </AppText>
            <Switch
              value={settings.budgetAlerts}
              onValueChange={(v) => setSetting(db, SETTING_BUDGET_ALERTS, String(v))}
              trackColor={{ true: colors.accent, false: colors.border }}
              thumbColor={colors.surface}
            />
          </View>
          {settings.budgetAlerts && (
            <>
              <View style={styles.thresholdRow}>
                <AppText size={13} color={colors.textMuted}>
                  Umbral de alerta
                </AppText>
                <AppText weight="bold" size={13}>
                  {threshold}%
                </AppText>
              </View>
              <ThresholdSlider
                value={threshold}
                onChange={setThreshold}
                onCommit={(v) => setSetting(db, SETTING_BUDGET_THRESHOLD, String(v))}
              />
              <AppText size={12} color={colors.textFaint}>
                Te aviso al guardar un gasto que haga cruzar este umbral o el 100 %.
              </AppText>
            </>
          )}
        </View>

        {recommended.length > 0 && (
          <AppText weight="semibold" size={13} color={colors.textMuted} style={styles.section}>
            Recomendaciones
          </AppText>
        )}
        {recommended.map(row)}

        {others.length > 0 && (
          <AppText weight="semibold" size={13} color={colors.textMuted} style={styles.section}>
            Otras
          </AppText>
        )}
        {others.map(row)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  alertCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: 8,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  thresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  pressed: {
    backgroundColor: colors.chip,
  },
  square: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 1,
  },
});
