import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { IconButton } from '../src/components/IconButton';
import { TransactionRow } from '../src/components/TransactionRow';
import {
  createAccount,
  deleteAccount,
  getAccount,
  isInvestmentType,
  listAccountGroups,
  listAccountTransactions,
  setAccountBalance,
  updateAccount,
} from '../src/db/repo';
import type { AccountGroup, AccountType, AccountWithBalance, TransactionWithCategory } from '../src/db/types';
import { useQuery } from '../src/hooks/useData';
import { useKeyboardInset } from '../src/hooks/useKeyboardInset';
import { ACCOUNT_TYPE_LABEL } from '../src/lib/accounts';
import { DEFAULT_CURRENCY, formatMoney } from '../src/lib/money';
import { showToast } from '../src/lib/toast';
import { categoryPalette, colors, fonts, radius } from '../src/theme';

type Params = { id?: string; groupId?: string; type?: string };

const TYPE_ORDER: AccountType[] = ['cash', 'savings', 'wallet', 'credit', 'asset', 'broker'];
const TYPE_EMOJI: Record<AccountType, string> = { cash: '💵', savings: '🏦', wallet: '📱', credit: '💳', asset: '🏛️', broker: '📈' };
const TYPE_HINT: Record<AccountType, string> = {
  cash: 'Billetes y monedas: la billetera, una alcancía.',
  savings: 'Una cuenta de banco.',
  wallet: 'Nequi, Daviplata y parecidas.',
  credit: 'Es una deuda: lo que compras con ella sube lo que debes y pagarla lo baja.',
  asset: 'Una inversión que actualizas a mano: CDT, un inmueble. Va en el grupo Inversiones.',
  broker: 'Una cuenta de bolsa como XTB. Va en el grupo Inversiones.',
};
const CURRENCIES = ['COP', 'USD'];
const MOVEMENTS_SHOWN = 30;

const onlyDigits = (text: string) => text.replace(/\D/g, '').slice(0, 13);

function isAccountType(value: string | undefined): value is AccountType {
  return TYPE_ORDER.includes(value as AccountType);
}

/**
 * Create an account, or open one: its balance, "Cuadrar saldo", its details and latest movements.
 * ?groupId= and ?type= preselect where a new account goes ("Agregar a Inversiones", "Agregar tarjeta").
 */
