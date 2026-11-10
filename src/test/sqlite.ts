// Test double for expo-sqlite: the same async interface the app uses, backed by a real SQLite
// in memory (node:sqlite), so migrations and queries run exactly the SQL that runs on the phone.

import type { SQLiteDatabase } from 'expo-sqlite';

type Param = string | number | null;

interface Statement {
  run(...params: Param[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: Param[]): unknown;
  all(...params: Param[]): unknown[];
}
interface NodeDatabase {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
}

function openNodeDatabase(): NodeDatabase {
  // Jest's own require() does not know this builtin yet; ask Node directly.
  const sqlite = process.getBuiltinModule('node:sqlite') as unknown as { DatabaseSync: new (path: string) => NodeDatabase };
  return new sqlite.DatabaseSync(':memory:');
}

function flatten(params: unknown[]): Param[] {
  const list = params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params;
  return list.map((p) => (p === undefined ? null : (p as Param)));
}

/** Lets other promises run between queries, like the native bridge does. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export interface TestDatabase extends SQLiteDatabase {
  /** Number of BEGINs seen, to check that a save is one transaction. */
  transactionCount: number;
}

export function openTestDatabase(): TestDatabase {
  const native = openNodeDatabase();
  const db = {
    transactionCount: 0,
    async execAsync(sql: string) {
      await tick();
      native.exec(sql);
    },
    async runAsync(sql: string, ...params: unknown[]) {
      await tick();
      const result = native.prepare(sql).run(...flatten(params));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getFirstAsync(sql: string, ...params: unknown[]) {
      await tick();
      const row = native.prepare(sql).get(...flatten(params));
      return row ? { ...(row as object) } : null;
    },
    async getAllAsync(sql: string, ...params: unknown[]) {
      await tick();
      return native.prepare(sql).all(...flatten(params)).map((row) => ({ ...(row as object) }));
    },
    // Same behavior as expo-sqlite: a second BEGIN on the connection throws.
    async withTransactionAsync(task: () => Promise<void>) {
      db.transactionCount++;
      await db.execAsync('BEGIN');
      try {
        await task();
        await db.execAsync('COMMIT');
      } catch (error) {
        try {
          await db.execAsync('ROLLBACK');
        } catch {
          // already rolled back
        }
        throw error;
      }
    },
    async withExclusiveTransactionAsync(task: (txn: SQLiteDatabase) => Promise<void>) {
      await db.withTransactionAsync(() => task(db as unknown as SQLiteDatabase));
    },
    async closeAsync() {
      native.close();
    },
  };
  return db as unknown as TestDatabase;
}

export async function userVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

export async function count(db: SQLiteDatabase, table: string, where = '1 = 1'): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`);
  return row?.n ?? 0;
}
