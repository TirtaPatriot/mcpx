import { useEffect, useState } from "preact/hooks";

export interface ToastState {
  message: string;
  isError: boolean;
  visible: boolean;
}

let state: ToastState = { message: "", isError: false, visible: false };
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(s: ToastState) => void>();

function set(next: ToastState) {
  state = next;
  listeners.forEach((fn) => fn(state));
}

export function showToast(message: string, isError = false) {
  clearTimeout(timer);
  set({ message, isError, visible: true });
  timer = setTimeout(() => set({ ...state, visible: false }), 3500);
}

export function useToast(): ToastState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

export function copyText(text: string) {
  navigator.clipboard.writeText(text);
  showToast("Copied to clipboard!");
}