export default function AccountScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const params = useLocalSearchParams<Params>();
  const editingId = typeof params.id === 'string' && params.id ? params.id : null;

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [type, setType] = useState<AccountType>(isAccountType(params.type) ? params.type : 'savings');
  const [groupId, setGroupId] = useState<string | null>(typeof params.groupId === 'string' && params.groupId ? params.groupId : null);
  const [color, setColor] = useState<string>(categoryPalette[Math.floor(Math.random() * categoryPalette.length)]);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [openingDigits, setOpeningDigits] = useState('');
  const [limitDigits, setLimitDigits] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [saving, setSaving] = useState(false);
  // "Cuadrar saldo": null = closed, otherwise the digits being typed.
  const [realDigits, setRealDigits] = useState<string | null>(null);
  const [realNegative, setRealNegative] = useState(false);

  const { data } = useQuery(
    async () => {
      const [groups, account, movements] = await Promise.all([
        listAccountGroups(db),
        editingId ? getAccount(db, editingId) : Promise.resolve(null),
        editingId ? listAccountTransactions(db, editingId, MOVEMENTS_SHOWN) : Promise.resolve([] as TransactionWithCategory[]),
      ]);
      return { groups, account, movements };
    },
    { groups: [] as AccountGroup[], account: null as AccountWithBalance | null, movements: [] as TransactionWithCategory[] },
    [db, editingId],
  );
  const account = data.account;

  // Fill the form once, when the account arrives.
  const loadedId = account?.id ?? null;
  useEffect(() => {
    if (!account) return;
    setName(account.name);
    setEmoji(account.emoji);
    setType(account.type);
    setGroupId(account.group_id);
    setColor(account.color);
    setCurrency(account.currency);
    setLimitDigits(account.credit_limit ? String(account.credit_limit) : '');
    setSubtitle(account.subtitle ?? '');
    // Only when another account is opened, not on every balance refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);

  const isCredit = type === 'credit';
  const investment = isInvestmentType(type);
  const userGroups = data.groups.filter((g) => !g.system_key);
  const shownEmoji = emoji.trim() || TYPE_EMOJI[type];
  const canSave = name.trim().length > 0 && !saving && (!isCredit || !limitDigits || Number(limitDigits) > 0);

  const pickType = (next: AccountType) => {
    setType(next);
    if (!editingId && next === 'broker') setCurrency('USD');
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const input = {
      name,
      emoji: shownEmoji,
      color,
      type,
      group_id: groupId,
      subtitle,
      currency,
      opening_balance: Number(openingDigits || '0'),
      credit_limit: limitDigits ? Number(limitDigits) : null,
    };
    try {
      if (editingId) await updateAccount(db, editingId, input);
      else await createAccount(db, input);
      router.back();
    } catch (error) {
      setSaving(false);
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : String(error));
    }
  };

  const remove = () => {
    if (!editingId) return;
    Alert.alert(
      `Archivar "${name}"`,
      'Sale del panel y de los totales. Sus movimientos se quedan como están y siguen mostrando su nombre.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Archivar',
          style: 'destructive',
          onPress: async () => {
            await deleteAccount(db, editingId);
            router.back();
          },
        },
      ],
    );
  };

  const applyRealBalance = async () => {
    if (!editingId || realDigits === null || realDigits === '') return;
    const value = Number(realDigits) * (realNegative ? -1 : 1);
    try {
      await setAccountBalance(db, editingId, value);
      setRealDigits(null);
      setRealNegative(false);
      showToast({ kind: 'success', emoji: shownEmoji, color, title: 'Saldo cuadrado', chip: formatMoney(value, currency) });
    } catch (error) {
      Alert.alert('No se pudo cuadrar', error instanceof Error ? error.message : String(error));
    }
  };

  const chips = <T extends string | null>(options: { value: T; label: string }[], selected: T, onPick: (value: T) => void) => (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o.value === selected;
        return (
          <Pressable key={String(o.value)} onPress={() => onPick(o.value)} style={[styles.chip, active && styles.chipActive]} accessibilityState={{ selected: active }}>
            <AppText weight="bold" size={13} color={active ? colors.surface : colors.text}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]} onLayout={keyboard.onLayout}>
      <View style={styles.header}>
        {editingId ? (
          <IconButton icon="archive" label="Archivar cuenta" color={colors.danger} background={colors.surface} onPress={remove} />
        ) : (
          <View />
        )}
        <IconButton icon="x" label="Cerrar" background={colors.surface} onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 110 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.nameRow}>
          <View style={[styles.tile, { backgroundColor: color }]}>
            <TextInput
              value={emoji}
              onChangeText={(text) => setEmoji([...text].slice(-2).join(''))}
              placeholder={TYPE_EMOJI[type]}
              style={styles.emoji}
              accessibilityLabel="Emoji de la cuenta"
            />
          </View>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nombre de la cuenta"
            placeholderTextColor={colors.textFaint}
            autoFocus={!editingId}
            maxLength={40}
            style={styles.name}
          />
        </View>

        {account && (
          <View style={styles.card}>
            <AppText size={13} color={colors.textMuted}>
              {isCredit ? 'Debes hoy' : 'Saldo hoy'}
            </AppText>
            <AppText weight="extrabold" size={34}>
              {account.balance < 0 ? '−' : ''}
              {formatMoney(account.balance, account.currency)}
              {account.currency !== DEFAULT_CURRENCY ? ` ${account.currency}` : ''}
            </AppText>
            {realDigits === null ? (
              <Pressable style={styles.linkButton} onPress={() => setRealDigits('')}>
                <Feather name="check-circle" size={15} color={colors.text} />
                <AppText weight="bold" size={14}>
                  {investment ? 'Actualizar valor' : 'Cuadrar saldo'}
                </AppText>
              </Pressable>
            ) : (
              <View style={styles.adjust}>
                <AppText size={12} color={colors.textMuted}>
                  Escribe lo que {isCredit ? 'debes' : 'hay'} de verdad. No crea ningún gasto ni ingreso.
                </AppText>
                <View style={styles.adjustRow}>
                  {!isCredit && (
                    <Pressable onPress={() => setRealNegative((v) => !v)} style={[styles.chip, realNegative && styles.chipActive]} accessibilityLabel="Saldo negativo">
                      <AppText weight="bold" size={13} color={realNegative ? colors.surface : colors.text}>
                        −
                      </AppText>
                    </Pressable>
                  )}
                  <TextInput
                    value={realDigits}
                    onChangeText={(text) => setRealDigits(onlyDigits(text))}
                    keyboardType="number-pad"
                    autoFocus
                    placeholder="0"
                    placeholderTextColor={colors.textFaint}
                    style={[styles.number, styles.flex]}
                  />
                  <Pressable onPress={applyRealBalance} disabled={realDigits === ''} style={[styles.chip, styles.chipActive, realDigits === '' && styles.disabled]}>
                    <AppText weight="bold" size={13} color={colors.surface}>
                      Listo
                    </AppText>
                  </Pressable>
                  <Pressable onPress={() => setRealDigits(null)} style={styles.chip}>
                    <AppText weight="bold" size={13}>
                      Cancelar
                    </AppText>
                  </Pressable>
                </View>
                {realDigits !== '' && (
                  <AppText size={12} color={colors.textMuted}>
                    Quedará en {realNegative ? '−' : ''}
                    {formatMoney(Number(realDigits), currency)}
                  </AppText>
                )}
              </View>
            )}
          </View>
        )}

        <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.label}>
          Tipo
        </AppText>
        {chips(TYPE_ORDER.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABEL[t] })), type, pickType)}
        <AppText size={12} color={colors.textMuted}>
          {TYPE_HINT[type]}
        </AppText>

        {!isCredit && !investment && (
          <>
            <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.label}>
              Grupo
            </AppText>
            {chips(
              [{ value: null as string | null, label: 'Sin grupo' }, ...userGroups.map((g) => ({ value: g.id as string | null, label: `${g.emoji} ${g.name}`.trim() }))],
              groupId,
              setGroupId,
            )}
            <Pressable style={styles.linkButton} onPress={() => router.push('/account-group')}>
              <Feather name="plus" size={15} color={colors.text} />
              <AppText weight="bold" size={14}>
                Nuevo grupo
              </AppText>
            </Pressable>
          </>
        )}

        {!editingId && (
          <>
            <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.label}>
              Moneda
            </AppText>
            {chips(CURRENCIES.map((c) => ({ value: c, label: c })), currency, setCurrency)}

            <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.label}>
              {isCredit ? 'Lo que debes hoy' : investment ? 'Lo que vale hoy' : 'Lo que tiene hoy'}
              {currency !== DEFAULT_CURRENCY ? ' (en centavos)' : ''}
            </AppText>
            <TextInput
              value={openingDigits}
              onChangeText={(text) => setOpeningDigits(onlyDigits(text))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textFaint}
              style={styles.number}
            />
            {openingDigits !== '' && (
              <AppText size={12} color={colors.textMuted}>
                {formatMoney(Number(openingDigits), currency)} {currency !== DEFAULT_CURRENCY ? currency : ''}
              </AppText>
            )}
          </>
        )}

        {isCredit && (
          <>
            <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.label}>
              Cupo
            </AppText>
            <TextInput
              value={limitDigits}
              onChangeText={(text) => setLimitDigits(onlyDigits(text))}
              keyboardType="number-pad"
              placeholder="Sin cupo"
              placeholderTextColor={colors.textFaint}
              style={styles.number}
            />
            {limitDigits !== '' && (
              <AppText size={12} color={colors.textMuted}>
                {formatMoney(Number(limitDigits), currency)}
              </AppText>
            )}
          </>
        )}

        <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.label}>
          Detalle (opcional)
        </AppText>
        <TextInput
          value={subtitle}
          onChangeText={setSubtitle}
          placeholder={investment ? 'Vence 14 mar 2027 · 11% E.A.' : 'Una nota corta'}
          placeholderTextColor={colors.textFaint}
          maxLength={60}
          style={styles.text}
        />

        <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.label}>
          Color
        </AppText>
        <View style={styles.chips}>
          {categoryPalette.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c }, c === color && styles.swatchActive]} accessibilityLabel={`Color ${c}`} />
          ))}
        </View>

        {editingId && (
          <>
            <AppText weight="extrabold" size={18} style={styles.movementsTitle}>
              Últimos movimientos
            </AppText>
            {data.movements.length === 0 && (
              <AppText size={14} color={colors.textMuted}>
                Todavía no hay movimientos con esta cuenta.
              </AppText>
            )}
          </>
        )}
        <View style={styles.movements}>
          {data.movements.map((t) => (
            <TransactionRow key={t.id} transaction={t} onPress={() => router.push({ pathname: '/transaction', params: { id: t.id } })} />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: keyboard.inset > 0 ? 12 : insets.bottom + 12 }]}>
        <Pressable onPress={save} disabled={!canSave} style={[styles.saveButton, !canSave && styles.disabled]}>
          <Feather name="check" size={20} color={colors.surface} />
          <AppText weight="bold" size={17} color={colors.surface}>
            Guardar
          </AppText>
        </Pressable>
      </View>
      <View style={{ height: keyboard.inset }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  tile: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 30,
    textAlign: 'center',
    padding: 0,
    minWidth: 48,
    color: colors.text,
  },
  name: {
    flex: 1,
    fontFamily: fonts.extrabold,
    fontSize: 26,
    color: colors.text,
    padding: 0,
    includeFontPadding: false,
  },
  card: {
    marginTop: 12,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: 4,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 8,
  },
  adjust: {
    gap: 6,
    paddingTop: 6,
  },
  adjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    marginTop: 14,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.chip,
  },
  chipActive: {
    backgroundColor: colors.text,
  },
  number: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: colors.text,
    padding: 0,
    includeFontPadding: false,
  },
  text: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.text,
    padding: 0,
    includeFontPadding: false,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: {
    borderColor: colors.text,
  },
  movementsTitle: {
    marginTop: 28,
  },
  movements: {
    marginHorizontal: -20,
  },
  bottom: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  saveButton: {
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
