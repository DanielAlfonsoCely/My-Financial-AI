// Tiny pub/sub so screens refresh after any write to the database.

type Listener = () => void;
const listeners = new Set<Listener>();

export function onDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let scheduled = false;
let paused = 0;
let pendingWhilePaused = false;

/**
 * Runs a long batch of writes (an import, the test-data seed) with a single refresh at the end,
 * instead of every screen re-reading the database after each row.
 */
export async function withNotificationsPaused<T>(task: () => Promise<T>): Promise<T> {
  paused++;
  try {
    return await task();
  } finally {
    paused--;
    if (paused === 0 && pendingWhilePaused) {
      pendingWhilePaused = false;
      notifyDataChanged();
    }
  }
}

/**
 * Tells every mounted query to run again. Several calls in the same tick (a save that touches
 * three tables, a toggle next to it) become one refresh instead of one per call.
 */
export function notifyDataChanged(): void {
  if (paused > 0) {
    pendingWhilePaused = true;
    return;
  }
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    // A copy, because a listener may unsubscribe while the others are being called.
    [...listeners].forEach((listener) => listener());
  });
}

// The category editor tells the screen that opened it which category was just created,
// so the transaction sheet can select it right away.
type CategoryListener = (categoryId: string) => void;
const categoryListeners = new Set<CategoryListener>();

export function onCategoryCreated(listener: CategoryListener): () => void {
  categoryListeners.add(listener);
  return () => {
    categoryListeners.delete(listener);
  };
}

export function notifyCategoryCreated(categoryId: string): void {
  categoryListeners.forEach((listener) => listener(categoryId));
}
