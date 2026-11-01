import { useSQLiteContext } from 'expo-sqlite';
import { type DependencyList, useCallback, useEffect, useState } from 'react';

import { getCurrentListId, listLists } from '../db/repo';
import { PERSONAL_LIST_ID } from '../db/seed';
import type { List } from '../db/types';
import { onDataChanged } from '../lib/events';

/**
 * Runs a query now and again after every write (notifyDataChanged).
 * Results of an outdated query are dropped, so fast changes never show stale data.
 */
export function useQuery<T>(query: () => Promise<T>, initial: T, deps: DependencyList): { data: T; loaded: boolean } {
  const [state, setState] = useState<{ data: T; loaded: boolean }>({ data: initial, loaded: false });
  // The caller lists the real dependencies of `query`.
  const run = useCallback(query, deps);

  useEffect(() => {
    let active = true;
    let version = 0;
    const load = () => {
      const mine = ++version;
      run()
        .then((data) => {
          if (active && mine === version) setState({ data, loaded: true });
        })
        .catch((error) => console.warn('Query failed', error));
    };
    load();
    const unsubscribe = onDataChanged(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [run]);

  return state;
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
