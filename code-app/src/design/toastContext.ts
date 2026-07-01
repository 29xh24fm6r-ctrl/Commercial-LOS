import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Auto-dismiss ms (default 3500). */
  duration?: number;
}

export interface ToastApi {
  toast: (opts: ToastOptions) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

/**
 * Toast verbs must agree with the action that produced them — "Publish" yields
 * "Published". Keep messages short and past-tense.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
