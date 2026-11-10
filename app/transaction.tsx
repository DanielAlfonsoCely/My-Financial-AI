import { Feather } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, type HostInstance, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, type TextInputInstance, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { containsAmount, parseFreeText } from '../src/ai/localParser';
import { type CategorySuggestion, suggestLocally } from '../src/ai/categorizer';
import { loadAiContext, suggestCategory } from '../src/ai/pipeline';
import { AmountInput } from '../src/components/AmountInput';
import { AppText } from '../src/components/AppText';
import { CategoryChips } from '../src/components/CategoryChips';
import { IconButton } from '../src/components/IconButton';
import { type Anchor, PopoverMenu } from '../src/components/PopoverMenu';
import { TagEditor } from '../src/components/TagEditor';
import {
  createAiRule,
  deleteTransaction,
  getRecurring,
  getTransaction,
  listCategories,
  listTags,
  saveTransaction,
} from '../src/db/repo';
import type { Category, Kind, TransactionInput } from '../src/db/types';
import { useCurrentList } from '../src/hooks/useData';
import { useKeyboardInset } from '../src/hooks/useKeyboardInset';
import { checkBudgetAlerts } from '../src/lib/budgetAlert';
import { dayLabel, withCurrentTime } from '../src/lib/dates';
import { onCategoryCreated } from '../src/lib/events';
import { DEFAULT_CURRENCY, formatMoney } from '../src/lib/money';
import { REPEAT_OPTIONS, type Repeat, repeatLabel } from '../src/lib/recurrence';
import { parseTags } from '../src/lib/tags';
import { showToast } from '../src/lib/toast';
import { colors, fonts, radius } from '../src/theme';

type Params = { id?: string; kind?: string; categoryId?: string };

