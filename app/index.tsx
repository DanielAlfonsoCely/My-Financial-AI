import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  type HostInstance,
  Pressable,
  SectionList,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountsPanel } from '../src/components/accounts/AccountsPanel';
import { AppText } from '../src/components/AppText';
import { CategoryBars, EmptyBars } from '../src/components/CategoryBars';
import { DefaultPeriodSheet } from '../src/components/home/DefaultPeriodSheet';
import { PeriodStrip, type StripItem } from '../src/components/home/PeriodStrip';
import { RangeSheet } from '../src/components/home/RangeSheet';
import { IconButton } from '../src/components/IconButton';
import { Pager } from '../src/components/Pager';
import { type Anchor, type MenuItem, PopoverMenu } from '../src/components/PopoverMenu';
import { TransactionRow } from '../src/components/TransactionRow';
import { setSetting, SETTING_PERIOD_START_DAY } from '../src/db/repo';
import type { Kind, TransactionAmount, TransactionWithCategory } from '../src/db/types';
import { sumRange, useAmountIndex, useHomeSettings, usePeriodData } from '../src/hooks/useHomeData';
import { dayLabel, startOfDay } from '../src/lib/dates';
import { formatAmount, formatMoney } from '../src/lib/money';
import {
  currentMonthPeriod,
  monthPeriodLabel,
  monthStartFor,
  type Period,
  periodRange,
  rangeLabel,
  shiftMonth,
} from '../src/lib/period';
import { colors, radius } from '../src/theme';

interface DaySection {
  title: string;
  total: number;
  data: TransactionWithCategory[];
}

function groupByDay(transactions: TransactionWithCategory[]): DaySection[] {
  const sections: DaySection[] = [];
  let currentKey = -1;
  for (const t of transactions) {
    const day = startOfDay(new Date(t.occurred_at));
    if (day.getTime() !== currentKey) {
      currentKey = day.getTime();
      sections.push({ title: dayLabel(day), total: 0, data: [] });
    }
    const section = sections[sections.length - 1];
    section.data.push(t);
    section.total += t.kind === 'income' ? t.amount : -t.amount;
  }
  return sections;
}

function signedMoney(value: number): string {
  return `${value < 0 ? '-' : ''}${formatMoney(Math.abs(value))}`;
}

function soon(what: string) {
  Alert.alert('Próximamente', `${what} llega en una próxima versión.`);
}

/** Measures a view on screen so a PopoverMenu can open right under it. */
function useAnchor() {
  const ref = useRef<HostInstance>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = () =>
    ref.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  return { ref, anchor, open, close: () => setAnchor(null) };
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);

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

