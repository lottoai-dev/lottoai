// contexts/AlertContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppAlert, type AlertButton } from '../components/ui/app-alert';

type AlertOptions = {
  title: string;
  message?: string;
  buttons: AlertButton[];
};

type AlertContextType = {
  showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
};

const AlertContext = createContext<AlertContextType | null>(null);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<AlertOptions>({ title: '', buttons: [] });
  const visibleRef = useRef(false);
  const pendingAlert = useRef<AlertOptions | null>(null);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  const showAlert = useCallback((title: string, message?: string, buttons?: AlertButton[]) => {
    const next: AlertOptions = { title, message, buttons: buttons ?? [] };

    if (visibleRef.current) {
      pendingAlert.current = next;
      setVisible(false);
      return;
    }

    setOptions(next);
    setVisible(true);
  }, []);

  const onDismiss = useCallback(() => {
    setVisible(false);
  }, []);

  useEffect(() => {
    if (visible || !pendingAlert.current) return;

    const next = pendingAlert.current;
    pendingAlert.current = null;

    const timer = setTimeout(() => {
      setOptions(next);
      setVisible(true);
    }, 160);

    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <AppAlert
        visible={visible}
        title={options.title}
        message={options.message}
        buttons={options.buttons}
        onDismiss={onDismiss}
      />
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlert must be used within AlertProvider');
  return ctx;
}