export default function TransactionScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<Params>();
  const editingId = typeof params.id === 'string' && params.id.length > 0 ? params.id : null;
  const { listId: currentListId, loaded: listLoaded } = useCurrentList();
  const keyboard = useKeyboardInset();

  const [listId, setListId] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>(params.kind === 'income' ? 'income' : 'expense');
  const [title, setTitle] = useState('');
  const [digits, setDigits] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(typeof params.categoryId === 'string' ? params.categoryId : null);
  const [date, setDate] = useState(() => new Date());
  const [repeat, setRepeat] = useState<Repeat>('once');
  const [tags, setTags] = useState<string[]>([]);
  const [recurringId, setRecurringId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [tagMode, setTagMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [repeatAnchor, setRepeatAnchor] = useState<Anchor | null>(null);

  // The category picked automatically (rule, history, dictionary or Gemini). If the user changes
  // it, we offer to remember the correction ("Mejoras de IA").
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const userPicked = useRef(typeof params.categoryId === 'string');
  // What the movement was when the sheet opened, to tell a new expense from an edited one.
  const original = useRef<{ kind: Kind; amount: number; categoryId: string | null } | null>(null);
  const repeatRef = useRef<HostInstance>(null);
  const amountRef = useRef<TextInputInstance>(null);

  // Which list: the transaction's own list when editing, otherwise the current one.
  useEffect(() => {
    if (editingId) {
      getTransaction(db, editingId).then(async (t) => {
        if (!t) {
          router.back();
          return;
        }
        // TODO(bloque C): la hoja todavía no edita transferencias; se abren como gasto hasta que exista el segmento Transferir.
        const shownKind: Kind = t.kind === 'income' ? 'income' : 'expense';
        original.current = { kind: shownKind, amount: t.amount, categoryId: t.category_id };
        setListId(t.list_id);
        setKind(shownKind);
        setTitle(t.title);
        setDigits(String(t.amount));
        setCategoryId(t.category_id);
        setDate(new Date(t.occurred_at));
        setTags(parseTags(t.tags));
        userPicked.current = true;
        // Voice entries were categorized by the AI: correcting them teaches it.
        if (t.source === 'voice' && t.category_id) setSuggestion({ categoryId: t.category_id, source: 'ai' });
        if (t.recurring_id) {
          const r = await getRecurring(db, t.recurring_id);
          if (r) {
            setRecurringId(r.id);
            setRepeat(r.frequency);
          }
        }
      });
    } else if (listLoaded) {
      setListId(currentListId);
    }
  }, [db, editingId, listLoaded, currentListId]);

  useEffect(() => {
    if (!listId) return;
    listCategories(db, listId).then(setCategories);
    listTags(db, listId).then((rows) => setKnownTags(rows.map((t) => t.name)));
  }, [db, listId]);

  // A category created from the "+" chip is selected right away.
  useEffect(
    () =>
      onCategoryCreated(async (id) => {
        if (!listId) return;
        setCategories(await listCategories(db, listId));
        userPicked.current = true;
        setCategoryId(id);
      }),
    [db, listId],
  );

  const ofKind = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind]);
  const amount = Number(digits || '0');
  const tint = kind === 'income' ? colors.income : colors.accent;
  const canSave = amount > 0 && !saving && listId !== null;

  // Local suggestion while typing (no network): rules, history and the keyword dictionary.
  useEffect(() => {
    if (!listId || userPicked.current || !title.trim()) return;
    const timer = setTimeout(async () => {
      const ctx = await loadAiContext(db, listId);
      const local = suggestLocally(title, kind, ctx.categories, ctx.rules, ctx.history);
      if (local && !userPicked.current) {
        setSuggestion(local);
        setCategoryId(local.categoryId);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [db, listId, title, kind]);

  const switchKind = (next: Kind) => {
    setKind(next);
    if (categories.find((c) => c.id === categoryId)?.kind !== next) {
      setCategoryId(null);
      setSuggestion(null);
      userPicked.current = false;
    }
  };

  /** When the title loses focus: read amounts typed in it, then ask Gemini if nothing local matched. */
  const onTitleBlur = async () => {
    if (!listId) return;
    let currentTitle = title;
    let currentKind = kind;
    if (!digits && containsAmount(title)) {
      const parsed = parseFreeText(title);
      // Only a clear single movement fills the form; anything doubtful stays as typed.
      if (parsed.confident && parsed.movements.length === 1) {
        const m = parsed.movements[0];
        currentTitle = m.title;
        currentKind = m.kind;
        setTitle(m.title);
        setDigits(String(m.amount));
        if (m.kind !== kind) switchKind(m.kind);
        if (m.occurredAt) setDate(new Date(m.occurredAt));
      }
    }
    const categoryFits = categoryId !== null && categories.find((c) => c.id === categoryId)?.kind === currentKind;
    if (userPicked.current || categoryFits || !currentTitle.trim()) return;
    const result = await suggestCategory(db, listId, currentTitle, currentKind, true);
    if (result && !userPicked.current) {
      setSuggestion(result);
      setCategoryId(result.categoryId);
    }
  };

  const pickCategory = (id: string) => {
    userPicked.current = true;
    setCategoryId(id);
  };

  const pickDate = () => {
    Keyboard.dismiss();
    DateTimePickerAndroid.open({
      value: date,
      mode: 'date',
      maximumDate: new Date(),
      onChange: (event, selected) => {
        if (event.type === 'set' && selected) setDate(withCurrentTime(selected, date));
      },
    });
  };

  const openRepeat = () => {
    Keyboard.dismiss();
    repeatRef.current?.measureInWindow((x, y, width, height) => setRepeatAnchor({ x, y, width, height }));
  };

  const finish = (input: TransactionInput) => {
    const category = categories.find((c) => c.id === input.category_id);
    showToast({
      kind: 'success',
      emoji: category?.emoji ?? (input.kind === 'income' ? '💵' : '🧾'),
      color: category?.color,
      title: category?.name ?? (input.title || 'Movimiento'),
      chip: `${input.kind === 'income' ? '+' : '-'} ${formatMoney(input.amount)}`,
    });
    router.back();
  };

  const save = async () => {
    if (!canSave || !listId) return;
    setSaving(true);
    const input: TransactionInput = {
      kind,
      amount,
      currency: DEFAULT_CURRENCY,
      category_id: categoryId,
      title: title.trim(),
      tags,
      occurred_at: date.getTime(),
    };
    try {
      // Movement, recurring template and tags are saved together, or not at all.
      const savedId = await saveTransaction(db, listId, { id: editingId, input, repeat, recurringId });
      const before = original.current;
      const alreadyCounted = before && before.kind === 'expense' && before.categoryId === input.category_id ? before.amount : 0;
      void checkBudgetAlerts(db, [{ id: savedId, alreadyCounted }]);
    } catch (error) {
      setSaving(false);
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : String(error));
      return;
    }

    // "Mejoras de IA": the user corrected an automatic category.
    const corrected = suggestion && categoryId && categoryId !== suggestion.categoryId && input.title;
    if (corrected) {
      const chosen = categories.find((c) => c.id === categoryId);
      Alert.alert(
        '¿Recordar esta corrección?',
        `La próxima vez que escribas algo parecido a "${input.title}", lo pondré en ${chosen?.emoji ?? ''} ${chosen?.name ?? 'esta categoría'}.`,
        [
          { text: 'No', style: 'cancel', onPress: () => finish(input) },
          {
            text: 'Recordar',
            onPress: async () => {
              try {
                await createAiRule(db, listId, input.title, categoryId);
              } catch {
                // The movement is already saved; a missing rule is not worth blocking the user.
              } finally {
                finish(input);
              }
            },
          },
        ],
        { cancelable: false },
      );
      return;
    }
    finish(input);
  };

  const remove = () => {
    if (!editingId) return;
    Alert.alert('Eliminar movimiento', '¿Seguro? Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(db, editingId);
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]} onLayout={keyboard.onLayout}>
      <View style={styles.header}>
        <View style={styles.segment}>
          {(['expense', 'income'] as const).map((k) => {
            const active = kind === k;
            const color = k === 'income' ? colors.income : colors.accent;
            return (
              <Pressable
                key={k}
                onPress={() => switchKind(k)}
                style={[styles.segmentItem, active && { backgroundColor: color }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <AppText weight="bold" size={14} color={active ? colors.surface : colors.textMuted}>
                  {k === 'expense' ? 'Gasto' : 'Ingreso'}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.headerRight}>
          {editingId && (
            <IconButton icon="trash-2" label="Eliminar" color={colors.danger} background={colors.surface} style={styles.softShadow} onPress={remove} />
          )}
          <IconButton icon="x" label="Cerrar" background={colors.surface} style={styles.softShadow} onPress={() => router.back()} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.metaRow}>
          <Pressable onPress={pickDate} style={styles.metaChip}>
            <AppText weight="semibold" size={13}>
              {dayLabel(date).toLowerCase()}
            </AppText>
            <Feather name="chevron-down" size={14} color={colors.text} />
          </Pressable>
          <Pressable ref={repeatRef} onPress={openRepeat} style={styles.metaChip}>
            {repeat !== 'once' && <Feather name="repeat" size={12} color={colors.text} />}
            <AppText weight="semibold" size={13}>
              {repeatLabel(repeat)}
            </AppText>
            <Feather name="chevron-down" size={14} color={colors.text} />
          </Pressable>
        </View>

        <TextInput
          value={title}
          onChangeText={setTitle}
          onBlur={onTitleBlur}
          onSubmitEditing={() => amountRef.current?.focus()}
          placeholder={kind === 'expense' ? '¿En qué gastaste?' : '¿De dónde vino?'}
          placeholderTextColor={colors.textFaint}
          autoFocus={!editingId}
          multiline={false}
          maxLength={80}
          returnKeyType="next"
          blurOnSubmit={false}
          style={styles.title}
        />

        <AmountInput ref={amountRef} digits={digits} onChangeDigits={setDigits} color={tint} onSubmitEditing={() => Keyboard.dismiss()} />

        <CategoryChips
          categories={ofKind}
          selectedId={categoryId}
          expanded={expanded || !categoryId}
          onToggle={() => setExpanded(true)}
          onSelect={pickCategory}
          onAdd={() => router.push({ pathname: '/category', params: { kind, listId: listId ?? '' } })}
        />

        {!tagMode && tags.length > 0 && (
          <Pressable onPress={() => setTagMode(true)} style={styles.tagsPreview}>
            {tags.map((t) => (
              <View key={t} style={styles.tagChip}>
                <AppText weight="semibold" size={12} color={colors.textMuted}>
                  #{t}
                </AppText>
              </View>
            ))}
          </Pressable>
        )}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: keyboard.inset > 0 ? 12 : insets.bottom + 12 }]}>
        {tagMode ? (
          <TagEditor tags={tags} onChange={setTags} known={knownTags} onDone={() => setTagMode(false)} />
        ) : (
          <View style={styles.actions}>
            <Pressable onPress={() => setTagMode(true)} style={styles.hash} accessibilityLabel="Etiquetas">
              <AppText weight="bold" size={22}>
                #
              </AppText>
            </Pressable>
            <Pressable onPress={save} disabled={!canSave} style={[styles.saveButton, !canSave && styles.disabled]}>
              <Feather name="check" size={20} color={colors.surface} />
              <AppText weight="bold" size={17} color={colors.surface}>
                Guardar
              </AppText>
            </Pressable>
          </View>
        )}
      </View>
      <View style={{ height: keyboard.inset }} />

      <PopoverMenu
        anchor={repeatAnchor}
        onClose={() => setRepeatAnchor(null)}
        items={REPEAT_OPTIONS.map((o) => ({
          key: o.value,
          label: o.label,
          checked: o.value === repeat,
          onPress: () => setRepeat(o.value),
        }))}
      />
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
  headerRight: {
    flexDirection: 'row',
    gap: 10,
  },
  softShadow: {
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.chip,
    borderRadius: radius.pill,
    padding: 3,
  },
  segmentItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 14,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.chip,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    color: colors.text,
    padding: 0,
    includeFontPadding: false,
  },
  tagsPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.chip,
  },
  bottom: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  hash: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: '#2C2C2E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disabled: {
    opacity: 0.35,
  },
});
