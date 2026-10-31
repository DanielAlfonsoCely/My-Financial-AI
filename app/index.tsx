import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { CategoryBars } from '../src/components/CategoryBars';
import { IconButton } from '../src/components/IconButton';
import { TransactionRow } from '../src/components/TransactionRow';
import type { TransactionWithCategory } from '../src/db/types';
import { useMonthData } from '../src/hooks/useMonthData';
import { addMonths, dayLabel, monthLabel, startOfDay, startOfMonth } from '../src/lib/dates';
import { DEFAULT_CURRENCY, formatAmount, formatMoney } from '../src/lib/money';
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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  // undefined = no filter, null = "sin categoría", string = category id
  const [categoryFilter, setCategoryFilter] = useState<string | null | undefined>(undefined);
  const data = useMonthData(month);

  const isCurrentMonth = month.getTime() === startOfMonth(new Date()).getTime();
  const balance = data.incomeTotal - data.expenseTotal;
  const headline = data.showIncome ? balance : data.expenseTotal;

  const sections = useMemo(() => {
    const filtered =
      categoryFilter === undefined
        ? data.transactions
        : data.transactions.filter((t) => t.kind === 'expense' && t.category_id === categoryFilter);
    return groupByDay(filtered);
  }, [data.transactions, categoryFilter]);

  const filterLabel = useMemo(() => {
    if (categoryFilter === undefined) return null;
    const match = data.expenseByCategory.find((c) => c.categoryId === categoryFilter);
    return match ? `${match.emoji} ${match.name}` : null;
  }, [categoryFilter, data.expenseByCategory]);

  const changeMonth = (delta: number) => {
    setCategoryFilter(undefined);
    setMonth((m) => addMonths(m, delta));
  };

  const openNew = () => router.push('/transaction');
  const openVoice = () =>
    Alert.alert('Próximamente', 'La entrada por voz con IA llega en la Fase 2. Por ahora usa el botón +.');

  const header = (
    <View>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="settings" label="Configuración" onPress={() => router.push('/settings')} />
      </View>

      <View style={styles.totalBlock}>
        <AppText size={13} color={colors.textMuted}>
          Total
        </AppText>
        <View style={styles.totalRow}>
          {data.showIncome && (
            <View style={[styles.signDot, { backgroundColor: balance >= 0 ? colors.income : colors.accent }]}>
              <AppText weight="extrabold" size={14} color={colors.surface}>
                {balance >= 0 ? '+' : '−'}
              </AppText>
            </View>
          )}
          <AppText weight="extrabold" size={54} style={styles.totalNumber} adjustsFontSizeToFit numberOfLines={1}>
            {formatAmount(headline)}
          </AppText>
          <AppText weight="semibold" size={18} color={colors.textMuted} style={styles.currency}>
            {DEFAULT_CURRENCY}
          </AppText>
        </View>

        {data.showIncome && (
          <View style={styles.pills}>
            <View style={[styles.pill, styles.pillDark]}>
              <AppText weight="bold" size={13} color={colors.surface}>
                - {formatMoney(data.expenseTotal)}
              </AppText>
            </View>
            <View style={styles.pill}>
              <AppText weight="bold" size={13}>
                + {formatMoney(data.incomeTotal)}
              </AppText>
            </View>
          </View>
        )}

        <View style={styles.monthRow}>
          <IconButton icon="chevron-left" label="Mes anterior" size={18} diameter={32} onPress={() => changeMonth(-1)} />
          <View style={styles.monthChip}>
            <AppText weight="semibold" size={13}>
              {monthLabel(month)}
            </AppText>
          </View>
          <IconButton
            icon="chevron-right"
            label="Mes siguiente"
            size={18}
            diameter={32}
            color={isCurrentMonth ? colors.textFaint : colors.text}
            onPress={() => !isCurrentMonth && changeMonth(1)}
          />
        </View>
      </View>

      {data.expenseByCategory.length > 0 && (
        <View style={styles.bars}>
          <CategoryBars
            items={data.expenseByCategory}
            selectedId={categoryFilter}
            onSelect={setCategoryFilter}
          />
        </View>
      )}

      {filterLabel && (
        <Pressable style={styles.filterChip} onPress={() => setCategoryFilter(undefined)}>
          <AppText weight="semibold" size={13}>
            {filterLabel}
          </AppText>
          <Feather name="x" size={14} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );

  const empty = !data.loading && (
    <View style={styles.empty}>
      <AppText weight="semibold" size={15} color={colors.textMuted}>
        {isCurrentMonth ? 'Nuevo mes, empieza ahora' : 'Sin movimientos este mes'}
      </AppText>
    </View>
  );

  return (
    <View style={styles.screen}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty || undefined}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <AppText size={13} color={colors.textMuted}>
              {section.title}
            </AppText>
            <AppText size={13} color={colors.textMuted}>
              {section.total < 0 ? '-' : '+'}
              {formatMoney(Math.abs(section.total))}
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
        <IconButton
          icon="plus"
          label="Nuevo movimiento"
          size={22}
          diameter={52}
          background={colors.surface}
          style={styles.shadow}
          onPress={openNew}
        />
        <IconButton
          icon="mic"
          label="Entrada por voz"
          size={26}
          diameter={64}
          color={colors.surface}
          background={colors.accent}
          style={styles.shadow}
          onPress={openVoice}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  totalBlock: {
    paddingHorizontal: 24,
    gap: 10,
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
    letterSpacing: -1,
  },
  currency: {
    alignSelf: 'flex-end',
    marginBottom: 10,
  },
  pills: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.chip,
  },
  pillDark: {
    backgroundColor: colors.text,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: -8,
  },
  monthChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.chip,
  },
  bars: {
    marginTop: 24,
    marginBottom: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginLeft: 20,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.chip,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 4,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 140,
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
  shadow: {
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
