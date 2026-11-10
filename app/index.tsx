import { Feather } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type HostInstance, Pressable, SectionList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountsPanel } from '../src/components/accounts/AccountsPanel';
import { AppText } from '../src/components/AppText';
import { type BarPress, CategoryBars, EmptyBars } from '../src/components/CategoryBars';
import { DefaultPeriodSheet } from '../src/components/home/DefaultPeriodSheet';
import { PeriodStrip, type StripItem } from '../src/components/home/PeriodStrip';
import { RangeSheet } from '../src/components/home/RangeSheet';
import { SearchBar, type SearchQuery } from '../src/components/home/SearchBar';
import { IconButton } from '../src/components/IconButton';
import { Pager } from '../src/components/Pager';
import { type Anchor, type MenuItem, PopoverMenu } from '../src/components/PopoverMenu';
import { TransactionRow } from '../src/components/TransactionRow';
import {
  getSetting,
  materializeRecurring,
  setSetting,
  SETTING_CURRENT_LIST,
  SETTING_ONBOARDING_DONE,
  SETTING_PERIOD_START_DAY,
} from '../src/db/repo';
import type { Kind, TransactionAmount, TransactionWithCategory } from '../src/db/types';
import { listLabel, useCurrentList, useQuery } from '../src/hooks/useData';
import { type CategoryTotal, sumRange, useAmountIndex, useHomeSettings, usePeriodData } from '../src/hooks/useHomeData';
import { useKeyboardInset } from '../src/hooks/useKeyboardInset';
import { dayLabel, startOfDay } from '../src/lib/dates';
import { formatAmount, formatCompact, formatMoney } from '../src/lib/money';
import {
  currentMonthPeriod,
  monthPeriodLabel,
  monthStartFor,
  type Period,
  periodRange,
  rangeLabel,
  shiftMonth,
} from '../src/lib/period';
import { parseTags } from '../src/lib/tags';
import { matchesAllWords } from '../src/lib/text';
import { colors, radius } from '../src/theme';
import { LoadError } from '../src/components/LoadError';
import { useToday } from '../src/hooks/useToday';

interface DaySection {
  title: string;
  total: number;
  data: TransactionWithCategory[];
}

function groupByDay(transactions: TransactionWithCategory[], now: Date): DaySection[] {
  const sections: DaySection[] = [];
  let currentKey = -1;
  for (const t of transactions) {
    const day = startOfDay(new Date(t.occurred_at));
    if (day.getTime() !== currentKey) {
      currentKey = day.getTime();
      sections.push({ title: dayLabel(day, now).toLowerCase(), total: 0, data: [] });
    }
    const section = sections[sections.length - 1];
    section.data.push(t);
    // A transfer is listed on its day but is not part of the day's total.
    if (t.kind !== 'transfer') section.total += t.kind === 'income' ? t.amount : -t.amount;
  }
  return sections;
}

function signedMoney(value: number): string {
  return `${value < 0 ? '-' : ''}${formatMoney(Math.abs(value))}`;
}

/** Text, categories and tags combined (Video Yt/25–26). Every word and every tag must match. */
function matchesSearch(t: TransactionWithCategory, query: SearchQuery): boolean {
  const tags = parseTags(t.tags);
  if (!query.tags.every((tag) => tags.includes(tag))) return false;
  const text = query.text.trim();
  if (!text) return true;
  return matchesAllWords(`${t.title} ${t.category_name ?? ''} ${t.account_name ?? ''} ${t.to_account_name ?? ''} ${tags.join(' ')}`, text);
}

