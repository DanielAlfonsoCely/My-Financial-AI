import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { IconButton } from '../src/components/IconButton';
import { LineChart } from '../src/components/LineChart';
import { PillButton } from '../src/components/PillButton';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { getPortfolio, latestFxRates, listHistory, listTrades, type Portfolio, type TradeWithInstrument, type FxRate } from '../src/db/investments';
import { getAccount, getSetting } from '../src/db/repo';
import type { AccountWithBalance, Instrument } from '../src/db/types';
import { useQuery } from '../src/hooks/useData';
import { usePriceRefresh } from '../src/hooks/usePriceRefresh';
import { DEFAULT_CURRENCY, formatAmount, formatMoney } from '../src/lib/money';
import {
  convertMinor,
  dayToTime,
  formatPercent,
  formatPrice,
  formatQuantity,
  portfolioSeries,
  priceLookup,
  type PricePoint,
  timeline,
} from '../src/lib/portfolio';
import { fetchIntraday, SETTING_PRICES_REFRESHED_AT } from '../src/prices/service';
import { colors, radius } from '../src/theme';

type Range = 'day' | 'week' | 'month' | 'year' | 'all';
const RANGES: { key: Range; label: string }[] = [
  { key: 'day', label: 'Día' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'year', label: 'Año' },
  { key: 'all', label: 'Todo' },
];
const DAY = 86_400_000;
const CHART_HEIGHT = 150;
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const symbolOf = (currency: string) => (currency === 'USD' ? 'US$' : currency === DEFAULT_CURRENCY ? '$' : `${currency} `);
const signed = (minor: number, currency: string) => `${minor < 0 ? '−' : '+'}${formatAmount(Math.abs(minor), currency)}`;

function ago(ms: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const d = new Date(ms);
  return `el ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function orderTime(ms: number): string {
  const d = new Date(ms);
  const hour = d.getHours() % 12 || 12;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${hour}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'a. m.' : 'p. m.'}`;
}

interface Data {
  account: AccountWithBalance | null;
  portfolio: Portfolio | null;
  trades: TradeWithInstrument[];
  history: Map<string, PricePoint[]>;
  fx: FxRate | null;
  refreshedAt: number | null;
}

const EMPTY: Data = { account: null, portfolio: null, trades: [], history: new Map(), fx: null, refreshedAt: null };

/**
 * The portfolio of a broker account: what it is worth, today's and the total gain, the chart and
 * the positions. Prices come from the cache in SQLite, so it opens offline with the last known ones.
 */
