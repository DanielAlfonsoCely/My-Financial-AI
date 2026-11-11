// Small toasts like MonAi's: success on top ("🍔 Comer afuera  $35.000", Video Yt/11) and errors at
// the bottom ("⊗ No se puede eliminar la categoría", Video Yt/27).

export interface ToastMessage {
  kind: 'success' | 'error';
  emoji?: string;
  /** Background of the emoji bubble (the category color). */
  color?: string;
  title: string;
  /** Gray chip on the right of a success toast (the amount). */
  chip?: string;
  /** Second line of an error toast. */
  subtitle?: string;
}

type Listener = (toast: ToastMessage) => void;
const listeners = new Set<Listener>();

export function onToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function showToast(toast: ToastMessage): void {
  listeners.forEach((l) => l(toast));
}
