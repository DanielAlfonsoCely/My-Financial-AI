import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { IconButton } from '../src/components/IconButton';
import { NumPad } from '../src/components/NumPad';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listCategories,
  updateTransaction,
} from '../src/db/repo';
import type { Category, Kind } from '../src/db/types';
import { dayLabel, withCurrentTime } from '../src/lib/dates';
import { DEFAULT_CURRENCY, formatAmount } from '../src/lib/money';
import { colors, fonts, radius } from '../src/theme';

export default function TransactionScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = typeof id === 'string' && id.length > 0;

  const [kind, setKind] = useState<Kind>('expense');
  const [digits, setDigits] = useState('');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date());
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listCategories(db).then(setCategories);
  }, [db]);

  useEffect(() => {
    if (!editing) return;
    getTransaction(db, id).then((t) => {
      if (!t) {
        router.back();
        return;
      }
      setKind(t.kind);
      setDigits(String(t.amount));
      setTitle(t.title);
      setCategoryId(t.category_id);
      setDate(new Date(t.occurred_at));
    });
  }, [db, editing, id]);

  const visibleCategories = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind]);
  const amount = Number(digits || '0');
  const canSave = amount > 0 && !saving;

  const switchKind = (next: Kind) => {
    setKind(next);
    // A category of the other kind does not make sense anymore.
    if (categories.find((c) => c.id === categoryId)?.kind !== next) setCategoryId(null);
  };

  const pickDate = () => {
    DateTimePickerAndroid.open({
      value: date,
      mode: 'date',
      maximumDate: new Date(),
      onChange: (event, selected) => {
        if (event.type === 'set' && selected) setDate(withCurrentTime(selected, date));
      },
    });
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const input = {
      kind,
      amount,
      currency: DEFAULT_CURRENCY,
      category_id: categoryId,
      title,
      occurred_at: date.getTime(),
    };
    try {
      if (editing) await updateTransaction(db, id, input);
      else await createTransaction(db, input);
      router.back();
    } catch (error) {
      setSaving(false);
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : String(error));
    }
  };

  const remove = () => {
    if (!editing) return;
    Alert.alert('Eliminar movimiento', '¿Seguro? Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(db, id);
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.header}>
        <IconButton icon="x" label="Cerrar" background={colors.chip} onPress={() => router.back()} />
        <View style={styles.segment}>
          {(['expense', 'income'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => switchKind(k)}
              style={[styles.segmentItem, kind === k && styles.segmentActive]}
            >
              <AppText weight="bold" size={13} color={kind === k ? colors.text : colors.textMuted}>
                {k === 'expense' ? 'Gasto' : 'Ingreso'}
              </AppText>
            </Pressable>
          ))}
        </View>
        <IconButton
          icon="check"
          label="Guardar"
          color={colors.surface}
          background={canSave ? colors.accent : colors.textFaint}
          onPress={save}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.amountRow}>
          <AppText weight="extrabold" size={48} color={amount > 0 ? colors.text : colors.textFaint} numberOfLines={1} adjustsFontSizeToFit>
            ${formatAmount(amount)}
          </AppText>
          <AppText weight="semibold" size={16} color={colors.textMuted} style={styles.currency}>
            {DEFAULT_CURRENCY}
          </AppText>
        </View>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={kind === 'expense' ? '¿En qué? (ej. Almuerzo)' : '¿De dónde? (ej. Nómina)'}
          placeholderTextColor={colors.textFaint}
          style={styles.titleInput}
          maxLength={80}
          returnKeyType="done"
        />

        <View style={styles.chips}>
          {visibleCategories.map((c) => {
            const selected = c.id === categoryId;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategoryId(selected ? null : c.id)}
                style={[
                  styles.chip,
                  { backgroundColor: selected ? c.color : colors.surface },
                  selected && styles.chipSelected,
                ]}
              >
                <AppText size={14}>{c.emoji}</AppText>
                <AppText weight="semibold" size={13}>
                  {c.name}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.metaRow}>
          <Pressable onPress={pickDate} style={styles.dateChip}>
            <AppText weight="semibold" size={13}>
              📅 {dayLabel(date)}
            </AppText>
          </Pressable>
          {editing && (
            <Pressable onPress={remove} hitSlop={8}>
              <AppText weight="semibold" size={13} color={colors.danger}>
                Eliminar
              </AppText>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <NumPad value={digits} onChange={setDigits} />
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
    paddingHorizontal: 16,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.chip,
    borderRadius: radius.pill,
    padding: 3,
  },
  segmentItem: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  segmentActive: {
    backgroundColor: colors.surface,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 16,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  currency: {
    marginBottom: 8,
  },
  titleInput: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: colors.text,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    borderColor: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.chip,
  },
});