export default function InvestmentsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const [range, setRange] = useState<Range>('month');
  const [intraday, setIntraday] = useState<{ range: Range; points: Map<string, PricePoint[]> } | null>(null);
  const [intradayFailed, setIntradayFailed] = useState(false);
  const prices = usePriceRefresh();

  const { data, loaded } = useQuery(
    async (): Promise<Data> => {
      if (!accountId) return EMPTY;
      const [account, portfolio, trades, rates, refreshed] = await Promise.all([
        getAccount(db, accountId),
        getPortfolio(db, accountId),
        listTrades(db, accountId),
        latestFxRates(db),
        getSetting(db, SETTING_PRICES_REFRESHED_AT),
      ]);
      const history = new Map<string, PricePoint[]>();
      for (const id of new Set(trades.map((t) => t.instrument_id))) {
        history.set(id, (await listHistory(db, id)).map((d) => ({ t: dayToTime(d.day), price_e4: d.close_e4 })));
      }
      return {
        account,
        portfolio,
        trades,
        history,
        fx: account ? rates.get(`${account.currency}${DEFAULT_CURRENCY}`) ?? null : null,
        refreshedAt: refreshed ? Number(refreshed) : null,
      };
    },
    EMPTY,
    [db, accountId],
  );
  const { account, portfolio, trades, history, fx } = data;

  // Day and week need prices within the day, which are fetched live and never stored.
  const heldKey = (portfolio?.holdings ?? []).filter((h) => h.quantity_e6 > 0).map((h) => h.instrument.id).join(',');
  useEffect(() => {
    if (range !== 'day' && range !== 'week') return;
    const instruments = (portfolio?.holdings ?? []).filter((h) => h.quantity_e6 > 0).map((h) => h.instrument as Instrument);
    if (instruments.length === 0) return;
    let active = true;
    setIntradayFailed(false);
    fetchIntraday(instruments, range === 'day' ? '1d' : '5d')
      .then((points) => active && setIntraday({ range, points }))
      .catch(() => active && setIntradayFailed(true));
    return () => {
      active = false;
    };
    // `heldKey` stands for the list of instruments held.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, heldKey, data.refreshedAt]);

  const series = useMemo(() => {
    if (trades.length === 0) return [];
    const daily = priceLookup(history);
    if (range === 'day' || range === 'week') {
      if (!intraday || intraday.range !== range) return [];
      return portfolioSeries(trades, timeline(intraday.points.values()), priceLookup(intraday.points, daily));
    }
    const now = Date.now();
    const first = Math.min(...trades.map((t) => t.executed_at));
    const from = range === 'month' ? now - 30 * DAY : range === 'year' ? now - 365 * DAY : first - DAY;
    return portfolioSeries(trades, timeline(history.values(), Math.max(from, first - DAY)), daily);
  }, [trades, history, range, intraday]);

  if (!accountId || (loaded && !account)) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <ScreenHeader title="Inversiones" />
        <AppText size={14} color={colors.textMuted} style={styles.pad}>
          Esta cuenta ya no existe.
        </AppText>
      </View>
    );
  }

  const currency = account?.currency ?? 'USD';
  const sym = symbolOf(currency);
  const total = portfolio?.total_minor ?? 0;
  const open = (portfolio?.holdings ?? []).filter((h) => h.quantity_e6 > 0);
  const inPesos = fx && currency !== DEFAULT_CURRENCY ? convertMinor(total, fx.rate_e4, currency, DEFAULT_CURRENCY) : null;
  const dayChange = portfolio?.day_change_minor ?? null;
  const dayRatio = dayChange !== null && portfolio && portfolio.prev_value_minor > 0 ? dayChange / portfolio.prev_value_minor : null;
  const gainRatio = portfolio && portfolio.cost_minor > 0 ? portfolio.gain_minor / portfolio.cost_minor : null;
  const tone = (value: number | null) => (value === null || value === 0 ? colors.textMuted : value > 0 ? colors.income : colors.danger);
  const now = Date.now();
  const newTrade = () => router.push({ pathname: '/trade', params: { accountId } });
  const chartColor = series.length >= 2 && series[series.length - 1].value < series[0].value ? colors.danger : colors.income;
  const needsLive = range === 'day' || range === 'week';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader
        title="Inversiones"
        subtitle={`${account?.name ?? ''} · valor del portafolio`}
        actions={
          <>
            <IconButton icon="settings" label="Datos de la cuenta" background={colors.surface} onPress={() => router.push({ pathname: '/account', params: { id: accountId } })} />
            <IconButton icon="plus" label="Nueva operación" background={colors.surface} onPress={newTrade} />
          </>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={prices.refreshing} onRefresh={prices.refresh} />}
      >
        <View style={styles.headline}>
          <View style={styles.totalRow}>
            <AppText weight="semibold" size={20} color={colors.textMuted} style={styles.currency}>
              {sym}
            </AppText>
            <AppText weight="extrabold" size={48} numberOfLines={1} adjustsFontSizeToFit style={styles.total}>
              {total < 0 ? '−' : ''}
              {formatAmount(total, currency)}
            </AppText>
          </View>
          {inPesos !== null && (
            <AppText size={14} color={colors.textMuted}>
              ≈ {formatMoney(inPesos)} COP
            </AppText>
          )}
          <View style={styles.changes}>
            <AppText weight="bold" size={14} color={tone(dayChange)}>
              Hoy {dayChange === null ? '—' : `${signed(dayChange, currency)}${dayRatio !== null ? ` · ${formatPercent(dayRatio)}` : ''}`}
            </AppText>
            <AppText weight="bold" size={14} color={tone(portfolio?.gain_minor ?? null)}>
              Total {portfolio && open.length > 0 ? `${signed(portfolio.gain_minor, currency)}${gainRatio !== null ? ` · ${formatPercent(gainRatio)}` : ''}` : '—'}
            </AppText>
          </View>
        </View>

        {trades.length === 0 ? (
          <View style={styles.empty}>
            <AppText size={36}>📈</AppText>
            <AppText weight="extrabold" size={20} style={styles.center}>
              Todavía no hay operaciones
            </AppText>
            <AppText size={14} color={colors.textMuted} style={styles.center}>
              Registra una compra con el símbolo, la cantidad, el precio y la hora de la orden. Los precios se
              actualizan solos, sin costo.
            </AppText>
            <PillButton label="Registrar compra" icon="plus" onPress={newTrade} />
          </View>
        ) : (
          <>
            <View style={styles.chart}>
              {series.length >= 2 ? (
                <LineChart values={series.map((p) => p.value)} width={width - 32} height={CHART_HEIGHT} color={chartColor} />
              ) : (
                <View style={[styles.chartEmpty, { height: CHART_HEIGHT }]}>
                  <AppText size={13} color={colors.textMuted} style={styles.center}>
                    {needsLive && intradayFailed
                      ? 'El gráfico del día y de la semana necesita conexión.'
                      : needsLive && !intraday
                        ? 'Cargando precios…'
                        : 'Todavía no hay suficientes precios para dibujar este período. Desliza hacia abajo para actualizar.'}
                  </AppText>
                </View>
              )}
            </View>
            <View style={styles.ranges}>
              {RANGES.map((r) => (
                <Pressable key={r.key} onPress={() => setRange(r.key)} style={[styles.range, range === r.key && styles.rangeActive]} accessibilityState={{ selected: range === r.key }}>
                  <AppText weight="bold" size={13} color={range === r.key ? colors.surface : colors.textMuted}>
                    {r.label}
                  </AppText>
                </Pressable>
              ))}
            </View>

            <View style={styles.sectionTitle}>
              <AppText weight="extrabold" size={18}>
                Posiciones
              </AppText>
              <AppText size={12} color={colors.textMuted}>
                Precios con retraso
              </AppText>
            </View>
            {open.map((h) => {
              const ratio = h.cost_minor > 0 ? h.gain_minor / h.cost_minor : null;
              return (
                <Pressable
                  key={h.instrument.id}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  onPress={() => router.push({ pathname: '/trade', params: { accountId, instrumentId: h.instrument.id } })}
                >
                  <View style={styles.flex}>
                    <AppText weight="bold" size={16}>
                      {h.instrument.symbol}
                    </AppText>
                    <AppText size={12} color={colors.textMuted} numberOfLines={1}>
                      {h.instrument.name}
                    </AppText>
                    <AppText size={12} color={colors.textMuted}>
                      {formatQuantity(h.quantity_e6)} · compra a {formatPrice(h.avg_price_e4)}
                      {h.quote ? ` · hoy ${formatPrice(h.price_e4)}` : ' · sin precio aún'}
                    </AppText>
                  </View>
                  <View style={styles.right}>
                    <AppText weight="bold" size={16}>
                      {formatAmount(h.value_minor, currency)}
                    </AppText>
                    <AppText weight="bold" size={12} color={tone(h.quote ? h.gain_minor : null)}>
                      {h.quote && ratio !== null ? formatPercent(ratio) : '—'}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
            {open.length === 0 && (
              <AppText size={14} color={colors.textMuted} style={styles.pad}>
                Vendiste todo: no hay posiciones abiertas.
              </AppText>
            )}

            <View style={styles.card}>
              <Line label="Saldo libre" value={`${sym}${formatAmount(portfolio?.cash_minor ?? 0, currency)}`} />
              <Line label="En posiciones" value={`${sym}${formatAmount(portfolio?.holdings_value_minor ?? 0, currency)}`} />
              {!!portfolio?.realized_minor && <Line label="Ganancia ya realizada" value={`${sym}${signed(portfolio.realized_minor, currency)}`} last />}
            </View>

            <AppText size={12} color={colors.textMuted} style={styles.pad}>
              {portfolio?.as_of ? `Precios de ${ago(portfolio.as_of, now)}` : 'Algunas posiciones todavía no tienen precio'}
              {fx ? ` · TRM ${formatMoney(Math.round(fx.rate_e4 / 10_000))} (${fx.day})` : currency !== DEFAULT_CURRENCY ? ' · sin TRM todavía' : ''}
              {prices.last?.error ? `\n${prices.last.error}` : ''}
              {prices.last && prices.last.failed.length > 0 ? ` Sin precio nuevo: ${prices.last.failed.join(', ')}.` : ''}
            </AppText>

            <View style={styles.sectionTitle}>
              <AppText weight="extrabold" size={18}>
                Operaciones
              </AppText>
            </View>
            {trades.map((t) => (
              <Pressable
                key={t.id}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() => router.push({ pathname: '/trade', params: { accountId, id: t.id } })}
              >
                <View style={[styles.side, { backgroundColor: t.side === 'buy' ? colors.incomeSoft : colors.accentSoft }]}>
                  <Feather name={t.side === 'buy' ? 'arrow-down-left' : 'arrow-up-right'} size={16} color={colors.text} />
                </View>
                <View style={styles.flex}>
                  <AppText weight="bold" size={15}>
                    {t.side === 'buy' ? 'Compra' : 'Venta'} {t.symbol}
                  </AppText>
                  <AppText size={12} color={colors.textMuted}>
                    {formatQuantity(t.quantity_e6)} a {formatPrice(t.price_e4)} · {orderTime(t.executed_at)}
                  </AppText>
                </View>
                <AppText weight="bold" size={15}>
                  {formatAmount(t.gross_minor, t.currency)}
                </AppText>
              </Pressable>
            ))}
          </>
        )}

        <Pressable style={styles.link} onPress={() => router.push('/prices')}>
          <Feather name="sliders" size={15} color={colors.textMuted} />
          <AppText weight="semibold" size={13} color={colors.textMuted}>
            De dónde salen los precios
          </AppText>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Line({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.line, !last && styles.lineDivider]}>
      <AppText size={14} color={colors.textMuted} style={styles.flex}>
        {label}
      </AppText>
      <AppText weight="bold" size={15}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  pad: { paddingHorizontal: 20, paddingTop: 10 },
  headline: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 8, gap: 4 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  total: { letterSpacing: -1, flexShrink: 1 },
  currency: { marginBottom: 8 },
  changes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16, rowGap: 2, paddingTop: 4 },
  empty: { alignItems: 'center', gap: 12, paddingHorizontal: 32, paddingVertical: 40 },
  chart: { paddingHorizontal: 16, paddingTop: 20 },
  chartEmpty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  ranges: { alignSelf: 'center', flexDirection: 'row', marginTop: 12, padding: 3, borderRadius: radius.pill, backgroundColor: colors.chip },
  range: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: radius.pill },
  rangeActive: { backgroundColor: colors.text },
  sectionTitle: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 28, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  pressed: { backgroundColor: colors.chip },
  right: { alignItems: 'flex-end', gap: 2 },
  side: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { marginHorizontal: 20, marginTop: 14, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: colors.surface },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  lineDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  link: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, paddingVertical: 20 },
});
