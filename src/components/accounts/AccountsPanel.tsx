// HARDCODED mockup of the accounts panel (swipe left from the home screen).
// Uses sample data from mockAccounts.ts; nothing is read from or written to the database.

import { Feather } from '@expo/vector-icons';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ACCOUNT_TYPE_LABEL, MOCK_ACCOUNTS, MOCK_MOVEMENTS, type MockAccount } from '../../lib/mockAccounts';
import { formatAmount, formatCompact, formatMoney } from '../../lib/money';
import { colors, radius } from '../../theme';
import { AppText } from '../AppText';

const MAX_HEIGHT = 220;
const MIN_HEIGHT = 70;
const BAR_WIDTH = 86;

function soon() {
  Alert.alert('Solo diseño', 'Este panel todavía usa datos de ejemplo. Cuando te guste, lo conectamos a tus movimientos.');
}

export function AccountsPanel({ width }: { width: number }) {
  const insets = useSafeAreaInsets();
  const assets = MOCK_ACCOUNTS.filter((a) => a.type !== 'credit');
  const credit = MOCK_ACCOUNTS.filter((a) => a.type === 'credit');
  const available = assets.reduce((sum, a) => sum + a.balance, 0);
  const debt = credit.reduce((sum, a) => sum + a.balance, 0);
  const net = available - debt;
  const scale = Math.max(...MOCK_ACCOUNTS.map((a) => a.limit ?? a.balance), 1);

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <AppText weight="extrabold" size={17}>
          Cuentas
        </AppText>
        <View style={styles.sampleChip}>
          <AppText weight="bold" size={11} color={colors.accent}>
            DATOS DE EJEMPLO
          </AppText>
        </View>
      </View>

      <View style={styles.header}>
        <AppText size={13} color={colors.textMuted}>
          Tu dinero hoy
        </AppText>
        <View style={styles.totalRow}>
          <AppText weight="extrabold" size={52} style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
            {formatAmount(net)}
          </AppText>
          <AppText weight="semibold" size={22} color={colors.textMuted} style={styles.currency}>
            $
          </AppText>
        </View>
        <View style={styles.split}>
          <View style={styles.splitItem}>
            <View style={[styles.dot, { backgroundColor: colors.income }]} />
            <AppText weight="semibold" size={15}>
              {formatAmount(available)}
            </AppText>
            <AppText size={12} color={colors.textMuted}>
              disponible
            </AppText>
          </View>
          <View style={styles.splitItem}>
            <View style={[styles.dot, { backgroundColor: colors.accent }]} />
            <AppText weight="semibold" size={15}>
              {formatAmount(debt)}
            </AppText>
            <AppText size={12} color={colors.textMuted}>
              deuda
            </AppText>
          </View>
        </View>
      </View>

      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bars}>
        {MOCK_ACCOUNTS.map((a) => (
          <AccountColumn key={a.id} account={a} scale={scale} />
        ))}
        <Pressable style={styles.addColumn} onPress={soon}>
          <Feather name="plus" size={26} color={colors.textFaint} />
        </Pressable>
      </ScrollView>

      <AppText weight="semibold" size={13} color={colors.textMuted} style={styles.sectionTitle}>
        Tus cuentas
      </AppText>
      {MOCK_ACCOUNTS.map((a) => (
        <AccountRow key={a.id} account={a} />
      ))}

      <AppText weight="semibold" size={13} color={colors.textMuted} style={styles.sectionTitle}>
        Últimos movimientos
      </AppText>
      {MOCK_MOVEMENTS.map((m) => {
        const sign = m.kind === 'income' ? '+ ' : m.kind === 'expense' ? '- ' : '';
        return (
          <Pressable key={m.id} style={styles.row} onPress={soon}>
            <View style={[styles.bubble, { backgroundColor: m.color }]}>
              <AppText size={20}>{m.emoji}</AppText>
            </View>
            <View style={styles.rowTexts}>
              <AppText size={12} color={colors.textMuted}>
                {m.when}
                {m.kind === 'transfer' ? ' · Transferencia' : ''}
              </AppText>
              <AppText weight="bold" size={16} numberOfLines={1}>
                {m.title}
              </AppText>
              <View style={styles.accountChip}>
                <AppText weight="semibold" size={12} color={colors.textMuted} numberOfLines={1}>
                  {m.accountLabel}
                </AppText>
              </View>
            </View>
            <AppText
              weight="bold"
              size={16}
              color={m.kind === 'income' ? colors.income : m.kind === 'transfer' ? colors.textMuted : colors.text}
            >
              {sign}
              {formatMoney(m.amount)}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function AccountColumn({ account: a, scale }: { account: MockAccount; scale: number }) {
  const fill = MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * (a.balance / scale);
  if (a.type !== 'credit' || !a.limit) {
    return (
      <View style={styles.column}>
        <View style={[styles.bar, { height: fill, backgroundColor: a.color }]}>
          <AppText size={24}>{a.emoji}</AppText>
          <AppText weight="bold" size={15}>
            {formatCompact(a.balance)}
          </AppText>
        </View>
        <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.columnName} numberOfLines={1}>
          {a.name}
        </AppText>
      </View>
    );
  }
  // Credit card: the dashed outline is the limit and the fill is what is owed,
  // the same language the budgets use.
  const outline = MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * (a.limit / scale);
  const used = Math.round((a.balance / a.limit) * 100);
  return (
    <View style={styles.column}>
      <View style={[styles.outline, { height: outline }]}>
        <View style={[styles.bar, styles.creditFill, { height: fill, backgroundColor: a.color }]}>
          <AppText size={24}>{a.emoji}</AppText>
          <AppText weight="bold" size={15}>
            {formatCompact(a.balance)}
          </AppText>
          <AppText size={12} color={colors.textMuted}>
            {used}%
          </AppText>
        </View>
      </View>
      <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.columnName} numberOfLines={1}>
        {a.name}
      </AppText>
    </View>
  );
}

function AccountRow({ account: a }: { account: MockAccount }) {
  const isCredit = a.type === 'credit';
  const subtitle = isCredit && a.limit
    ? `Cupo ${formatMoney(a.limit)} · disponible ${formatMoney(a.limit - a.balance)}`
    : `Este mes  - ${formatCompact(a.monthOut)}  + ${formatCompact(a.monthIn)}`;
  return (
    <Pressable style={styles.row} onPress={soon}>
      <View style={[styles.bubble, { backgroundColor: a.color }]}>
        <AppText size={20}>{a.emoji}</AppText>
      </View>
      <View style={styles.rowTexts}>
        <AppText size={12} color={colors.textMuted}>
          {ACCOUNT_TYPE_LABEL[a.type]}
        </AppText>
        <AppText weight="bold" size={16}>
          {a.name}
        </AppText>
        <AppText size={12} color={colors.textMuted}>
          {subtitle}
        </AppText>
        {isCredit && a.limit && (
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${Math.min(100, (a.balance / a.limit) * 100)}%` }]} />
          </View>
        )}
      </View>
      <AppText weight="bold" size={16} color={isCredit ? colors.accent : colors.text}>
        {isCredit ? '- ' : ''}
        {formatMoney(a.balance)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: 44,
  },
  sampleChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 6,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  total: {
    letterSpacing: -1,
    flexShrink: 1,
  },
  currency: {
    marginBottom: 8,
  },
  split: {
    flexDirection: 'row',
    gap: 20,
  },
  splitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 28,
    minHeight: MAX_HEIGHT + 60,
  },
  column: {
    width: BAR_WIDTH,
    justifyContent: 'flex-end',
  },
  bar: {
    borderRadius: radius.lg + 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 14,
    gap: 2,
  },
  outline: {
    borderRadius: radius.lg + 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.textFaint,
    justifyContent: 'flex-end',
  },
  creditFill: {
    marginHorizontal: -1.5,
    marginBottom: -1.5,
  },
  columnName: {
    textAlign: 'center',
    marginTop: 6,
  },
  addColumn: {
    width: BAR_WIDTH,
    height: MIN_HEIGHT,
    marginBottom: 24,
    borderRadius: radius.lg + 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  bubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  accountChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.chip,
    marginTop: 2,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.chip,
    marginTop: 6,
    overflow: 'hidden',
  },
  trackFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
});
