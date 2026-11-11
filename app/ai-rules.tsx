import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { LoadError } from '../src/components/LoadError';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { type AiRuleWithCategory, deleteAiRule, listAiRules } from '../src/db/repo';
import { useCurrentList, useQuery } from '../src/hooks/useData';
import { colors } from '../src/theme';

/** "Mejoras de IA" (Video Yt/18): what the app learned from your category corrections. */
export default function AiRulesScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { listId } = useCurrentList();
  const { data: rules, error, reload } = useQuery(() => listAiRules(db, listId), [] as AiRuleWithCategory[], [db, listId]);

  const remove = (rule: AiRuleWithCategory) => {
    Alert.alert('Olvidar esta corrección', `"${rule.phrase}" ya no irá siempre a ${rule.category_name ?? 'esa categoría'}.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Olvidar', style: 'destructive', onPress: () => deleteAiRule(db, rule.id) },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader
        title="Mejoras de IA"
        subtitle="Cada vez que corrijas una sugerencia automática de categoría, tu corrección será recordada para futuras clasificaciones."
      />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 8 }}>
        {error && <LoadError onRetry={reload} />}
        {rules.length === 0 && !error && (
          <AppText size={14} color={colors.textMuted} style={styles.empty}>
            Aún no hay correcciones. Cuando cambies la categoría que la app eligió, te preguntará si quieres recordarlo.
          </AppText>
        )}
        {rules.map((r) => (
          <Pressable key={r.id} onPress={() => remove(r)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={styles.bubble}>
              <AppText size={24}>{r.category_emoji ?? '❔'}</AppText>
            </View>
            <View style={styles.texts}>
              <AppText weight="bold" size={16}>
                {r.category_name ?? 'Categoría eliminada'}
              </AppText>
              <AppText size={14} color={colors.textMuted} numberOfLines={2}>
                {r.phrase}
              </AppText>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  empty: {
    paddingHorizontal: 24,
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
  bubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 2,
  },
});
