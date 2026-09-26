// A tiny module-level store so any component (and the root loader effect)
// can raise a toast without prop drilling. Only one toast shows at a time;
// a new one replaces whatever is on screen.
import * as React from "react";

export type ToastVariant = "success" | "error";

export type ToasterToast = {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  /** How long it stays up once it has slid in, in milliseconds. */
  duration?: number;
  open: boolean;
};

type State = { toasts: ToasterToast[] };

// Long enough for the exit animation to finish before the content goes.
const TOAST_REMOVE_DELAY = 1000;

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

let listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };
let removeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function setState(update: (state: State) => State) {
  memoryState = update(memoryState);
  listeners.forEach((listener) => listener(memoryState));
}

function dismiss(toastId?: string) {
  setState((state) => ({
    toasts: state.toasts.map((t) =>
      toastId === undefined || t.id === toastId ? { ...t, open: false } : t,
    ),
  }));

  for (let t of memoryState.toasts) {
    if (t.open || removeTimeouts.has(t.id)) continue;
    removeTimeouts.set(
      t.id,
      setTimeout(() => {
        removeTimeouts.delete(t.id);
        setState((state) => ({
          toasts: state.toasts.filter((other) => other.id !== t.id),
        }));
      }, TOAST_REMOVE_DELAY),
    );
  }
}

type Toast = Omit<ToasterToast, "id" | "open">;

function toast(props: Toast) {
  let id = genId();

  setState(() => ({ toasts: [{ ...props, id, open: true }] }));

  return {
    id,
    dismiss: () => dismiss(id),
    update: (next: Partial<ToasterToast>) =>
      setState((state) => ({
        toasts: state.toasts.map((t) =>
          t.id === id ? { ...t, ...next, id } : t,
        ),
      })),
  };
}

function useToast() {
  let [state, setLocalState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setLocalState);
    return () => {
      listeners = listeners.filter((listener) => listener !== setLocalState);
    };
  }, []);

  return { ...state, toast, dismiss };
}

export { toast, useToast };
