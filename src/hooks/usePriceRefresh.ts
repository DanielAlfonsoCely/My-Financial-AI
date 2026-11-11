import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { REFRESH_EVERY_MS, refreshPrices, type RefreshResult } from '../prices/service';

/**
 * Keeps prices fresh while a screen that shows them is open: when it opens, every 15 minutes, and
 * when the app comes back to the front. `refresh()` forces it (pull down to refresh).
 */
export function usePriceRefresh(): { refreshing: boolean; last: RefreshResult | null; refresh: () => Promise<void> } {
  const db = useSQLiteContext();
  const [refreshing, setRefreshing] = useState(false);
  const [last, setLast] = useState<RefreshResult | null>(null);

  const run = useCallback(
    async (force: boolean) => {
      if (force) setRefreshing(true);
      const result = await refreshPrices(db, { force });
      if (result.ran) setLast(result);
      if (force) setRefreshing(false);
    },
    [db],
  );

  useEffect(() => {
    run(false);
    const timer = setInterval(() => run(false), REFRESH_EVERY_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run(false);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [run]);

  const refresh = useCallback(() => run(true), [run]);
  return { refreshing, last, refresh };
}
