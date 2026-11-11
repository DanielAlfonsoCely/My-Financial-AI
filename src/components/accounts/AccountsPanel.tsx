// The accounts panel (swipe left from the home screen): what the user has, by account or by group.
// Accounts are global, so nothing here depends on the current list.

import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getSetting, listAccountGroups, listAccounts, setSetting, SETTING_ACCOUNTS_VIEW } from '../../db/repo';
import type { AccountGroup, AccountWithBalance } from '../../db/types';
import { useQuery } from '../../hooks/useData';
import {
  ACCOUNT_TYPE_LABEL,
  creditUsage,
  formatShare,
  type GroupSection,
  groupAccounts,
  isLiability,
  summarizeAccounts,
} from '../../lib/accounts';
import { DEFAULT_CURRENCY, formatAmount, formatCompact, formatMoney } from '../../lib/money';
import { colors, radius } from '../../theme';
import { AppText } from '../AppText';
import { IconButton } from '../IconButton';
import { LoadError } from '../LoadError';
import { PillButton } from '../PillButton';

const MAX_HEIGHT = 200;
const MIN_HEIGHT = 70;
const BAR_WIDTH = 86;

type ViewMode = 'general' | 'grouped';

const openAccount = (id: string) => router.push({ pathname: '/account', params: { id } });
const newAccount = (params: { groupId?: string; type?: string } = {}) => router.push({ pathname: '/account', params });

const barHeight = (value: number, scale: number) =>
  MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * Math.min(1, Math.max(0, value) / Math.max(scale, 1));

/** Balance in the account's own currency; pesos are the default and need no code. */
function money(account: AccountWithBalance): string {
  const text = formatMoney(account.balance, account.currency);
  const signed = account.balance < 0 ? `−${text}` : text;
  return account.currency === DEFAULT_CURRENCY ? signed : `${signed} ${account.currency}`;
}

