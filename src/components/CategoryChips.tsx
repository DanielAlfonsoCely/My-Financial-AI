import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Category } from '../db/types';
import { colors, radius } from '../theme';
import { AppText } from './AppText';

interface Props {
  categories: Category[];
  selectedId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

/**
 * Category of the transaction sheet, like MonAi:
 * - collapsed: one bordered chip with the suggested/selected category and "›" (Video Yt/09);
 * - expanded: a horizontal row with "+" and every category, the selected one with a dark border (Video Yt/13).
 */
export function CategoryChips({ categories, selectedId, expanded, onToggle, onSelect, onAdd }: Props) {
  const selected = categories.find((c) => c.id === selectedId) ?? null;

  if (!expanded) {
    return (
      <Pressable onPress={onToggle} style={[styles.chip, styles.chipSelected, !selected && styles.chipEmpty]}>
        {selected && <AppText size={20}>{selected.emoji}</AppText>}
        <AppText weight="bold" size={16} color={selected ? colors.text : colors.textMuted}>
          {selected ? selected.name : 'Elegir categoría'}
        </AppText>
        <Feather name="chevron-right" size={18} color={selected ? colors.text : colors.textMuted} />
      </Pressable>
    );
  }

  // Selected first, so it is visible without scrolling.
  const ordered = selected ? [selected, ...categories.filter((c) => c.id !== selected.id)] : categories;

  return (
    <View style={styles.bleed}>
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Pressable onPress={onAdd} style={styles.add} accessibilityLabel="Nueva categoría">
          <Feather name="plus" size={22} color={colors.text} />
        </Pressable>
        {ordered.map((c) => {
          const isSelected = c.id === selectedId;
          return (
            <Pressable key={c.id} onPress={() => onSelect(c.id)} style={[styles.chip, isSelected ? styles.chipSelected : styles.chipIdle]}>
              <AppText size={20}>{c.emoji}</AppText>
              <AppText weight="bold" size={16}>
                {c.name}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bleed: {
    marginHorizontal: -24,
  },
  row: {
    gap: 8,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderWidth: 2,
    borderColor: colors.text,
  },
  chipEmpty: {
    borderColor: colors.textFaint,
  },
  chipIdle: {
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  add: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
