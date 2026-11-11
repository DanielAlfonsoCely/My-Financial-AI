import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { enqueueWrite } from '../db/repo';

/**
 * When the app goes to the background, moves everything from the write-ahead log into
 * finanzas.db. Android's automatic backup copies the files as they are: without this it could
 * pick up a database missing its latest movements (they would still be only in the -wal file).
 */
export function useCheckpointOnBackground(): void {
  const db = useSQLiteContext();
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return;
      // Queued like any write, so it never runs in the middle of a save.
      enqueueWrite(() => db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)')).catch((error) =>
        console.warn('WAL checkpoint failed', error),
      );
    });
    return () => sub.remove();
  }, [db]);
}