/** Measures a view on screen so a PopoverMenu can open right under it. */
function useAnchor() {
  const ref = useRef<HostInstance>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = () => ref.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  return { ref, anchor, open, setAnchor, close: () => setAnchor(null) };
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const onboarding = useQuery(() => getSetting(db, SETTING_ONBOARDING_DONE), null as string | null, [db]);

  // Recurring transactions are created when the app opens and every time it comes back.
  useEffect(() => {
    materializeRecurring(db).catch(() => undefined);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') materializeRecurring(db).catch(() => undefined);
    });
    return () => sub.remove();
  }, [db]);

  if (onboarding.loaded && onboarding.data !== 'true') return <Redirect href="/onboarding" />;

  return (
    <View style={styles.screen}>
      <Pager width={width} pages={[<HomePage key="home" width={width} />, <AccountsPanel key="accounts" width={width} />]} onPageChange={setPage} />
      {/* Two dots so it is obvious there is a second panel to the right. */}
      <View style={[styles.pageDots, { top: insets.top + 26 }]} pointerEvents="none">
        {[0, 1].map((i) => (
          <View key={i} style={[styles.pageDot, page === i && styles.pageDotActive]} />
        ))}
      </View>
    </View>
  );
}

type KindFilter = 'all' | Kind;
const KIND_FILTER_LABEL: Record<KindFilter, string> = { all: 'Ingresos y gastos', expense: 'Solo gastos', income: 'Solo ingresos' };

