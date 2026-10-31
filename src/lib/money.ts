// Amounts are stored as integers in the currency's minor unit.
// COP has no decimals, so 25.000 COP is stored as 25000.

const DECIMALS: Record<string, number> = {
  COP: 0,
  USD: 2,
  EUR: 2,
};

export const DEFAULT_CURRENCY = 'COP';

export function currencyDecimals(currency: string): number {
  return DECIMALS[currency] ?? 2;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Number only, Colombian style: 2293479 -> "2.293.479". */
export function formatAmount(amountMinor: number, currency = DEFAULT_CURRENCY): string {
  const decimals = currencyDecimals(currency);
  const abs = Math.abs(Math.round(amountMinor));
  const units = Math.floor(abs / 10 ** decimals);
  const fraction = abs % 10 ** decimals;
  const grouped = groupThousands(String(units));
  return decimals > 0 ? `${grouped},${String(fraction).padStart(decimals, '0')}` : grouped;
}

/** With currency symbol: 25000 -> "$25.000". */
export function formatMoney(amountMinor: number, currency = DEFAULT_CURRENCY): string {
  return `$${formatAmount(amountMinor, currency)}`;
}

/** Short form for bars and widgets: 250000 -> "250K", 1500000 -> "1,5M". */
export function formatCompact(amountMinor: number, currency = DEFAULT_CURRENCY): string {
  const value = Math.abs(amountMinor) / 10 ** currencyDecimals(currency);
  const short = (n: number, suffix: string) => {
    const rounded = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
    return `${String(rounded).replace('.', ',')}${suffix}`;
  };
  if (value >= 1_000_000) return short(value / 1_000_000, 'M');
  if (value >= 1_000) return short(value / 1_000, 'K');
  return String(Math.round(value));
}
