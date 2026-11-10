import type { SQLiteDatabase } from 'expo-sqlite';

import { SELECT_WITH_CATEGORY } from '../db/repo';
import type { TransactionWithCategory } from '../db/types';
import { shareFile } from './backup';
import { parseTags } from './tags';

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  voice: 'Voz',
  notification: 'Notificación',
  sms: 'SMS',
  ocr: 'Foto',
  import: 'Importado',
  recurring: 'Recurrente',
};

const KIND_LABEL: Record<TransactionWithCategory['kind'], string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Transferencia',
};

// Excel in Colombia uses ";" as the list separator (the comma is the decimal mark).
const SEP = ';';

/**
 * One CSV cell. Text that starts with = + - @ (or a tab / line break) would run as a formula when
 * the file is opened in Excel or Sheets, so it gets a leading apostrophe: the spreadsheet shows
 * it as plain text. Numbers are written as they are.
 */
export function cell(value: string | number): string {
  const raw = String(value);
  const text = typeof value === 'string' && /^[=+\-@\t\r\n]/.test(raw) ? `'${raw}` : raw;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Exports the transactions of one list as CSV and opens the share sheet. */
export async function exportCsv(db: SQLiteDatabase, listId: string, listName: string): Promise<number> {
  const rows = await db.getAllAsync<TransactionWithCategory>(
    `${SELECT_WITH_CATEGORY} WHERE t.deleted_at IS NULL AND t.list_id = ? ORDER BY t.occurred_at`,
    listId,
  );
  const header = ['Fecha', 'Tipo', 'Monto', 'Moneda', 'Categoría', 'Título', 'Cuenta', 'Cuenta destino', 'Etiquetas', 'Lista', 'Origen'];
  const lines = rows.map((t) =>
    [
      dateTime(t.occurred_at),
      KIND_LABEL[t.kind],
      t.amount,
      t.currency,
      t.kind === 'transfer' ? '' : t.category_name ?? 'Sin categoría',
      t.title,
      t.account_name ?? '',
      t.to_account_name ?? '',
      parseTags(t.tags).map((tag) => `#${tag}`).join(' '),
      listName,
      SOURCE_LABEL[t.source] ?? t.source,
    ]
      .map(cell)
      .join(SEP),
  );
  // The BOM makes Excel read accents (é, ñ) correctly.
  const content = `\uFEFF${[header.map(cell).join(SEP), ...lines].join('\r\n')}`;
  const stamp = new Date().toISOString().slice(0, 10);
  await shareFile(`movimientos-${stamp}.csv`, content, 'text/csv', 'Exportar CSV');
  return rows.length;
}