function HomePage({ width }: { width: number }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const settings = useHomeSettings();
  const { listId, list, lists } = useCurrentList();
  const amounts = useAmountIndex(listId);
  // Renders again when the day changes, so "este mes", "hoy" and "ayer" never stay on yesterday.
  const today = useToday();

  // null = default period (the current month, starting on the chosen day).
  const [period, setPeriod] = useState<Period | null>(null);
  const [kind, setKind] = useState<Kind>('expense');
  // undefined = no filter, null = "sin categoría", string = category id
  const [categoryFilter, setCategoryFilter] = useState<string | null | undefined>(undefined);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [search, setSearch] = useState<SearchQuery | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [barMenu, setBarMenu] = useState<{ anchor: Anchor; item: CategoryTotal } | null>(null);
  const periodMenu = useAnchor();
  const listMenu = useAnchor();
  const kindMenu = useAnchor();

  // Switching lists starts clean.
  useEffect(() => {
    setCategoryFilter(undefined);
    setSearch(null);
  }, [listId]);

  const effective = period ?? currentMonthPeriod(settings.startDay);
  const range = periodRange(effective);
  const isMonth = effective.mode === 'month';
  const data = usePeriodData(listId, range, isMonth);

  const activeKind: Kind = settings.showIncome ? kind : 'expense';
  const bars = data.byCategory[activeKind];
  const kindTotal = activeKind === 'income' ? data.incomeTotal : data.expenseTotal;
  const selectedBar = categoryFilter === undefined ? undefined : bars.find((b) => b.categoryId === categoryFilter);
  const searching = search !== null;

  // ---- Headline ----
  const searchResults = useMemo(() => {
    if (!search) return [];
    return data.transactions.filter(
      (t) => (kindFilter === 'all' || t.kind === kindFilter) && matchesSearch(t, search),
    );
  }, [data.transactions, search, kindFilter]);

  let headline: number;
  let positive: boolean;
  if (searching) {
    const expense = searchResults.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
    const income = searchResults.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
    const net = kindFilter === 'income' ? income : kindFilter === 'expense' ? -expense : income - expense;
    headline = Math.abs(net);
    positive = net > 0;
  } else if (selectedBar) {
    // Selecting a column shows that category's total, like MonAi (TikTok/19).
    headline = selectedBar.total;
    positive = activeKind === 'income';
  } else if (settings.showIncome) {
    // "Acumulado": everything up to the end of the period, not only the period.
    const balance = settings.accumulated
      ? sumRange(amounts, 0, range ? range[1] : Number.MAX_SAFE_INTEGER).balance
      : data.incomeTotal - data.expenseTotal;
    headline = Math.abs(balance);
    positive = balance >= 0;
  } else {
    headline = data.expenseTotal;
    positive = false;
  }
  const neutral = !settings.showIncome && !selectedBar && !searching;
  const signColor = neutral ? colors.textFaint : positive ? colors.income : colors.accent;

  // ---- Budget line: "$218.650 sobre presupuesto" (TikTok/12) ----
  const budgetLine = useMemo(() => {
    if (!isMonth || searching || activeKind !== 'expense') return null;
    const withBudget = data.byCategory.expense.filter((c) => (c.budget ?? 0) > 0);
    if (withBudget.length === 0) return null;
    const over = withBudget.reduce((s, c) => s + Math.max(0, c.total - (c.budget ?? 0)), 0);
    if (over > 0) return { amount: over, text: 'sobre presupuesto', danger: true };
    const left = withBudget.reduce((s, c) => s + Math.max(0, (c.budget ?? 0) - c.total), 0);
    return { amount: left, text: 'restante del presupuesto', danger: false };
  }, [isMonth, searching, activeKind, data.byCategory.expense]);

  const changePeriod = (next: Period | null) => {
    setCategoryFilter(undefined);
    setPeriod(next);
  };

  const changeKind = (next: Kind) => {
    setCategoryFilter(undefined);
    setKind(next);
  };

  const sections = useMemo(() => {
    const now = new Date(today);
    if (searching) return groupByDay(searchResults, now);
    const filtered =
      categoryFilter === undefined
        ? data.transactions
        : data.transactions.filter((t) => t.kind === activeKind && t.category_id === categoryFilter);
    return groupByDay(filtered, now);
  }, [searching, searchResults, data.transactions, categoryFilter, activeKind, today]);

  const strip = useMemo(
    () => buildStrip(period, amounts, settings.startDay, settings.showIncome, changePeriod, () => setRangeOpen(true)),
    // changePeriod only touches state setters. `today`: the strip ends in the current month.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period, amounts, settings.startDay, settings.showIncome, today],
  );

  // ---- Menus ----
  const periodItems: MenuItem[] = [
    {
      key: 'month',
      label: 'Mes',
      icon: 'calendar',
      checked: isMonth,
      onPress: () => changePeriod(isMonth ? effective : currentMonthPeriod(settings.startDay)),
    },
    {
      key: 'year',
      label: 'Año',
      icon: 'grid',
      checked: effective.mode === 'year',
      onPress: () => changePeriod({ mode: 'year', year: new Date(range?.[0] ?? Date.now()).getFullYear() }),
    },
    { key: 'all', label: 'Todo el tiempo', icon: 'repeat', checked: effective.mode === 'all', onPress: () => changePeriod({ mode: 'all' }) },
    { key: 'range', label: 'Rango personalizado…', icon: 'calendar', checked: effective.mode === 'range', onPress: () => setRangeOpen(true) },
    { key: 'default', label: 'Cambiar período predeterminado', icon: 'sliders', separated: true, onPress: () => setDefaultOpen(true) },
  ];

  const listItems: MenuItem[] = lists.map((l) => ({
    key: l.id,
    label: listLabel(l),
    checked: l.id === listId,
    onPress: () => {
      changePeriod(null);
      setSetting(db, SETTING_CURRENT_LIST, l.id);
    },
  }));

  const listFooter = (
    <View style={styles.listActions}>
      <Pressable
        style={styles.listAction}
        onPress={() => {
          listMenu.close();
          router.push('/lists');
        }}
      >
        <Feather name="edit-2" size={18} color={colors.text} />
        <AppText weight="semibold" size={13}>
          Editar
        </AppText>
      </Pressable>
      <Pressable
        style={styles.listAction}
        onPress={() => {
          listMenu.close();
          router.push('/list-edit');
        }}
      >
        <Feather name="plus" size={18} color={colors.text} />
        <AppText weight="semibold" size={13}>
          Nueva
        </AppText>
      </Pressable>
    </View>
  );

  const kindItems: MenuItem[] = (['all', 'expense', 'income'] as const).map((k) => ({
    key: k,
    label: KIND_FILTER_LABEL[k],
    checked: kindFilter === k,
    onPress: () => setKindFilter(k),
  }));

  const openBarMenu = ({ item, pageX, pageY }: BarPress) => {
    if (!item.categoryId) return;
    // Opens above the finger, like MonAi.
    setBarMenu({ anchor: { x: pageX - 110, y: pageY - 170, width: 0, height: 0 }, item });
  };

  const barMenuItems: MenuItem[] = barMenu
    ? [
        {
          key: 'budget',
          label: barMenu.item.budget ? 'Editar presupuesto' : 'Añadir presupuesto',
          icon: 'arrow-up',
          subtitle: barMenu.item.budget
            ? barMenu.item.total > barMenu.item.budget
              ? `$${formatCompact(barMenu.item.total - barMenu.item.budget)} excedido`
              : `$${formatCompact(barMenu.item.budget - barMenu.item.total)} restante`
            : `${formatMoney(barMenu.item.total)} este mes`,
          onPress: () => router.push({ pathname: '/budget', params: { categoryId: barMenu.item.categoryId ?? '' } }),
        },
        {
          key: 'new',
          label: 'Nueva transacción',
          icon: 'arrow-down',
          onPress: () =>
            router.push({ pathname: '/transaction', params: { categoryId: barMenu.item.categoryId ?? '', kind: barMenu.item.kind } }),
        },
      ]
    : [];

  // ---- Header ----
  const header = (
    <View>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable ref={listMenu.ref} onPress={listMenu.open} style={styles.listChip} hitSlop={6}>
          <AppText weight="bold" size={15} numberOfLines={1} style={styles.listName}>
            {listLabel(list)}
          </AppText>
          <Feather name="chevron-down" size={16} color={colors.text} />
        </Pressable>
        <View style={styles.topIcons}>
          <View ref={periodMenu.ref} collapsable={false}>
            <IconButton icon="calendar" label="Período" background={colors.surface} style={styles.softShadow} onPress={periodMenu.open} />
            {period !== null && (
              <Pressable style={styles.clearBadge} onPress={() => changePeriod(null)} hitSlop={8} accessibilityLabel="Volver al período actual">
                <Feather name="x" size={10} color={colors.surface} />
              </Pressable>
            )}
          </View>
          <IconButton icon="settings" label="Configuración" background={colors.surface} style={styles.softShadow} onPress={() => router.push('/settings')} />
        </View>
      </View>

      {strip.length > 0 && (
        <View style={styles.strip}>
          <PeriodStrip items={strip} />
        </View>
      )}

      <View style={styles.totals}>
        {budgetLine && !selectedBar && (
          <AppText size={12} color={colors.textMuted}>
            <AppText weight="bold" size={12} color={budgetLine.danger ? colors.danger : colors.textMuted}>
              {formatMoney(budgetLine.amount)}
            </AppText>{' '}
            {budgetLine.text}
          </AppText>
        )}
        {selectedBar && (
          <AppText weight="semibold" size={13} color={colors.textMuted}>
            {selectedBar.emoji} {selectedBar.name}
            {selectedBar.budget ? ` · ${Math.round((selectedBar.total / selectedBar.budget) * 100)}% de ${formatMoney(selectedBar.budget)}` : ''}
          </AppText>
        )}
        <View style={styles.totalRow}>
          <View style={[styles.signDot, { backgroundColor: signColor }]}>
            <Feather name={positive ? 'plus' : 'minus'} size={14} color={colors.surface} />
          </View>
          <AppText weight="extrabold" size={58} style={styles.totalNumber} adjustsFontSizeToFit numberOfLines={1}>
            {formatAmount(headline)}
          </AppText>
          <AppText weight="semibold" size={24} color={colors.textMuted} style={styles.currency}>
            $
          </AppText>
        </View>

        {searching ? (
          <Pressable ref={kindMenu.ref} onPress={kindMenu.open} style={styles.filterChip}>
            <AppText weight="semibold" size={13}>
              {KIND_FILTER_LABEL[kindFilter]}
            </AppText>
            <Feather name="chevron-down" size={14} color={colors.text} />
          </Pressable>
        ) : (
          settings.showIncome && (
            <View style={styles.kinds}>
              <KindToggle kind="expense" amount={data.expenseTotal} selected={activeKind === 'expense'} onPress={() => changeKind('expense')} />
              <KindToggle kind="income" amount={data.incomeTotal} selected={activeKind === 'income'} onPress={() => changeKind('income')} />
            </View>
          )
        )}
      </View>

      {!searching && (
        <View style={styles.bars}>
          {data.loading ? null : kindTotal === 0 && !bars.some((b) => (b.budget ?? 0) > 0) ? (
            <EmptyBars />
          ) : (
            <CategoryBars items={bars} selectedId={categoryFilter} onSelect={setCategoryFilter} onLongPress={openBarMenu} />
          )}
        </View>
      )}
    </View>
  );

  const empty = data.error ? (
    <LoadError onRetry={data.reload} />
  ) : searching && !data.loading ? (
      <AppText size={14} color={colors.textMuted} style={styles.emptySearch}>
        No hay movimientos que coincidan en este período.
      </AppText>
    ) : null;

  return (
    <View style={{ width, flex: 1 }} onLayout={keyboard.onLayout}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty ?? undefined}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <View style={styles.dayPill}>
              <AppText weight="semibold" size={12} color={colors.textMuted}>
                {section.title}
              </AppText>
            </View>
            <AppText size={13} color={colors.textMuted}>
              {signedMoney(section.total)}
            </AppText>
          </View>
        )}
        renderItem={({ item }) => (
          <TransactionRow transaction={item} onPress={() => router.push({ pathname: '/transaction', params: { id: item.id } })} />
        )}
      />

      <View
        style={[styles.bottomBar, { paddingBottom: keyboard.inset > 0 ? keyboard.inset + 12 : insets.bottom + 16 }]}
        pointerEvents="box-none"
      >
        {searching ? (
          <View style={styles.searchWrap}>
            <SearchBar query={search} onChange={setSearch} onClose={() => setSearch(null)} />
          </View>
        ) : (
          <>
            <View style={[styles.actions, styles.shadow]}>
              <IconButton icon="plus" label="Nuevo movimiento" size={24} diameter={48} onPress={() => router.push('/transaction')} />
              <IconButton icon="message-square" label="Chat" size={21} diameter={48} onPress={() => router.push('/chat')} />
              <IconButton
                icon="search"
                label="Buscar"
                size={21}
                diameter={48}
                onPress={() => {
                  setCategoryFilter(undefined);
                  setKindFilter('all');
                  setSearch({ text: '', tags: [] });
                }}
              />
            </View>
            <IconButton
              icon="mic"
              label="Entrada por voz"
              size={28}
              diameter={72}
              color={colors.surface}
              background={colors.accent}
              style={styles.shadow}
              onPress={() => router.push('/voice')}
            />
          </>
        )}
      </View>

      <PopoverMenu anchor={periodMenu.anchor} onClose={periodMenu.close} items={periodItems} align="right" />
      <PopoverMenu anchor={listMenu.anchor} onClose={listMenu.close} items={listItems} footer={listFooter} />
      <PopoverMenu anchor={kindMenu.anchor} onClose={kindMenu.close} items={kindItems} />
      <PopoverMenu anchor={barMenu?.anchor ?? null} onClose={() => setBarMenu(null)} items={barMenuItems} />
      <RangeSheet
        visible={rangeOpen}
        onClose={() => setRangeOpen(false)}
        onApply={(start, end) => {
          setRangeOpen(false);
          changePeriod({ mode: 'range', start, end });
        }}
      />
      <DefaultPeriodSheet
        visible={defaultOpen}
        startDay={settings.startDay}
        amounts={amounts}
        onClose={() => setDefaultOpen(false)}
        onApply={(day) => {
          changePeriod(null);
          setSetting(db, SETTING_PERIOD_START_DAY, String(day));
        }}
      />
    </View>
  );
}

