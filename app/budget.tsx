import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountInput } from '../src/components/AmountInput';
import { AppText } from '../src/components/AppText';
import { IconButton } from '../src/components/IconButton';
import { headerButtonShadow } from '../src/components/ScreenHeader';
import { getCategory, listBudgets, setBudget, updateCategory } from '../src/db/repo';
import type { Category } from '../src/db/types';
import { useKeyboardInset } from '../src/hooks/useKeyboardInset';
import { categoryPalette, colors } from '../src/theme';

/**
 * Edit one budget (TikTok/04): ✕ on the left, ✓ in a yellow-green circle on the right, the category
 * name, its emoji in a colored square, "Cambiar color del presupuesto" and the amount.
 */
export default function BudgetScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const [category, setCategory] = useState<Category | null>(null);
  const [color, setColor] = useState<string>(categoryPalette[0]);
  const [digits, setDigits] = useState('');

  useEffect(() => {
    if (!categoryId) return;
    getCategory(db, categoryId).then(async (c) => {
      if (!c) {
        router.back();
        return;
      }
      setCategory(c);
      setColor(c.color);
      const budget = (await listBudgets(db, c.list_id)).find((b) => b.category_id === c.id);
      if (budget) setDigits(String(budget.amount));
    });
  }, [db, categoryId]);

  const save = async () => {
    if (!category) return;
    try {
      await setBudget(db, category.list_id, category.id, Number(digits || '0'));
      if (color !== category.color) {
        await updateCategory(db, category.id, { name: category.name, emoji: category.emoji, color, kind: category.kind });
      }
      router.back();
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]} onLayout={keyboard.onLayout}>
      <View style={styles.header}>
        <IconButton icon="x" label="Cerrar" background={colors.surface} style={headerButtonShadow} onPress={() => router.back()} />
        <Pressable onPress={save} style={styles.confirm} accessibilityLabel="Guardar">
          <Feather name="check" size={20} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <AppText weight="bold" size={17}>
          {category?.name ?? ''}
        </AppText>
        <View style={[styles.tile, { backgroundColor: color }]}>
          <AppText size={40}>{category?.emoji ?? ''}</AppText>
        </View>

        <AppText weight="semibold" size={13} color={colors.textMuted}>
          Cambiar color del presupuesto
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colors}>
          {categoryPalette.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)} style={[styles.ring, c === color && styles.ringActive]}>
              <View style={[styles.dot, { backgroundColor: c }]} />
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.amount}>
          <AmountInput digits={digits} onChangeDigits={setDigits} color={colors.text} size={44} placeholder="$0" autoFocus onSubmitEditing={save} />
        </View>
        <AppText size={12} color={colors.textMuted} style={styles.center}>
          Presupuesto mensual. Déjalo en $0 para quitarlo.
        </AppText>
      </ScrollView>
      <View style={{ height: keyboard.inset }} />
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  confirm: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F07A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  tile: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colors: {
    gap: 6,
    paddingHorizontal: 20,
  },
  ring: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringActive: {
    borderColor: colors.text,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  amount: {
    marginTop: 12,
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
});
