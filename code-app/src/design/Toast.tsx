import { useCallback, useRef, useState, type ReactNode } from 'react';
import * as RadixToast from '@radix-ui/react-toast';
import { ToastContext, type ToastOptions, type ToastTone } from './toastContext';

interface ToastRecord extends ToastOptions {
  id: number;
}

const TONE_CLASS: Record<ToastTone, string> = {
  success: '',
  error: 'ig-toast--error',
  info: 'ig-toast--info',
};

/** App-level toast host — mount once near the root. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((opts: ToastOptions) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { ...opts, id }]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {toasts.map((t) => (
          <RadixToast.Root
            key={t.id}
            className={['ig-toast', TONE_CLASS[t.tone ?? 'success']].filter(Boolean).join(' ')}
            duration={t.duration ?? 3500}
            onOpenChange={(open) => {
              if (!open) remove(t.id);
            }}
          >
            <RadixToast.Title className="ig-toast__title">{t.title}</RadixToast.Title>
            {t.description && (
              <RadixToast.Description className="ig-toast__desc">{t.description}</RadixToast.Description>
            )}
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="ig-toast-viewport" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
