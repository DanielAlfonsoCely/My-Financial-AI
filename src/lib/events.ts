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
