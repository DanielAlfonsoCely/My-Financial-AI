import { Feather } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { IconButton } from '../src/components/IconButton';
import { deleteTrade, ensureInstrument, getInstrument, getPortfolio, getTrade, type InstrumentInput, latestFxRates, saveTrade } from '../src/db/investments';
import { getAccount } from '../src/db/repo';
import type { AccountWithBalance, TradeSide } from '../src/db/types';
import { useKeyboardInset } from '../src/hooks/useKeyboardInset';
import { DEFAULT_CURRENCY, formatAmount, formatMoney } from '../src/lib/money';
import { convertMinor, formatPrice, formatQuantity, parseScaled, PRICE_SCALE, QUANTITY_SCALE, valueMinor } from '../src/lib/portfolio';
import { lookupQuote, refreshPrices, searchSymbols } from '../src/prices/service';
import type { SymbolMatch } from '../src/prices/types';
import { showToast } from '../src/lib/toast';
import { colors, fonts, radius } from '../src/theme';

type Params = { accountId: string; id?: string; instrumentId?: string };
type Chosen = InstrumentInput & { id?: string };

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function orderTime(d: Date): string {
  const hour = d.getHours() % 12 || 12;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${hour}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'a. m.' : 'p. m.'}`;
}
const symbolOf = (currency: string) => (currency === 'USD' ? 'US$' : currency === DEFAULT_CURRENCY ? '$' : `${currency} `);
const decimalInput = (text: string) => text.replace(/[^\d.,]/g, '').slice(0, 14);

/**
 * Register a buy or a sell (or edit one): what, how many, at what price, the commission, and the
 * day and time of the order. Buying takes the money out of the account's free cash.
 */
export default function TradeScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const params = useLocalSearchParams<Params>();
  const accountId = params.accountId;
  const editingId = typeof params.id === 'string' && params.id ? params.id : null;

  const [account, setAccount] = useState<AccountWithBalance | null>(null);
  const [side, setSide] = useState<TradeSide>('buy');
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SymbolMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [fee, setFee] = useState('');
  const [date, setDate] = useState(() => new Date());
  const [held, setHeld] = useState<Map<string, number>>(new Map());
  const [rate, setRate] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    getAccount(db, accountId).then(async (a) => {
      setAccount(a);
      if (a) setRate((await latestFxRates(db)).get(`${a.currency}${DEFAULT_CURRENCY}`)?.rate_e4 ?? null);
    });
    getPortfolio(db, accountId).then((p) => setHeld(new Map((p?.holdings ?? []).map((h) => [h.instrument.id, h.quantity_e6]))));
  }, [db, accountId]);

  useEffect(() => {
    if (editingId) {
      getTrade(db, editingId).then(async (t) => {
        if (!t) {
          router.back();
          return;
        }
        const instrument = await getInstrument(db, t.instrument_id);
        if (instrument) setChosen(instrument);
        setSide(t.side);
        setQuantity(formatQuantity(t.quantity_e6));
        setPrice(formatPrice(t.price_e4));
        setFee(t.fee_minor ? formatAmount(t.fee_minor, t.currency) : '');
        setDate(new Date(t.executed_at));
      });
    } else if (typeof params.instrumentId === 'string' && params.instrumentId) {
      getInstrument(db, params.instrumentId).then((instrument) => instrument && setChosen(instrument));
    }
  }, [db, editingId, params.instrumentId]);

  // Search while typing, a moment after the last key.
  useEffect(() => {
    if (chosen || query.trim().length < 1) {
      setMatches([]);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchSymbols(query)
        .then((found) => {
          if (!active) return;
          setMatches(found);
          setSearchFailed(false);
        })
        .catch(() => active && setSearchFailed(true))
        .finally(() => active && setSearching(false));
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, chosen]);

  const currency = chosen?.currency ?? account?.currency ?? 'USD';
  const sym = symbolOf(currency);
  const quantityE6 = parseScaled(quantity, QUANTITY_SCALE);
  const priceE4 = parseScaled(price, PRICE_SCALE);
  const feeMinor = fee.trim() ? parseScaled(fee, 100) : 0;
  const gross = quantityE6 && priceE4 ? valueMinor(quantityE6, priceE4, currency) : 0;
  const total = side === 'buy' ? gross + (feeMinor ?? 0) : gross - (feeMinor ?? 0);
  const totalInPesos = rate && currency !== DEFAULT_CURRENCY && gross > 0 ? convertMinor(total, rate, currency, DEFAULT_CURRENCY) : null;
  const heldNow = chosen?.id ? held.get(chosen.id) ?? 0 : 0;
  const canSave = !!chosen && !!quantityE6 && !!priceE4 && feeMinor !== null && !saving && !!account;

  /** Picks a search result: its quote confirms the symbol, says the currency and suggests the price. */
  const pick = async (match: SymbolMatch) => {
    Keyboard.dismiss();
    const base: Chosen = { symbol: match.symbol, name: match.name, exchange: match.exchange, currency: account?.currency ?? 'USD', provider_symbol: match.provider_symbol };
    setChosen(base);
    setMatches([]);
    try {
      const quote = await lookupQuote(match.provider_symbol);
      setChosen({ ...base, currency: quote.currency ?? base.currency });
      setPrice((current) => current || formatPrice(quote.price_e4));
    } catch {
      // Without a quote the symbol is kept as typed; the price is written by hand.
    }
  };

  /** No connection: the symbol typed is used as it is, in the account's currency. */
  const useTyped = () => {
    const symbol = query.trim().toUpperCase();
    if (!symbol) return;
    Keyboard.dismiss();
    setChosen({ symbol, name: symbol, exchange: '', currency: account?.currency ?? 'USD', provider_symbol: symbol });
    setMatches([]);
  };

  const pickDate = () => {
    Keyboard.dismiss();
    DateTimePickerAndroid.open({
      value: date,
      mode: 'date',
      maximumDate: new Date(),
      onChange: (event, day) => {
        if (event.type !== 'set' || !day) return;
        // Then the time: the order's hour is what sets the price.
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          is24Hour: false,
          onChange: (timeEvent, time) => {
            const hours = timeEvent.type === 'set' && time ? time : date;
            setDate(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours.getHours(), hours.getMinutes()));
          },
        });
      },
    });
  };

  const save = async () => {
    if (!canSave || !chosen || !quantityE6 || !priceE4 || !account) return;
    setSaving(true);
    try {
      const instrumentId = chosen.id ?? (await ensureInstrument(db, chosen));
      await saveTrade(
        db,
        { account_id: account.id, instrument_id: instrumentId, side, quantity_e6: quantityE6, price_e4: priceE4, fee_minor: feeMinor ?? 0, executed_at: Math.min(date.getTime(), Date.now()) },
        editingId,
      );
      showToast({ kind: 'success', emoji: side === 'buy' ? '📈' : '💵', title: `${side === 'buy' ? 'Compra' : 'Venta'} ${chosen.symbol}`, chip: `${sym}${formatAmount(gross, currency)}` });
      // Its price and history are fetched in the background; the screen behind refreshes by itself.
      void refreshPrices(db, { force: true });
      router.back();
    } catch (error) {
      setSaving(false);
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : String(error));
    }
  };

  const remove = () => {
    if (!editingId) return;
    Alert.alert('Borrar operación', 'El saldo libre y las posiciones se recalculan sin ella.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTrade(db, editingId);
            router.back();
          } catch (error) {
            Alert.alert('No se pudo borrar', error instanceof Error ? error.message : String(error));
          }
        },
      },
    ]);
  };

  const field = (label: string, value: string, onChange: (text: string) => void, placeholder: string) => (
    <View style={styles.field}>
      <AppText weight="semibold" size={12} color={colors.textMuted}>
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(decimalInput(text))}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={styles.number}
      />
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]} onLayout={keyboard.onLayout}>
      <View style={styles.header}>
        <View style={styles.segment}>
          {(['buy', 'sell'] as const).map((s) => (
            <Pressable key={s} onPress={() => setSide(s)} style={[styles.segmentItem, side === s && { backgroundColor: colors.text }]} accessibilityState={{ selected: side === s }}>
              <AppText weight="bold" size={14} color={side === s ? colors.surface : colors.textMuted}>
                {s === 'buy' ? 'Compra' : 'Venta'}
              </AppText>
            </Pressable>
          ))}
        </View>
        <View style={styles.headerRight}>
          {editingId && <IconButton icon="trash-2" label="Borrar" color={colors.danger} background={colors.surface} onPress={remove} />}
          <IconButton icon="x" label="Cerrar" background={colors.surface} onPress={() => router.back()} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {chosen ? (
          <View style={styles.instrument}>
            <View style={styles.flex}>
              <AppText weight="extrabold" size={28}>
                {chosen.symbol}
              </AppText>
              <AppText size={13} color={colors.textMuted} numberOfLines={1}>
                {chosen.name}
              </AppText>
              <AppText size={12} color={colors.textMuted}>
                {[chosen.exchange, chosen.currency].filter(Boolean).join(' · ')}
                {side === 'sell' || heldNow > 0 ? ` · tienes ${formatQuantity(heldNow)}` : ''}
              </AppText>
            </View>
            {!editingId && (
              <Pressable onPress={() => setChosen(null)} style={styles.chip}>
                <AppText weight="bold" size={13}>
                  Cambiar
                </AppText>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.field}>
            <AppText weight="semibold" size={12} color={colors.textMuted}>
              ¿Qué {side === 'buy' ? 'compraste' : 'vendiste'}?
            </AppText>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Símbolo o nombre: VOO, Nvidia…"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              style={styles.search}
            />
            {searching && <ActivityIndicator style={styles.spinner} color={colors.textMuted} />}
            {matches.map((m) => (
              <Pressable key={m.provider_symbol} onPress={() => pick(m)} style={({ pressed }) => [styles.match, pressed && styles.pressed]}>
                <View style={styles.flex}>
                  <AppText weight="bold" size={15}>
                    {m.provider_symbol}
                  </AppText>
                  <AppText size={12} color={colors.textMuted} numberOfLines={1}>
                    {m.name}
                  </AppText>
                </View>
                <AppText size={12} color={colors.textMuted}>
                  {[m.kind, m.exchange].filter(Boolean).join(' · ')}
                </AppText>
              </Pressable>
            ))}
            {query.trim().length > 0 && !searching && (searchFailed || matches.length === 0) && (
              <Pressable onPress={useTyped} style={styles.match}>
                <Feather name="edit-3" size={15} color={colors.text} />
                <AppText weight="semibold" size={14} style={styles.flex}>
                  {searchFailed ? 'Sin conexión para buscar. ' : 'No lo encontré. '}Usar “{query.trim().toUpperCase()}” tal cual
                </AppText>
              </Pressable>
            )}
          </View>
        )}

        {chosen && (
          <>
            {field('Cantidad', quantity, setQuantity, '0,3512')}
            {field(`Precio por unidad · ${sym.trim()}`, price, setPrice, '598,20')}
            {field(`Comisión · ${sym.trim()}`, fee, setFee, '0')}

            <View style={styles.field}>
              <AppText weight="semibold" size={12} color={colors.textMuted}>
                Día y hora de la orden
              </AppText>
              <Pressable onPress={pickDate} style={[styles.chip, styles.dateChip]}>
                <AppText weight="bold" size={14}>
                  {orderTime(date)}
                </AppText>
                <Feather name="chevron-down" size={14} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.card}>
              <AppText size={13} color={colors.textMuted}>
                {side === 'buy' ? `Se paga desde ${account?.name ?? ''} · saldo libre` : `Entra a ${account?.name ?? ''} · saldo libre`}
              </AppText>
              <AppText weight="extrabold" size={28}>
                {sym}
                {formatAmount(Math.max(0, total), currency)}
              </AppText>
              {totalInPesos !== null && (
                <AppText size={13} color={colors.textMuted}>
                  ≈ {formatMoney(Math.max(0, totalInPesos))} COP
                </AppText>
              )}
              {account && side === 'buy' && gross > 0 && total > account.balance && !editingId && (
                <AppText size={12} color={colors.danger}>
                  El saldo libre es {sym}
                  {formatAmount(account.balance, currency)}: quedará en negativo. Registra primero el depósito como una
                  transferencia hacia {account.name}.
                </AppText>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: keyboard.inset > 0 ? 12 : insets.bottom + 12 }]}>
        <Pressable onPress={save} disabled={!canSave} style={[styles.saveButton, !canSave && styles.disabled]}>
          <Feather name="check" size={20} color={colors.surface} />
          <AppText weight="bold" size={17} color={colors.surface}>
            Guardar {side === 'buy' ? 'compra' : 'venta'}
          </AppText>
        </Pressable>
      </View>
      <View style={{ height: keyboard.inset }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  headerRight: { flexDirection: 'row', gap: 10 },
  segment: { flexDirection: 'row', backgroundColor: colors.chip, borderRadius: radius.pill, padding: 3 },
  segmentItem: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill },
  body: { paddingHorizontal: 24, paddingVertical: 20, gap: 16 },
  instrument: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  field: { gap: 6 },
  search: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.text, padding: 0, includeFontPadding: false },
  number: { fontFamily: fonts.bold, fontSize: 24, color: colors.text, padding: 0, includeFontPadding: false },
  spinner: { alignSelf: 'flex-start', paddingVertical: 8 },
  match: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  pressed: { backgroundColor: colors.chip },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.chip },
  dateChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6 },
  card: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, gap: 4 },
  bottom: { paddingHorizontal: 16, paddingTop: 8 },
  saveButton: { height: 56, borderRadius: radius.md, backgroundColor: '#2C2C2E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disabled: { opacity: 0.35 },
});
