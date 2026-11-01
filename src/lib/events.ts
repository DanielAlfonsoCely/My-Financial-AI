// Tiny pub/sub so screens refresh after any write to the database.

type Listener = () => void;
const listeners = new Set<Listener>();

export function onDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyDataChanged(): void {
  listeners.forEach((listener) => listener());
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
