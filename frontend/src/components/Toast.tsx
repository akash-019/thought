/**
 * File: src/components/Toast.tsx
 *
 * Short confirmation messages after an action ("Session booked"). `useToast().show(text)`.
 * Announced to screen readers through an aria-live region.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';

const ToastContext = createContext<{ show: (message: string) => void }>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  function show(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage((current) => (current === text ? null : current)), 4000);
  }

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-region" aria-live="polite">
        {message && (
          <div className="toast" role="status">
            {message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