function KindToggle({ kind, amount, selected, onPress }: { kind: Kind; amount: number; selected: boolean; onPress: () => void }) {
  const isIncome = kind === 'income';
  const tint = isIncome ? colors.income : colors.accent;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.kind, selected && { backgroundColor: isIncome ? colors.incomeSoft : colors.accentSoft }]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={isIncome ? 'Ver ingresos' : 'Ver gastos'}
    >
      <View style={[styles.kindDot, { backgroundColor: tint }]}>
        <Feather name={isIncome ? 'plus' : 'minus'} size={10} color={colors.surface} />
      </View>
      <AppText weight="bold" size={16} color={selected ? tint : colors.text}>
        {formatAmount(amount)}
      </AppText>
    </Pressable>
  );
}

/** Items of the month or year strip for the current filter. Empty when no filter is active. */
function buildStrip(
  period: Period | null,
  amounts: TransactionAmount[],
  startDay: number,
  showIncome: boolean,
  select: (p: Period) => void,
  openRange: () => void,
): StripItem[] {
  if (!period) return [];
  const value = (start: number, end: number) => {
    const sums = sumRange(amounts, start, end);
    return signedMoney(showIncome ? sums.balance : -sums.expense);
  };
  const now = new Date();
  const earliest = amounts.length > 0 ? new Date(amounts[0].occurred_at) : now;

  if (period.mode === 'month') {
    const current = monthStartFor(now, startDay);
    // At least the last 12 months, and back to the first transaction.
    let first = shiftMonth(current, -11);
    const firstData = monthStartFor(earliest, startDay);
    if (firstData.getTime() < first.getTime()) first = firstData;
    const items: StripItem[] = [];
    for (let m = first; m.getTime() <= current.getTime(); m = shiftMonth(m, 1)) {
      const start = m.getTime();
      items.push({
        key: String(start),
        label: monthPeriodLabel(m, now),
        amount: value(start, shiftMonth(m, 1).getTime()),
        selected: start === period.start,
        onPress: () => select({ mode: 'month', start }),
      });
    }
    return items;
  }

  if (period.mode === 'year') {
    const items: StripItem[] = [];
    for (let y = Math.min(earliest.getFullYear(), now.getFullYear() - 1); y <= now.getFullYear(); y++) {
      items.push({
        key: String(y),
        label: String(y),
        amount: value(new Date(y, 0, 1).getTime(), new Date(y + 1, 0, 1).getTime()),
        selected: y === period.year,
        onPress: () => select({ mode: 'year', year: y }),
      });
    }
    return items;
  }

  if (period.mode === 'all') {
    return [{ key: 'all', label: 'Todo el tiempo', amount: value(0, Number.MAX_SAFE_INTEGER), selected: true, onPress: () => {} }];
  }

  return [
    {
      key: 'range',
      label: rangeLabel(period.start, period.end),
      amount: value(period.start, period.end),
      selected: true,
      onPress: openRange,
    },
  ];
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pageDots: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textFaint,
  },
  pageDotActive: {
    backgroundColor: colors.text,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  listChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '45%',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.chip,
  },
  listName: {
    flexShrink: 1,
  },
  topIcons: {
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
  clearBadge: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strip: {
    marginTop: 12,
  },
  totals: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 8,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalNumber: {
    flexShrink: 1,
    letterSpacing: -1.5,
  },
  currency: {
    alignSelf: 'flex-end',
    marginBottom: 10,
  },
  kinds: {
    flexDirection: 'row',
    gap: 8,
  },
  kind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  kindDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: colors.chip,
  },
  bars: {
    marginTop: 28,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 4,
  },
  dayPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.chip,
  },
  emptySearch: {
    textAlign: 'center',
    paddingTop: 40,
    paddingHorizontal: 32,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  searchWrap: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  shadow: {
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  listActions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 6,
    paddingTop: 6,
  },
  listAction: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
});
