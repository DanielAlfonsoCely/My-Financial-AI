import { Feather } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { LoadError } from '../src/components/LoadError';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { deleteRecurring, listRecurring, type RecurringWithCategory } from '../src/db/repo';
import { useCurrentList, useQuery } from '../src/hooks/useData';
import { formatMoney } from '../src/lib/money';
import { REPEAT_OPTIONS } from '../src/lib/recurrence';
import { parseTags } from '../src/lib/tags';
import { colors, radius } from '../src/theme';

function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * "Lista de transacciones recurrentes" (Video Yt/29): emoji bubble with a small 🔁 badge, title,
 * "Categoría · próxima fecha · frecuencia", tags and the amount in a pill (never cut, unlike MonAi).
 */
export default function RecurringScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { listId } = useCurrentList();
  const { data: items, error, reload } = useQuery(() => listRecurring(db, listId), [] as RecurringWithCategory[], [db, listId]);

  const stop = (r: RecurringWithCategory) => {
    Alert.alert('Dejar de repetir', `"${r.title || r.category_name || 'Este movimiento'}" ya no se agregará automáticamente. Los movimientos que ya se crearon se quedan.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Dejar de repetir', style: 'destructive', onPress: () => deleteRecurring(db, r.id) },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader title="Lista de transacciones recurrentes" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {error && <LoadError onRetry={reload} />}
        {items.length === 0 && !error && (
          <AppText size={14} color={colors.textMuted} style={styles.empty}>
            Al crear un movimiento, cambia "Una vez" por "Mensualmente" (u otra frecuencia) y aparecerá aquí. La app lo
            agregará sola en cada fecha.
          </AppText>
        )}
        {items.map((r) => {
          const tags = parseTags(r.tags);
          const frequency = REPEAT_OPTIONS.find((o) => o.value === r.frequency)?.label ?? r.frequency;
          return (
            <Pressable key={r.id} onPress={() => stop(r)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={[styles.bubble, { backgroundColor: r.category_color ?? colors.chip }]}>
                <AppText size={22}>{r.category_emoji ?? '❔'}</AppText>
                <View style={styles.badge}>
                  <Feather name="repeat" size={11} color={colors.text} />
                </View>
              </View>
              <View style={styles.texts}>
                <AppText weight="bold" size={16} numberOfLines={2}>
                  {r.title || r.category_name || 'Sin título'}
                </AppText>
                <AppText size={12} color={colors.textMuted}>
                  {r.category_name ?? 'Sin categoría'} · {shortDate(r.next_at)} · {frequency}
                </AppText>
                {tags.length > 0 && (
                  <View style={styles.tags}>
                    {tags.map((t) => (
                      <View key={t} style={styles.tag}>
                        <AppText size={11} color={colors.textMuted}>
                          #{t}
                        </AppText>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View style={styles.amount}>
                <AppText weight="bold" size={14} color={r.kind === 'income' ? colors.income : colors.text}>
                  {r.kind === 'income' ? '+' : '-'} {formatMoney(r.amount)}
                </AppText>
              </View>
            </Pressable>
          );
        })}
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
    paddingTop: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  pressed: {
    backgroundColor: colors.chip,
  },
  bubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.chip,
  },
  amount: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.chip,
  },
});