function HomePage({ width }: { width: number }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const settings = useHomeSettings();
  const amounts = useAmountIndex();

  // null = default period (the current month, starting on the chosen day).
  const [period, setPeriod] = useState<Period | null>(null);
  const [kind, setKind] = useState<Kind>('expense');
  // undefined = no filter, null = "sin categoría", string = category id
  const [categoryFilter, setCategoryFilter] = useState<string | null | undefined>(undefined);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [defaultOpen, setDefaultOpen] = useState(false);
  const periodMenu = useAnchor();
  const listMenu = useAnchor();

  const effective = period ?? currentMonthPeriod(settings.startDay);
  const range = periodRange(effective);
  const data = usePeriodData(range);

  const activeKind: Kind = settings.showIncome ? kind : 'expense';
  const bars = data.byCategory[activeKind];
  const kindTotal = activeKind === 'income' ? data.incomeTotal : data.expenseTotal;
  const balance = data.incomeTotal - data.expenseTotal;
  const selectedBar = categoryFilter === undefined ? undefined : bars.find((b) => b.categoryId === categoryFilter);

  // Selecting a column shows that category's total, like MonAi.
  const headline = selectedBar ? selectedBar.total : settings.showIncome ? balance : data.expenseTotal;
  const headlinePositive = selectedBar ? activeKind === 'income' : settings.showIncome ? balance >= 0 : false;
  const signColor = !settings.showIncome && !selectedBar ? colors.textFaint : headlinePositive ? colors.income : colors.accent;

  const changePeriod = (next: Period | null) => {
    setCategoryFilter(undefined);
    setPeriod(next);
  };

  const changeKind = (next: Kind) => {
    setCategoryFilter(undefined);
    setKind(next);
  };

  const sections = useMemo(() => {
    const filtered =
      categoryFilter === undefined
        ? data.transactions
        : data.transactions.filter((t) => t.kind === activeKind && t.category_id === categoryFilter);
    return groupByDay(filtered);
  }, [data.transactions, categoryFilter, activeKind]);

  const strip = useMemo(
    () => buildStrip(period, amounts, settings.startDay, settings.showIncome, changePeriod, () => setRangeOpen(true)),
    // changePeriod only touches state setters.
    [period, amounts, settings.startDay, settings.showIncome],
  );

  const periodItems: MenuItem[] = [
    {
      key: 'month',
      label: 'Mes',
      icon: 'calendar',
      checked: effective.mode === 'month',
      onPress: () => changePeriod(effective.mode === 'month' ? effective : currentMonthPeriod(settings.startDay)),
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

  const listItems: MenuItem[] = [
    { key: 'personal', label: 'Personal', checked: true, onPress: () => {} },
    { key: 'new', label: 'Nueva lista', icon: 'plus', separated: true, onPress: () => soon('Crear listas') },
  ];

  const header = (
    <View>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable ref={listMenu.ref} onPress={listMenu.open} style={styles.listChip} hitSlop={6}>
          <AppText weight="bold" size={15}>
            Personal
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
        {selectedBar && (
          <AppText weight="semibold" size={13} color={colors.textMuted}>
            {selectedBar.emoji} {selectedBar.name}
          </AppText>
        )}
        <View style={styles.totalRow}>
          <View style={[styles.signDot, { backgroundColor: signColor }]}>
            <Feather name={headlinePositive ? 'plus' : 'minus'} size={14} color={colors.surface} />
          </View>
          <AppText weight="extrabold" size={58} style={styles.totalNumber} adjustsFontSizeToFit numberOfLines={1}>
            {formatAmount(headline)}
          </AppText>
          <AppText weight="semibold" size={24} color={colors.textMuted} style={styles.currency}>
            $
          </AppText>
        </View>

        {settings.showIncome && (
          <View style={styles.kinds}>
            <KindToggle
              kind="expense"
              amount={data.expenseTotal}
              selected={activeKind === 'expense'}
              onPress={() => changeKind('expense')}
            />
            <KindToggle
              kind="income"
              amount={data.incomeTotal}
              selected={activeKind === 'income'}
              onPress={() => changeKind('income')}
            />
          </View>
        )}
      </View>

      <View style={styles.bars}>
        {data.loading ? null : kindTotal === 0 ? (
          <EmptyBars />
        ) : (
          <CategoryBars items={bars} selectedId={categoryFilter} onSelect={setCategoryFilter} />
        )}
      </View>
    </View>
  );

  return (
    <View style={{ width, flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
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
          <TransactionRow
            transaction={item}
            onPress={() => router.push({ pathname: '/transaction', params: { id: item.id } })}
          />
        )}
      />

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
        <View style={[styles.actions, styles.shadow]}>
          <IconButton icon="plus" label="Nuevo movimiento" size={24} diameter={48} onPress={() => router.push('/transaction')} />
          <IconButton icon="message-square" label="Chat" size={21} diameter={48} onPress={() => soon('El chat financiero')} />
          <IconButton icon="search" label="Buscar" size={21} diameter={48} onPress={() => soon('La búsqueda')} />
        </View>
        <IconButton
          icon="mic"
          label="Entrada por voz"
          size={28}
          diameter={72}
          color={colors.surface}
          background={colors.accent}
          style={styles.shadow}
          onPress={() => soon('La entrada por voz con IA')}
        />
      </View>

      <PopoverMenu anchor={periodMenu.anchor} onClose={periodMenu.close} items={periodItems} align="right" />
      <PopoverMenu anchor={listMenu.anchor} onClose={listMenu.close} items={listItems} />
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
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.chip,
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
});
