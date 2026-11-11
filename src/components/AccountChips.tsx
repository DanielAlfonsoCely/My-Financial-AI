import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { AccountWithBalance } from '../db/types';
import { colors, radius } from '../theme';
import { AppText } from './AppText';

interface Props {
  /** "Sale de", "Entra a". */
  label: string;
  accounts: AccountWithBalance[];
  selectedId: string | null;
  /** null = the user unselected the account ("sin cuenta"). Only called with null when `optional`. */
  onSelect: (id: string | null) => void;
  /** Tapping the selected chip again leaves the movement without account. */
  optional?: boolean;
  /** Account that cannot be picked here (the other side of a transfer). */
  excludeId?: string | null;
  onAdd?: () => void;
}

/** A labeled row of account chips for the movement sheet. The selected one goes first. */
export function AccountChips({ label, accounts, selectedId, onSelect, optional, excludeId, onAdd }: Props) {
  const available = accounts.filter((a) => a.id !== excludeId);
  const selected = available.find((a) => a.id === selectedId) ?? null;
  const ordered = selected ? [selected, ...available.filter((a) => a.id !== selected.id)] : available;

  return (
    <View style={styles.block}>
      <AppText weight="semibold" size={12} color={colors.textMuted}>
        {label}
      </AppText>
      <View style={styles.bleed}>
        <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {ordered.map((a) => {
            const isSelected = a.id === selectedId;
            return (
              <Pressable
                key={a.id}
                onPress={() => onSelect(isSelected && optional ? null : a.id)}
                style={[styles.chip, isSelected ? styles.chipSelected : styles.chipIdle]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <AppText size={16}>{a.emoji}</AppText>
                <AppText weight="bold" size={14}>
                  {a.name}
                </AppText>
              </Pressable>
            );
          })}
          {onAdd && (
            <Pressable onPress={onAdd} style={[styles.chip, styles.add]} accessibilityLabel="Nueva cuenta">
              <Feather name="plus" size={16} color={colors.text} />
              {ordered.length === 0 && (
                <AppText weight="bold" size={14}>
                  Crear cuenta
                </AppText>
              )}
            </Pressable>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 6,
  },
  // The row scrolls edge to edge even though the sheet has side padding.
  bleed: {
    marginHorizontal: -24,
  },
  row: {
    paddingHorizontal: 24,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 2,
  },
  chipIdle: {
    borderColor: 'transparent',
    backgroundColor: colors.chip,
  },
  chipSelected: {
    borderColor: colors.text,
    backgroundColor: colors.surface,
  },
  add: {
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
});
