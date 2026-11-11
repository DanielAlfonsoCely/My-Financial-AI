import { useSQLiteContext } from 'expo-sqlite';
import { type DependencyList, useCallback, useEffect, useRef, useState } from 'react';

import { getCurrentListId, listLists } from '../db/repo';
import { PERSONAL_LIST_ID } from '../db/seed';
import type { List } from '../db/types';
import { onDataChanged } from '../lib/events';

export interface QueryState<T> {
  data: T;
  loaded: boolean;
  /** Set when the last run failed; `data` keeps the last good result. Cleared by the next good run. */
  error: Error | null;
  /** Runs the query again ("Reintentar"). */
  reload: () => void;
}

/**
 * Runs a query now and again after every write (notifyDataChanged).
 * Results of an outdated query are dropped, so fast changes never show stale data.
 * A failure is returned as `error` so the screen can say so instead of staying empty.
 */
export function useQuery<T>(query: () => Promise<T>, initial: T, deps: DependencyList): QueryState<T> {
  const [state, setState] = useState<{ data: T; loaded: boolean; error: Error | null }>({
    data: initial,
    loaded: false,
    error: null,
  });
  // The caller lists the real dependencies of `query`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(query, deps);
  const loadRef = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    let version = 0;
    const load = () => {
      const mine = ++version;
      run()
        .then((data) => {
          if (active && mine === version) setState({ data, loaded: true, error: null });
        })
        .catch((error: unknown) => {
          console.warn('Query failed', error);
          if (active && mine === version) {
            setState((current) => ({ ...current, error: error instanceof Error ? error : new Error(String(error)) }));
          }
        });
    };
    loadRef.current = load;
    load();
    const unsubscribe = onDataChanged(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [run]);

  const reload = useCallback(() => loadRef.current(), []);
  return { ...state, reload };
}

export interface CurrentList {
  listId: string;
  list: List | null;
  lists: List[];
  loaded: boolean;
}

/** The list the app is showing ("Personal ⌄") and all the lists. */
export function useCurrentList(): CurrentList {
  const db = useSQLiteContext();
  const { data, loaded } = useQuery(
    async () => {
      const [listId, lists] = await Promise.all([getCurrentListId(db), listLists(db)]);
      return { listId, lists };
    },
    { listId: PERSONAL_LIST_ID, lists: [] as List[] },
    [db],
  );
  return {
    listId: data.listId,
    lists: data.lists,
    list: data.lists.find((l) => l.id === data.listId) ?? null,
    loaded,
  };
}

/** "✍️ Pruebas" / "Personal" */
export function listLabel(list: List | null): string {
  if (!list) return 'Personal';
  return list.emoji ? `${list.emoji} ${list.name}` : list.name;
}