export function AccountsPanel({ width }: { width: number }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { data, loaded, error, reload } = useQuery(
    async () => {
      const [accounts, groups, view] = await Promise.all([listAccounts(db), listAccountGroups(db), getSetting(db, SETTING_ACCOUNTS_VIEW)]);
      return { accounts, groups, view: (view === 'grouped' ? 'grouped' : 'general') as ViewMode };
    },
    { accounts: [] as AccountWithBalance[], groups: [] as AccountGroup[], view: 'general' as ViewMode },
    [db],
  );
  const { accounts, groups, view } = data;

  const summary = summarizeAccounts(accounts);
  const inPesos = (a: AccountWithBalance) => a.currency === DEFAULT_CURRENCY;
  // Biggest first, like the category bars of the home screen.
  const assets = accounts.filter((a) => !isLiability(a)).sort((a, b) => Number(inPesos(b)) - Number(inPesos(a)) || b.balance - a.balance);
  const liabilities = accounts.filter(isLiability).sort((a, b) => b.balance - a.balance);
  const sections = groupAccounts(accounts, groups);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  const setView = (next: ViewMode) => {
    if (next !== view) setSetting(db, SETTING_ACCOUNTS_VIEW, next);
  };

  if (error && accounts.length === 0) {
    return (
      <View style={[styles.center, { width, paddingTop: insets.top + 80 }]}>
        <LoadError onRetry={reload} />
      </View>
    );
  }

  if (loaded && accounts.length === 0) {
    return (
      <View style={[styles.center, { width, paddingTop: insets.top + 12 }]}>
        <View style={styles.topBar}>
          <AppText weight="extrabold" size={17}>
            Cuentas
          </AppText>
        </View>
        <View style={styles.empty}>
          <AppText size={40}>🏦</AppText>
          <AppText weight="extrabold" size={22} style={styles.emptyText}>
            Tu plata, cuenta por cuenta
          </AppText>
          <AppText size={14} color={colors.textMuted} style={styles.emptyText}>
            Crea tus cuentas (efectivo, bancos, tarjetas) con lo que tienen hoy. Cada gasto que marques con una cuenta
            baja su saldo, y pasar plata entre ellas no cuenta como gasto.
          </AppText>
          <PillButton label="Crear mi primera cuenta" icon="plus" onPress={() => newAccount()} />
        </View>
      </View>
    );
  }

  const columnScale = view === 'general'
    ? Math.max(...assets.filter(inPesos).map((a) => a.balance), ...liabilities.map((a) => a.credit_limit ?? a.balance), 1)
    : Math.max(...sections.map((s) => s.total), summary.debt, liabilities.reduce((s, a) => s + (a.credit_limit ?? 0), 0), 1);

  return (
    <View style={{ width, flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <AppText weight="extrabold" size={17}>
            Cuentas
          </AppText>
          <IconButton icon="plus" label="Nueva cuenta" background={colors.surface} onPress={() => newAccount()} />
        </View>

        <View style={styles.header}>
          <AppText size={13} color={colors.textMuted}>
            Tu dinero hoy
          </AppText>
          <View style={styles.totalRow}>
            <AppText weight="extrabold" size={52} style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
              {summary.net < 0 ? '−' : ''}
              {formatAmount(summary.net)}
            </AppText>
            <AppText weight="semibold" size={22} color={colors.textMuted} style={styles.currency}>
              $
            </AppText>
          </View>
        </View>

        {/* One under the other, never the three in one row. */}
        <View style={styles.card}>
          <SummaryLine color={colors.income} label="Disponible" value={formatMoney(summary.available)} />
          <SummaryLine color={colors.text} label="Invertido" value={formatMoney(summary.invested)} />
          <SummaryLine color={colors.danger} label="Deuda" value={`−${formatMoney(summary.debt)}`} valueColor={summary.debt > 0 ? colors.danger : colors.textMuted} last />
        </View>
        {summary.foreign.length > 0 && (
          <AppText size={12} color={colors.textMuted} style={styles.note}>
            Sin contar {summary.foreign.map((a) => a.name).join(', ')}: {summary.foreign.length === 1 ? 'está' : 'están'} en otra moneda.
          </AppText>
        )}

        <View style={styles.viewToggle}>
          {(['general', 'grouped'] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setView(mode)}
              style={[styles.viewItem, view === mode && styles.viewItemActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: view === mode }}
            >
              <AppText weight="bold" size={13} color={view === mode ? colors.surface : colors.textMuted}>
                {mode === 'general' ? 'General' : 'Agrupada'}
              </AppText>
            </Pressable>
          ))}
        </View>

        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bars}>
          {view === 'general'
            ? [...assets.filter(inPesos), ...liabilities].map((a) => <AccountColumn key={a.id} account={a} scale={columnScale} />)
            : (
              <>
                {sections.filter((s) => s.accounts.length > 0).sort((a, b) => b.total - a.total).map((s) => (
                  <Column key={s.id ?? 'none'} emoji={s.emoji} value={s.total} detail={formatShare(s.share)} name={s.name} color={colors.chip} height={barHeight(s.total, columnScale)} />
                ))}
                {liabilities.length > 0 && <LiabilitiesColumn accounts={liabilities} debt={summary.debt} scale={columnScale} />}
              </>
            )}
        </ScrollView>

        <SectionTitle title="Activos" value={formatMoney(summary.assets)} />
        {view === 'general'
          ? assets.map((a) => <AccountRow key={a.id} account={a} caption={a.group_id ? groupName.get(a.group_id) ?? 'Sin grupo' : 'Sin grupo'} />)
          : sections.map((s) => <GroupBlock key={s.id ?? 'none'} section={s} />)}
        {view === 'grouped' && (
          <Pressable style={styles.addLine} onPress={() => router.push('/account-group')}>
            <Feather name="plus" size={16} color={colors.text} />
            <AppText weight="bold" size={14}>
              Nuevo grupo
            </AppText>
          </Pressable>
        )}

        <SectionTitle title="Pasivos" value={`−${formatMoney(summary.debt)}`} valueColor={summary.debt > 0 ? colors.danger : colors.textMuted} />
        {liabilities.map((a) => (
          <AccountRow key={a.id} account={a} caption={ACCOUNT_TYPE_LABEL[a.type]} />
        ))}
        {liabilities.length === 0 && (
          <Pressable style={styles.addLine} onPress={() => newAccount({ type: 'credit' })}>
            <Feather name="plus" size={16} color={colors.text} />
            <AppText weight="bold" size={14}>
              Agregar tarjeta de crédito
            </AppText>
          </Pressable>
        )}
      </ScrollView>

      {accounts.length >= 2 && (
        <Pressable
          style={[styles.transfer, { bottom: insets.bottom + 24 }]}
          onPress={() => router.push({ pathname: '/transaction', params: { kind: 'transfer' } })}
          accessibilityRole="button"
        >
          <Feather name="repeat" size={18} color={colors.surface} />
          <AppText weight="bold" size={15} color={colors.surface}>
            Transferir
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

function SummaryLine({ color, label, value, valueColor, last }: { color: string; label: string; value: string; valueColor?: string; last?: boolean }) {
  return (
    <View style={[styles.summaryLine, !last && styles.summaryDivider]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <AppText size={14} color={colors.textMuted} style={styles.flex}>
        {label}
      </AppText>
      <AppText weight="bold" size={16} color={valueColor ?? colors.text}>
        {value}
      </AppText>
    </View>
  );
}

function SectionTitle({ title, value, valueColor }: { title: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <AppText weight="extrabold" size={18}>
        {title}
      </AppText>
      <AppText weight="bold" size={15} color={valueColor ?? colors.textMuted}>
        {value}
      </AppText>
    </View>
  );
}

function Column({ emoji, value, detail, name, color, height, onPress }: { emoji: string; value: number; detail?: string; name: string; color: string; height: number; onPress?: () => void }) {
  return (
    <Pressable style={styles.column} onPress={onPress} disabled={!onPress}>
      <View style={[styles.bar, { height, backgroundColor: color }]}>
        <AppText size={24}>{emoji}</AppText>
        <AppText weight="bold" size={15}>
          {formatCompact(value)}
        </AppText>
        {detail && (
          <AppText size={12} color={colors.textMuted}>
            {detail}
          </AppText>
        )}
      </View>
      <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.columnName} numberOfLines={1}>
        {name}
      </AppText>
    </Pressable>
  );
}

function AccountColumn({ account: a, scale }: { account: AccountWithBalance; scale: number }) {
  const usage = creditUsage(a);
  if (usage === null || !a.credit_limit) {
    return <Column emoji={a.emoji} value={a.balance} name={a.name} color={a.color} height={barHeight(a.balance, scale)} onPress={() => openAccount(a.id)} />;
  }
  // Credit card: the dashed outline is the limit and the fill is what is owed,
  // the same language the budgets use.
  return (
    <Pressable style={styles.column} onPress={() => openAccount(a.id)}>
      <View style={[styles.outline, { height: barHeight(a.credit_limit, scale) }]}>
        <View style={[styles.bar, styles.creditFill, { height: Math.min(barHeight(a.balance, scale), barHeight(a.credit_limit, scale)), backgroundColor: a.color }]}>
          <AppText size={24}>{a.emoji}</AppText>
          <AppText weight="bold" size={15}>
            {formatCompact(a.balance)}
          </AppText>
          <AppText size={12} color={colors.textMuted}>
            {usage}%
          </AppText>
        </View>
      </View>
      <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.columnName} numberOfLines={1}>
        {a.name}
      </AppText>
    </Pressable>
  );
}

/** Grouped view: every liability in one column, the dashed outline being the sum of the limits. */
function LiabilitiesColumn({ accounts, debt, scale }: { accounts: AccountWithBalance[]; debt: number; scale: number }) {
  const limit = accounts.reduce((s, a) => s + (a.credit_limit ?? 0), 0);
  const outline = barHeight(Math.max(limit, debt), scale);
  return (
    <View style={styles.column}>
      <View style={[styles.outline, styles.outlineDebt, { height: outline }]}>
        <View style={[styles.bar, styles.creditFill, { height: Math.min(barHeight(debt, scale), outline), backgroundColor: colors.accentSoft }]}>
          <AppText size={24}>💳</AppText>
          <AppText weight="bold" size={15}>
            {formatCompact(debt)}
          </AppText>
        </View>
      </View>
      <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.columnName} numberOfLines={1}>
        Pasivos
      </AppText>
    </View>
  );
}

function GroupBlock({ section: s }: { section: GroupSection }) {
  const editable = s.id !== null && !s.system;
  return (
    <View>
      <Pressable
        style={styles.groupHeader}
        disabled={!editable}
        onPress={() => router.push({ pathname: '/account-group', params: { id: s.id ?? '' } })}
      >
        <AppText size={18}>{s.emoji || '🗂️'}</AppText>
        <View style={styles.flex}>
          <View style={styles.groupTitle}>
            <AppText weight="bold" size={15}>
              {s.name}
            </AppText>
            <AppText weight="semibold" size={12} color={colors.textMuted}>
              {formatShare(s.share)}
            </AppText>
            {editable && <Feather name="edit-2" size={12} color={colors.textFaint} />}
          </View>
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${Math.round(s.share * 100)}%`, backgroundColor: colors.text }]} />
          </View>
        </View>
        <AppText weight="bold" size={15}>
          {formatMoney(s.total)}
        </AppText>
      </Pressable>
      {s.accounts.map((a) => (
        <AccountRow key={a.id} account={a} caption={a.subtitle ?? ACCOUNT_TYPE_LABEL[a.type]} chip={a.type === 'broker' ? 'Automático' : undefined} />
      ))}
      {s.id !== null && (
        <Pressable style={styles.addLine} onPress={() => newAccount(s.system ? { type: 'asset' } : { groupId: s.id ?? undefined })}>
          <Feather name="plus" size={16} color={colors.textMuted} />
          <AppText weight="semibold" size={13} color={colors.textMuted}>
            {s.system ? 'Agregar a Inversiones' : `Agregar a ${s.name}`}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

function AccountRow({ account: a, caption, chip }: { account: AccountWithBalance; caption: string; chip?: string }) {
  const usage = creditUsage(a);
  const debt = isLiability(a);
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={() => openAccount(a.id)} accessibilityRole="button">
      <View style={[styles.bubble, { backgroundColor: a.color }]}>
        <AppText size={20}>{a.emoji}</AppText>
      </View>
      <View style={styles.rowTexts}>
        <View style={styles.groupTitle}>
          <AppText weight="bold" size={16} numberOfLines={1} style={styles.flexShrink}>
            {a.name}
          </AppText>
          {chip && (
            <View style={styles.chip}>
              <AppText weight="bold" size={10} color={colors.textMuted}>
                {chip}
              </AppText>
            </View>
          )}
        </View>
        <AppText size={12} color={colors.textMuted} numberOfLines={1}>
          {caption}
        </AppText>
        {usage !== null && a.credit_limit && (
          <>
            <View style={styles.usageRow}>
              <View style={[styles.track, styles.flex]}>
                <View style={[styles.trackFill, { width: `${Math.min(100, usage)}%`, backgroundColor: colors.danger }]} />
              </View>
              <AppText weight="bold" size={12} color={colors.textMuted}>
                {usage}%
              </AppText>
            </View>
            <AppText size={12} color={colors.textMuted}>
              Cupo {formatMoney(a.credit_limit, a.currency)} · disponible {formatMoney(Math.max(0, a.credit_limit - a.balance), a.currency)}
            </AppText>
          </>
        )}
      </View>
      <AppText weight="bold" size={16} color={debt && a.balance > 0 ? colors.danger : colors.text}>
        {debt && a.balance > 0 ? `−${formatMoney(a.balance, a.currency)}` : money(a)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  flexShrink: {
    flexShrink: 1,
  },
  center: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: 44,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
    gap: 12,
  },
  emptyText: {
    textAlign: 'center',
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
  card: {
    marginHorizontal: 20,
    marginTop: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  summaryDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  note: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  viewToggle: {
    alignSelf: 'center',
    flexDirection: 'row',
    marginTop: 18,
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.chip,
  },
  viewItem: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  viewItemActive: {
    backgroundColor: colors.text,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 20,
    minHeight: MAX_HEIGHT + 50,
  },
  column: {
    width: BAR_WIDTH,
    justifyContent: 'flex-end',
  },
  bar: {
    borderRadius: radius.lg + 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
    gap: 2,
  },
  outline: {
    borderRadius: radius.lg + 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.textFaint,
    justifyContent: 'flex-end',
  },
  outlineDebt: {
    borderColor: colors.danger,
  },
  creditFill: {
    marginHorizontal: -1.5,
    marginBottom: -1.5,
  },
  columnName: {
    textAlign: 'center',
    marginTop: 6,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 6,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  groupTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  pressed: {
    backgroundColor: colors.chip,
  },
  bubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.chip,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.chip,
    marginTop: 4,
    overflow: 'hidden',
  },
  trackFill: {
    height: 6,
    borderRadius: 3,
  },
  addLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  transfer: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: '#2C2C2E',
    elevation: 4,
  },
});
